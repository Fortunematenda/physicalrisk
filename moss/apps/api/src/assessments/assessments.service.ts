import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import { AssessmentStatus, FindingSeverity, Prisma } from '@prisma/client';
import {
  calculateAssessmentScore,
  calculateEvidenceConfidence,
  calculateLeakage,
  calculateOpportunityScore,
  type ScliAssumptions,
  type ScliCalibrationInput,
} from '@moss/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { workflowTimeline } from '../common/workflow';
import { INTERNAL_ROLES as INTERNAL_ROLE_SET } from '../common/roles';
import { EspoCrmService } from '../crm/espocrm.service';

const INTERNAL_ROLES = INTERNAL_ROLE_SET;
const asNumber = (value: unknown): number => Number(value ?? 0) || 0;
const asBoolean = (value: unknown): boolean => value === true || String(value).toUpperCase() === 'YES' || String(value).toLowerCase() === 'true';

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() @Inject(forwardRef(() => EspoCrmService)) private readonly crm?: EspoCrmService,
  ) {}

  async checkAccess(assessmentId: string, user: AuthUser) {
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id: assessmentId }, select: { organisationId: true } });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (INTERNAL_ROLES.has(user.role)) return;
    const membership = await this.prisma.membership.findUnique({ where: { userId_organisationId: { userId: user.id, organisationId: assessment.organisationId } } });
    if (!membership) throw new ForbiddenException('You do not have access to this assessment.');
  }

  async list(user: AuthUser) {
    const where = INTERNAL_ROLES.has(user.role) ? {} : { organisation: { memberships: { some: { userId: user.id } } } };
    const items = await this.prisma.assessmentSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        organisation: { select: { id: true, name: true, industry: true } },
        questionnaireVersion: { include: { questionnaire: true } },
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignments: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] } },
          orderBy: { assignedAt: 'desc' },
          take: 3,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, reportType: true, status: true, version: true, createdAt: true },
        },
        _count: { select: { evidence: true, recommendations: true, reports: true, responses: true, inputValues: true } },
      },
    });

    const leads = await this.prisma.publicLead.findMany({
      where: { assessmentId: { in: items.map((item) => item.id) } },
    });
    const leadByAssessment = new Map(leads.filter((l) => l.assessmentId).map((l) => [l.assessmentId as string, l]));

    const versionIds = [...new Set(items.map((item) => item.questionnaireVersionId))];
    const versionTotals = await this.prisma.questionnaireVersion.findMany({
      where: { id: { in: versionIds } },
      select: {
        id: true,
        _count: { select: { inputDefinitions: true, questions: true } },
      },
    });
    const totalsByVersion = new Map(versionTotals.map((v) => [v.id, v._count]));

    return items.map((item) => {
      const lead = leadByAssessment.get(item.id);
      const totals = totalsByVersion.get(item.questionnaireVersionId) || { inputDefinitions: 0, questions: 0 };
      const inputsAnswered = item._count.inputValues;
      const questionsAnswered = item._count.responses;
      const inputsTotal = totals.inputDefinitions;
      const questionsTotal = totals.questions;
      const computedPercent = inputsTotal + questionsTotal
        ? Math.round(((inputsAnswered + questionsAnswered) / (inputsTotal + questionsTotal)) * 100)
        : 0;
      const isComplete = lead?.status === 'COMPLETED' || ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'APPROVED'].includes(item.status);
      const progressPercent = isComplete ? 100 : (lead?.progressPercent ?? computedPercent);
      const progressLabel = isComplete
        ? 'Submitted'
        : lead?.progressLabel
          || (questionsAnswered
            ? `Questions answered ${questionsAnswered}/${questionsTotal}`
            : inputsAnswered
              ? `Calibration ${inputsAnswered}/${inputsTotal}`
              : 'Details captured');

      return {
        ...item,
        source: lead ? 'PUBLIC' : 'INTERNAL',
        publicLead: lead
          ? {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              email: lead.email,
              phone: lead.phone,
              status: lead.status,
              source: lead.source,
              completedAt: lead.completedAt,
              progressPhase: lead.progressPhase,
              progressLabel: lead.progressLabel,
              progressPercent: lead.progressPercent,
              progressCalStep: lead.progressCalStep,
              progressQuestionIndex: lead.progressQuestionIndex,
              lastProgressAt: lead.lastProgressAt,
            }
          : null,
        progress: {
          percent: progressPercent,
          label: progressLabel,
          phase: isComplete ? 'completed' : (lead?.progressPhase || (questionsAnswered ? 'questions' : 'calibration')),
          inputsAnswered,
          inputsTotal,
          questionsAnswered,
          questionsTotal,
          lastProgressAt: lead?.lastProgressAt || item.updatedAt,
        },
      };
    });
  }

  async create(input: { organisationId: string; questionnaireCode?: string; title?: string }, user: AuthUser) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { code: input.questionnaireCode || 'SCLI' },
      include: { versions: { where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } },
    });
    if (!questionnaire?.versions[0]) throw new BadRequestException('No published questionnaire version is available.');
    const organisation = await this.prisma.organisation.findUnique({ where: { id: input.organisationId } });
    if (!organisation) throw new BadRequestException('Organisation not found.');
    if (!INTERNAL_ROLES.has(user.role)) {
      const membership = await this.prisma.membership.findUnique({ where: { userId_organisationId: { userId: user.id, organisationId: input.organisationId } } });
      if (!membership) throw new ForbiddenException('You cannot create an assessment for this organisation.');
    }
    const reference = `MOSS-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const assessment = await this.prisma.assessmentSession.create({
      data: {
        reference,
        organisationId: organisation.id,
        questionnaireVersionId: questionnaire.versions[0].id,
        createdById: user.id,
        title: input.title || `${organisation.name} ${questionnaire.code} Assessment`,
        status: AssessmentStatus.IN_PROGRESS,
      },
    });
    await this.audit.record({ userId: user.id, action: 'CREATE', entityType: 'AssessmentSession', entityId: assessment.id, metadata: { reference } });
    return assessment;
  }

  async get(id: string, user: AuthUser) {
    await this.checkAccess(id, user);
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: {
        organisation: true,
        questionnaireVersion: {
          include: {
            questionnaire: true,
            inputDefinitions: { orderBy: { sortOrder: 'asc' } },
            questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } },
          },
        },
        inputValues: { include: { inputDefinition: true } },
        responses: { include: { responseOption: true, question: true } },
        evidence: { orderBy: { uploadedAt: 'desc' } },
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        recommendations: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
        findings: { orderBy: { createdAt: 'desc' } },
        reports: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    const approvedOverride = await this.prisma.scoreOverride.findFirst({
      where: { assessmentId: id, status: 'APPROVED' },
      orderBy: { decidedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    return {
      ...assessment,
      timeline: workflowTimeline(assessment.status),
      approvedOverride,
    };
  }

  async saveInput(id: string, code: string, value: unknown, user: AuthUser) {
    await this.checkAccess(id, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id }, select: { questionnaireVersionId: true, lockedAt: true } });
    if (!assessment || assessment.lockedAt) throw new BadRequestException('Assessment is locked or unavailable.');
    const definition = await this.prisma.assessmentInputDefinition.findUnique({ where: { questionnaireVersionId_code: { questionnaireVersionId: assessment.questionnaireVersionId, code } } });
    if (!definition) throw new BadRequestException('Input definition not found.');
    const record = await this.prisma.assessmentInputValue.upsert({
      where: { assessmentId_inputDefinitionId: { assessmentId: id, inputDefinitionId: definition.id } },
      update: { value: value as Prisma.InputJsonValue },
      create: { assessmentId: id, inputDefinitionId: definition.id, value: value as Prisma.InputJsonValue },
    });
    await this.audit.record({ userId: user.id, action: 'SAVE_INPUT', entityType: 'AssessmentSession', entityId: id, metadata: { code } });
    return record;
  }

  async saveResponse(id: string, questionCode: string, responseOptionId: string, comment: string | undefined, user: AuthUser) {
    await this.checkAccess(id, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id }, select: { questionnaireVersionId: true, lockedAt: true } });
    if (!assessment || assessment.lockedAt) throw new BadRequestException('Assessment is locked or unavailable.');
    const question = await this.prisma.question.findUnique({
      where: { questionnaireVersionId_code: { questionnaireVersionId: assessment.questionnaireVersionId, code: questionCode } },
      include: { options: true },
    });
    if (!question || !question.options.some(option => option.id === responseOptionId)) throw new BadRequestException('Invalid question response.');
    const record = await this.prisma.assessmentResponse.upsert({
      where: { assessmentId_questionId: { assessmentId: id, questionId: question.id } },
      update: { responseOptionId, comment },
      create: { assessmentId: id, questionId: question.id, responseOptionId, comment },
    });
    await this.audit.record({ userId: user.id, action: 'SAVE_RESPONSE', entityType: 'AssessmentSession', entityId: id, metadata: { questionCode } });
    return record;
  }

  private mapAssumptions(records: Array<{ code: string; value: Prisma.Decimal }>): ScliAssumptions {
    const m = Object.fromEntries(records.map(record => [record.code, Number(record.value)]));
    return {
      minimumLeakageBaseFloor: m.minimum_leakage_base_floor,
      minimumManualRecordWeight: m.minimum_leakage_manual_record_weight,
      minimumDelayedReportingWeight: m.minimum_leakage_delayed_patrol_reporting_weight,
      minimumSupervisoryProofGapWeight: m.minimum_leakage_supervisory_proof_gap_weight,
      minimumAttendanceProofGapWeight: m.minimum_leakage_attendance_proof_gap_weight,
      minimumInternalCapacityGapWeight: m.minimum_leakage_internal_capacity_gap_weight,
      minimumScaleComplexityWeight: m.minimum_leakage_scale_complexity_weight,
      minimumAllowanceComplexityWeight: m.minimum_leakage_allowance_complexity_weight,
      likelySurveillanceGapWeight: m.likely_reality_surveillance_gap_weight,
      likelyAccessControlGapWeight: m.likely_reality_access_control_gap_weight,
      likelyElectronicRecordGapWeight: m.likely_reality_electronic_record_monitoring_gap_weight,
      likelyRealtimePatrolGapWeight: m.likely_reality_real_time_patrol_gap_weight,
      likelyManualRecordWeight: m.likely_reality_manual_record_weight,
      likelyScaleComplexityWeight: m.likely_reality_scale_complexity_weight,
      likelyAllowanceComplexityWeight: m.likely_reality_allowance_complexity_weight,
      maximumManualRecordWeight: m.maximum_exposure_manual_record_weight,
      maximumDelayedReportingWeight: m.maximum_exposure_delayed_patrol_reporting_weight,
      maximumSupervisoryProofGapWeight: m.maximum_exposure_supervisory_proof_gap_weight,
      maximumAttendanceProofGapWeight: m.maximum_exposure_attendance_proof_gap_weight,
      maximumSurveillanceGapWeight: m.maximum_exposure_surveillance_gap_weight,
      maximumElectronicRecordGapWeight: m.maximum_exposure_electronic_record_monitoring_gap_weight,
      maximumInternalCapacityGapWeight: m.maximum_exposure_internal_capacity_gap_weight,
      maximumAllowanceComplexityWeight: m.maximum_exposure_allowance_complexity_weight,
      guardForceSaturationPoint: m.guard_force_saturation_point,
      annualCostSaturationPoint: m.annual_cost_saturation_point,
      protectedPremisesSaturationPoint: m.protected_premises_saturation_point,
      geographicalFootprintSaturationPoint: m.geographical_footprint_saturation_point,
      targetSitesPerInternalStaff: m.target_sites_per_internal_security_staff_member,
      minimumLeakageCap: m.minimum_leakage_cap,
      likelyLeakageCap: m.likely_leakage_cap,
      maximumExposureCap: m.maximum_exposure_cap,
      recoverableLowFactor: m.recoverable_low_factor,
      recoverableHighFactor: m.recoverable_high_factor,
    };
  }

  async evaluate(id: string, user: AuthUser) {
    await this.checkAccess(id, user);
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: {
        questionnaireVersion: { include: { questions: { include: { options: true } }, inputDefinitions: true, assumptions: true, recommendationRules: { include: { triggerQuestion: true } } } },
        responses: { include: { responseOption: true, question: true } },
        inputValues: { include: { inputDefinition: true } },
        evidence: true,
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');

    const missingInputs = assessment.questionnaireVersion.inputDefinitions.filter(def => def.required && !assessment.inputValues.some(value => value.inputDefinitionId === def.id));
    const missingQuestions = assessment.questionnaireVersion.questions.filter(question => question.required && !assessment.responses.some(response => response.questionId === question.id && response.responseOptionId));
    if (missingInputs.length || missingQuestions.length) {
      throw new BadRequestException({
        message: 'Complete all required fields before evaluation.',
        missingInputs: missingInputs.map(item => item.code),
        missingQuestions: missingQuestions.map(item => item.code),
      });
    }

    const scoredItems = assessment.responses.map(response => ({
      code: response.question.code,
      category: response.question.category,
      weight: Number(response.question.weight),
      riskScore: response.analystOverrideRisk ? Number(response.analystOverrideRisk) : Number(response.responseOption?.riskScore || 0),
      responseLabel: response.responseOption?.label,
    }));
    const score = calculateAssessmentScore(scoredItems);
    const values = Object.fromEntries(assessment.inputValues.map(item => [item.inputDefinition.code, item.value]));
    const calibration: ScliCalibrationInput = {
      protectedPremises: asNumber(values.C3),
      guardForce: asNumber(values.C4),
      annualSecurityContractValue: asNumber(values.C5),
      internalSecurityTeamSize: asNumber(values.C8),
      integratedTechnologyCoverage: asNumber(values.C10),
      technologySlaVerification: asNumber(values.C11),
      manualRecordReliance: asNumber(values.C12),
      surveillanceCoverage: asNumber(values.C13),
      accessControlCoverage: asNumber(values.C14),
      realtimePatrolCoverage: asNumber(values.C15),
      delayedPatrolReporting: asNumber(values.C16),
      supervisoryProof: asNumber(values.C17),
      attendanceProof: asNumber(values.C18),
      allowanceFlags: [values.C19, values.C20, values.C21, values.C22, values.C23].map(asBoolean),
    };
    const leakage = calculateLeakage(calibration, this.mapAssumptions(assessment.questionnaireVersion.assumptions), score.overallRiskScore);
    const unknownAnswers = assessment.responses.filter(response => response.responseOption?.label.toLowerCase().includes('unknown')).length;
    const verifiedEvidence = assessment.evidence.filter(item => item.status === 'VERIFIED' || item.status === 'ACCEPTED').length;
    const evidenceConfidence = calculateEvidenceConfidence({
      answeredQuestions: assessment.responses.length,
      totalQuestions: assessment.questionnaireVersion.questions.length,
      unknownAnswers,
      evidenceSubmitted: assessment.evidence.length,
      evidenceExpected: assessment.questionnaireVersion.questions.length,
      evidenceVerified: verifiedEvidence,
      consistencyScore: 0.7,
    });
    const executiveAssuranceScore = score.categoryScores.find(item => item.category === 'Executive Assurance')?.score || 0;
    const opportunityScore = calculateOpportunityScore({
      overallRiskScore: score.overallRiskScore,
      annualContractValue: calibration.annualSecurityContractValue,
      likelyLeakageValue: leakage.likelyLeakageValue,
      recoverableHigh: leakage.recoverableHigh,
      executiveAssuranceScore,
      executiveUrgency: assessment.executiveUrgency,
      engagementReadiness: assessment.engagementReadiness,
      evidenceConfidence,
    });

    const snapshot = await this.prisma.$transaction(async tx => {
      const created = await tx.scoreSnapshot.create({
        data: {
          assessmentId: id,
          modelVersion: `SCLI ${assessment.questionnaireVersion.version}`,
          overallRiskScore: score.overallRiskScore,
          maturityScore: score.maturityScore,
          riskBand: score.riskBand,
          methodologyConfidence: leakage.methodologyConfidence,
          evidenceConfidence,
          opportunityScore,
          categoryScores: score.categoryScores as any,
          leakageResult: leakage as any,
          calculationTrace: { scoredItems, calibration } as any,
        },
      });
      await tx.recommendation.deleteMany({ where: { assessmentId: id, status: 'GENERATED' } });
      for (const rule of assessment.questionnaireVersion.recommendationRules) {
        const response = assessment.responses.find(item => item.questionId === rule.triggerQuestionId);
        const risk = response?.analystOverrideRisk ? Number(response.analystOverrideRisk) : Number(response?.responseOption?.riskScore || 0);
        if (risk >= Number(rule.triggerMinRisk || 101)) {
          await tx.recommendation.create({
            data: {
              assessmentId: id,
              recommendationRuleId: rule.id,
              title: rule.title,
              category: rule.category,
              priority: rule.priority,
              summary: rule.summary,
              originalSummary: rule.summary,
              serviceOffering: rule.serviceOffering,
            },
          });
        }
      }
      await tx.assessmentSession.update({ where: { id }, data: { status: AssessmentStatus.SUBMITTED, submittedAt: assessment.submittedAt || new Date() } });
      return created;
    });
    await this.audit.record({ userId: user.id, action: 'EVALUATE', entityType: 'AssessmentSession', entityId: id, metadata: { score: score.overallRiskScore, riskBand: score.riskBand } });
    return this.get(id, user);
  }

  async submit(id: string, user: AuthUser) {
    await this.checkAccess(id, user);
    await this.evaluate(id, user);
    await this.prisma.assessmentSession.update({ where: { id }, data: { status: AssessmentStatus.SUBMITTED, submittedAt: new Date() } });
    try {
      await this.crm?.queueOpportunitySync(id);
    } catch {
      // CRM downtime must not block submission
    }
    return this.get(id, user);
  }

  async approve(id: string, user: AuthUser) {
    if (!['SUPER_ADMIN', 'REVIEWER', 'ANALYST'].includes(user.role)) throw new ForbiddenException('Approver permission required.');
    await this.checkAccess(id, user);
    const assessment = await this.prisma.assessmentSession.update({
      where: { id },
      data: { status: AssessmentStatus.APPROVED, approvedAt: new Date(), approvedById: user.id, lockedAt: new Date() },
    });
    await this.audit.record({ userId: user.id, action: 'APPROVE', entityType: 'AssessmentSession', entityId: id });
    return assessment;
  }

  async update(id: string, data: { title?: string }, user: AuthUser) {
    if (!['SUPER_ADMIN', 'METHODOLOGY_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Admin permission required.');
    }
    await this.checkAccess(id, user);
    const title = data.title?.trim();
    if (!title || title.length < 2) throw new BadRequestException('Assessment title is required.');
    const assessment = await this.prisma.assessmentSession.update({
      where: { id },
      data: { title },
    });
    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'AssessmentSession',
      entityId: id,
      metadata: { title },
    });
    return assessment;
  }

  async remove(id: string, user: AuthUser) {
    if (!['SUPER_ADMIN', 'METHODOLOGY_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Admin permission required.');
    }
    await this.checkAccess(id, user);
    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { id: true, reference: true },
    });
    if (!existing) throw new NotFoundException('Assessment not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.updateMany({
        where: { parentAssessmentId: id },
        data: { parentAssessmentId: null },
      });
      await tx.publicLead.updateMany({
        where: { assessmentId: id },
        data: { assessmentId: null },
      });
      await tx.assessmentSession.delete({ where: { id } });
    });

    await this.audit.record({
      userId: user.id,
      action: 'DELETE',
      entityType: 'AssessmentSession',
      entityId: id,
      metadata: { reference: existing.reference },
    });

    return {
      id,
      deleted: true,
      message: 'Assessment deleted.',
    };
  }
}
