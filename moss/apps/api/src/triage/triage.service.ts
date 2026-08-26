import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductCode, ProposalStatus } from '@prisma/client';
import type { AuthUser } from '../common/current-user.decorator';
import { INTERNAL_ROLES } from '../common/roles';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdvisoryService } from '../advisory/advisory.service';

type LeadQuery = {
  q?: string;
  status?: string;
  intent?: string;
};

const ADMIN_STAGES = new Set(['REVIEWED', 'CONTACTED', 'CLOSED']);

const PROPOSAL_ACTIONS = new Set([
  'PREPARE',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRE',
]);

@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly advisory: AdvisoryService,
  ) {}

  private assertInternal(user: AuthUser) {
    if (!INTERNAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Internal Physical Risk access is required.');
    }
  }

  private commercialIntent(lead: {
    proposalStatus: ProposalStatus;
    proposalRequestedAt: Date | null;
    diagnosticRequestedAt: Date | null;
    convertedAt: Date | null;
    closedAt: Date | null;
  }) {
    if (lead.convertedAt) return 'CONVERTED';
    if (lead.closedAt) return 'CLOSED';
    switch (lead.proposalStatus) {
      case ProposalStatus.REQUESTED:
        return 'PROPOSAL_REQUESTED';
      case ProposalStatus.IN_PREPARATION:
        return 'PROPOSAL_IN_PREPARATION';
      case ProposalStatus.SENT:
        return 'PROPOSAL_SENT';
      case ProposalStatus.ACCEPTED:
        return 'PROPOSAL_ACCEPTED';
      case ProposalStatus.DECLINED:
        return 'PROPOSAL_DECLINED';
      case ProposalStatus.EXPIRED:
        return 'PROPOSAL_EXPIRED';
      case ProposalStatus.CANCELLED:
        return 'PROPOSAL_CANCELLED';
      default:
        break;
    }
    if (lead.diagnosticRequestedAt) return 'DIAGNOSTIC_REQUESTED';
    return 'NONE';
  }

  private displayStatus(lead: {
    status: string;
    proposalStatus: ProposalStatus;
    diagnosticRequestedAt: Date | null;
    convertedAt: Date | null;
    closedAt: Date | null;
  }) {
    if (lead.closedAt || lead.status === 'CLOSED') return 'CLOSED';
    if (lead.convertedAt || lead.status === 'CONVERTED') return 'CONVERTED';
    if (lead.proposalStatus === ProposalStatus.ACCEPTED) return 'PROPOSAL_ACCEPTED';
    if (lead.proposalStatus === ProposalStatus.SENT) return 'PROPOSAL_SENT';
    if (lead.proposalStatus === ProposalStatus.IN_PREPARATION) return 'PROPOSAL_IN_PREPARATION';
    if (lead.proposalStatus === ProposalStatus.REQUESTED) return 'PROPOSAL_REQUESTED';
    if (lead.proposalStatus === ProposalStatus.DECLINED) return 'PROPOSAL_DECLINED';
    if (lead.diagnosticRequestedAt) return 'DIAGNOSTIC_REQUESTED';
    if (lead.status === 'REVIEWED') return 'REVIEWED';
    if (lead.status === 'CONTACTED') return 'CONTACTED';
    if (lead.status === 'COMPLETED') return 'COMPLETED';
    return 'IN_PROGRESS';
  }

  private commercialSortKey(lead: {
    proposalStatus: ProposalStatus;
    proposalRequestedAt: Date | null;
    diagnosticRequestedAt: Date | null;
    convertedAt: Date | null;
    closedAt: Date | null;
    completedAt: Date | null;
    contactedAt: Date | null;
    updatedAt: Date;
  }) {
    // Lower = higher priority in admin list
    if (lead.proposalStatus === ProposalStatus.REQUESTED) return 1;
    if (lead.proposalStatus === ProposalStatus.ACCEPTED) return 2;
    if (lead.proposalStatus === ProposalStatus.IN_PREPARATION) return 3;
    if (lead.proposalStatus === ProposalStatus.SENT) return 4;
    if (lead.diagnosticRequestedAt && !lead.convertedAt && !lead.closedAt) return 5;
    if (lead.completedAt && !lead.contactedAt && !lead.convertedAt && !lead.closedAt) return 6;
    if (!lead.completedAt && !lead.closedAt) return 7;
    if (lead.convertedAt || lead.closedAt) return 9;
    return 8;
  }

  async list(user: AuthUser, query: LeadQuery = {}) {
    this.assertInternal(user);
    const q = String(query.q || '').trim();
    const status = String(query.status || '').trim().toUpperCase();
    const intent = String(query.intent || '').trim().toLowerCase();

    const leads = await this.prisma.publicLead.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { organisationName: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { proposalReference: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(intent === 'requested' || intent === 'diagnostic'
          ? { diagnosticRequestedAt: { not: null } }
          : {}),
        ...(intent === 'proposal' || intent === 'proposal_requested'
          ? { proposalStatus: ProposalStatus.REQUESTED }
          : {}),
        ...(intent === 'proposal_in_preparation'
          ? { proposalStatus: ProposalStatus.IN_PREPARATION }
          : {}),
        ...(intent === 'proposal_sent' ? { proposalStatus: ProposalStatus.SENT } : {}),
        ...(intent === 'proposal_accepted' ? { proposalStatus: ProposalStatus.ACCEPTED } : {}),
        ...(intent === 'proposal_declined' ? { proposalStatus: ProposalStatus.DECLINED } : {}),
      },
      include: {
        assignedAnalyst: {
          select: { id: true, firstName: true, lastName: true, email: true, systemRole: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });

    const filtered = status
      ? leads.filter((lead) => this.displayStatus(lead) === status)
      : [...leads].sort((a, b) => {
          const pa = this.commercialSortKey(a);
          const pb = this.commercialSortKey(b);
          if (pa !== pb) return pa - pb;
          const ta = a.proposalRequestedAt?.getTime() || a.updatedAt.getTime();
          const tb = b.proposalRequestedAt?.getTime() || b.updatedAt.getTime();
          return tb - ta;
        });

    const assessmentIds = filtered.map((lead) => lead.assessmentId).filter(Boolean) as string[];
    const convertedIds = filtered.map((lead) => lead.convertedAssessmentId).filter(Boolean) as string[];
    const sessions = assessmentIds.length
      ? await this.prisma.assessmentSession.findMany({
          where: { id: { in: assessmentIds } },
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            productCode: true,
            updatedAt: true,
            scoreSnapshots: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { overallRiskScore: true, riskBand: true, categoryScores: true, createdAt: true },
            },
          },
        })
      : [];
    const converted = convertedIds.length
      ? await this.prisma.assessmentSession.findMany({
          where: { id: { in: convertedIds } },
          select: { id: true, reference: true, title: true, status: true, productCode: true },
        })
      : [];

    const sessionById = new Map(sessions.map((row) => [row.id, row]));
    const convertedById = new Map(converted.map((row) => [row.id, row]));

    const items = filtered.map((lead) => {
      const session = lead.assessmentId ? sessionById.get(lead.assessmentId) : null;
      const conversion = lead.convertedAssessmentId ? convertedById.get(lead.convertedAssessmentId) : null;
      const snapshot = session?.scoreSnapshots?.[0];
      return {
        ...lead,
        displayStatus: this.displayStatus(lead),
        intent: this.commercialIntent(lead),
        assessment: session
          ? {
              id: session.id,
              reference: session.reference,
              title: session.title,
              status: session.status,
              productCode: session.productCode,
              overallRiskScore: snapshot ? Number(snapshot.overallRiskScore) : null,
              riskBand: snapshot?.riskBand || null,
              categoryScores: snapshot?.categoryScores || [],
            }
          : null,
        convertedEngagement: conversion || null,
      };
    });

    const all = leads.map((lead) => ({ ...lead, displayStatus: this.displayStatus(lead) }));
    const openStatuses: ProposalStatus[] = [
      ProposalStatus.REQUESTED,
      ProposalStatus.IN_PREPARATION,
      ProposalStatus.SENT,
      ProposalStatus.ACCEPTED,
    ];
    const openProposal = (lead: (typeof all)[number]) =>
      openStatuses.includes(lead.proposalStatus) && !lead.convertedAt && !lead.closedAt;

    const summary = {
      total: all.length,
      inProgress: all.filter((lead) => lead.displayStatus === 'IN_PROGRESS').length,
      completed: all.filter((lead) => lead.completedAt && !lead.convertedAt && !lead.closedAt).length,
      diagnosticRequested: all.filter(
        (lead) => lead.diagnosticRequestedAt && !lead.convertedAt && !lead.closedAt,
      ).length,
      proposalRequested: all.filter(
        (lead) =>
          lead.proposalStatus === ProposalStatus.REQUESTED && !lead.convertedAt && !lead.closedAt,
      ).length,
      proposalActive: all.filter((lead) => openProposal(lead)).length,
      notContacted: all.filter(
        (lead) => lead.completedAt && !lead.contactedAt && !lead.convertedAt && !lead.closedAt,
      ).length,
      converted: all.filter((lead) => Boolean(lead.convertedAt)).length,
      closed: all.filter((lead) => Boolean(lead.closedAt)).length,
    };

    return { items, summary };
  }

  async get(id: string, user: AuthUser) {
    this.assertInternal(user);
    const lead = await this.prisma.publicLead.findUnique({
      where: { id },
      include: {
        assignedAnalyst: {
          select: { id: true, firstName: true, lastName: true, email: true, systemRole: true },
        },
      },
    });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    const list = await this.list(user, { q: lead.email });
    const item = list.items.find((row) => row.id === id) || {
      ...lead,
      displayStatus: this.displayStatus(lead),
      intent: this.commercialIntent(lead),
      assessment: null,
      convertedEngagement: null,
    };
    const audit = await this.prisma.auditEvent.findMany({
      where: { entityType: 'PublicLead', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    let responses: Array<{
      id: string;
      question?: { code: string; text: string } | null;
      responseOption?: { label: string } | null;
    }> = [];
    if (lead.assessmentId) {
      const session = await this.prisma.assessmentSession.findUnique({
        where: { id: lead.assessmentId },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          productCode: true,
          updatedAt: true,
          responses: {
            orderBy: { question: { sortOrder: 'asc' } },
            select: {
              id: true,
              question: { select: { code: true, text: true, sortOrder: true } },
              responseOption: { select: { label: true } },
            },
          },
          scoreSnapshots: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              overallRiskScore: true,
              riskBand: true,
              categoryScores: true,
              maturityScore: true,
              methodologyConfidence: true,
              opportunityScore: true,
              createdAt: true,
            },
          },
        },
      });
      if (session) {
        responses = session.responses;
        const snapshot = session.scoreSnapshots[0];
        (item as any).assessment = {
          id: session.id,
          reference: session.reference,
          title: session.title,
          status: session.status,
          productCode: session.productCode,
          overallRiskScore: snapshot ? Number(snapshot.overallRiskScore) : null,
          riskBand: snapshot?.riskBand || null,
          categoryScores: snapshot?.categoryScores || [],
          maturityScore: snapshot?.maturityScore != null ? Number(snapshot.maturityScore) : null,
          methodologyConfidence:
            snapshot?.methodologyConfidence != null ? Number(snapshot.methodologyConfidence) : null,
          opportunityScore: snapshot?.opportunityScore != null ? Number(snapshot.opportunityScore) : null,
        };
      }
    }

    return {
      ...item,
      assignedAnalyst: lead.assignedAnalyst,
      assignedAnalystId: lead.assignedAnalystId,
      commercialJourney: this.commercialJourney(lead),
      responses,
      audit,
    };
  }

  private commercialJourney(lead: {
    createdAt: Date;
    completedAt: Date | null;
    diagnosticRequestedAt: Date | null;
    proposalRequestedAt: Date | null;
    proposalStatus: ProposalStatus;
    proposalReference: string | null;
    proposalSentAt: Date | null;
    proposalAcceptedAt: Date | null;
    proposalDeclinedAt: Date | null;
    proposalExpiredAt: Date | null;
    reviewedAt: Date | null;
    contactedAt: Date | null;
    convertedAt: Date | null;
  }) {
    return [
      { key: 'STARTED', label: 'Questionnaire Started', at: lead.createdAt },
      { key: 'COMPLETED', label: 'Questionnaire Completed', at: lead.completedAt },
      { key: 'DIAGNOSTIC', label: 'Executive Discussion Requested', at: lead.diagnosticRequestedAt },
      { key: 'PROPOSAL_REQUESTED', label: 'Proposal Requested', at: lead.proposalRequestedAt },
      { key: 'REVIEWED', label: 'Reviewed', at: lead.reviewedAt },
      { key: 'CONTACTED', label: 'Contacted', at: lead.contactedAt },
      {
        key: 'PROPOSAL_PREP',
        label: 'Proposal In Preparation',
        at: lead.proposalStatus === ProposalStatus.IN_PREPARATION ? lead.proposalRequestedAt : null,
        active: lead.proposalStatus === ProposalStatus.IN_PREPARATION,
      },
      { key: 'PROPOSAL_SENT', label: 'Proposal Sent', at: lead.proposalSentAt },
      {
        key: 'PROPOSAL_OUTCOME',
        label:
          lead.proposalStatus === ProposalStatus.DECLINED
            ? 'Proposal Declined'
            : lead.proposalStatus === ProposalStatus.EXPIRED
              ? 'Proposal Expired'
              : 'Proposal Accepted',
        at: lead.proposalAcceptedAt || lead.proposalDeclinedAt || lead.proposalExpiredAt,
      },
      { key: 'CONVERTED', label: 'Converted to Level 2', at: lead.convertedAt },
    ];
  }

  async update(
    id: string,
    input: {
      status?: string;
      adminNotes?: string;
      proposalAdminNotes?: string;
      assignedAnalystId?: string | null;
    },
    user: AuthUser,
  ) {
    this.assertInternal(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Triage submission not found.');

    const requestedStage = input.status?.trim().toUpperCase();
    if (requestedStage && !ADMIN_STAGES.has(requestedStage)) {
      throw new BadRequestException('Unsupported triage stage.');
    }
    if (requestedStage && !lead.completedAt) {
      throw new BadRequestException('Complete the questionnaire before changing the follow-up stage.');
    }

    if (input.assignedAnalystId !== undefined && input.assignedAnalystId) {
      const analyst = await this.prisma.user.findFirst({
        where: {
          id: input.assignedAnalystId,
          isActive: true,
          systemRole: { in: ['ANALYST', 'REVIEWER', 'SUPER_ADMIN', 'METHODOLOGY_ADMIN'] },
        },
      });
      if (!analyst) throw new BadRequestException('Select an active analyst or reviewer.');
    }

    const now = new Date();
    const data: Record<string, unknown> = {};
    if (input.adminNotes !== undefined) data.adminNotes = input.adminNotes.trim() || null;
    if (input.proposalAdminNotes !== undefined) {
      data.proposalAdminNotes = input.proposalAdminNotes.trim() || null;
    }
    if (input.assignedAnalystId !== undefined) {
      data.assignedAnalystId = input.assignedAnalystId || null;
    }
    if (requestedStage === 'REVIEWED') {
      data.status = lead.diagnosticRequestedAt || lead.proposalRequestedAt ? lead.status : 'REVIEWED';
      data.reviewedAt = lead.reviewedAt || now;
      data.closedAt = null;
    } else if (requestedStage === 'CONTACTED') {
      data.status = 'CONTACTED';
      data.contactedAt = lead.contactedAt || now;
      data.reviewedAt = lead.reviewedAt || now;
      data.closedAt = null;
    } else if (requestedStage === 'CLOSED') {
      data.status = 'CLOSED';
      data.closedAt = now;
    }

    const updated = await this.prisma.publicLead.update({ where: { id }, data });
    await this.audit.record({
      userId: user.id,
      action: requestedStage
        ? `TRIAGE_${requestedStage}`
        : input.assignedAnalystId !== undefined
          ? 'TRIAGE_ANALYST_ASSIGNED'
          : 'TRIAGE_NOTES_UPDATED',
      entityType: 'PublicLead',
      entityId: id,
      metadata: {
        status: updated.status,
        diagnosticRequested: Boolean(updated.diagnosticRequestedAt),
        proposalStatus: updated.proposalStatus,
        assignedAnalystId: updated.assignedAnalystId,
      },
    });
    return this.get(id, user);
  }

  async updateProposal(
    id: string,
    input: { action: string; proposalAdminNotes?: string },
    user: AuthUser,
  ) {
    this.assertInternal(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    if (!lead.completedAt) {
      throw new BadRequestException('Complete the questionnaire before managing proposal status.');
    }

    const action = String(input.action || '').trim().toUpperCase();
    if (!PROPOSAL_ACTIONS.has(action)) {
      throw new BadRequestException('Unsupported proposal action.');
    }

    const previous = lead.proposalStatus;
    const now = new Date();
    const data: Record<string, unknown> = {};
    let auditAction = 'PROPOSAL_UPDATED';
    let next: ProposalStatus = previous;

    if (input.proposalAdminNotes !== undefined) {
      data.proposalAdminNotes = input.proposalAdminNotes.trim() || null;
    }

    if (action === 'PREPARE') {
      const allowed: ProposalStatus[] = [ProposalStatus.REQUESTED, ProposalStatus.IN_PREPARATION];
      if (!allowed.includes(previous)) {
        throw new BadRequestException('Start preparing only from a requested proposal.');
      }
      next = ProposalStatus.IN_PREPARATION;
      data.proposalStatus = next;
      data.proposalPreparedById = user.id;
      data.reviewedAt = lead.reviewedAt || now;
      auditAction = 'PROPOSAL_PREPARATION_STARTED';
    } else if (action === 'SENT') {
      const allowed: ProposalStatus[] = [
        ProposalStatus.REQUESTED,
        ProposalStatus.IN_PREPARATION,
        ProposalStatus.SENT,
      ];
      if (!allowed.includes(previous)) {
        throw new BadRequestException('Mark sent only after a proposal has been requested.');
      }
      next = ProposalStatus.SENT;
      data.proposalStatus = next;
      data.proposalSentAt = lead.proposalSentAt || now;
      data.contactedAt = lead.contactedAt || now;
      auditAction = 'PROPOSAL_SENT';
    } else if (action === 'ACCEPTED') {
      const allowed: ProposalStatus[] = [
        ProposalStatus.SENT,
        ProposalStatus.ACCEPTED,
        ProposalStatus.IN_PREPARATION,
      ];
      if (!allowed.includes(previous)) {
        throw new BadRequestException('Accept only after the proposal has been prepared or sent.');
      }
      next = ProposalStatus.ACCEPTED;
      data.proposalStatus = next;
      data.proposalAcceptedAt = lead.proposalAcceptedAt || now;
      auditAction = 'PROPOSAL_ACCEPTED';
    } else if (action === 'DECLINED') {
      const allowed: ProposalStatus[] = [
        ProposalStatus.REQUESTED,
        ProposalStatus.IN_PREPARATION,
        ProposalStatus.SENT,
        ProposalStatus.DECLINED,
      ];
      if (!allowed.includes(previous)) {
        throw new BadRequestException('Decline is not valid for this proposal state.');
      }
      next = ProposalStatus.DECLINED;
      data.proposalStatus = next;
      data.proposalDeclinedAt = lead.proposalDeclinedAt || now;
      auditAction = 'PROPOSAL_DECLINED';
    } else if (action === 'EXPIRE') {
      next = ProposalStatus.EXPIRED;
      data.proposalStatus = next;
      data.proposalExpiredAt = lead.proposalExpiredAt || now;
      auditAction = 'PROPOSAL_EXPIRED';
    } else if (action === 'CANCELLED') {
      next = ProposalStatus.CANCELLED;
      data.proposalStatus = next;
      auditAction = 'PROPOSAL_CANCELLED';
    }

    await this.prisma.publicLead.update({ where: { id }, data });
    await this.audit.record({
      userId: user.id,
      action: auditAction,
      entityType: 'PublicLead',
      entityId: id,
      metadata: {
        proposalReference: lead.proposalReference,
        previousStatus: previous,
        newStatus: next,
      },
    });
    return this.get(id, user);
  }

  async convert(id: string, user: AuthUser) {
    this.assertInternal(user);
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Triage submission not found.');
    if (!lead.completedAt || !lead.assessmentId || !lead.organisationId) {
      throw new BadRequestException('Only completed triage submissions can be converted to a paid diagnostic.');
    }
    if (lead.closedAt) throw new BadRequestException('Closed submissions must be reopened before conversion.');

    if (lead.convertedAssessmentId) {
      const existing = await this.prisma.assessmentSession.findUnique({
        where: { id: lead.convertedAssessmentId },
        select: { id: true, reference: true, title: true, status: true, productCode: true },
      });
      if (existing) return { created: false, engagement: existing };
    }

    const engagement = await this.advisory.create(
      {
        organisationId: lead.organisationId,
        productCode: ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
        parentAssessmentId: lead.assessmentId,
        title: `${lead.organisationName} Executive Advisory Diagnostic`,
      },
      user,
    );

    await this.prisma.publicLead.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        convertedAt: new Date(),
        convertedAssessmentId: engagement.id,
        reviewedAt: lead.reviewedAt || new Date(),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'TRIAGE_CONVERTED_TO_LEVEL2',
      entityType: 'PublicLead',
      entityId: id,
      metadata: {
        triageAssessmentId: lead.assessmentId,
        diagnosticAssessmentId: engagement.id,
        diagnosticReference: engagement.reference,
        proposalReference: lead.proposalReference,
        proposalStatus: lead.proposalStatus,
      },
    });
    return { created: true, engagement };
  }
}
