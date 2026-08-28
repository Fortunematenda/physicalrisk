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
import { generateEadProposalNumber } from '../common/ead-proposal-reference';
import { generateProposalReference } from '../common/proposal-reference';
import {
  COMMERCIAL_OWNER_ROLES,
  COMMERCIAL_OVERRIDE_ROLES,
  COMMERCIAL_WRITE_ROLES,
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
  ) {
    const latestProposal = bundle.proposals[0] || null;
    const stage = resolveCommercialStage(lead, {
      contactCount: bundle.contactCount,
      latestProposal: this.proposalSnapshot(latestProposal),
    });
    const primaryCta = resolvePrimaryCta(
      {
        ...lead,
        convertedEngagementId: lead.convertedAssessmentId,
      },
      stage,
      this.proposalSnapshot(latestProposal),
    );
    const convertGate = canCreateLevel2(lead, stage);
    return {
      commercialStage: stage,
      commercialStageLabel: commercialStageLabel(stage),
      primaryCta,
      convertGate,
      commercialWorkflow: commercialWorkflowSteps(lead, stage),
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
      orderBy: { createdAt: 'desc' },
    });

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
              title: input.title?.trim() || existing.title,
              timeline: input.timeline?.trim() || existing.timeline,
              fee: input.fee != null ? input.fee : existing.fee,
              status: existing.documentStorageKey ? existing.status : status,
            },
            include: { createdBy: { select: userSelect } },
          })
        : await tx.triageProposal.create({
            data: {
              proposalNumber:
                input.proposalNumber?.trim()
                || (await generateEadProposalNumber(tx)),
              publicLeadId,
              organisationId: lead.organisationId,
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
      action: 'PROPOSAL_UPLOADED',
      entityType: 'PublicLead',
      entityId: publicLeadId,
      metadata: {
        proposalId: proposal.id,
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
        acceptedAt: next === TriageProposalStatus.ACCEPTED ? proposal.acceptedAt || now : proposal.acceptedAt,
        declinedAt: next === TriageProposalStatus.DECLINED ? proposal.declinedAt || now : proposal.declinedAt,
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
