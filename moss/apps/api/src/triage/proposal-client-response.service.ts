import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommercialStage,
  ProposalStatus,
  TriageProposalStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ProposalTokenService } from '../common/proposal-token.service';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../evidence/storage.service';
import {
  calculateProposalFees,
  recalculateAllLineItems,
  resolveIncludedExpenses,
  recalculateAllExpenseLines,
} from './proposal/proposal-fee-calculations';
import { readContentSnapshot } from './proposal/proposal-template-registry';
import {
  formatProposalVersionShort,
  readProposalVersionParts,
} from './proposal/proposal-version';

const RESPONDABLE = new Set<TriageProposalStatus>([
  TriageProposalStatus.SENT,
  TriageProposalStatus.VIEWED,
  TriageProposalStatus.CHANGES_REQUESTED,
]);

const PO_REQUIREMENTS = new Set(['NOT_REQUIRED', 'REQUIRED_WITH_ACCEPTANCE', 'REQUIRED_BEFORE_WORK']);

@Injectable()
export class ProposalClientResponseService {
  private readonly logger = new Logger(ProposalClientResponseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: ProposalTokenService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** Mint / refresh respond URL when emailing a proposal. */
  async ensureRespondUrl(proposalId: string): Promise<string> {
    const proposal = await this.prisma.triageProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new NotFoundException('Proposal not found.');
    const parts = readProposalVersionParts(proposal);
    const opaque = proposal.responseToken || this.tokens.mintOpaqueResponseToken();
    const expiresAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    if (!proposal.responseToken || !proposal.responseTokenExpiresAt) {
      await this.prisma.triageProposal.update({
        where: { id: proposalId },
        data: {
          responseToken: opaque,
          responseTokenExpiresAt: expiresAt,
        },
      });
    }
    return this.tokens.buildRespondUrl({
      proposalId: proposal.id,
      publicLeadId: proposal.publicLeadId,
      version: parts.major,
      versionRevision: parts.revision,
    });
  }

  async getPublicProposal(token: string) {
    const proposal = await this.resolveProposalFromToken(token, { markViewed: true });
    const content = readContentSnapshot(proposal.contentSnapshot);
    const feeLineItems = recalculateAllLineItems(content.feeLineItems);
    const expenseLines = recalculateAllExpenseLines(content.expenseLineItems);
    const included = resolveIncludedExpenses({
      includeExpenses: content.includeExpenses,
      expenseLineItems: expenseLines,
      expensesEstimate: Number(proposal.expensesEstimate) || 0,
    });
    const feeTotals = calculateProposalFees({
      lineItems: feeLineItems,
      discount: Number(proposal.discount) || 0,
      vatRate: Number(proposal.vatRate) || 0.15,
      expensesEstimate: included.total,
    });
    const parts = readProposalVersionParts(proposal);
    const orgName =
      proposal.organisation?.name
      || proposal.publicLead.organisationName
      || 'Organisation';

    return {
      proposalId: proposal.id,
      proposalNumber: proposal.proposalNumber,
      title: proposal.title,
      subtitle: proposal.subtitle,
      organisationName: orgName,
      status: proposal.status,
      versionLabel: formatProposalVersionShort(parts.major, parts.revision),
      proposalDate: proposal.sentAt || proposal.createdAt,
      currency: proposal.currency || 'ZAR',
      paymentTerms: proposal.paymentTerms,
      feeTotals: {
        ...feeTotals,
        expenses: included.total,
        includeExpenses: included.include,
      },
      poRequirement: proposal.poRequirement || 'NOT_REQUIRED',
      hasDocument: Boolean(proposal.documentStorageKey),
      canRespond: RESPONDABLE.has(proposal.status),
      alreadyAccepted: proposal.status === TriageProposalStatus.ACCEPTED,
      alreadyDeclined: proposal.status === TriageProposalStatus.DECLINED,
      acceptance: proposal.status === TriageProposalStatus.ACCEPTED
        ? {
            acceptedAt: proposal.acceptedAt,
            acceptedByName: proposal.acceptedByName,
            acceptedByEmail: proposal.acceptedByEmail,
            acceptedByJobTitle: proposal.acceptedByJobTitle,
            poNumber: proposal.poNumber,
            method: proposal.acceptanceMethod,
          }
        : null,
    };
  }

  async downloadPublicPdf(token: string): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }> {
    const proposal = await this.resolveProposalFromToken(token, { markViewed: true });
    if (!proposal.documentStorageKey) {
      throw new NotFoundException('Proposal PDF is not available.');
    }
    const buffer = await this.storage.getBuffer(proposal.documentStorageKey);
    return {
      buffer,
      fileName: proposal.documentFileName || `${proposal.proposalNumber}.pdf`,
      mimeType: proposal.documentMimeType || 'application/pdf',
    };
  }

