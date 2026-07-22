import { BadRequestException, Inject, Injectable, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import {
  AssessmentStatus,
  AssignmentRole,
  FindingSeverity,
  FindingStatus,
  OverrideStatus,
  QaItemStatus,
  Prisma,
  ReportType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssessmentsService } from '../assessments/assessments.service';
import type { AuthUser } from '../common/current-user.decorator';
import { assertTransition, workflowTimeline } from '../common/workflow';
import { ANALYST_ROLES, APPROVER_ROLES, ADMIN_ROLES, requireRole, hasRole } from '../common/roles';
import { EmailService } from '../email/email.service';
import { ReportsService } from '../reports/reports.service';
import { EspoCrmService } from '../crm/espocrm.service';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assessments: AssessmentsService,
    private readonly email: EmailService,
    @Inject(forwardRef(() => ReportsService)) private readonly reports: ReportsService,
    @Optional() @Inject(forwardRef(() => EspoCrmService)) private readonly crm?: EspoCrmService,
  ) {}

  timeline(status: AssessmentStatus) {
    return workflowTimeline(status);
  }

  async transition(assessmentId: string, to: AssessmentStatus, user: AuthUser, reason?: string) {
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (assessment.lockedAt && !hasRole(user, ADMIN_ROLES)) {
      throw new BadRequestException('Assessment is locked. An administrator must unlock it first.');
    }
    assertTransition(assessment.status, to, user, { reason });
    const updated = await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: {
        status: to,
        returnReason: reason || null,
        ...(to === AssessmentStatus.SUBMITTED ? { submittedAt: new Date() } : {}),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ASSESSMENT_STATUS_CHANGE',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: { from: assessment.status, to, reason },
    });
    return { ...updated, timeline: this.timeline(updated.status) };
  }

  async myAssignments(user: AuthUser) {
    requireRole(user, ANALYST_ROLES);
    const submitted = await this.prisma.assessmentSession.findMany({
      where: {
        status: {
          in: [
            AssessmentStatus.SUBMITTED,
            AssessmentStatus.REVIEWED,
            AssessmentStatus.AUTOMATED_EVALUATION_COMPLETE,
            AssessmentStatus.EVIDENCE_REVIEW,
            AssessmentStatus.ANALYST_REVIEW,
            AssessmentStatus.QUALITY_ASSURANCE,
          ],
        },
      },
      include: {
        organisation: { select: { id: true, name: true, industry: true } },
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignments: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] } },
          orderBy: { assignedAt: 'desc' },
          take: 5,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        _count: { select: { evidence: true, recommendations: true, findings: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });

    const now = Date.now();
    const slaDays = 3;
    const items = submitted.map((row) => {
      const primary = row.assignments.find((a) => a.role === AssignmentRole.PRIMARY_ANALYST) || row.assignments[0];
      const submittedAt = row.submittedAt || row.updatedAt;
      const ageMs = now - new Date(submittedAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const dueDate = primary?.dueDate
        ? new Date(primary.dueDate)
        : new Date(new Date(submittedAt).getTime() + slaDays * 24 * 60 * 60 * 1000);
      const overdue = now > dueDate.getTime() && !['REVIEWED', 'QUALITY_ASSURANCE'].includes(row.status);
      const needsInfo = Boolean(row.returnReason);
      let queueStatus: string = 'awaiting_review';
      if (overdue) queueStatus = 'overdue';
      else if (needsInfo) queueStatus = 'needs_info';
      else if (row.status === AssessmentStatus.QUALITY_ASSURANCE) queueStatus = 'ready_for_approval';
      else if (row.status === AssessmentStatus.REVIEWED) queueStatus = 'reviewed';
      else if (row.status === AssessmentStatus.SUBMITTED || row.status === AssessmentStatus.AUTOMATED_EVALUATION_COMPLETE) {
        queueStatus = 'submitted';
      } else if (row.status === AssessmentStatus.ANALYST_REVIEW || row.status === AssessmentStatus.EVIDENCE_REVIEW) {
        queueStatus = 'awaiting_review';
      }

      const score = row.scoreSnapshots[0];
      const riskBand = score?.riskBand || '';
      let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';
      if (riskBand === 'Critical' || overdue) priority = 'critical';
      else if (riskBand === 'High') priority = 'high';
      else if (riskBand === 'Moderate') priority = 'medium';
      else priority = 'low';

      return {
        ...row,
        queueStatus,
        priority,
        overdue,
        ageDays: Math.round(ageDays * 10) / 10,
        dueDate: dueDate.toISOString(),
        assignedAnalyst: primary?.user || row.reviewedBy || null,
      };
    });

    const awaitingReview = items.filter((i) =>
      ['awaiting_review', 'submitted', 'needs_info', 'overdue'].includes(i.queueStatus),
    );
    const readyForApproval = items.filter((i) =>
      ['ready_for_approval', 'reviewed'].includes(i.queueStatus),
    );
    const overdueItems = items.filter((i) => i.queueStatus === 'overdue');
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const submittedToday = items.filter((i) => i.submittedAt && new Date(i.submittedAt) >= startOfDay);

    const reviewedWithTiming = items.filter((i) => i.reviewedAt && i.submittedAt);
    const avgReviewDays = reviewedWithTiming.length
      ? reviewedWithTiming.reduce((sum, i) => {
          const days =
            (new Date(i.reviewedAt as Date).getTime() - new Date(i.submittedAt as Date).getTime()) /
            (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / reviewedWithTiming.length
      : items.length
        ? items.reduce((sum, i) => sum + i.ageDays, 0) / items.length
        : 0;

    const workloadMap = new Map<string, { id: string; name: string; email?: string | null; count: number }>();
    for (const item of items) {
      const analyst = item.assignedAnalyst;
      if (!analyst) continue;
      const name = [analyst.firstName, analyst.lastName].filter(Boolean).join(' ').trim() || analyst.email || 'Analyst';
      const existing = workloadMap.get(analyst.id);
      if (existing) existing.count += 1;
      else workloadMap.set(analyst.id, { id: analyst.id, name, email: analyst.email, count: 1 });
    }

    return {
      awaitingReview: items,
      all: items,
      summary: {
        totalInQueue: items.length,
        awaitingReview: awaitingReview.length,
        submittedToday: submittedToday.length,
        overdue: overdueItems.length,
        readyForApproval: readyForApproval.length,
        avgReviewDays: Math.round(avgReviewDays * 10) / 10,
      },
      workload: [...workloadMap.values()].sort((a, b) => b.count - a.count),
    };
  }

  async assign(
    assessmentId: string,
    input: { userId: string; role: AssignmentRole; dueDate?: string; notes?: string },
    user: AuthUser,
  ) {
    requireRole(user, ADMIN_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    return this.prisma.assessmentAssignment.create({
      data: {
        assessmentId,
        userId: input.userId,
        role: input.role,
        assignedById: user.id,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes,
      },
    });
  }

  async validateForApproval(assessmentId: string) {
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: {
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        responses: true,
        inputValues: { include: { inputDefinition: true } },
        questionnaireVersion: { include: { questions: true, inputDefinitions: true } },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    const blockers: string[] = [];
    if (assessment.status !== AssessmentStatus.REVIEWED) {
      blockers.push('Assessment must be marked as reviewed before approval.');
    }
    if (!assessment.scoreSnapshots[0]) {
      blockers.push('Automated scoring has not completed successfully.');
    }
    if (!assessment.submittedAt && assessment.status === AssessmentStatus.DRAFT) {
      blockers.push('Assessment must be submitted before approval.');
    }
    const requiredInputs = assessment.questionnaireVersion.inputDefinitions.filter((i) => i.required);
    for (const def of requiredInputs) {
      const value = assessment.inputValues.find((v) => v.inputDefinitionId === def.id);
      if (value == null || value.value === null || value.value === '' || value.value === undefined) {
        blockers.push(`Required calibration input missing: ${def.code}`);
      }
    }
    const mandatory = assessment.questionnaireVersion.questions.filter((q) => q.required);
    for (const q of mandatory) {
      const response = assessment.responses.find((r) => r.questionId === q.id);
      if (!response?.responseOptionId) {
        blockers.push(`Mandatory question unanswered: ${q.code}`);
      }
    }
    return { ok: blockers.length === 0, blockers };
  }

  async saveReviewNote(assessmentId: string, note: string, user: AuthUser) {
    requireRole(user, ANALYST_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const updated = await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: { reviewNote: note },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ANALYST_REVIEW_NOTE',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      newValue: { reviewNote: note },
    });
    return updated;
  }

  async markReviewed(assessmentId: string, user: AuthUser, note?: string) {
    requireRole(user, ANALYST_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: { scoreSnapshots: { take: 1 } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (!assessment.scoreSnapshots.length) {
      throw new BadRequestException('Scoring must complete before review can be marked complete.');
    }
    assertTransition(assessment.status, AssessmentStatus.REVIEWED, user);
    const updated = await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: {
        status: AssessmentStatus.REVIEWED,
        reviewedAt: new Date(),
        reviewedById: user.id,
        reviewNote: note ?? assessment.reviewNote,
        returnReason: null,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ANALYST_REVIEW',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: { note },
    });
    return { ...updated, timeline: this.timeline(updated.status) };
  }

  async returnToClient(assessmentId: string, comment: string, user: AuthUser) {
    requireRole(user, ANALYST_ROLES);
    if (!comment?.trim()) throw new BadRequestException('A comment is required when returning to the client.');
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: { organisation: true },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    assertTransition(assessment.status, AssessmentStatus.IN_PROGRESS, user, { reason: comment });
    const updated = await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: {
        status: AssessmentStatus.IN_PROGRESS,
        returnReason: comment,
        reviewedAt: null,
        reviewedById: null,
      },
    });
    const lead = await this.prisma.publicLead.findFirst({
      where: { assessmentId },
      orderBy: { updatedAt: 'desc' },
    });
    if (lead?.email) {
      await this.email.enqueue({
        recipient: lead.email,
        subject: `Additional information required: ${assessment.reference}`,
        template: 'missing_information',
        relatedType: 'AssessmentSession',
        relatedId: assessmentId,
        organisationId: assessment.organisationId,
        payload: {
          firstName: lead.firstName,
          reference: assessment.reference,
          comment,
          organisationName: assessment.organisation.name,
        },
      }).catch(() => undefined);
    }
    await this.audit.record({
      userId: user.id,
      action: 'ASSESSMENT_RETURNED',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: { comment },
    });
    return { ...updated, timeline: this.timeline(updated.status) };
  }

  async approve(assessmentId: string, user: AuthUser) {
    requireRole(user, APPROVER_ROLES, 'Only authorised analysts or administrators may approve.');
    await this.assessments.checkAccess(assessmentId, user);
    const validation = await this.validateForApproval(assessmentId);
    if (!validation.ok) throw new BadRequestException(validation.blockers.join(' '));
    const current = await this.prisma.assessmentSession.findUniqueOrThrow({ where: { id: assessmentId } });
    assertTransition(current.status, AssessmentStatus.APPROVED, user);
    const updated = await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: {
        status: AssessmentStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: user.id,
        lockedAt: new Date(),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ASSESSMENT_APPROVED',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: {},
    });
    const lead = await this.prisma.publicLead.findFirst({
      where: { assessmentId },
      orderBy: { updatedAt: 'desc' },
    });
    if (lead?.email) {
      await this.email.enqueue({
        recipient: lead.email,
        subject: `Assessment approved: ${updated.reference}`,
        template: 'assessment_approved',
        relatedType: 'AssessmentSession',
        relatedId: assessmentId,
        organisationId: updated.organisationId,
        payload: { reference: updated.reference, firstName: lead.firstName },
      }).catch(() => undefined);
    }
    try {
      await this.reports.generate(assessmentId, user, { reportType: ReportType.VERIFIED_EXECUTIVE });
    } catch {
      // Report generation failure must not roll back approval; analyst can regenerate.
    }
    try {
      await this.crm?.queueOpportunitySync(assessmentId);
    } catch {
      // CRM downtime must not block approval
    }
    return this.prisma.assessmentSession.findUniqueOrThrow({ where: { id: assessmentId } });
  }

  async updateRecommendation(
    id: string,
    input: {
      summary?: string;
      title?: string;
      priority?: FindingSeverity;
      includeInReport?: boolean;
      suggestedNextStep?: string;
      serviceOffering?: string;
    },
    user: AuthUser,
  ) {
    requireRole(user, ANALYST_ROLES);
    const existing = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Recommendation not found.');
    await this.assessments.checkAccess(existing.assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id: existing.assessmentId } });
    if (assessment?.lockedAt && !hasRole(user, ADMIN_ROLES)) {
      throw new BadRequestException('Assessment is locked.');
    }
    const updated = await this.prisma.recommendation.update({
      where: { id },
      data: {
        ...(input.summary !== undefined
          ? {
              summary: input.summary,
              originalSummary: existing.originalSummary ?? existing.summary,
            }
          : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.includeInReport !== undefined ? { includeInReport: input.includeInReport } : {}),
        ...(input.suggestedNextStep !== undefined ? { suggestedNextStep: input.suggestedNextStep } : {}),
        ...(input.serviceOffering !== undefined ? { serviceOffering: input.serviceOffering } : {}),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'RECOMMENDATION_UPDATED',
      entityType: 'Recommendation',
      entityId: id,
      oldValue: { summary: existing.summary, priority: existing.priority, includeInReport: existing.includeInReport },
      newValue: input as any,
    });
    return updated;
  }

  async addRecommendation(
    assessmentId: string,
    input: {
      title: string;
      summary: string;
      category?: string;
      priority?: FindingSeverity;
      serviceOffering?: string;
      suggestedNextStep?: string;
    },
    user: AuthUser,
  ) {
    requireRole(user, ANALYST_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (assessment.lockedAt && !hasRole(user, ADMIN_ROLES)) {
      throw new BadRequestException('Assessment is locked.');
    }
    const created = await this.prisma.recommendation.create({
      data: {
        assessmentId,
        title: input.title,
        summary: input.summary,
        originalSummary: input.summary,
        category: input.category || 'Analyst',
        priority: input.priority || FindingSeverity.MEDIUM,
        serviceOffering: input.serviceOffering,
        suggestedNextStep: input.suggestedNextStep,
        includeInReport: true,
        status: 'PROPOSED',
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'RECOMMENDATION_ADDED',
      entityType: 'Recommendation',
      entityId: created.id,
      metadata: { assessmentId },
    });
    return created;
  }

  async unlock(assessmentId: string, reason: string, user: AuthUser) {
    requireRole(user, ADMIN_ROLES, 'Only administrators may unlock assessments.');
    if (!reason?.trim()) throw new BadRequestException('Unlock reason is required.');
    const updated = await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: { lockedAt: null, unlockedAt: new Date(), unlockedById: user.id, unlockReason: reason },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ASSESSMENT_UNLOCKED',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: { reason },
    });
    return updated;
  }

  async requestOverride(
    assessmentId: string,
    input: { proposedScore: number; reason: string; supportingEvidenceIds?: string[] },
    user: AuthUser,
  ) {
    requireRole(user, ANALYST_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const snapshot = await this.prisma.scoreSnapshot.findFirst({
      where: { assessmentId },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) throw new BadRequestException('Evaluate the assessment before requesting an override.');
    const row = await this.prisma.scoreOverride.create({
      data: {
        assessmentId,
        originalScore: snapshot.overallRiskScore,
        proposedScore: input.proposedScore,
        reason: input.reason,
        supportingEvidenceIds: input.supportingEvidenceIds || [],
        requestedById: user.id,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'SCORE_OVERRIDE_REQUESTED',
      entityType: 'ScoreOverride',
      entityId: row.id,
      metadata: { assessmentId, proposedScore: input.proposedScore },
    });
    return row;
  }

  async decideOverride(
    overrideId: string,
    input: { status: 'APPROVED' | 'REJECTED'; comments?: string },
    user: AuthUser,
  ) {
    requireRole(user, ADMIN_ROLES, 'Score overrides are not part of the Lean MVP approval path.');
    const existing = await this.prisma.scoreOverride.findUnique({ where: { id: overrideId } });
    if (!existing) throw new NotFoundException('Override not found.');
    if (existing.status !== OverrideStatus.REQUESTED) throw new BadRequestException('Override already decided.');
    await this.assessments.checkAccess(existing.assessmentId, user);
    const updated = await this.prisma.scoreOverride.update({
      where: { id: overrideId },
      data: {
        status: input.status === 'APPROVED' ? OverrideStatus.APPROVED : OverrideStatus.REJECTED,
        reviewerComments: input.comments,
        decidedById: user.id,
        decidedAt: new Date(),
        finalScore: input.status === 'APPROVED' ? existing.proposedScore : existing.originalScore,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: input.status === 'APPROVED' ? 'SCORE_OVERRIDE_APPROVED' : 'SCORE_OVERRIDE_REJECTED',
      entityType: 'ScoreOverride',
      entityId: overrideId,
      metadata: { comments: input.comments },
    });
    return updated;
  }

  async listFindings(assessmentId: string, user: AuthUser) {
    await this.assessments.checkAccess(assessmentId, user);
    return this.prisma.finding.findMany({
      where: { assessmentId },
      orderBy: { createdAt: 'asc' },
      include: {
        analyst: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async listOverrides(assessmentId: string, user: AuthUser) {
    await this.assessments.checkAccess(assessmentId, user);
    return this.prisma.scoreOverride.findMany({
      where: { assessmentId },
      orderBy: { requestedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async listAssignments(assessmentId: string, user: AuthUser) {
    await this.assessments.checkAccess(assessmentId, user);
    return this.prisma.assessmentAssignment.findMany({
      where: { assessmentId },
      orderBy: { assignedAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, systemRole: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  // Legacy pilot endpoints retained but unused by Lean MVP UI.
  async ensureQaChecklist(assessmentId: string) {
    return this.prisma.qaChecklistItem.findMany({ where: { assessmentId }, orderBy: { sortOrder: 'asc' } });
  }

  async updateQaItem(
    assessmentId: string,
    code: string,
    input: { status: QaItemStatus; comment?: string },
    user: AuthUser,
  ) {
    requireRole(user, ADMIN_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const item = await this.prisma.qaChecklistItem.update({
      where: { assessmentId_code: { assessmentId, code } },
      data: {
        status: input.status,
        comment: input.comment,
        checkedById: user.id,
        checkedAt: new Date(),
      },
    });
    return item;
  }

  async createFinding(
    assessmentId: string,
    input: {
      title: string;
      category: string;
      description: string;
      severity: FindingSeverity;
      rootCause?: string;
      riskImplication?: string;
      governanceImplication?: string;
      financialImplication?: string;
      estimatedExposure?: number;
      likelihood?: string;
      impact?: string;
      priority?: FindingSeverity;
      recommendationText?: string;
      relatedQuestionCodes?: string[];
      relatedEvidenceIds?: string[];
      targetResolutionDate?: string;
    },
    user: AuthUser,
  ) {
    requireRole(user, ADMIN_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    const count = await this.prisma.finding.count({ where: { assessmentId } });
    const reference = `MOSS-${assessment.reference}-F${String(count + 1).padStart(3, '0')}`;
    return this.prisma.finding.create({
      data: {
        assessmentId,
        reference,
        title: input.title,
        category: input.category,
        description: input.description,
        severity: input.severity,
        analystId: user.id,
        status: FindingStatus.DRAFT,
      },
    });
  }

  async updateFinding(id: string, input: Prisma.FindingUpdateInput, user: AuthUser) {
    requireRole(user, ADMIN_ROLES);
    const existing = await this.prisma.finding.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Finding not found.');
    await this.assessments.checkAccess(existing.assessmentId, user);
    return this.prisma.finding.update({ where: { id }, data: input });
  }

  async generateFindingsFromHighRisk(assessmentId: string, user: AuthUser) {
    requireRole(user, ADMIN_ROLES);
    return [];
  }
}

