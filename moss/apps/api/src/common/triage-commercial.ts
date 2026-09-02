import {
  ClientInterest,
  CommercialStage,
  ProposalStatus,
  TriageContactOutcome,
  TriageProposalStatus,
} from '@prisma/client';
import { readProposalContextSnapshot } from './triage-proposal-context';

export type CommercialLeadSnapshot = {
  completedAt: Date | null;
  reviewedAt: Date | null;
  contactedAt: Date | null;
  closedAt: Date | null;
  convertedAt: Date | null;
  convertedAssessmentId?: string | null;
  proposalStatus: ProposalStatus;
  proposalRequestedAt?: Date | null;
  clientInterest: ClientInterest;
  commercialStage?: CommercialStage | null;
  scopeClientObjectives?: string | null;
  scopeIndicativeScope?: string | null;
  scopeSitesOrBusinessUnits?: string | null;
};

export type CommercialProposalSnapshot = {
  status: TriageProposalStatus;
  hasDocument?: boolean;
} | null;

export function toProposalSnapshot(
  proposal: { status: TriageProposalStatus; documentStorageKey?: string | null } | null | undefined,
): CommercialProposalSnapshot {
  return proposal
    ? { status: proposal.status, hasDocument: Boolean(proposal.documentStorageKey) }
    : null;
}

export function isProposalPrepared(
  lead: CommercialLeadSnapshot,
  proposal: CommercialProposalSnapshot,
) {
  if (!proposal) return false;
  return (
    proposal.hasDocument === true
    || hasScopeDiscussion(lead)
    || proposal.status !== TriageProposalStatus.DRAFT
  );
}

export const COMMERCIAL_OWNER_ROLES = new Set([
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
]);

export const COMMERCIAL_WRITE_ROLES = new Set([
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'SALES',
  'ANALYST',
  'REVIEWER',
]);

export const COMMERCIAL_OVERRIDE_ROLES = new Set(['SUPER_ADMIN', 'METHODOLOGY_ADMIN']);

export function hasScopeDiscussion(lead: CommercialLeadSnapshot) {
  return Boolean(
    lead.scopeClientObjectives?.trim()
      || lead.scopeIndicativeScope?.trim()
      || lead.scopeSitesOrBusinessUnits?.trim(),
  );
}

export function resolveCommercialStage(
  lead: CommercialLeadSnapshot,
  opts: {
    contactCount?: number;
    latestProposal?: CommercialProposalSnapshot;
  } = {},
): CommercialStage {
  if (lead.closedAt) return CommercialStage.CLOSED;
  if (lead.convertedAt || lead.convertedAssessmentId) return CommercialStage.LEVEL_2_CREATED;

  const proposal = opts.latestProposal;
  const leadProposalAccepted = lead.proposalStatus === ProposalStatus.ACCEPTED;
  const entityAccepted =
    proposal?.status === TriageProposalStatus.ACCEPTED || leadProposalAccepted;

  if (entityAccepted) {
    return CommercialStage.LEVEL_2_READY;
  }
  if (
    lead.proposalStatus === ProposalStatus.SENT
    || proposal?.status === TriageProposalStatus.SENT
    || proposal?.status === TriageProposalStatus.VIEWED
  ) {
    return CommercialStage.PROPOSAL_SENT;
  }
  if (
    lead.proposalStatus === ProposalStatus.IN_PREPARATION
    || lead.proposalStatus === ProposalStatus.REQUESTED
    || (proposal?.hasDocument === true
      && (proposal?.status === TriageProposalStatus.DRAFT
        || proposal?.status === TriageProposalStatus.INTERNAL_REVIEW
        || proposal?.status === TriageProposalStatus.APPROVED))
  ) {
    return CommercialStage.PROPOSAL_DRAFT;
  }
  if (
    hasScopeDiscussion(lead)
    || lead.clientInterest === ClientInterest.INTERESTED
    || lead.clientInterest === ClientInterest.NEEDS_FOLLOW_UP
  ) {
    return CommercialStage.COMMERCIAL_DISCUSSION;
  }
  if (lead.contactedAt || (opts.contactCount ?? 0) > 0) {
    return CommercialStage.CONTACTED;
  }
  if (lead.reviewedAt) return CommercialStage.UNDER_REVIEW;
  if (lead.completedAt) return CommercialStage.TRIAGE_COMPLETED;
  return CommercialStage.TRIAGE_COMPLETED;
}

