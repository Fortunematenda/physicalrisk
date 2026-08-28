import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { TriageService } from './triage.service';
import { TriageCommercialService } from './triage-commercial.service';

class UpdateTriageDto {
  @IsOptional() @IsIn(['REVIEWED', 'CONTACTED', 'CLOSED']) status?: string;
  @IsOptional() @IsString() @MaxLength(4000) adminNotes?: string;
  @IsOptional() @IsString() @MaxLength(4000) proposalAdminNotes?: string;
  @IsOptional() @IsString() assignedAnalystId?: string | null;
  @IsOptional() @IsString() commercialOwnerId?: string | null;
  @IsOptional()
  @IsIn(['UNKNOWN', 'INTERESTED', 'NEEDS_FOLLOW_UP', 'NOT_INTERESTED', 'DEFERRED'])
  clientInterest?: string;
  @IsOptional() @IsString() nextFollowUpAt?: string | null;
  @IsOptional() @IsString() followUpOwnerId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) followUpReason?: string | null;
}

class ProposalActionDto {
  @IsIn(['PREPARE', 'SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRE']) action!: string;
  @IsOptional() @IsString() @MaxLength(4000) proposalAdminNotes?: string;
}

class ConvertTriageDto {
  @IsOptional() @IsBoolean() force?: boolean;
}

class CreateTriageNoteDto {
  @IsString() @MaxLength(4000) body!: string;
  @IsOptional()
  @IsIn([
    'GENERAL',
    'CALL_OUTCOME',
    'FOLLOW_UP',
    'COMMERCIAL',
    'CONSULTANT_OBSERVATION',
    'CLIENT_REQUEST',
    'INTERNAL_DECISION',
  ])
  category?: string;
}

class UpdateTriageNoteDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional()
  @IsIn([
    'GENERAL',
    'CALL_OUTCOME',
    'FOLLOW_UP',
    'COMMERCIAL',
    'CONSULTANT_OBSERVATION',
    'CLIENT_REQUEST',
    'INTERNAL_DECISION',
  ])
  category?: string;
}

class ContactActivityDto {
  @IsIn(['CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'OTHER']) contactMethod!: string;
  @IsIn([
    'NO_RESPONSE',
    'FOLLOW_UP_REQUIRED',
    'INTERESTED',
    'NOT_INTERESTED',
    'WANTS_PROPOSAL',
    'NEEDS_MORE_INFORMATION',
    'DEFERRED',
    'CLOSED',
  ])
  outcome!: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() contactedAt?: string;
  @IsOptional() @IsString() nextFollowUpAt?: string | null;
}

class ScopeDiscussionDto {
  @IsOptional() @IsString() @MaxLength(4000) clientObjectives?: string;
  @IsOptional() @IsString() @MaxLength(2000) sitesOrBusinessUnits?: string;
  @IsOptional() @IsString() @MaxLength(4000) indicativeScope?: string;
  @IsOptional() @IsString() @MaxLength(500) expectedTimeline?: string;
  @IsOptional() @IsString() @MaxLength(4000) commercialNotes?: string;
}

class CreateProposalDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) scopeSummary?: string;
  @IsOptional() @IsString() @MaxLength(4000) objectives?: string;
  @IsOptional() @IsString() @MaxLength(2000) sitesOrBusinessUnits?: string;
  @IsOptional() @IsString() @MaxLength(4000) deliverables?: string;
  @IsOptional() @IsString() @MaxLength(500) timeline?: string;
  @IsOptional() fee?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;
}

class ProposalRecordActionDto {
  @IsIn(['INTERNAL_REVIEW', 'APPROVE', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRE', 'WITHDRAW'])
  action!: string;
}

class UploadProposalDto {
  @IsOptional() @IsString() proposalNumber?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() fee?: number;
  @IsOptional() @IsString() timeline?: string;
  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'ACCEPTED'])
  status?: string;
}

@Controller('triage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES', 'AUDITOR')
export class TriageController {
  constructor(
    private readonly service: TriageService,
    private readonly commercial: TriageCommercialService,
  ) {}

  @Get('submissions')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('intent') intent?: string,
  ) {
    return this.service.list(user, { q, status, intent });
  }

  @Get('submissions/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }

  @Get('commercial-owners')
  commercialOwners(@CurrentUser() user: AuthUser) {
    return this.service.listCommercialOwners(user);
  }

  @Patch('submissions/:id')
  update(@Param('id') id: string, @Body() body: UpdateTriageDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Post('submissions/:id/proposal')
  proposal(
    @Param('id') id: string,
    @Body() body: ProposalActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateProposal(id, body, user);
  }

  @Post('submissions/:id/convert')
  convert(@Param('id') id: string, @Body() body: ConvertTriageDto, @CurrentUser() user: AuthUser) {
    return this.service.convert(id, user, { force: body?.force });
  }

  @Post('submissions/:id/contacts')
  recordContact(
    @Param('id') id: string,
    @Body() body: ContactActivityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.recordContactActivity(id, body, user).then(() => this.service.get(id, user));
  }

  @Patch('submissions/:id/scope')
  updateScope(
    @Param('id') id: string,
    @Body() body: ScopeDiscussionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.updateScopeDiscussion(id, body, user).then(() => this.service.get(id, user));
  }

  @Post('submissions/:id/proposals')
  createProposal(
    @Param('id') id: string,
    @Body() body: CreateProposalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.createProposal(id, body, user).then(() => this.service.get(id, user));
  }

  @Post('submissions/:id/proposals/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  uploadProposal(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadProposalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.uploadProposal(id, file, body, user).then(() => this.service.get(id, user));
  }

  @Patch('submissions/:id/proposals/:proposalId')
  patchProposal(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: CreateProposalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial
      .updateProposalFields(id, proposalId, body, user)
      .then(() => this.service.get(id, user));
  }

  @Post('submissions/:id/proposals/:proposalId/actions')
  proposalRecordAction(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @Body() body: ProposalRecordActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial
      .proposalRecordAction(id, proposalId, body.action, user)
      .then(() => this.service.get(id, user));
  }

  @Get('submissions/:id/proposals/:proposalId/download')
  downloadProposal(
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.downloadProposal(id, proposalId, user);
  }

  @Post('submissions/:id/notes')
  createNote(@Param('id') id: string, @Body() body: CreateTriageNoteDto, @CurrentUser() user: AuthUser) {
    return this.service.createNote(id, body, user);
  }

  @Patch('submissions/:id/notes/:noteId')
  updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() body: UpdateTriageNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateNote(id, noteId, body, user);
  }

  @Delete('submissions/:id/notes/:noteId')
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.deleteNote(id, noteId, user);
  }
}