  async acceptPublic(input: {
    token: string;
    acceptedByName: string;
    acceptedByEmail: string;
    acceptedByJobTitle?: string;
    acceptedByPhone?: string;
    authorised: boolean;
    poRequiredChoice?: 'YES' | 'NO' | 'NOT_YET';
    poNumber?: string;
    poDate?: string;
    poValue?: number | string;
    procurementContact?: string;
    procurementEmail?: string;
    poNotes?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const proposal = await this.resolveProposalFromToken(input.token, { markViewed: true });
    if (proposal.status === TriageProposalStatus.ACCEPTED) {
      return this.getPublicProposal(input.token);
    }
    if (!RESPONDABLE.has(proposal.status)) {
      throw new BadRequestException('This proposal can no longer be accepted.');
    }
    if (!input.authorised) {
      throw new BadRequestException('Authorisation confirmation is required to accept this proposal.');
    }
    const name = String(input.acceptedByName || '').trim();
    const email = String(input.acceptedByEmail || '').trim();
    if (!name) throw new BadRequestException('Authorised person full name is required.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email address is required.');
    }

    const poRequirement = String(proposal.poRequirement || 'NOT_REQUIRED').toUpperCase();
    const poChoice = String(input.poRequiredChoice || 'NO').toUpperCase();
    let poNumber = String(input.poNumber || '').trim() || null;
    let poDate: Date | null = null;
    if (input.poDate) {
      poDate = new Date(input.poDate);
      if (Number.isNaN(poDate.getTime())) throw new BadRequestException('Invalid PO date.');
    }
    const poValueRaw = input.poValue != null && input.poValue !== '' ? Number(input.poValue) : null;
    const poValue = poValueRaw != null && Number.isFinite(poValueRaw) ? poValueRaw : null;

    if (poRequirement === 'REQUIRED_WITH_ACCEPTANCE' || poChoice === 'YES') {
      if (!poNumber) {
        throw new BadRequestException('Purchase Order number is required to complete acceptance.');
      }
    }

    const now = new Date();
    const poReceived =
      Boolean(poNumber)
        ? now
        : null;

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.triageProposal.findUnique({ where: { id: proposal.id } });
      if (!current) throw new NotFoundException('Proposal not found.');
      if (current.status === TriageProposalStatus.ACCEPTED) return;
      if (!RESPONDABLE.has(current.status)) {
        throw new BadRequestException('This proposal can no longer be accepted.');
      }

      await tx.triageProposal.update({
        where: { id: proposal.id },
        data: {
          status: TriageProposalStatus.ACCEPTED,
          acceptedAt: now,
          acceptedByName: name,
          acceptedByEmail: email,
          acceptedByJobTitle: String(input.acceptedByJobTitle || '').trim() || null,
          acceptanceMethod: 'CLIENT_PORTAL',
          acceptanceNotes: [
            input.acceptedByPhone ? `Phone: ${String(input.acceptedByPhone).trim()}` : '',
            input.poNotes ? `PO notes: ${String(input.poNotes).trim()}` : '',
          ]
            .filter(Boolean)
            .join('\n') || null,
          poNumber,
          poDate,
          poValue,
          procurementContact: String(input.procurementContact || '').trim() || null,
          procurementEmail: String(input.procurementEmail || '').trim() || null,
          poNotes: String(input.poNotes || '').trim() || null,
          poReceivedAt: poReceived,
        },
      });

      await tx.publicLead.update({
        where: { id: proposal.publicLeadId },
        data: {
          proposalStatus: ProposalStatus.ACCEPTED,
          proposalAcceptedAt: now,
          acceptedProposalId: proposal.id,
          commercialStage: CommercialStage.PROPOSAL_ACCEPTED,
          status: 'COMMERCIAL_ACCEPTED',
        },
      });

      if (proposal.sourceAdvisoryAssessmentId) {
        const outcome = await tx.advisoryDiagnosticOutcome.findUnique({
          where: { assessmentId: proposal.sourceAdvisoryAssessmentId },
        });
        if (outcome && outcome.commercialStatus !== ProposalStatus.ACCEPTED) {
          await tx.advisoryDiagnosticOutcome.update({
            where: { id: outcome.id },
            data: {
              commercialStatus: ProposalStatus.ACCEPTED,
              commercialAcceptedAt: outcome.commercialAcceptedAt || now,
              commercialReference: proposal.proposalNumber,
            },
          });
        }
      }
    });

    await this.audit.record({
      action: 'PROPOSAL_ACCEPTED_CLIENT_PORTAL',
      entityType: 'TriageProposal',
      entityId: proposal.id,
      organisationId: proposal.organisationId || undefined,
      ipAddress: input.ipAddress,
      metadata: {
        publicLeadId: proposal.publicLeadId,
        proposalNumber: proposal.proposalNumber,
        acceptedByName: name,
        acceptedByEmail: email,
        poNumber,
        poRequirement,
        userAgent: input.userAgent || null,
      },
    });

    void this.sendAcceptanceEmails(proposal.id).catch((err) => {
      this.logger.warn(`Acceptance email failed for ${proposal.id}: ${(err as Error)?.message || err}`);
    });

    return this.getPublicProposal(input.token);
  }

  async requestChangesPublic(input: {
    token: string;
    notes: string;
    contactName?: string;
    contactEmail?: string;
    ipAddress?: string;
  }) {
    const proposal = await this.resolveProposalFromToken(input.token, { markViewed: true });
    if (proposal.status === TriageProposalStatus.ACCEPTED) {
      throw new BadRequestException('This proposal has already been accepted.');
    }
    if (!RESPONDABLE.has(proposal.status) && proposal.status !== TriageProposalStatus.CHANGES_REQUESTED) {
      throw new BadRequestException('This proposal can no longer accept change requests.');
    }
    const notes = String(input.notes || '').trim();
    if (!notes) throw new BadRequestException('Please describe the requested changes.');

    const now = new Date();
    await this.prisma.triageProposal.update({
      where: { id: proposal.id },
      data: {
        status: TriageProposalStatus.CHANGES_REQUESTED,
        changesRequestNotes: notes,
        changesRequestedAt: now,
      },
    });

    await this.prisma.publicLead.update({
      where: { id: proposal.publicLeadId },
      data: { proposalStatus: ProposalStatus.IN_PREPARATION },
    });

    await this.audit.record({
      action: 'PROPOSAL_CHANGES_REQUESTED',
      entityType: 'TriageProposal',
      entityId: proposal.id,
      organisationId: proposal.organisationId || undefined,
      ipAddress: input.ipAddress,
      metadata: {
        notes,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        proposalNumber: proposal.proposalNumber,
      },
    });

    void this.notifyOwner(proposal.id, 'CHANGES_REQUESTED', notes).catch(() => undefined);

    return this.getPublicProposal(input.token);
  }

  async declinePublic(input: {
    token: string;
    reason: string;
    contactName?: string;
    contactEmail?: string;
    ipAddress?: string;
  }) {
    const proposal = await this.resolveProposalFromToken(input.token, { markViewed: true });
    if (proposal.status === TriageProposalStatus.ACCEPTED) {
      throw new BadRequestException('This proposal has already been accepted.');
    }
    if (proposal.status === TriageProposalStatus.DECLINED) {
      return this.getPublicProposal(input.token);
    }
    if (!RESPONDABLE.has(proposal.status) && proposal.status !== TriageProposalStatus.CHANGES_REQUESTED) {
      throw new BadRequestException('This proposal can no longer be declined.');
    }
    const reason = String(input.reason || '').trim();
    if (!reason) throw new BadRequestException('Please provide a reason for declining.');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.triageProposal.update({
        where: { id: proposal.id },
        data: {
          status: TriageProposalStatus.DECLINED,
          declinedAt: now,
          declinedReason: reason,
        },
      });
      await tx.publicLead.update({
        where: { id: proposal.publicLeadId },
        data: {
          proposalStatus: ProposalStatus.DECLINED,
          proposalDeclinedAt: now,
        },
      });
    });

    await this.audit.record({
      action: 'PROPOSAL_DECLINED_CLIENT_PORTAL',
      entityType: 'TriageProposal',
      entityId: proposal.id,
      organisationId: proposal.organisationId || undefined,
      ipAddress: input.ipAddress,
      metadata: {
        reason,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        proposalNumber: proposal.proposalNumber,
      },
    });

    void this.notifyOwner(proposal.id, 'DECLINED', reason).catch(() => undefined);

    return this.getPublicProposal(input.token);
  }

  /** Whether Level 3 work can start (PO gate). */
  isWorkReady(proposal: {
    status: TriageProposalStatus | string;
    poRequirement?: string | null;
    poNumber?: string | null;
    poReceivedAt?: Date | null;
  }): { ready: boolean; reason?: string; awaitingPo?: boolean } {
    if (String(proposal.status) !== TriageProposalStatus.ACCEPTED) {
      return { ready: false, reason: 'Proposal has not been accepted yet.' };
    }
    const req = String(proposal.poRequirement || 'NOT_REQUIRED').toUpperCase();
    if (req === 'REQUIRED_BEFORE_WORK' || req === 'REQUIRED_WITH_ACCEPTANCE') {
      if (!proposal.poNumber && !proposal.poReceivedAt) {
        return {
          ready: false,
          awaitingPo: true,
          reason: 'Purchase Order is required before work can commence.',
        };
      }
    }
    return { ready: true };
  }

  normalizePoRequirement(value?: string | null): string {
    const v = String(value || 'NOT_REQUIRED').trim().toUpperCase();
    return PO_REQUIREMENTS.has(v) ? v : 'NOT_REQUIRED';
  }

  private async resolveProposalFromToken(
    token: string,
    opts?: { markViewed?: boolean },
  ) {
    const payload = this.tokens.verifyRespond(token);
    const proposal = await this.prisma.triageProposal.findFirst({
      where: { id: payload.proposalId, publicLeadId: payload.publicLeadId },
      include: {
        organisation: { select: { id: true, name: true } },
        publicLead: {
          select: {
            id: true,
            organisationName: true,
            email: true,
            firstName: true,
            organisationId: true,
          },
        },
      },
    });
    if (!proposal) {
      throw new BadRequestException('This proposal link is invalid or has expired.');
    }
    // Soft version check — allow respond on current revision of same proposal.
    if (opts?.markViewed && RESPONDABLE.has(proposal.status) && !proposal.viewedAt) {
      await this.prisma.triageProposal.update({
        where: { id: proposal.id },
        data: {
          status:
            proposal.status === TriageProposalStatus.SENT
              ? TriageProposalStatus.VIEWED
              : proposal.status,
          viewedAt: new Date(),
        },
      });
      proposal.viewedAt = new Date();
      if (proposal.status === TriageProposalStatus.SENT) {
        proposal.status = TriageProposalStatus.VIEWED;
      }
    }
    return proposal;
  }

  private async sendAcceptanceEmails(proposalId: string) {
    const proposal = await this.prisma.triageProposal.findUnique({
      where: { id: proposalId },
      include: {
        publicLead: true,
        organisation: true,
        createdBy: { select: { email: true, firstName: true } },
      },
    });
    if (!proposal) return;
    const org = proposal.organisation?.name || proposal.publicLead.organisationName;
    const clientEmail = proposal.acceptedByEmail || proposal.publicLead.email;
    if (clientEmail) {
      await this.email.enqueueAndDeliver({
        recipient: clientEmail,
        subject: `Proposal acceptance confirmed — ${proposal.proposalNumber}`,
        template: 'proposal_acceptance_confirmed',
        relatedType: 'TriageProposal',
        relatedId: proposal.id,
        organisationId: proposal.organisationId || undefined,
        payload: {
          firstName: proposal.acceptedByName?.split(/\s+/)[0] || 'Colleague',
          organisationName: org,
          proposalReference: proposal.proposalNumber,
          acceptedByName: proposal.acceptedByName,
          acceptedAt: proposal.acceptedAt?.toISOString(),
          poNumber: proposal.poNumber,
        },
      });
    }
    const internal = proposal.createdBy?.email;
    if (internal) {
      await this.email.enqueueAndDeliver({
        recipient: internal,
        subject: `Proposal ${proposal.proposalNumber} accepted by ${org}`,
        template: 'proposal_acceptance_internal',
        relatedType: 'TriageProposal',
        relatedId: proposal.id,
        organisationId: proposal.organisationId || undefined,
        payload: {
          organisationName: org,
          proposalReference: proposal.proposalNumber,
          acceptedByName: proposal.acceptedByName,
          acceptedByEmail: proposal.acceptedByEmail,
          mossUrl: `${this.tokens.webBase()}/triage/${proposal.publicLeadId}?tab=commercial`,
        },
      });
    }
  }

  private async notifyOwner(proposalId: string, kind: string, detail: string) {
    const proposal = await this.prisma.triageProposal.findUnique({
      where: { id: proposalId },
      include: {
        createdBy: { select: { email: true } },
        publicLead: { select: { organisationName: true } },
      },
    });
    if (!proposal?.createdBy?.email) return;
    await this.email.enqueueAndDeliver({
      recipient: proposal.createdBy.email,
      subject: `Proposal ${proposal.proposalNumber}: ${kind.replaceAll('_', ' ')}`,
      template: 'proposal_client_response_internal',
      relatedType: 'TriageProposal',
      relatedId: proposal.id,
      payload: {
        organisationName: proposal.publicLead.organisationName,
        proposalReference: proposal.proposalNumber,
        responseKind: kind,
        detail,
        mossUrl: `${this.tokens.webBase()}/triage/${proposal.publicLeadId}?tab=commercial`,
      },
    });
  }
}
