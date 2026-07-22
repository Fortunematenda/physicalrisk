import { BadRequestException, Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import { Allow, ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { PublicService } from './public.service';
import { AnonymousSessionService } from './anonymous-session.service';
import { ContactService } from './contact.service';

class ContactDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsString() @MinLength(2) @MaxLength(160) organisation!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(2) @MaxLength(120) programmeInterest!: string;
  @IsString() @MinLength(10) @MaxLength(3000) description!: string;
  @IsOptional() @IsString() @MaxLength(40) source?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsString() @MinLength(1) @MaxLength(4096) captchaToken!: string;
}

class LeadDto {
  @IsString() @MaxLength(160) organisationName!: string;
  @IsOptional() @IsString() @MaxLength(100) industry?: string;
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  // Honeypot: legitimate clients leave this blank.
  @IsOptional() @IsString() @MaxLength(0) website?: string;
}

class InputAnswerDto {
  @IsString() @MaxLength(20) code!: string;
  @Allow() value!: unknown;
}

class ResponseAnswerDto {
  @IsString() @MaxLength(20) questionCode!: string;
  @IsString() @MaxLength(64) responseOptionId!: string;
}

class CompleteAssessmentDto extends LeadDto {
  @IsString() leadId!: string;

  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InputAnswerDto)
  inputs?: InputAnswerDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ResponseAnswerDto)
  responses?: ResponseAnswerDto[];
}

class ProgressDto {
  @IsIn(['calibration', 'questions']) phase!: 'calibration' | 'questions';
  @IsOptional() @IsInt() @Min(0) calStep?: number;
  @IsOptional() @IsInt() @Min(0) questionIndex?: number;
  @IsOptional() @IsString() progressLabel?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InputAnswerDto)
  inputs?: InputAnswerDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ResponseAnswerDto)
  responses?: ResponseAnswerDto[];
}

class ResumeDto {
  @IsOptional() @IsString() leadId?: string;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly sessions: AnonymousSessionService,
    private readonly contacts: ContactService,
    private readonly config: ConfigService,
  ) {}

  @Post('contact')
  async contact(@Body() body: ContactDto, @Req() req: Request) {
    this.assertContactOrigin(req);
    const email = body.email.trim().toLowerCase();
    this.limit(req, 'contact-ip', 10, 60 * 60_000);
    this.limitKey(`contact-email:${email}`, 5, 60 * 60_000);
    if (body.website) {
      return {
        success: true,
        message: 'Thank you. Your enquiry has been sent successfully.',
        submissionId: `ENQ-${randomBytes(8).toString('hex').toUpperCase()}`,
      };
    }
    const ip = this.clientIp(req);
    await this.contacts.verifyCaptcha(body.captchaToken, ip);
    return this.contacts.submit({
      fullName: body.fullName,
      organisation: body.organisation,
      email,
      programmeInterest: body.programmeInterest,
      description: body.description,
    });
  }

  @Get('start')
  async start(@Query('source') source: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.limit(req, 'start', 60, 60_000);
    if (!this.sessions.tryVerify(req.headers.cookie)) {
      const token = this.sessions.create(source);
      res.setHeader('Set-Cookie', this.sessions.cookie(token));
    }
    return this.publicService.getPublishedQuestionnaire('SCLI');
  }

  @Post('leads')
  async captureLead(@Body() body: LeadDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.limit(req, 'lead', 10, 60 * 60_000);
    if (body.website) throw new BadRequestException('Invalid submission.');
    const session = this.sessions.verify(req.headers.cookie);
    // A human cannot reasonably load and complete the details form immediately.
    if (!session.iat || Date.now() / 1000 - session.iat < 2) throw new BadRequestException('Please try again.');
    const result = await this.publicService.captureLead(body, session.source);
    res.setHeader('Set-Cookie', this.sessions.cookie(this.sessions.attach(session, result.leadId)));
    return result;
  }

  @Post('resume')
  resume(@Body() _body: ResumeDto, @Req() req: Request) {
    this.limit(req, 'resume', 30, 60_000);
    const session = this.sessions.verify(req.headers.cookie);
    return this.publicService.resumeSession(session.leadId);
  }

  @Patch('leads/:id/progress')
  saveProgress(@Param('id') id: string, @Body() body: ProgressDto, @Req() req: Request) {
    this.limit(req, 'progress', 120, 60 * 60_000);
    const session = this.sessions.verify(req.headers.cookie);
    return this.publicService.saveProgress({ ...body, leadId: this.sessionLead(session.leadId, id) });
  }

  @Post('complete-assessment')
  complete(@Body() body: CompleteAssessmentDto, @Req() req: Request) {
    this.limit(req, 'complete', 5, 60 * 60_000);
    if (body.website) throw new BadRequestException('Invalid submission.');
    const session = this.sessions.verify(req.headers.cookie);
    return this.publicService.completeAssessment({ ...body, leadId: this.sessionLead(session.leadId, body.leadId) });
  }

  private sessionLead(sessionLeadId?: string, requestedLeadId?: string): string {
    if (!sessionLeadId || (requestedLeadId && requestedLeadId !== sessionLeadId)) {
      throw new BadRequestException('Assessment session does not match.');
    }
    return sessionLeadId;
  }

  private limit(req: Request, action: string, max: number, windowMs: number) {
    this.limitKey(`${action}:${this.clientIp(req)}`, max, windowMs);
  }

  private limitKey(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      throw new HttpException(
        { success: false, message: 'Too many attempts. Please wait and try again.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private clientIp(req: Request): string {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  private assertContactOrigin(req: Request) {
    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const allowed = (this.config.get<string>('CONTACT_ALLOWED_ORIGINS') || 'https://test.physicalrisk.com')
      .split(',').map((v) => v.trim().replace(/\/$/, '')).filter(Boolean);
    if (!origin || !allowed.includes(origin)) {
      throw new HttpException({ success: false, message: 'Request origin is not allowed.' }, HttpStatus.FORBIDDEN);
    }
  }
}
