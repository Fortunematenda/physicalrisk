import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClientInterest,
  CommercialStage,
  ProposalStatus,
  SystemRole,
  TriageContactMethod,
  TriageContactOutcome,
  TriageProposalSource,
  TriageProposalStatus,
} from '@prisma/client';
import type { AuthUser } from '../common/current-user.decorator';
import { generateProposalReference } from '../common/proposal-reference';
import {
  COMMERCIAL_OWNER_ROLES,
  COMMERCIAL_OVERRIDE_ROLES,
  COMMERCIAL_WRITE_ROLES,
  buildCommercialWorkspace,
  canCreateLevel2,
  clientInterestFromContact,
  commercialStageLabel,
  commercialWorkflowSteps,
  mapTriageProposalToLeadStatus,
  resolveCommercialStage,
  resolvePrimaryCta,
  toProposalSnapshot,
} from '../common/triage-commercial';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../evidence/storage.service';
import { EmailService } from '../email/email.service';
import { readProposalContextSnapshot } from '../common/triage-proposal-context';
import { TriageProposalRequestService } from './triage-proposal-request.service';
import {
  buildProposalPdfDefaults,
  renderExecutiveAdvisoryProposalPdf,
  type ProposalPdfInput,
} from './triage-proposal-pdf';
import { buildDefaultContentSnapshot, buildPhysicalRiskProposalInput, resolveTemplateConfig } from './proposal/proposal-content-builder';
import { calculateProposalFees, recalculateAllLineItems } from './proposal/proposal-fee-calculations';
import {
  proposalPdfV2Enabled,
  renderPhysicalRiskProposalPdf,
} from './proposal/physical-risk-proposal-pdf';
import { mergeContentSnapshot, readContentSnapshot } from './proposal/proposal-template-registry';
import { canMarkReadyToSend, validateProposalForSend } from './proposal/proposal-validation';
import type { ProposalContentSnapshot } from './proposal/proposal-template-types';
import { dedupeRepeatedNarrative } from './proposal/proposal-rich-text';

const PROPOSAL_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const PROPOSAL_ACTIONS = new Set([
  'INTERNAL_REVIEW',
  'APPROVE',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRE',
  'WITHDRAW',
]);

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  systemRole: true,
} as const;