export function commercialStageLabel(stage: CommercialStage) {
  const map: Record<CommercialStage, string> = {
    TRIAGE_COMPLETED: 'Triage completed',
    UNDER_REVIEW: 'Under review',
    CONTACTED: 'Contacted',
    COMMERCIAL_DISCUSSION: 'Commercial discussion',
    PROPOSAL_DRAFT: 'Proposal preparation',
    PROPOSAL_SENT: 'Proposal sent',
    PROPOSAL_ACCEPTED: 'Proposal accepted',
    LEVEL_2_READY: 'Level 2 ready',
    LEVEL_2_CREATED: 'Level 2 created',
    CLOSED: 'Closed',
  };
  return map[stage] || stage;
}

export type PrimaryCta =
  | { kind: 'none' }
  | { kind: 'mark_reviewed'; label: string }
  | { kind: 'contact_client'; label: string }
  | { kind: 'upload_proposal'; label: string }
  | { kind: 'complete_proposal'; label: string }
  | { kind: 'send_proposal'; label: string }
  | { kind: 'mark_sent'; label: string }
  | { kind: 'awaiting_decision'; label: string; disabled: true }
  | { kind: 'create_level2'; label: string }
  | { kind: 'open_level2'; label: string; engagementId: string }
  | { kind: 'closed'; label: string; disabled: true };

export function resolvePrimaryCta(
  lead: CommercialLeadSnapshot & { convertedEngagementId?: string | null },
  stage: CommercialStage,
  latestProposal?: CommercialProposalSnapshot | null,
): PrimaryCta {
  if (lead.closedAt && !lead.convertedAt) {
    return { kind: 'closed', label: 'Lead closed', disabled: true };
  }
  if (lead.convertedEngagementId || lead.convertedAt) {
    return {
      kind: 'open_level2',
      label: 'Open Level 2 Diagnostic',
      engagementId: lead.convertedEngagementId || '',
    };
  }
  if (!lead.completedAt) return { kind: 'none' };

  switch (stage) {
    case CommercialStage.TRIAGE_COMPLETED:
      return { kind: 'mark_reviewed', label: 'Mark reviewed' };
    case CommercialStage.UNDER_REVIEW:
      return { kind: 'contact_client', label: 'Contact client' };
    case CommercialStage.CONTACTED:
    case CommercialStage.COMMERCIAL_DISCUSSION:
    case CommercialStage.PROPOSAL_DRAFT:
      if (!latestProposal?.hasDocument) {
        return { kind: 'complete_proposal', label: 'Continue preparation' };
      }
      if (
        latestProposal.status === TriageProposalStatus.DRAFT
        || latestProposal.status === TriageProposalStatus.INTERNAL_REVIEW
        || latestProposal.status === TriageProposalStatus.APPROVED
      ) {
        // Document exists — primary CTA emails the proposal to the client.
        return { kind: 'send_proposal', label: 'Send proposal' };
      }
      return { kind: 'none' };
    case CommercialStage.PROPOSAL_SENT:
      return { kind: 'awaiting_decision', label: 'Awaiting response', disabled: true };
    case CommercialStage.PROPOSAL_ACCEPTED:
    case CommercialStage.LEVEL_2_READY:
      return { kind: 'create_level2', label: 'Create Level 2' };
    case CommercialStage.CLOSED:
      return { kind: 'closed', label: 'Lead closed', disabled: true };
    default:
      return { kind: 'none' };
  }
}

