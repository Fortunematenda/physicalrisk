import { Injectable, NotFoundException } from '@nestjs/common';
import { CommercialStage, ProposalStatus, TriageProposalSource, TriageProposalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateProposalReference } from '../common/proposal-reference';
import { buildProposalContextSnapshot } from '../common/triage-proposal-context';
import { buildDefaultContentSnapshot, resolveTemplateConfig } from './proposal/proposal-content-builder';
import { operationalSitesLabelFromStored, securityExpenditureLabelFromStored } from '@moss/shared';

export type ProposalRequestResult = {
  leadId: string;
  proposalReference: string;
  proposalStatus: ProposalStatus;
  requestedAt: Date;
  alreadyRequested: boolean;
  proposalId: string;
  proposalNumber: string;
  sourceTriageReference: string | null;
  sourceTriageAssessmentId: string | null;
};

@Injectable()
export class TriageProposalRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Idempotent: one proposal request (PRP-*) and one draft TriageProposal per lead.
   */
  async ensureProposalRequestFromPublicLead(
    leadId: string,
    systemUserId: string,
  ): Promise<ProposalRequestResult> {
    const lead = await this.prisma.publicLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    if (!lead.completedAt || !lead.assessmentId) {
      throw new NotFoundException('Complete the Executive Governance Triage before requesting a proposal.');
    }

    const existingProposal = await this.prisma.triageProposal.findFirst({
      where: { publicLeadId: leadId },
      orderBy: { createdAt: 'asc' },
    });

    if (lead.proposalRequestedAt && lead.proposalReference && existingProposal) {
      return {
        leadId: lead.id,
        proposalReference: lead.proposalReference,
        proposalStatus: lead.proposalStatus,
        requestedAt: lead.proposalRequestedAt,
        alreadyRequested: true,
        proposalId: existingProposal.id,
        proposalNumber: existingProposal.proposalNumber,
        sourceTriageReference: existingProposal.sourceAssessmentId
          ? (
              await this.prisma.assessmentSession.findUnique({
                where: { id: existingProposal.sourceAssessmentId },
                select: { reference: true },
              })
            )?.reference || null
          : null,
        sourceTriageAssessmentId: existingProposal.sourceAssessmentId,
      };
    }

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: lead.assessmentId },
      include: {
        inputValues: { include: { inputDefinition: true } },
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!assessment) throw new NotFoundException('Linked triage assessment not found.');

    const auditEvents = await this.prisma.auditEvent.findMany({
      where: { entityType: 'PublicLead', entityId: leadId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const attributionEvent = auditEvents.find((event) => {
      const meta = (event.metadata || {}) as Record<string, unknown>;
      return meta.attribution || meta.jobTitle;
    });
    const attributionMeta = (attributionEvent?.metadata || {}) as Record<string, unknown>;
    const attr = (attributionMeta.attribution || {}) as Record<string, unknown>;
    const inputMap = Object.fromEntries(
      assessment.inputValues.map((row) => [row.inputDefinition.code, row.value]),
    );

    const contextSnapshot = buildProposalContextSnapshot({
      lead,
      assessment,
      qualification: {
        jobTitle:
          (typeof attr.jobTitle === 'string' && attr.jobTitle) ||
          (typeof attributionMeta.jobTitle === 'string' ? attributionMeta.jobTitle : null),
        country: typeof attr.country === 'string' ? attr.country : null,
        primaryConcern: typeof attr.primaryConcern === 'string' ? attr.primaryConcern : null,
        operationalSitesLabel: operationalSitesLabelFromStored(inputMap.C3 ?? attr.totalSites) || null,
        securityExpenditureLabel:
          securityExpenditureLabelFromStored(inputMap.C5 ?? attr.securityExpenditure) || null,
      },
    });

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const freshLead = await tx.publicLead.findUnique({ where: { id: leadId } });
      if (!freshLead) throw new NotFoundException('Triage submission not found.');

      const proposalReference =
        freshLead.proposalReference || (await generateProposalReference(tx));

      const updatedLead = await tx.publicLead.update({
        where: { id: leadId },
        data: {
          proposalStatus: ProposalStatus.REQUESTED,
          proposalRequestedAt: freshLead.proposalRequestedAt || now,
          proposalReference,
          lastProgressAt: now,
          commercialStage: CommercialStage.TRIAGE_COMPLETED,
        },
      });

      let proposal = await tx.triageProposal.findFirst({
        where: { publicLeadId: leadId },
        orderBy: { createdAt: 'asc' },
      });

      const draftCreated = !proposal;
      const productCode = 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
      const template = resolveTemplateConfig(productCode);
      const defaultContent = buildDefaultContentSnapshot(productCode, template);
      const feeDefaults = template.feeDefaults || {
        analystHourlyRate: 985,
        specialistHourlyRate: 1825,
        vatRate: 0.15,
        currency: 'ZAR',
        paymentTerms: '50% on acceptance, 50% on delivery',
      };
      if (!proposal) {
        proposal = await tx.triageProposal.create({
          data: {
            proposalNumber: proposalReference,
            publicLeadId: leadId,
            organisationId: freshLead.organisationId,
            sourceAssessmentId: assessment.id,
            productCode,
            title: `${freshLead.organisationName} — Executive Advisory Diagnostic`,
            status: TriageProposalStatus.DRAFT,
            source: TriageProposalSource.PLATFORM,
            contextSnapshot: contextSnapshot as object,
            contentSnapshot: defaultContent as object,
            analystHourlyRate: feeDefaults.analystHourlyRate,
            specialistHourlyRate: feeDefaults.specialistHourlyRate,
            vatRate: feeDefaults.vatRate,
            paymentTerms: feeDefaults.paymentTerms,
            currency: feeDefaults.currency,
            createdById: systemUserId,
          },
        });
      } else if (!proposal.contextSnapshot) {
        proposal = await tx.triageProposal.update({
          where: { id: proposal.id },
          data: {
            sourceAssessmentId: proposal.sourceAssessmentId || assessment.id,
            contextSnapshot: contextSnapshot as object,
            proposalNumber: proposal.proposalNumber || proposalReference,
          },
        });
      }

      return {
        updatedLead,
        proposal,
        draftCreated,
        alreadyRequested: Boolean(freshLead.proposalRequestedAt),
      };
    });

    if (!result.alreadyRequested) {
      await this.audit.record({
        userId: systemUserId,
        action: 'PROPOSAL_REQUESTED',
        entityType: 'PublicLead',
        entityId: leadId,
        metadata: {
          proposalReference: result.updatedLead.proposalReference,
          proposalId: result.proposal.id,
          proposalNumber: result.proposal.proposalNumber,
          sourceTriageReference: assessment.reference,
          sourceTriageAssessmentId: assessment.id,
        },
      });
    }

    if (result.draftCreated) {
      await this.audit.record({
        userId: systemUserId,
        action: 'PROPOSAL_DRAFT_CREATED',
        entityType: 'TriageProposal',
        entityId: result.proposal.id,
        metadata: {
          proposalNumber: result.proposal.proposalNumber,
          publicLeadId: leadId,
          sourceTriageReference: assessment.reference,
        },
      });
      await this.audit.record({
        userId: systemUserId,
        action: 'PROPOSAL_CONTEXT_CAPTURED',
        entityType: 'TriageProposal',
        entityId: result.proposal.id,
        metadata: {
          triageReference: assessment.reference,
          assuranceScore: contextSnapshot.assuranceScore,
          assuranceBand: contextSnapshot.assuranceBand,
        },
      });
    }

    return {
      leadId,
      proposalReference: result.updatedLead.proposalReference!,
      proposalStatus: result.updatedLead.proposalStatus,
      requestedAt: result.updatedLead.proposalRequestedAt!,
      alreadyRequested: result.alreadyRequested,
      proposalId: result.proposal.id,
      proposalNumber: result.proposal.proposalNumber,
      sourceTriageReference: assessment.reference,
      sourceTriageAssessmentId: assessment.id,
    };
  }
}