@Injectable()
export class TriageCommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly proposalRequests: TriageProposalRequestService,
  ) {}

  assertCommercialWrite(user: AuthUser) {
    if (!COMMERCIAL_WRITE_ROLES.has(user.role)) {
      throw new ForbiddenException('You cannot manage commercial activities on this lead.');
    }
  }

  private async assertCommercialOwnerCandidate(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        systemRole: { in: [...COMMERCIAL_OWNER_ROLES] as SystemRole[] },
      },
    });
    if (!user) throw new BadRequestException('Select an active commercial owner.');
    return user;
  }

  async loadCommercialBundle(publicLeadId: string) {
    const [contactActivities, proposals, contactCount] = await Promise.all([
      this.prisma.triageContactActivity.findMany({
        where: { publicLeadId },
        orderBy: { contactedAt: 'desc' },
        include: { contactedBy: { select: userSelect } },
      }),
      this.prisma.triageProposal.findMany({
        where: { publicLeadId },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: userSelect } },
      }),
      this.prisma.triageContactActivity.count({ where: { publicLeadId } }),
    ]);
    return { contactActivities, proposals, contactCount };
  }

  private proposalSnapshot(
    proposal: { status: TriageProposalStatus; documentStorageKey?: string | null } | null | undefined,
  ) {
    return toProposalSnapshot(proposal);
  }

  buildCommercialView(
    lead: any,
    bundle: Awaited<ReturnType<TriageCommercialService['loadCommercialBundle']>>,
    extras: {
      assessmentReference?: string | null;
      qualification?: Record<string, unknown> | null;
    } = {},
  ) {
    const latestProposal = bundle.proposals[0] || null;
    const proposalSnap = this.proposalSnapshot(latestProposal);
    const stage = resolveCommercialStage(lead, {
      contactCount: bundle.contactCount,
      latestProposal: proposalSnap,
    });
    const primaryCta = resolvePrimaryCta(
      {
        ...lead,
        convertedEngagementId: lead.convertedAssessmentId,
      },
      stage,
      proposalSnap,
    );
    const convertGate = canCreateLevel2(lead, stage);
    const commercialWorkspace = buildCommercialWorkspace({
      lead,
      activeProposal: latestProposal,
      assessmentReference: extras.assessmentReference,
      qualification: extras.qualification as any,
    });
    return {
      commercialStage: stage,
      commercialStageLabel: commercialStageLabel(stage),
      primaryCta,
      convertGate,
      commercialWorkflow: commercialWorkflowSteps(lead, stage, { latestProposal: proposalSnap }),
      commercialWorkspace,
      commercialOwner: lead.commercialOwner || null,
      followUpOwner: lead.followUpOwner || null,
      clientInterest: lead.clientInterest,
      scopeDiscussion: {
        proposedProduct: 'Executive Advisory Diagnostic',
        clientObjectives: lead.scopeClientObjectives,
        sitesOrBusinessUnits: lead.scopeSitesOrBusinessUnits,
        indicativeScope: lead.scopeIndicativeScope,
        expectedTimeline: lead.scopeExpectedTimeline,
        commercialNotes: lead.scopeCommercialNotes,
      },
      proposalTemplate: this.buildProposalTemplateView(lead, latestProposal, extras),
      followUp: {
        nextFollowUpAt: lead.nextFollowUpAt,
        followUpOwner: lead.followUpOwner || null,
        followUpReason: lead.followUpReason,
      },
      contactActivities: bundle.contactActivities,
      proposals: bundle.proposals,
      activeProposal: latestProposal,
    };
  }

  private async persistStage(publicLeadId: string, stage: CommercialStage) {
    await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: { commercialStage: stage },
    });
  }

  async assignCommercialOwner(publicLeadId: string, commercialOwnerId: string | null, user: AuthUser) {
    this.assertCommercialWrite(user);
    if (commercialOwnerId) await this.assertCommercialOwnerCandidate(commercialOwnerId);
    const now = new Date();
    const updated = await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: {
        commercialOwnerId: commercialOwnerId || null,
        commercialOwnerAssignedAt: commercialOwnerId ? now : null,
      },
      include: {
        commercialOwner: { select: userSelect },
        followUpOwner: { select: userSelect },
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'COMMERCIAL_OWNER_ASSIGNED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: { commercialOwnerId: updated.commercialOwnerId },
    });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(updated, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(bundle.proposals[0]),
    });
    await this.persistStage(publicLeadId, stage);
    return updated;
  }

  async recordContactActivity(
    publicLeadId: string,
    input: {
      contactMethod: string;
      outcome: string;
      notes?: string;
      contactedAt?: string;
      nextFollowUpAt?: string | null;
    },
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    if (!lead.completedAt) {
      throw new BadRequestException('Complete the questionnaire before recording contact activity.');
    }

    const contactMethod = String(input.contactMethod || '').trim().toUpperCase();
    const outcome = String(input.outcome || '').trim().toUpperCase();
    if (!Object.values(TriageContactMethod).includes(contactMethod as TriageContactMethod)) {
      throw new BadRequestException('Unsupported contact method.');
    }
    if (!Object.values(TriageContactOutcome).includes(outcome as TriageContactOutcome)) {
      throw new BadRequestException('Unsupported contact outcome.');
    }

    const contactedAt = input.contactedAt ? new Date(input.contactedAt) : new Date();
    const nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
    const notes = input.notes?.trim() || null;

    const activity = await this.prisma.triageContactActivity.create({
      data: {
        publicLeadId,
        contactMethod: contactMethod as TriageContactMethod,
        outcome: outcome as TriageContactOutcome,
        contactedById: user.id,
        contactedAt,
        notes,
        nextFollowUpAt,
      },
      include: { contactedBy: { select: userSelect } },
    });

    const interest = clientInterestFromContact(outcome as TriageContactOutcome);
    const leadUpdate: Record<string, unknown> = {
      contactedAt: lead.contactedAt || contactedAt,
      reviewedAt: lead.reviewedAt || contactedAt,
      status: 'CONTACTED',
    };
    if (interest) leadUpdate.clientInterest = interest;
    if (nextFollowUpAt) {
      leadUpdate.nextFollowUpAt = nextFollowUpAt;
      leadUpdate.followUpOwnerId = lead.commercialOwnerId || user.id;
    }

    await this.prisma.publicLead.update({ where: { id: publicLeadId }, data: leadUpdate });

    await this.audit.record({
      userId: user.id,
      action: 'CLIENT_CONTACT_RECORDED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: {
        activityId: activity.id,
        contactMethod,
        outcome,
      },
    });

    const refreshed = await this.prisma.publicLead.findUnique({
      where: { id: publicLeadId },
      include: {
        commercialOwner: { select: userSelect },
        followUpOwner: { select: userSelect },
      },
    });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(refreshed!, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(bundle.proposals[0]),
    });
    await this.persistStage(publicLeadId, stage);
    return activity;
  }

  async updateScopeDiscussion(
    publicLeadId: string,
    input: {
      clientObjectives?: string;
      sitesOrBusinessUnits?: string;
      indicativeScope?: string;
      expectedTimeline?: string;
      commercialNotes?: string;
      fee?: number;
      currency?: string;
      terms?: string;
    },
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    const updated = await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: {
        scopeClientObjectives: input.clientObjectives?.trim() || null,
        scopeSitesOrBusinessUnits: input.sitesOrBusinessUnits?.trim() || null,
        scopeIndicativeScope: input.indicativeScope?.trim() || null,
        scopeExpectedTimeline: input.expectedTimeline?.trim() || null,
        scopeCommercialNotes: input.commercialNotes?.trim() || null,
      },
      include: {
        commercialOwner: { select: userSelect },
        followUpOwner: { select: userSelect },
      },
    });

    const activeProposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
    });
    if (activeProposal) {
      await this.prisma.triageProposal.update({
        where: { id: activeProposal.id },
        data: {
          objectives: input.clientObjectives?.trim() || activeProposal.objectives,
          sitesOrBusinessUnits:
            input.sitesOrBusinessUnits?.trim() || activeProposal.sitesOrBusinessUnits,
          scopeSummary: input.indicativeScope?.trim() || activeProposal.scopeSummary,
          timeline: input.expectedTimeline?.trim() || activeProposal.timeline,
          fee: input.fee !== undefined ? input.fee : activeProposal.fee,
          currency: input.currency?.trim() || activeProposal.currency,
          terms: input.terms?.trim() || activeProposal.terms,
        },
      });
    }
    await this.audit.record({
      userId: user.id,
      action: 'COMMERCIAL_DISCUSSION_RECORDED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
    });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(updated, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(bundle.proposals[0]),
    });
    await this.persistStage(publicLeadId, stage);
    return updated;
  }

  async updateClientInterest(publicLeadId: string, clientInterest: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const value = String(clientInterest || '').trim().toUpperCase();
    if (!Object.values(ClientInterest).includes(value as ClientInterest)) {
      throw new BadRequestException('Unsupported client interest value.');
    }
    const updated = await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: { clientInterest: value as ClientInterest },
    });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(updated, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(bundle.proposals[0]),
    });
    await this.persistStage(publicLeadId, stage);
    return updated;
  }

  async updateFollowUp(
    publicLeadId: string,
    input: {
      nextFollowUpAt?: string | null;
      followUpOwnerId?: string | null;
      followUpReason?: string | null;
    },
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    if (input.followUpOwnerId) await this.assertCommercialOwnerCandidate(input.followUpOwnerId);
    const updated = await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: {
        nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
        followUpOwnerId: input.followUpOwnerId || null,
        followUpReason: input.followUpReason?.trim() || null,
      },
      include: {
        commercialOwner: { select: userSelect },
        followUpOwner: { select: userSelect },
      },
    });
    return updated;
  }

  async uploadProposal(
    publicLeadId: string,
    file: Express.Multer.File,
    input: {
      proposalNumber?: string;
      title?: string;
      fee?: number;
      timeline?: string;
      status?: string;
    },
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    if (!file) throw new BadRequestException('Proposal file is required.');
    if (!PROPOSAL_MIME.has(file.mimetype)) {
      throw new BadRequestException('Upload PDF or Word documents only.');
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new BadRequestException('Proposal file exceeds 25 MB.');
    }

    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    if (!lead.completedAt) {
      throw new BadRequestException('Complete the questionnaire before uploading a proposal.');
    }

    const storageKey = `triage/${publicLeadId}/proposals/${Date.now()}-${file.originalname}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    const requestedStatus = String(input.status || 'DRAFT').trim().toUpperCase();
    const status = Object.values(TriageProposalStatus).includes(requestedStatus as TriageProposalStatus)
      ? (requestedStatus as TriageProposalStatus)
      : TriageProposalStatus.DRAFT;

    const existing = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
    });

    const hadDocument = Boolean(existing?.documentStorageKey);

    const proposal = await this.prisma.$transaction(async (tx) => {
      let proposalReference = lead.proposalReference;
      if (!proposalReference) {
        proposalReference = await generateProposalReference(tx);
      }

      const documentData = {
        documentStorageKey: storageKey,
        documentFileName: file.originalname,
        documentMimeType: file.mimetype,
        documentSizeBytes: file.size,
        source: TriageProposalSource.UPLOAD,
      };

      const saved = existing
        ? await tx.triageProposal.update({
            where: { id: existing.id },
            data: {
              ...documentData,
              proposalNumber: existing.proposalNumber || proposalReference,
              title: input.title?.trim() || existing.title,
              timeline: input.timeline?.trim() || existing.timeline,
              fee: input.fee != null ? input.fee : existing.fee,
              status: existing.documentStorageKey ? existing.status : status,
            },
            include: { createdBy: { select: userSelect } },
          })
        : await tx.triageProposal.create({
            data: {
              proposalNumber: input.proposalNumber?.trim() || proposalReference,
              publicLeadId,
              organisationId: lead.organisationId,
              sourceAssessmentId: lead.assessmentId,
              productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
              title: input.title?.trim() || `${lead.organisationName} — Executive Advisory Diagnostic`,
              scopeSummary: lead.scopeIndicativeScope || null,
              objectives: lead.scopeClientObjectives || null,
              sitesOrBusinessUnits: lead.scopeSitesOrBusinessUnits || null,
              timeline: input.timeline?.trim() || lead.scopeExpectedTimeline || null,
              fee: input.fee != null ? input.fee : null,
              status,
              ...documentData,
              createdById: user.id,
              sentAt: status === TriageProposalStatus.SENT ? new Date() : null,
              acceptedAt: status === TriageProposalStatus.ACCEPTED ? new Date() : null,
            },
            include: { createdBy: { select: userSelect } },
          });

      const effectiveStatus = saved.status;
      const mapped = mapTriageProposalToLeadStatus(effectiveStatus);
      const leadData: Record<string, unknown> = {
        proposalReference,
        proposalPreparedById: user.id,
        reviewedAt: lead.reviewedAt || new Date(),
      };
      if (mapped) {
        leadData.proposalStatus = mapped;
        if (mapped === ProposalStatus.SENT) leadData.proposalSentAt = new Date();
        if (mapped === ProposalStatus.ACCEPTED) {
          leadData.proposalAcceptedAt = new Date();
          leadData.acceptedProposalId = saved.id;
        }
      } else if (lead.proposalStatus === ProposalStatus.NOT_REQUESTED) {
        leadData.proposalStatus = ProposalStatus.IN_PREPARATION;
      }

      await tx.publicLead.update({ where: { id: publicLeadId }, data: leadData });
      return saved;
    });

    await this.audit.record({
      userId: user.id,
      action: hadDocument ? 'PROPOSAL_DOCUMENT_REPLACED' : 'PROPOSAL_DOCUMENT_UPLOADED',
      entityType: 'TriageProposal',
      entityId: proposal.id,
      metadata: {
        publicLeadId,
        proposalNumber: proposal.proposalNumber,
        fileName: file.originalname,
      },
    });

    const refreshed = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(refreshed!, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(proposal),
    });
    await this.persistStage(publicLeadId, stage);
    return proposal;
  }

  async updateProposalFields(
    publicLeadId: string,
    proposalId: string,
    input: {
      title?: string;
      scopeSummary?: string;
      objectives?: string;
      sitesOrBusinessUnits?: string;
      deliverables?: string;
      evidenceRequirements?: string;
      timeline?: string;
      fee?: number;
      currency?: string;
      validUntil?: string;
      terms?: string;
    },
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    const existing = await this.prisma.triageProposal.findFirst({
      where: { id: proposalId, publicLeadId },
    });
    if (!existing) throw new NotFoundException('Proposal not found.');

    const data: Record<string, unknown> = {};
    const stringFields = [
      'title',
      'scopeSummary',
      'objectives',
      'sitesOrBusinessUnits',
      'deliverables',
      'evidenceRequirements',
      'timeline',
      'terms',
      'currency',
    ] as const;
    for (const key of stringFields) {
      if (input[key] !== undefined) data[key] = String(input[key] || '').trim() || null;
    }
    if (input.fee !== undefined) data.fee = input.fee != null ? Number(input.fee) : null;
    if (input.validUntil !== undefined) {
      data.validUntil = input.validUntil ? new Date(String(input.validUntil)) : null;
    }

    return this.prisma.triageProposal.update({
      where: { id: proposalId },
      data,
      include: { createdBy: { select: userSelect } },
    });
  }

  async proposalRecordAction(
    publicLeadId: string,
    proposalId: string,
    action: string,
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    const normalized = String(action || '').trim().toUpperCase();
    if (!PROPOSAL_ACTIONS.has(normalized)) {
      throw new BadRequestException('Unsupported proposal action.');
    }

    const proposal = await this.prisma.triageProposal.findFirst({
      where: { id: proposalId, publicLeadId },
    });
    if (!proposal) throw new NotFoundException('Proposal not found.');
    if (!proposal.documentStorageKey && normalized !== 'WITHDRAW') {
      throw new BadRequestException('Upload the external proposal document before updating its status.');
    }

    const now = new Date();
    let next = proposal.status;
    let auditAction = 'PROPOSAL_UPDATED';

    if (normalized === 'INTERNAL_REVIEW') next = TriageProposalStatus.INTERNAL_REVIEW;
    else if (normalized === 'APPROVE') next = TriageProposalStatus.APPROVED;
    else if (normalized === 'SENT') {
      next = TriageProposalStatus.SENT;
      auditAction = 'PROPOSAL_SENT';
    } else if (normalized === 'VIEWED') next = TriageProposalStatus.VIEWED;
    else if (normalized === 'ACCEPTED') {
      next = TriageProposalStatus.ACCEPTED;
      auditAction = 'PROPOSAL_ACCEPTED';
    } else if (normalized === 'DECLINED') {
      next = TriageProposalStatus.DECLINED;
      auditAction = 'PROPOSAL_DECLINED';
    } else if (normalized === 'EXPIRE') next = TriageProposalStatus.EXPIRED;
    else if (normalized === 'WITHDRAW') next = TriageProposalStatus.WITHDRAWN;

    const updated = await this.prisma.triageProposal.update({
      where: { id: proposalId },
      data: {
        status: next,
        sentAt:
          next === TriageProposalStatus.SENT || next === TriageProposalStatus.VIEWED
            ? proposal.sentAt || now
            : proposal.sentAt,
        viewedAt: next === TriageProposalStatus.VIEWED ? proposal.viewedAt || now : proposal.viewedAt,
        acceptedAt: next === TriageProposalStatus.ACCEPTED ? proposal.acceptedAt || now : proposal.acceptedAt,
        declinedAt: next === TriageProposalStatus.DECLINED ? proposal.declinedAt || now : proposal.declinedAt,
        ...(next === TriageProposalStatus.SENT && !proposal.sentSnapshot
          ? {
              sentSnapshot: {
                contentSnapshot: proposal.contentSnapshot,
                understandingOfNeeds: proposal.understandingOfNeeds,
                objectives: proposal.objectives,
                scopeSummary: proposal.scopeSummary,
                deliverables: proposal.deliverables,
                termsAndConditions: proposal.termsAndConditions,
                sentAt: now.toISOString(),
              },
            }
          : {}),
      },
      include: { createdBy: { select: userSelect } },
    });

    const mapped = mapTriageProposalToLeadStatus(next);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (lead && mapped) {
      const leadData: Record<string, unknown> = { proposalStatus: mapped };
      if (mapped === ProposalStatus.SENT) {
        leadData.proposalSentAt = lead.proposalSentAt || now;
        leadData.contactedAt = lead.contactedAt || now;
      }
      if (mapped === ProposalStatus.ACCEPTED) {
        leadData.proposalAcceptedAt = lead.proposalAcceptedAt || now;
        leadData.acceptedProposalId = proposalId;
      }
      if (mapped === ProposalStatus.DECLINED) leadData.proposalDeclinedAt = lead.proposalDeclinedAt || now;
      await this.prisma.publicLead.update({ where: { id: publicLeadId }, data: leadData });
    }

    await this.audit.record({
      userId: user.id,
      action: auditAction,
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: {
        proposalId,
        proposalNumber: updated.proposalNumber,
        previousStatus: proposal.status,
        newStatus: next,
      },
    });

    const refreshed = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(refreshed!, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(updated),
    });
    await this.persistStage(publicLeadId, stage);
    return updated;
  }

  async downloadProposal(publicLeadId: string, proposalId: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const proposal = await this.prisma.triageProposal.findFirst({
      where: { id: proposalId, publicLeadId },
    });
    if (!proposal?.documentStorageKey) {
      throw new NotFoundException('Proposal document not found.');
    }
    const url = await this.storage.signedDownloadUrl(
      proposal.documentStorageKey,
      900,
      proposal.documentFileName || 'proposal.pdf',
    );
    return { url, fileName: proposal.documentFileName, mimeType: proposal.documentMimeType };
  }

  private buildProposalTemplateView(
    lead: any,
    proposal: any,
    extras: {
      assessmentReference?: string | null;
      qualification?: Record<string, unknown> | null;
    } = {},
  ) {
    const pdfInput = this.toProposalPdfInput(lead, proposal, extras);
    const defaults = buildProposalPdfDefaults(pdfInput);
    const snapshot = readProposalContextSnapshot(proposal?.contextSnapshot);
    const addressee = ((snapshot as any)?.proposalAddressee || {}) as Record<string, string | null>;
    const storedIntro =
      snapshot && typeof (snapshot as any).proposalIntroduction === 'string'
        ? String((snapshot as any).proposalIntroduction)
        : null;
    return {
      organisationName: addressee.organisationName || pdfInput.organisationName,
      addressedTo: addressee.addressedTo || pdfInput.prospectName,
      jobTitle: addressee.jobTitle || pdfInput.prospectJobTitle || null,
      email: addressee.email || pdfInput.prospectEmail || null,
      phone: addressee.phone || snapshot?.prospect?.phone || lead.phone || null,
      triageReference: pdfInput.sourceTriageReference,
      assuranceScore: pdfInput.assuranceScore,
      assuranceBandLabel: pdfInput.assuranceBandLabel,
      strongestIndicators: pdfInput.strongestIndicators || [],
      primaryConcern: pdfInput.primaryConcern,
      introduction: storedIntro || defaults.introduction,
      deliverables: proposal?.deliverables || defaults.deliverables,
      terms: proposal?.terms || defaults.terms,
      clientObjective:
        proposal?.objectives || lead.scopeClientObjectives || pdfInput.clientObjective,
      sitesOrBusinessUnits:
        proposal?.sitesOrBusinessUnits
        || lead.scopeSitesOrBusinessUnits
        || pdfInput.sitesOrBusinessUnits,
      indicativeScope:
        proposal?.scopeSummary || lead.scopeIndicativeScope || pdfInput.indicativeScope,
      timeline: proposal?.timeline || lead.scopeExpectedTimeline || pdfInput.timeline,
      fee: proposal?.fee != null ? Number(proposal.fee) : null,
      currency: proposal?.currency || 'ZAR',
      hasGeneratedDocument: Boolean(proposal?.documentStorageKey),
      documentFileName: proposal?.documentFileName || null,
      source: proposal?.source || null,
    };
  }

  private toProposalPdfInput(
    lead: any,
    proposal: any,
    extras: {
      assessmentReference?: string | null;
      qualification?: Record<string, unknown> | null;
    } = {},
    overrides: Record<string, unknown> = {},
  ): ProposalPdfInput {
    const snapshot = readProposalContextSnapshot(proposal?.contextSnapshot);
    const addressee = ((snapshot as any)?.proposalAddressee || {}) as Record<string, string | null>;
    const storedIntro =
      snapshot && typeof (snapshot as any).proposalIntroduction === 'string'
        ? String((snapshot as any).proposalIntroduction)
        : null;
    const prospectName = [
      snapshot?.prospect?.firstName || lead.firstName,
      snapshot?.prospect?.lastName || lead.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    const issued = new Date();
    return {
      proposalNumber:
        proposal?.proposalNumber || lead.proposalReference || 'DRAFT',
      organisationName:
        (overrides.organisationName as string | undefined)
        || addressee.organisationName
        || snapshot?.organisation?.name
        || lead.organisationName,
      prospectName:
        (overrides.addressedTo as string | undefined)
        || addressee.addressedTo
        || prospectName,
      prospectJobTitle:
        (overrides.jobTitle as string | undefined)
        || addressee.jobTitle
        || snapshot?.prospect?.jobTitle
        || (extras.qualification?.jobTitle as string | undefined)
        || null,
      prospectEmail:
        (overrides.email as string | undefined)
        || addressee.email
        || snapshot?.prospect?.email
        || lead.email,
      prospectPhone:
        (overrides.phone as string | undefined)
        || addressee.phone
        || snapshot?.prospect?.phone
        || lead.phone
        || null,
      industry: snapshot?.organisation?.industry || lead.industry,
      country:
        snapshot?.organisation?.country
        || (extras.qualification?.country as string | undefined)
        || null,
      sourceTriageReference:
        snapshot?.triageReference || extras.assessmentReference || null,
      assuranceScore: snapshot?.assuranceScore ?? null,
      assuranceBandLabel: snapshot?.assuranceBandLabel ?? null,
      strongestIndicators: (snapshot?.strongestIndicators || []).map(
        (row) => row.category,
      ),
      primaryConcern:
        snapshot?.primaryConcern
        || (extras.qualification?.primaryConcern as string | undefined)
        || null,
      clientObjective:
        (overrides.clientObjective as string | undefined)
        || proposal?.objectives
        || lead.scopeClientObjectives
        || null,
      sitesOrBusinessUnits:
        (overrides.sitesOrBusinessUnits as string | undefined)
        || proposal?.sitesOrBusinessUnits
        || lead.scopeSitesOrBusinessUnits
        || snapshot?.organisation?.operationalSitesLabel
        || null,
      indicativeScope:
        (overrides.indicativeScope as string | undefined)
        || proposal?.scopeSummary
        || lead.scopeIndicativeScope
        || null,
      timeline:
        (overrides.timeline as string | undefined)
        || proposal?.timeline
        || lead.scopeExpectedTimeline
        || null,
      fee:
        overrides.fee !== undefined
          ? (overrides.fee as number | null)
          : proposal?.fee != null
            ? Number(proposal.fee)
            : null,
      currency:
        (overrides.currency as string | undefined) || proposal?.currency || 'ZAR',
      deliverables:
        (overrides.deliverables as string | undefined) || proposal?.deliverables || null,
      terms: (overrides.terms as string | undefined) || proposal?.terms || null,
      introduction:
        (overrides.introduction as string | undefined) || storedIntro || null,
      preparedByName: null,
      preparedByEmail: null,
      validUntilLabel: proposal?.validUntil
        ? new Date(proposal.validUntil).toLocaleDateString('en-ZA', { dateStyle: 'long' })
        : null,
      issuedDateLabel: issued.toLocaleDateString('en-ZA', { dateStyle: 'long' }),
    };
  }

  private async ensureAdminProposalDraft(publicLeadId: string, user: AuthUser) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    if (!lead.completedAt) {
      throw new BadRequestException('Complete the triage questionnaire before preparing a proposal.');
    }

    if (lead.assessmentId) {
      await this.proposalRequests.ensureProposalRequestFromPublicLead(publicLeadId, user.id);
      const existing = await this.prisma.triageProposal.findFirst({
        where: { publicLeadId },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) return existing;
    }

    const proposalReference =
      lead.proposalReference
      || (await this.prisma.$transaction((tx) => generateProposalReference(tx)));

    if (!lead.proposalReference) {
      await this.prisma.publicLead.update({
        where: { id: publicLeadId },
        data: {
          proposalReference,
          proposalStatus:
            lead.proposalStatus === ProposalStatus.NOT_REQUESTED
              ? ProposalStatus.IN_PREPARATION
              : lead.proposalStatus,
          proposalRequestedAt: lead.proposalRequestedAt || new Date(),
        },
      });
    }

    const template = resolveTemplateConfig('EXECUTIVE_ADVISORY_DIAGNOSTIC');
    const defaultContent = buildDefaultContentSnapshot('EXECUTIVE_ADVISORY_DIAGNOSTIC', template);
    const feeDefaults = template.feeDefaults || {
      analystHourlyRate: 985,
      specialistHourlyRate: 1825,
      vatRate: 0.15,
      currency: 'ZAR',
      paymentTerms: '50% on acceptance, 50% on delivery',
    };

    return this.prisma.triageProposal.create({
      data: {
        proposalNumber: proposalReference,
        publicLeadId,
        organisationId: lead.organisationId,
        sourceAssessmentId: lead.assessmentId,
        productCode: 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
        title: `${lead.organisationName} — Executive Advisory Diagnostic`,
        status: TriageProposalStatus.DRAFT,
        source: TriageProposalSource.PLATFORM,
        createdById: user.id,
        contentSnapshot: defaultContent as object,
        analystHourlyRate: feeDefaults.analystHourlyRate,
        specialistHourlyRate: feeDefaults.specialistHourlyRate,
        vatRate: feeDefaults.vatRate,
        paymentTerms: feeDefaults.paymentTerms,
        currency: feeDefaults.currency,
      },
    });
  }

  private async loadProposalWithRelations(publicLeadId: string, user: AuthUser) {
    let proposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
      include: { template: true, organisation: true },
    });
    if (!proposal) {
      await this.ensureAdminProposalDraft(publicLeadId, user);
      proposal = await this.prisma.triageProposal.findFirst({
        where: { publicLeadId },
        orderBy: { createdAt: 'asc' },
        include: { template: true, organisation: true },
      });
    }
    if (!proposal) {
      throw new NotFoundException('Proposal workspace could not be initialized.');
    }
    return this.hydrateProposalWorkspace(publicLeadId, proposal);
  }

  private async hydrateProposalWorkspace(publicLeadId: string, proposal: any) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) return proposal;

    const content = readContentSnapshot(proposal.contentSnapshot);
    const hasStructuredContent = content.phases.length > 0 || content.feeLineItems.length > 0;
    const template = resolveTemplateConfig(
      proposal.productCode,
      proposal.template as Parameters<typeof resolveTemplateConfig>[1],
    );
    const defaultContent = buildDefaultContentSnapshot(proposal.productCode, template);
    const pdfInput = buildPhysicalRiskProposalInput({
      lead,
      organisation: proposal.organisation,
      proposal: proposal as Record<string, unknown>,
      template,
    });

    // Only seed missing structured content / rates. Do not inject template narrative
    // into blank admin fields — those stay blank until the admin fills them.
    const patch: Record<string, unknown> = {};
    if (!hasStructuredContent) patch.contentSnapshot = defaultContent;
    if (proposal.objectives?.trim()) {
      const cleaned = dedupeRepeatedNarrative(proposal.objectives);
      if (cleaned !== proposal.objectives) patch.objectives = cleaned;
    }
    if (proposal.understandingOfNeeds?.trim()) {
      const cleaned = dedupeRepeatedNarrative(proposal.understandingOfNeeds);
      if (cleaned !== proposal.understandingOfNeeds) patch.understandingOfNeeds = cleaned;
    } else if (pdfInput.understandingOfNeeds?.trim()) {
      // Triage-derived understanding (not builtin template boilerplate)
      patch.understandingOfNeeds = pdfInput.understandingOfNeeds;
    }
    if (!proposal.paymentTerms?.trim() && pdfInput.paymentTerms?.trim()) {
      patch.paymentTerms = pdfInput.paymentTerms;
    }
    if (proposal.analystHourlyRate == null) patch.analystHourlyRate = pdfInput.analystHourlyRate;
    if (proposal.specialistHourlyRate == null) patch.specialistHourlyRate = pdfInput.specialistHourlyRate;
    if (proposal.vatRate == null) patch.vatRate = pdfInput.vatRate;

    if (!Object.keys(patch).length) return proposal;

    return this.prisma.triageProposal.update({
      where: { id: proposal.id },
      data: patch,
      include: { template: true, organisation: true },
    });
  }

  async getProposalWorkspace(publicLeadId: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const templateView = await this.getProposalTemplate(publicLeadId, user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    const proposal = await this.loadProposalWithRelations(publicLeadId, user);
    const content = readContentSnapshot(proposal.contentSnapshot);
    const feeLineItems = recalculateAllLineItems(content.feeLineItems);
    const feeTotals = calculateProposalFees({
      lineItems: feeLineItems,
      discount: Number(proposal.discount) || 0,
      vatRate: Number(proposal.vatRate) || 0.15,
      expensesEstimate: Number(proposal.expensesEstimate) || 0,
    });
    const validation = validateProposalForSend(
      buildPhysicalRiskProposalInput({
        lead,
        organisation: proposal.organisation,
        proposal: { ...proposal, contentSnapshot: { ...content, feeLineItems } } as Record<string, unknown>,
      }),
    );
    return {
      ...templateView,
      productCode: proposal.productCode,
      subtitle: proposal.subtitle,
      understandingOfNeeds: proposal.understandingOfNeeds,
      methodology: proposal.methodology,
      approach: proposal.approach,
      exclusions: proposal.exclusions,
      assumptions: proposal.assumptions,
      statementOfResponsibility: proposal.statementOfResponsibility,
      termsAndConditions: proposal.termsAndConditions,
      acceptanceTerms: proposal.acceptanceTerms,
      analystHourlyRate: proposal.analystHourlyRate != null ? Number(proposal.analystHourlyRate) : null,
      specialistHourlyRate: proposal.specialistHourlyRate != null ? Number(proposal.specialistHourlyRate) : null,
      discount: proposal.discount != null ? Number(proposal.discount) : 0,
      vatRate: proposal.vatRate != null ? Number(proposal.vatRate) : 0.15,
      expensesEstimate: proposal.expensesEstimate != null ? Number(proposal.expensesEstimate) : 0,
      paymentTerms: proposal.paymentTerms,
      estimatedProjectWeeks: proposal.estimatedProjectWeeks,
      timelineNarrative: proposal.timelineNarrative,
      projectSponsor: proposal.projectSponsor,
      projectChampion: proposal.projectChampion,
      currency: proposal.currency || templateView.currency || 'ZAR',
      contentSnapshot: content,
      feeTotals,
      readyToSend: canMarkReadyToSend(
        buildPhysicalRiskProposalInput({
          lead,
          organisation: proposal.organisation,
          proposal: { ...proposal, contentSnapshot: { ...content, feeLineItems } } as Record<string, unknown>,
        }),
      ),
      validationIssues: validation,
      version: proposal.version,
      status: proposal.status,
      hasDocument: Boolean(proposal.documentStorageKey),
      proposalId: proposal.id,
    };
  }

  async getProposalTemplate(publicLeadId: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const lead = await this.prisma.publicLead.findUnique({
      where: { id: publicLeadId },
      include: {
        commercialOwner: { select: userSelect },
      },
    });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    const proposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
    });
    let assessmentReference: string | null = null;
    if (lead.assessmentId) {
      assessmentReference =
        (
          await this.prisma.assessmentSession.findUnique({
            where: { id: lead.assessmentId },
            select: { reference: true },
          })
        )?.reference || null;
    }
    return this.buildProposalTemplateView(lead, proposal, { assessmentReference });
  }

  async saveProposalTemplate(
    publicLeadId: string,
    input: {
      introduction?: string;
      deliverables?: string;
      terms?: string;
      clientObjective?: string;
      sitesOrBusinessUnits?: string;
      indicativeScope?: string;
      timeline?: string;
      fee?: number | null;
      currency?: string;
      organisationName?: string;
      addressedTo?: string;
      jobTitle?: string;
      email?: string;
      phone?: string;
      subtitle?: string;
      understandingOfNeeds?: string;
      methodology?: string;
      approach?: string;
      exclusions?: string;
      assumptions?: string;
      statementOfResponsibility?: string;
      termsAndConditions?: string;
      acceptanceTerms?: string;
      analystHourlyRate?: number | null;
      specialistHourlyRate?: number | null;
      discount?: number | null;
      vatRate?: number | null;
      expensesEstimate?: number | null;
      paymentTerms?: string;
      estimatedProjectWeeks?: number | null;
      timelineNarrative?: string;
      projectSponsor?: string;
      projectChampion?: string;
      productCode?: string;
      title?: string;
      contentSnapshot?: ProposalContentSnapshot | Record<string, unknown>;
      expectedGrandTotal?: number | null;
    },
    user: AuthUser,
  ) {
    this.assertCommercialWrite(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');

    let proposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
    });
    if (!proposal) {
      proposal = await this.ensureAdminProposalDraft(publicLeadId, user);
    }

    const existingContent = readContentSnapshot(proposal.contentSnapshot);
    const parsedIncoming =
      input.contentSnapshot !== undefined ? readContentSnapshot(input.contentSnapshot) : null;
    const mergedContent =
      parsedIncoming !== null ? mergeContentSnapshot(existingContent, parsedIncoming) : existingContent;
    const nextContent: ProposalContentSnapshot = {
      ...mergedContent,
      feeLineItems: recalculateAllLineItems(mergedContent.feeLineItems),
    };

    const nextDiscount =
      input.discount !== undefined ? Number(input.discount) || 0 : Number(proposal.discount) || 0;
    const nextVatRate =
      input.vatRate !== undefined ? Number(input.vatRate) || 0 : Number(proposal.vatRate) || 0.15;
    const nextExpenses =
      input.expensesEstimate !== undefined
        ? Number(input.expensesEstimate) || 0
        : Number(proposal.expensesEstimate) || 0;
    const feeTotals = calculateProposalFees({
      lineItems: nextContent.feeLineItems,
      discount: nextDiscount,
      vatRate: nextVatRate,
      expensesEstimate: nextExpenses,
    });

    if (
      input.expectedGrandTotal != null
      && Math.abs(feeTotals.grandTotal - Number(input.expectedGrandTotal)) > 0.01
    ) {
      throw new BadRequestException(
        `Fee total mismatch: server calculated ${feeTotals.grandTotal}, client sent ${input.expectedGrandTotal}.`,
      );
    }

    const sentStatuses: TriageProposalStatus[] = [
      TriageProposalStatus.SENT,
      TriageProposalStatus.VIEWED,
      TriageProposalStatus.ACCEPTED,
    ];
    const materialEdit =
      input.contentSnapshot !== undefined
      || input.understandingOfNeeds !== undefined
      || input.methodology !== undefined
      || input.approach !== undefined
      || input.exclusions !== undefined
      || input.assumptions !== undefined
      || input.termsAndConditions !== undefined
      || input.acceptanceTerms !== undefined
      || input.fee !== undefined
      || input.discount !== undefined
      || input.vatRate !== undefined
      || input.expensesEstimate !== undefined;
    const bumpVersion =
      sentStatuses.includes(proposal.status) && materialEdit && Boolean(proposal.documentStorageKey);

    const existingSnap = (proposal.contextSnapshot as Record<string, unknown>) || {};
    const existingAddressee =
      (existingSnap.proposalAddressee as Record<string, unknown> | undefined) || {};
    const snapshot = {
      ...existingSnap,
      proposalIntroduction:
        input.introduction !== undefined
          ? input.introduction.trim() || null
          : ((existingSnap.proposalIntroduction as string | null | undefined) ?? null),
      proposalAddressee: {
        organisationName:
          input.organisationName !== undefined
            ? input.organisationName.trim() || null
            : existingAddressee.organisationName ?? null,
        addressedTo:
          input.addressedTo !== undefined
            ? input.addressedTo.trim() || null
            : existingAddressee.addressedTo ?? null,
        jobTitle:
          input.jobTitle !== undefined
            ? input.jobTitle.trim() || null
            : existingAddressee.jobTitle ?? null,
        email:
          input.email !== undefined
            ? input.email.trim() || null
            : existingAddressee.email ?? null,
        phone:
          input.phone !== undefined
            ? input.phone.trim() || null
            : existingAddressee.phone ?? null,
      },
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.publicLead.update({
        where: { id: publicLeadId },
        data: {
          scopeClientObjectives:
            input.clientObjective !== undefined
              ? dedupeRepeatedNarrative(input.clientObjective).trim() || null
              : lead.scopeClientObjectives,
          scopeSitesOrBusinessUnits:
            input.sitesOrBusinessUnits !== undefined
              ? input.sitesOrBusinessUnits.trim() || null
              : lead.scopeSitesOrBusinessUnits,
          scopeIndicativeScope:
            input.indicativeScope !== undefined
              ? input.indicativeScope.trim() || null
              : lead.scopeIndicativeScope,
          scopeExpectedTimeline:
            input.timeline !== undefined ? input.timeline.trim() || null : lead.scopeExpectedTimeline,
        },
      });

      proposal = await tx.triageProposal.update({
        where: { id: proposal!.id },
        data: {
          title: input.title?.trim() || proposal!.title,
          productCode: input.productCode?.trim() || proposal!.productCode,
          subtitle: input.subtitle !== undefined ? input.subtitle.trim() || null : proposal!.subtitle,
          objectives:
            input.clientObjective !== undefined
              ? dedupeRepeatedNarrative(input.clientObjective).trim() || null
              : proposal!.objectives,
          sitesOrBusinessUnits:
            input.sitesOrBusinessUnits !== undefined
              ? input.sitesOrBusinessUnits.trim() || null
              : proposal!.sitesOrBusinessUnits,
          scopeSummary:
            input.indicativeScope !== undefined
              ? input.indicativeScope.trim() || null
              : proposal!.scopeSummary,
          timeline:
            input.timeline !== undefined ? input.timeline.trim() || null : proposal!.timeline,
          fee:
            input.contentSnapshot !== undefined
              || input.discount !== undefined
              || input.vatRate !== undefined
              || input.expensesEstimate !== undefined
              ? feeTotals.grandTotal
              : input.fee !== undefined
                ? input.fee
                : proposal!.fee,
          version: bumpVersion ? (proposal!.version || 1) + 1 : proposal!.version,
          currency: input.currency?.trim() || proposal!.currency,
          deliverables:
            input.deliverables !== undefined
              ? input.deliverables.trim() || null
              : proposal!.deliverables,
          terms: input.terms !== undefined ? input.terms.trim() || null : proposal!.terms,
          understandingOfNeeds:
            input.understandingOfNeeds !== undefined
              ? dedupeRepeatedNarrative(input.understandingOfNeeds).trim() || null
              : proposal!.understandingOfNeeds,
          methodology:
            input.methodology !== undefined ? input.methodology.trim() || null : proposal!.methodology,
          approach: input.approach !== undefined ? input.approach.trim() || null : proposal!.approach,
          exclusions:
            input.exclusions !== undefined ? input.exclusions.trim() || null : proposal!.exclusions,
          assumptions:
            input.assumptions !== undefined ? input.assumptions.trim() || null : proposal!.assumptions,
          statementOfResponsibility:
            input.statementOfResponsibility !== undefined
              ? input.statementOfResponsibility.trim() || null
              : proposal!.statementOfResponsibility,
          termsAndConditions:
            input.termsAndConditions !== undefined
              ? input.termsAndConditions.trim() || null
              : proposal!.termsAndConditions,
          acceptanceTerms:
            input.acceptanceTerms !== undefined
              ? input.acceptanceTerms.trim() || null
              : proposal!.acceptanceTerms,
          analystHourlyRate:
            input.analystHourlyRate !== undefined ? input.analystHourlyRate : proposal!.analystHourlyRate,
          specialistHourlyRate:
            input.specialistHourlyRate !== undefined
              ? input.specialistHourlyRate
              : proposal!.specialistHourlyRate,
          discount: input.discount !== undefined ? input.discount : proposal!.discount,
          vatRate: input.vatRate !== undefined ? input.vatRate : proposal!.vatRate,
          expensesEstimate:
            input.expensesEstimate !== undefined ? input.expensesEstimate : proposal!.expensesEstimate,
          paymentTerms:
            input.paymentTerms !== undefined ? input.paymentTerms.trim() || null : proposal!.paymentTerms,
          estimatedProjectWeeks:
            input.estimatedProjectWeeks !== undefined
              ? input.estimatedProjectWeeks
              : proposal!.estimatedProjectWeeks,
          timelineNarrative:
            input.timelineNarrative !== undefined
              ? input.timelineNarrative.trim() || null
              : proposal!.timelineNarrative,
          projectSponsor:
            input.projectSponsor !== undefined ? input.projectSponsor.trim() || null : proposal!.projectSponsor,
          projectChampion:
            input.projectChampion !== undefined
              ? input.projectChampion.trim() || null
              : proposal!.projectChampion,
          contentSnapshot: nextContent as object,
          contextSnapshot: snapshot as object,
        },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'PROPOSAL_TEMPLATE_UPDATED',
      entityType: 'TriageProposal',
      entityId: proposal.id,
      metadata: { proposalNumber: proposal.proposalNumber, publicLeadId },
    });

    return this.getProposalTemplate(publicLeadId, user);
  }

  async previewProposalPdf(publicLeadId: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const { buffer, fileName } = await this.renderProposalBuffer(publicLeadId, user);
    return { buffer, fileName, contentType: 'application/pdf' };
  }

  async generateProposalPdf(publicLeadId: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');

    let proposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
    });
    if (!proposal) {
      proposal = await this.ensureAdminProposalDraft(publicLeadId, user);
    }

    const { buffer, fileName } = await this.renderProposalBuffer(publicLeadId, user);
    const storageKey = `triage/${publicLeadId}/proposals/${Date.now()}-${fileName}`;
    await this.storage.put(storageKey, buffer, 'application/pdf');

    const hadDocument = Boolean(proposal.documentStorageKey);
    const updated = await this.prisma.triageProposal.update({
      where: { id: proposal.id },
      data: {
        documentStorageKey: storageKey,
        documentFileName: fileName,
        documentMimeType: 'application/pdf',
        documentSizeBytes: buffer.length,
        source: TriageProposalSource.PLATFORM,
        version: (proposal.version || 1) + (hadDocument ? 1 : 0),
      },
      include: { createdBy: { select: userSelect } },
    });

    await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: {
        ...(lead.proposalStatus === ProposalStatus.NOT_REQUESTED
          || lead.proposalStatus === ProposalStatus.REQUESTED
          ? {
              proposalStatus: ProposalStatus.IN_PREPARATION,
              proposalReference: lead.proposalReference || updated.proposalNumber,
            }
          : {}),
        proposalPreparedById: user.id,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: hadDocument ? 'PROPOSAL_DOCUMENT_REPLACED' : 'PROPOSAL_DOCUMENT_UPLOADED',
      entityType: 'TriageProposal',
      entityId: updated.id,
      metadata: {
        publicLeadId,
        proposalNumber: updated.proposalNumber,
        fileName,
        generated: true,
      },
    });

    const refreshed = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    const bundle = await this.loadCommercialBundle(publicLeadId);
    const stage = resolveCommercialStage(refreshed!, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(updated),
    });
    await this.persistStage(publicLeadId, stage);
    return updated;
  }

  async sendProposalToClient(publicLeadId: string, user: AuthUser) {
    this.assertCommercialWrite(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: publicLeadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');

    let proposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId },
      orderBy: { createdAt: 'asc' },
    });
    if (!proposal) throw new BadRequestException('No proposal workspace exists yet.');

    if (proposalPdfV2Enabled()) {
      const org = lead.organisationId
        ? await this.prisma.organisation.findUnique({ where: { id: lead.organisationId } })
        : null;
      const pdfInput = buildPhysicalRiskProposalInput({
        lead,
        organisation: org,
        proposal: proposal as Record<string, unknown>,
      });
      if (!canMarkReadyToSend(pdfInput)) {
        const issues = validateProposalForSend(pdfInput).filter((i) => i.blocking);
        throw new BadRequestException(
          issues.length
            ? `Proposal is not ready to send: ${issues.map((i) => i.message).join(' ')}`
            : 'Proposal is not ready to send.',
        );
      }
    }

    // Always regenerate so the signature block matches the logged-in sender
    // (Analyst / Administrator / etc.), not whoever last generated the PDF.
    proposal = await this.generateProposalPdf(publicLeadId, user);

    await this.prisma.publicLead.update({
      where: { id: publicLeadId },
      data: { proposalPreparedById: user.id },
    });

    await this.email.enqueue({
      recipient: lead.email,
      subject: `Executive Advisory Proposal — ${lead.organisationName}`,
      template: 'triage_proposal_sent',
      relatedType: 'TriageProposal',
      relatedId: proposal.id,
      organisationId: lead.organisationId || undefined,
      payload: {
        firstName: lead.firstName,
        organisationName: lead.organisationName,
        proposalReference: proposal.proposalNumber,
        recommendedProduct: 'Executive Advisory Diagnostic',
        attachmentStorageKey: proposal.documentStorageKey,
        attachmentFileName:
          proposal.documentFileName
          || `Physical_Risk_Executive_Advisory_Proposal_${lead.organisationName.replace(/\s+/g, '_')}.pdf`,
        attachmentContentType: proposal.documentMimeType || 'application/pdf',
      },
    });

    const updated = await this.proposalRecordAction(publicLeadId, proposal.id, 'SENT', user);

    await this.audit.record({
      userId: user.id,
      action: 'PROPOSAL_SENT_TO_CLIENT',
      entityType: 'TriageProposal',
      entityId: proposal.id,
      metadata: {
        publicLeadId,
        proposalNumber: proposal.proposalNumber,
        recipient: lead.email,
      },
    });

    return updated;
  }

  private async renderProposalBuffer(publicLeadId: string, user: AuthUser) {
    const lead = await this.prisma.publicLead.findUnique({
      where: { id: publicLeadId },
    });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    const proposal = await this.loadProposalWithRelations(publicLeadId, user);

    let assessmentReference: string | null = null;
    if (lead.assessmentId) {
      assessmentReference =
        (
          await this.prisma.assessmentSession.findUnique({
            where: { id: lead.assessmentId },
            select: { reference: true },
          })
        )?.reference || null;
    }

    const organisation =
      proposal.organisation
      || (lead.organisationId
        ? await this.prisma.organisation.findUnique({ where: { id: lead.organisationId } })
        : null);

    const prepared = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true, email: true, systemRole: true },
    });
    const sender = this.resolveProposalSenderSignature(prepared);

    if (proposalPdfV2Enabled()) {
      const template = resolveTemplateConfig(
        proposal.productCode,
        proposal.template as Parameters<typeof resolveTemplateConfig>[1],
      );
      const pdfInput = buildPhysicalRiskProposalInput({
        lead,
        organisation,
        proposal: proposal as Record<string, unknown>,
        template,
        assessmentReference,
        preparedByName: sender.name,
        preparedByEmail: sender.email,
      });
      const buffer = await renderPhysicalRiskProposalPdf(pdfInput);
      const orgSlug = lead.organisationName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      const fileName = `Physical_Risk_Proposal_${orgSlug || 'Client'}_${proposal.proposalNumber}_v${proposal.version || 1}.pdf`;
      return { buffer, fileName, pdfInput };
    }

    const pdfInput = this.toProposalPdfInput(lead, proposal, { assessmentReference });
    pdfInput.preparedByName = sender.name;
    pdfInput.preparedByEmail = sender.email;
    const buffer = await renderExecutiveAdvisoryProposalPdf(pdfInput);
    const orgSlug = lead.organisationName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const fileName = `Physical_Risk_Executive_Advisory_Proposal_${orgSlug || 'Client'}_v${
      proposal.version || 1
    }.pdf`;
    return { buffer, fileName, pdfInput };
  }

  private resolveProposalSenderSignature(
    prepared: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      systemRole?: string | null;
    } | null,
  ): { name: string | null; email: string | null } {
    const fullName = [prepared?.firstName, prepared?.lastName].filter(Boolean).join(' ').trim();
    const roleLabel = this.proposalSenderRoleLabel(prepared?.systemRole);
    return {
      // Prefer the logged-in user's name; fall back to role title (Analyst / Administrator).
      name: fullName || roleLabel || prepared?.email || null,
      email: prepared?.email?.trim() || null,
    };
  }

  private proposalSenderRoleLabel(systemRole?: string | null): string | null {
    if (!systemRole) return null;
    const labels: Record<string, string> = {
      SUPER_ADMIN: 'Platform Administrator',
      METHODOLOGY_ADMIN: 'Methodology Administrator',
      ANALYST: 'Analyst',
      REVIEWER: 'Senior Reviewer',
      SALES: 'Sales',
      AUDITOR: 'Auditor',
    };
    return labels[systemRole] || systemRole.replaceAll('_', ' ');
  }

  assertConvertAllowed(
    lead: any,
    stage: CommercialStage,
    user: AuthUser,
    force?: boolean,
  ) {
    const gate = canCreateLevel2(lead, stage, {
      force,
      isOverrideRole: COMMERCIAL_OVERRIDE_ROLES.has(user.role),
    });
    if (!gate.allowed) {
      throw new BadRequestException(gate.reason);
    }
    return gate;
  }
}