export function canCreateLevel2(
  lead: CommercialLeadSnapshot,
  stage: CommercialStage,
  opts: { force?: boolean; isOverrideRole?: boolean } = {},
) {
  if (lead.closedAt) {
    return { allowed: false, reason: 'Lead is closed.' };
  }
  if (!lead.completedAt) {
    return { allowed: false, reason: 'Complete the triage questionnaire first.' };
  }
  if (lead.convertedAt || lead.convertedAssessmentId) {
    return { allowed: false, reason: 'Level 2 already exists.', existing: true };
  }
  if (opts.force && opts.isOverrideRole) {
    return { allowed: true, override: true };
  }
  const accepted =
    lead.proposalStatus === ProposalStatus.ACCEPTED
    || stage === CommercialStage.LEVEL_2_READY
    || stage === CommercialStage.PROPOSAL_ACCEPTED;
  if (!accepted) {
    return {
      allowed: false,
      reason: 'Proposal must be accepted before creating a paid Level 2 diagnostic.',
    };
  }
  return { allowed: true };
}

const STAGE_ORDER: CommercialStage[] = [
  CommercialStage.TRIAGE_COMPLETED,
  CommercialStage.UNDER_REVIEW,
  CommercialStage.CONTACTED,
  CommercialStage.COMMERCIAL_DISCUSSION,
  CommercialStage.PROPOSAL_DRAFT,
  CommercialStage.PROPOSAL_SENT,
  CommercialStage.PROPOSAL_ACCEPTED,
  CommercialStage.LEVEL_2_READY,
  CommercialStage.LEVEL_2_CREATED,
  CommercialStage.CLOSED,
];

