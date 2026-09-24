import { BadRequestException } from '@nestjs/common';
import { ProductCode, TriageProposalStatus } from '@prisma/client';
import { EAD_ROUTING_PRODUCT_CODES } from '@moss/shared';
import type { PrismaService } from '../prisma/prisma.service';

const GOVERNED_L3_PRODUCTS = new Set<string>([
  ProductCode.SCLI_COST_LEAKAGE,
  ...EAD_ROUTING_PRODUCT_CODES,
]);

export function isGovernedLevel3Product(productCode: string): boolean {
  return GOVERNED_L3_PRODUCTS.has(productCode);
}

export type ManualCreatePolicy = {
  allowed: boolean;
  reason?: string;
  guidanceTitle?: string;
  guidanceBody?: string;
  completedEad?: { id: string; reference: string; outcomeHref: string };
  proposal?: {
    id: string;
    proposalNumber: string;
    status: string;
    sentAt?: string | null;
    acceptedAt?: string | null;
    poRequirement?: string | null;
    poNumber?: string | null;
    awaitingPo?: boolean;
  } | null;
  actions?: Array<{ label: string; href: string }>;
};

export async function resolveManualCreatePolicy(
  prisma: PrismaService,
  organisationId: string,
  productCode: string,
  parentAssessmentId?: string | null,
): Promise<ManualCreatePolicy> {
  if (parentAssessmentId) return { allowed: true };
  if (!isGovernedLevel3Product(productCode)) return { allowed: true };

  const completedEad = await prisma.assessmentSession.findFirst({
    where: {
      organisationId,
      productCode: ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
      diagnosticOutcome: { isNot: null },
    },
    select: { id: true, reference: true },
    orderBy: { submittedAt: 'desc' },
  });

  if (!completedEad) return { allowed: true };

  const proposal = await prisma.triageProposal.findFirst({
    where: {
      organisationId,
      sourceAdvisoryAssessmentId: completedEad.id,
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      proposalNumber: true,
      status: true,
      sentAt: true,
      acceptedAt: true,
      poRequirement: true,
      poNumber: true,
      poReceivedAt: true,
      publicLeadId: true,
    },
  });

  const outcomeHref = `/advisory/${completedEad.id}/outcome`;
  const actions: Array<{ label: string; href: string }> = [
    { label: 'Open diagnostic outcome', href: outcomeHref },
  ];

  if (proposal) {
    actions.push({
      label: 'View proposal',
      href: `/triage/${proposal.publicLeadId}/proposal?proposalId=${proposal.id}`,
    });
    if (
      proposal.status === TriageProposalStatus.SENT
      || proposal.status === TriageProposalStatus.VIEWED
      || proposal.status === TriageProposalStatus.CHANGES_REQUESTED
    ) {
      actions.push({
        label: 'Open commercial tab',
        href: `/triage/${proposal.publicLeadId}?tab=commercial`,
      });
    }
  }

  const awaitingPo =
    proposal?.status === TriageProposalStatus.ACCEPTED
    && ['REQUIRED_BEFORE_WORK', 'REQUIRED_WITH_ACCEPTANCE'].includes(
      String(proposal.poRequirement || '').toUpperCase(),
    )
    && !proposal.poNumber
    && !proposal.poReceivedAt;

  if (proposal?.status === TriageProposalStatus.ACCEPTED && !awaitingPo) {
    return {
      allowed: false,
      guidanceTitle: 'Start from the diagnostic outcome',
      guidanceBody:
        'This organisation already has an accepted Executive Advisory proposal. Create the Security Cost Leakage assessment from the diagnostic outcome to preserve Triage → Diagnostic → Proposal → Acceptance lineage.',
      reason:
        'Level 3 engagements must be created from the completed diagnostic outcome after commercial acceptance.',
      completedEad: { ...completedEad, outcomeHref },
      proposal: {
        id: proposal.id,
        proposalNumber: proposal.proposalNumber,
        status: proposal.status,
        sentAt: proposal.sentAt?.toISOString() || null,
        acceptedAt: proposal.acceptedAt?.toISOString() || null,
        poRequirement: proposal.poRequirement,
        poNumber: proposal.poNumber,
        awaitingPo: false,
      },
      actions: [
        { label: 'Start from diagnostic outcome', href: outcomeHref },
        ...actions.filter((a) => a.label !== 'Open diagnostic outcome'),
      ],
    };
  }

  if (awaitingPo && proposal) {
    return {
      allowed: false,
      guidanceTitle: 'Proposal accepted — Purchase Order required',
      guidanceBody:
        'Commercial acceptance is complete, but a Purchase Order is required before Security Cost Leakage work can commence.',
      reason: 'Purchase Order is required before Level 3 work can commence.',
      completedEad: { ...completedEad, outcomeHref },
      proposal: {
        id: proposal.id,
        proposalNumber: proposal.proposalNumber,
        status: proposal.status,
        sentAt: proposal.sentAt?.toISOString() || null,
        acceptedAt: proposal.acceptedAt?.toISOString() || null,
        poRequirement: proposal.poRequirement,
        poNumber: proposal.poNumber,
        awaitingPo: true,
      },
      actions,
    };
  }

  const status = proposal?.status || 'NOT_REQUESTED';
  return {
    allowed: false,
    guidanceTitle: 'Commercial acceptance required',
    guidanceBody:
      'The Security Cost Leakage Assessment can begin after the associated Executive Advisory proposal has been accepted. Use the diagnostic outcome to view, resend, or mark the proposal accepted.',
    reason:
      'Level 3 engagements must be created from the completed diagnostic outcome after commercial acceptance. Manual creation bypasses routing and commercial governance.',
    completedEad: { ...completedEad, outcomeHref },
    proposal: proposal
      ? {
          id: proposal.id,
          proposalNumber: proposal.proposalNumber,
          status,
          sentAt: proposal.sentAt?.toISOString() || null,
          acceptedAt: proposal.acceptedAt?.toISOString() || null,
          poRequirement: proposal.poRequirement,
          poNumber: proposal.poNumber,
          awaitingPo: false,
        }
      : null,
    actions,
  };
}

export async function assertManualLevel3CreationAllowed(
  prisma: PrismaService,
  organisationId: string,
  productCode: string,
  parentAssessmentId?: string | null,
): Promise<void> {
  const policy = await resolveManualCreatePolicy(prisma, organisationId, productCode, parentAssessmentId);
  if (!policy.allowed) {
    const ref = policy.completedEad?.reference || 'diagnostic outcome';
    const proposalBit = policy.proposal?.proposalNumber
      ? ` Proposal ${policy.proposal.proposalNumber} is ${String(policy.proposal.status).replaceAll('_', ' ')}.`
      : '';
    throw new BadRequestException(
      `${policy.guidanceTitle || 'Commercial acceptance required'}. ${policy.guidanceBody || policy.reason || ''} Use ${ref} → diagnostic outcome.${proposalBit}`,
    );
  }
}
