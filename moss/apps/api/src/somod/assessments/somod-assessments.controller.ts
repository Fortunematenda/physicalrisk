import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { SomodAssessmentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { SomodAssessmentsService } from './somod-assessments.service';
import { SomodReportsService } from '../reports/somod-reports.service';

export class CreateSomodAssessmentDto {
  @IsString() organisationId!: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() mossAssessmentId?: string;
}

export class UpdateSomodAssessmentDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsEnum(SomodAssessmentStatus) status?: SomodAssessmentStatus;
  @IsOptional() @IsString() siteId?: string | null;
  @IsOptional() @IsString() mossAssessmentId?: string | null;
}

export class UpdateSomodEngineDto {
  @IsObject() data!: Record<string, unknown>;
}

export class SomodReviewDto {
  @IsOptional() @IsString() note?: string;
}

export class SomodReturnDto {
  @IsString() @MinLength(2) comment!: string;
}

@Controller('somod')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SomodAssessmentsController {
  constructor(
    private readonly assessments: SomodAssessmentsService,
    private readonly reports: SomodReportsService,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.assessments.dashboard(user);
  }

  @Get('assessments')
  list(@CurrentUser() user: AuthUser) {
    return this.assessments.list(user);
  }

  @Post('assessments')
  create(@Body() body: CreateSomodAssessmentDto, @CurrentUser() user: AuthUser) {
    return this.assessments.create(body, user);
  }

  @Get('assessments/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.getWorkspace(id, user);
  }

  @Patch('assessments/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateSomodAssessmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.update(id, body, user);
  }

  @Patch('assessments/:id/engines/:engineKey')
  updateEngine(
    @Param('id') id: string,
    @Param('engineKey') engineKey: string,
    @Body() body: UpdateSomodEngineDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.updateEngine(id, engineKey, body.data || {}, user);
  }

  @Post('assessments/:id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.submit(id, user);
  }

  @Post('assessments/:id/mark-reviewed')
  markReviewed(
    @Param('id') id: string,
    @Body() body: SomodReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.markReviewed(id, user, body?.note);
  }

  @Post('assessments/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.approve(id, user);
  }

  @Post('assessments/:id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.archive(id, user);
  }

  @Post('assessments/:id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.unarchive(id, user);
  }

  @Post('assessments/:id/return')
  returnToInProgress(
    @Param('id') id: string,
    @Body() body: SomodReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assessments.returnToInProgress(id, body.comment, user);
  }

  @Post('assessments/:id/reports/generate')
  generateReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reports.generate(id, user);
  }

  @Delete('assessments/:id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.assessments.remove(id, user);
  }
}
