import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, Allow } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { TriageService } from './triage.service';
import { TriageCommercialService } from './triage-commercial.service';
import { TriageCommunicationsService } from './triage-communications.service';
import { TriageInboundImapService } from './triage-inbound-imap.service';

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

class ComposeCommunicationEmailDto {
  @IsOptional() @IsEmail() to?: string;
  @IsOptional() cc?: string | string[];
  @IsOptional() bcc?: string | string[];
  @IsString() @MaxLength(500) subject!: string;
  @IsString() @MaxLength(20000) message!: string;
  @IsOptional() @IsString() threadId?: string;
  @IsOptional() saveDraft?: boolean | string;
}

function normalizeCommunicationEmailList(value?: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch {
      // Fall through to comma-separated parsing.
    }
    return trimmed.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

class LogCommunicationCallDto {
  @IsIn(['OUTBOUND', 'INBOUND']) direction!: 'OUTBOUND' | 'INBOUND';
  @IsOptional() @IsString() @MaxLength(40) telephoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) contactedPerson?: string;
  @IsIn([
    'CLIENT_REACHED',
    'NO_ANSWER',
    'VOICEMAIL',
    'WRONG_NUMBER',
    'CALLBACK_REQUESTED',
    'MEETING_ARRANGED',
    'OTHER',
  ])
  outcome!: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsInt() @Min(0) durationSeconds?: number;
  @IsOptional() @IsBoolean() followUpRequired?: boolean;
  @IsOptional() @IsString() followUpDate?: string;
  @IsOptional() @IsString() occurredAt?: string;
}

class ScopeDiscussionDto {
  @IsOptional() @IsString() @MaxLength(4000) clientObjectives?: string;
  @IsOptional() @IsString() @MaxLength(2000) sitesOrBusinessUnits?: string;
  @IsOptional() @IsString() @MaxLength(4000) indicativeScope?: string;
  @IsOptional() @IsString() @MaxLength(500) expectedTimeline?: string;
  @IsOptional() @IsString() @MaxLength(4000) commercialNotes?: string;
  @IsOptional() fee?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() @MaxLength(4000) terms?: string;
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

class ProposalTemplateDto {
  @IsOptional() @IsString() @MaxLength(12000) introduction?: string;
  @IsOptional() @IsString() @MaxLength(12000) deliverables?: string;
  @IsOptional() @IsString() @MaxLength(12000) terms?: string;
  @IsOptional() @IsString() @MaxLength(8000) clientObjective?: string;
  @IsOptional() @IsString() @MaxLength(2000) sitesOrBusinessUnits?: string;
  @IsOptional() @IsString() @MaxLength(8000) indicativeScope?: string;
  @IsOptional() @IsString() @MaxLength(500) timeline?: string;
  @IsOptional() fee?: number | null;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() @MaxLength(300) organisationName?: string;
  @IsOptional() @IsString() @MaxLength(200) addressedTo?: string;
  @IsOptional() @IsString() @MaxLength(200) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) subtitle?: string;
  @IsOptional() @IsString() @MaxLength(16000) understandingOfNeeds?: string;
  @IsOptional() @IsString() @MaxLength(12000) methodology?: string;
  @IsOptional() @IsString() @MaxLength(12000) approach?: string;
  @IsOptional() @IsString() @MaxLength(8000) exclusions?: string;
  @IsOptional() @IsString() @MaxLength(8000) assumptions?: string;
  @IsOptional() @IsString() @MaxLength(8000) statementOfResponsibility?: string;
  @IsOptional() @IsString() @MaxLength(20000) termsAndConditions?: string;
  @IsOptional() @IsString() @MaxLength(8000) acceptanceTerms?: string;
  @IsOptional() analystHourlyRate?: number | null;
  @IsOptional() specialistHourlyRate?: number | null;
  @IsOptional() discount?: number | null;
  @IsOptional() vatRate?: number | null;
  @IsOptional() expensesEstimate?: number | null;
  @IsOptional() @IsString() @MaxLength(500) paymentTerms?: string;
  @IsOptional() estimatedProjectWeeks?: number | null;
  @IsOptional() @IsString() @MaxLength(4000) timelineNarrative?: string;
  @IsOptional() @IsString() @MaxLength(200) projectSponsor?: string;
  @IsOptional() @IsString() @MaxLength(200) projectChampion?: string;
  @IsOptional() @IsString() @MaxLength(120) productCode?: string;
  @IsOptional() @IsString() @MaxLength(500) title?: string;
  @Allow()
  @IsOptional()
  @IsObject()
  contentSnapshot?: Record<string, unknown>;
  @IsOptional() expectedGrandTotal?: number | null;
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
    private readonly communications: TriageCommunicationsService,
    private readonly inboundImap: TriageInboundImapService,
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