function stageIndex(stage: CommercialStage) {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

export function commercialWorkflowSteps(
  lead: CommercialLeadSnapshot,
  stage: CommercialStage,
  opts: { latestProposal?: CommercialProposalSnapshot } = {},
) {
  const idx = stageIndex(stage);
  const atLeast = (target: CommercialStage) => idx >= stageIndex(target);
  const proposal = opts.latestProposal;
  const proposalRequested = Boolean(
    lead.proposalRequestedAt || lead.proposalStatus !== ProposalStatus.NOT_REQUESTED,
  );
  const proposalPrepared = isProposalPrepared(lead, proposal || null);
  const proposalSent =
    lead.proposalStatus === ProposalStatus.SENT
    || proposal?.status === TriageProposalStatus.SENT
    || proposal?.status === TriageProposalStatus.VIEWED
    || atLeast(CommercialStage.PROPOSAL_SENT);
  const proposalAccepted =
    lead.proposalStatus === ProposalStatus.ACCEPTED
    || proposal?.status === TriageProposalStatus.ACCEPTED
    || atLeast(CommercialStage.LEVEL_2_READY);
  const level2Created = stage === CommercialStage.LEVEL_2_CREATED || Boolean(lead.convertedAt);

  const steps: Array<{ key: string; label: string; done: boolean; current: boolean }> = [
    {
      key: 'completed',
      label: 'Questionnaire completed',
      done: Boolean(lead.completedAt),
      current: stage === CommercialStage.TRIAGE_COMPLETED,
    },
    {
      key: 'scored',
      label: 'Indication scored',
      done: Boolean(lead.completedAt),
      current: false,
    },
    {
      key: 'contacted',
      label: 'Client contacted',
      // Once commercial work is underway, treat contact as satisfied for presentation.
      done:
        Boolean(lead.contactedAt)
        || atLeast(CommercialStage.CONTACTED)
        || proposalRequested
        || proposalPrepared
        || proposalSent,
      current: stage === CommercialStage.CONTACTED && !proposalRequested,
    },
    {
      key: 'proposal_requested',
      label: 'Proposal requested',
      done: proposalRequested,
      current:
        proposalRequested
        && !proposalPrepared
        && !proposalSent
        && stage !== CommercialStage.LEVEL_2_CREATED,
    },
    {
      key: 'proposal_prepared',
      label: 'Proposal preparation',
      done: proposalPrepared || proposalSent || proposalAccepted || level2Created,
      current: stage === CommercialStage.PROPOSAL_DRAFT && proposalPrepared && !proposalSent,
    },
    {
      key: 'proposal_sent',
      label: 'Proposal sent',
      done: proposalSent || proposalAccepted || level2Created,
      current: stage === CommercialStage.PROPOSAL_SENT,
    },
    {
      key: 'proposal_accepted',
      label: 'Proposal accepted',
      done: proposalAccepted || level2Created,
      current:
        stage === CommercialStage.PROPOSAL_ACCEPTED || stage === CommercialStage.LEVEL_2_READY,
    },
    {
      key: 'level2_created',
      label: 'Level 2 created',
      done: level2Created,
      current: false,
    },
  ];
  return steps.map((s) => ({
    label: s.label,
    state: s.done ? ('done' as const) : s.current ? ('current' as const) : ('pending' as const),
  }));
}

export function mapTriageProposalToLeadStatus(status: TriageProposalStatus): ProposalStatus | null {
  switch (status) {
    case TriageProposalStatus.DRAFT:
    case TriageProposalStatus.INTERNAL_REVIEW:
    case TriageProposalStatus.APPROVED:
      return ProposalStatus.IN_PREPARATION;
    case TriageProposalStatus.SENT:
    case TriageProposalStatus.VIEWED:
      return ProposalStatus.SENT;
    case TriageProposalStatus.ACCEPTED:
      return ProposalStatus.ACCEPTED;
    case TriageProposalStatus.DECLINED:
      return ProposalStatus.DECLINED;
    case TriageProposalStatus.EXPIRED:
      return ProposalStatus.EXPIRED;
    case TriageProposalStatus.WITHDRAWN:
      return ProposalStatus.CANCELLED;
    default:
      return null;
  }
}

export function clientInterestFromContact(outcome: TriageContactOutcome): ClientInterest | null {
  switch (outcome) {
    case TriageContactOutcome.INTERESTED:
    case TriageContactOutcome.WANTS_PROPOSAL:
      return ClientInterest.INTERESTED;
    case TriageContactOutcome.FOLLOW_UP_REQUIRED:
    case TriageContactOutcome.NEEDS_MORE_INFORMATION:
      return ClientInterest.NEEDS_FOLLOW_UP;
    case TriageContactOutcome.NOT_INTERESTED:
    case TriageContactOutcome.CLOSED:
      return ClientInterest.NOT_INTERESTED;
    case TriageContactOutcome.DEFERRED:
    case TriageContactOutcome.NO_RESPONSE:
      return ClientInterest.DEFERRED;
    default:
      return null;
  }
}

export const CONTACT_METHOD_LABELS: Record<string, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Other',
};

export const CONTACT_OUTCOME_LABELS: Record<string, string> = {
  NO_RESPONSE: 'No response',
  FOLLOW_UP_REQUIRED: 'Follow-up required',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  WANTS_PROPOSAL: 'Wants proposal',
  NEEDS_MORE_INFORMATION: 'Needs more information',
  DEFERRED: 'Deferred',
  CLOSED: 'Closed',
};

export const CLIENT_INTEREST_LABELS: Record<string, string> = {
  UNKNOWN: 'Unknown',
  INTERESTED: 'Interested in Level 2',
  NEEDS_FOLLOW_UP: 'Needs follow-up',
  NOT_INTERESTED: 'Not interested',
  DEFERRED: 'Deferred',
};

