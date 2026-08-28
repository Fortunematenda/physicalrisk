import {
  ClientInterest,
  CommercialStage,
  ProposalStatus,
  TriageContactOutcome,
  TriageProposalStatus,
} from '@prisma/client';

export type CommercialLeadSnapshot = {
  completedAt: Date | null;
  reviewedAt: Date | null;
  contactedAt: Date | null;
  closedAt: Date | null;
  convertedAt: Date | null;
  convertedAssessmentId?: string | null;
  proposalStatus: ProposalStatus;
  clientInterest: ClientInterest;
  commercialStage?: CommercialStage | null;
  scopeClientObjectives?: string | null;
  scopeIndicativeScope?: string | null;
  scopeSitesOrBusinessUnits?: string | null;
};

export type CommercialProposalSnapshot = {
  status: TriageProposalStatus;
} | null;

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
    || proposal?.status === TriageProposalStatus.DRAFT
    || proposal?.status === TriageProposalStatus.INTERNAL_REVIEW
    || proposal?.status === TriageProposalStatus.APPROVED
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
  | { kind: 'prepare_proposal'; label: string }
  | { kind: 'open_proposal'; label: string; proposalId?: string }
  | { kind: 'awaiting_decision'; label: string; disabled: true }
  | { kind: 'create_level2'; label: string }
  | { kind: 'open_level2'; label: string; engagementId: string }
  | { kind: 'closed'; label: string; disabled: true };

export function resolvePrimaryCta(
  lead: CommercialLeadSnapshot & { convertedEngagementId?: string | null },
  stage: CommercialStage,
  latestProposalId?: string | null,
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
      return { kind: 'prepare_proposal', label: 'Prepare proposal' };
    case CommercialStage.PROPOSAL_DRAFT:
      return {
        kind: 'open_proposal',
        label: latestProposalId ? 'Open proposal' : 'Create proposal',
        proposalId: latestProposalId || undefined,
      };
    case CommercialStage.PROPOSAL_SENT:
      return { kind: 'awaiting_decision', label: 'Awaiting client decision', disabled: true };
    case CommercialStage.PROPOSAL_ACCEPTED:
    case CommercialStage.LEVEL_2_READY:
      return { kind: 'create_level2', label: 'Create Level 2 Diagnostic' };
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
) {
  const idx = stageIndex(stage);
  const atLeast = (target: CommercialStage) => idx >= stageIndex(target);

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
      key: 'reviewed',
      label: 'Reviewed',
      done: Boolean(lead.reviewedAt),
      current: stage === CommercialStage.UNDER_REVIEW,
    },
    {
      key: 'contacted',
      label: 'Contacted',
      done: Boolean(lead.contactedAt) || atLeast(CommercialStage.CONTACTED),
      current: stage === CommercialStage.CONTACTED,
    },
    {
      key: 'discussion',
      label: 'Commercial discussion',
      done: atLeast(CommercialStage.COMMERCIAL_DISCUSSION),
      current: stage === CommercialStage.COMMERCIAL_DISCUSSION,
    },
    {
      key: 'proposal_prepared',
      label: 'Proposal prepared',
      done: atLeast(CommercialStage.PROPOSAL_DRAFT),
      current: stage === CommercialStage.PROPOSAL_DRAFT,
    },
    {
      key: 'proposal_sent',
      label: 'Proposal sent',
      done: atLeast(CommercialStage.PROPOSAL_SENT),
      current: stage === CommercialStage.PROPOSAL_SENT,
    },
    {
      key: 'proposal_accepted',
      label: 'Proposal accepted',
      done: atLeast(CommercialStage.LEVEL_2_READY),
      current:
        stage === CommercialStage.PROPOSAL_ACCEPTED || stage === CommercialStage.LEVEL_2_READY,
    },
    {
      key: 'level2_created',
      label: 'Level 2 created',
      done: stage === CommercialStage.LEVEL_2_CREATED,
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