  @Get('submissions/:id/proposal-template')
  getProposalTemplate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.commercial.getProposalTemplate(id, user);
  }

  @Get('submissions/:id/proposal-workspace')
  getProposalWorkspace(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.commercial.getProposalWorkspace(id, user);
  }

  @Patch('submissions/:id/proposal-template')
  saveProposalTemplate(
    @Param('id') id: string,
    @Body() body: ProposalTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.saveProposalTemplate(id, body, user).then(() => this.service.get(id, user));
  }

  @Patch('submissions/:id/proposal-workspace')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }))
  saveProposalWorkspace(
    @Param('id') id: string,
    @Body() body: ProposalTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commercial.saveProposalTemplate(id, body, user).then(() => this.commercial.getProposalWorkspace(id, user));
  }

  @Get('submissions/:id/proposal-preview')
  async previewProposal(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, fileName, contentType } = await this.commercial.previewProposalPdf(id, user);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(buffer);
  }

  @Post('submissions/:id/proposal-generate')
  generateProposal(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.commercial.generateProposalPdf(id, user).then(() => this.service.get(id, user));
  }

  @Post('submissions/:id/proposal-send')
  sendProposal(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.commercial.sendProposalToClient(id, user).then(() => this.service.get(id, user));
  }

  @Get('communications/unread-summary')
  communicationsUnreadSummary(@CurrentUser() user: AuthUser) {
    return this.communications.getGlobalUnreadSummary(user);
  }

  @Get('submissions/:id/communications/summary')
  communicationsSummary(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.communications.getSummary(id, user);
  }

  @Get('submissions/:id/communications')
  listCommunications(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('filter') filter?: 'all' | 'email' | 'calls',
    @Query('q') q?: string,
    @Query('mailbox') mailbox?: 'inbox' | 'sent' | 'drafts' | 'trash',
  ) {
    return this.communications.listCommunications(id, user, filter || 'all', q, mailbox || 'inbox');
  }

  @Get('submissions/:id/communications/attachments/:attachmentId')
  async downloadCommunicationAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @Query('disposition') disposition: 'inline' | 'attachment' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.communications.getAttachmentFile(id, attachmentId, user);
    const safeName = file.filename.replace(/"/g, '');
    const mode = disposition === 'attachment' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${mode}; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(file.buffer);
  }

  @Post('submissions/:id/communications/email')
  @UseInterceptors(FilesInterceptor('attachments', 10, { limits: { fileSize: 25 * 1024 * 1024 } }))
  composeCommunicationEmail(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: ComposeCommunicationEmailDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.composeEmail(
      id,
      {
        to: body.to,
        cc: normalizeCommunicationEmailList(body.cc),
        bcc: normalizeCommunicationEmailList(body.bcc),
        subject: body.subject,
        message: body.message,
        threadId: body.threadId,
        saveDraft: body.saveDraft === true || body.saveDraft === 'true',
      },
      user,
      files || [],
    );
  }

  @Post('submissions/:id/communications/calls')
  logCommunicationCall(
    @Param('id') id: string,
    @Body() body: LogCommunicationCallDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.logCall(id, body, user);
  }

  @Post('submissions/:id/communications/messages/:messageId/retry')
  retryCommunicationEmail(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.retryEmail(id, messageId, user);
  }

  @Post('submissions/:id/communications/messages/:messageId/read')
  markCommunicationMessageRead(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.markMessageRead(id, messageId, user);
  }

  @Post('submissions/:id/communications/threads/:threadId/read')
  markCommunicationThreadRead(
    @Param('id') id: string,
    @Param('threadId') threadId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.markThreadRead(id, threadId, user);
  }

  @Post('submissions/:id/communications/trash')
  trashCommunication(
    @Param('id') id: string,
    @Body() body: { messageId?: string; threadId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.moveToTrash(id, user, body || {});
  }

  @Post('submissions/:id/communications/restore')
  restoreCommunication(
    @Param('id') id: string,
    @Body() body: { messageId?: string; threadId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.restoreFromTrash(id, user, body || {});
  }

  @Post('submissions/:id/communications/purge')
  purgeCommunication(
    @Param('id') id: string,
    @Body() body: { messageId?: string; threadId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.communications.purgeFromTrash(id, user, body || {});
  }

  @Post('submissions/:id/communications/check-inbox')
  checkCommunicationInbox(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.communications.assertLeadAccessForPoll(id, user).then(async () => {
      const summary = await this.inboundImap.pollInbox();
      const communicationsSummary = await this.communications.getSummary(id, user);
      return { poll: summary, ...communicationsSummary };
    });
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

  @Delete('submissions/:id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