export function buildCommercialWorkspace(input: {
  lead: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    organisationName: string;
    industry: string | null;
    proposalReference: string | null;
    proposalRequestedAt: Date | null;
    proposalStatus: ProposalStatus;
    scopeClientObjectives?: string | null;
    scopeSitesOrBusinessUnits?: string | null;
    scopeIndicativeScope?: string | null;
    scopeExpectedTimeline?: string | null;
    scopeCommercialNotes?: string | null;
  };
  activeProposal: {
    id: string;
    proposalNumber: string;
    status: TriageProposalStatus;
    contextSnapshot: unknown;
    objectives: string | null;
    scopeSummary: string | null;
    sitesOrBusinessUnits: string | null;
    timeline: string | null;
    fee: unknown;
    currency: string;
    terms: string | null;
    documentStorageKey: string | null;
    documentFileName: string | null;
    documentMimeType: string | null;
    updatedAt: Date;
    sentAt: Date | null;
    acceptedAt: Date | null;
  } | null;
  assessmentReference?: string | null;
  qualification?: {
    jobTitle?: string | null;
    country?: string | null;
    primaryConcern?: string | null;
    operationalSitesLabel?: string | null;
    securityExpenditureLabel?: string | null;
  } | null;
}) {
  const snapshot = readProposalContextSnapshot(input.activeProposal?.contextSnapshot);
  const proposal = input.activeProposal;

  return {
    proposalRequest: input.lead.proposalReference
      ? {
          reference: input.lead.proposalReference,
          requestedAt: input.lead.proposalRequestedAt,
          status: input.lead.proposalStatus,
          sourceTriageReference:
            snapshot?.triageReference || input.assessmentReference || null,
        }
      : null,
    prospect: {
      firstName: snapshot?.prospect?.firstName || input.lead.firstName,
      lastName: snapshot?.prospect?.lastName || input.lead.lastName,
      email: snapshot?.prospect?.email || input.lead.email,
      phone: snapshot?.prospect?.phone ?? input.lead.phone,
      jobTitle: snapshot?.prospect?.jobTitle || input.qualification?.jobTitle || null,
    },
    organisation: {
      name: snapshot?.organisation?.name || input.lead.organisationName,
      country: snapshot?.organisation?.country || input.qualification?.country || null,
      industry: snapshot?.organisation?.industry || input.lead.industry,
      operationalSitesLabel:
        snapshot?.organisation?.operationalSitesLabel
        || input.qualification?.operationalSitesLabel
        || null,
      securityExpenditureLabel:
        snapshot?.organisation?.securityExpenditureLabel
        || input.qualification?.securityExpenditureLabel
        || null,
    },
    triageIndication: snapshot
      ? {
          reference: snapshot.triageReference,
          assuranceScore: snapshot.assuranceScore,
          assuranceBand: snapshot.assuranceBand,
          assuranceBandLabel: snapshot.assuranceBandLabel,
          dimensionResults: snapshot.dimensionResults,
          strongestIndicators: snapshot.strongestIndicators,
          primaryConcern: snapshot.primaryConcern,
          recommendedProduct: snapshot.recommendedProduct,
          recommendedProductCode: snapshot.recommendedProductCode,
          capturedAt: snapshot.capturedAt,
        }
      : null,
    commercialScope: {
      clientObjective:
        proposal?.objectives || input.lead.scopeClientObjectives || null,
      sitesOrBusinessUnits:
        proposal?.sitesOrBusinessUnits || input.lead.scopeSitesOrBusinessUnits || null,
      indicativeScope: proposal?.scopeSummary || input.lead.scopeIndicativeScope || null,
      timeline: proposal?.timeline || input.lead.scopeExpectedTimeline || null,
      fee: proposal?.fee != null ? Number(proposal.fee) : null,
      currency: proposal?.currency || 'ZAR',
      terms: proposal?.terms || null,
      commercialNotes: input.lead.scopeCommercialNotes || null,
    },
    proposalDocument: proposal?.documentStorageKey
      ? {
          proposalId: proposal.id,
          fileName: proposal.documentFileName,
          mimeType: proposal.documentMimeType,
          uploadedAt: proposal.updatedAt,
          status: proposal.status,
          sentAt: proposal.sentAt,
          acceptedAt: proposal.acceptedAt,
        }
      : null,
    activeProposalId: proposal?.id || null,
    activeProposalNumber: proposal?.proposalNumber || input.lead.proposalReference || null,
    activeProposalStatus: proposal?.status || null,
  };
}
