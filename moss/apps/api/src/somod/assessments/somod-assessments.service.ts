import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProductCode,
  SomodAssessmentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { ANALYST_ROLES, INTERNAL_ROLES, SOMOD_APPROVER_ROLES, hasRole } from '../../common/roles';
import { generateSomodReference } from '../../common/somod-reference';
import {
  DEFAULT_SCENARIOS,
  ENGINE_FIELD_KEY,
  sanitizeEnginePayload,
  type EngineKey,
} from '../engines/somod-engines';

const EDITABLE_STATUSES = new Set<SomodAssessmentStatus>([
  SomodAssessmentStatus.DRAFT,
  SomodAssessmentStatus.IN_PROGRESS,
]);

export const SOMOD_ENGINES = [
  {
    key: 'RISK_REQUIREMENT' as const,
    name: 'Risk / Requirement',
    description: 'Threat, residual risk, and control coverage inputs.',
  },
  {
    key: 'DEPLOYMENT_CAPABILITY' as const,
    name: 'Deployment / Capability',
    description: 'Manpower deployment and operational coverage.',
  },
  {
    key: 'TECHNOLOGY' as const,
    name: 'Technology',
    description: 'Automation level and technology debt.',
  },
  {
    key: 'COST_EFFICIENCY' as const,
    name: 'Cost / Efficiency',
    description: 'Annual cost and leakage pressure.',
  },
  {
    key: 'OPTIMISATION_TRADEOFF' as const,
    name: 'Optimisation / Trade-off',
    description: 'Preferred balance across risk, cost, and capability.',
  },
];

@Injectable()
export class SomodAssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private engineSummaries(row: {
    riskRequirementJson: unknown;
    deploymentCapabilityJson: unknown;
    technologyJson: unknown;
    costEfficiencyJson: unknown;
    optimisationTradeoffJson: unknown;
  }) {
    const payloads: Record<string, unknown> = {
      RISK_REQUIREMENT: row.riskRequirementJson,
      DEPLOYMENT_CAPABILITY: row.deploymentCapabilityJson,
      TECHNOLOGY: row.technologyJson,
      COST_EFFICIENCY: row.costEfficiencyJson,
      OPTIMISATION_TRADEOFF: row.optimisationTradeoffJson,
    };
    return SOMOD_ENGINES.map((engine) => ({
      ...engine,
      status: payloads[engine.key] == null ? 'NOT_CONFIGURED' : 'CONFIGURED',
      configured: payloads[engine.key] != null,
      data: payloads[engine.key] ?? null,
    }));
  }

  private mapListRow(row: {
    id: string;
    reference: string;
    title: string;
    status: SomodAssessmentStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    organisation: { id: string; name: string };
    site: { id: string; name: string; siteCode: string } | null;
    mossAssessment: { id: string; reference: string; title: string } | null;
    financialLayerStatus?: string;
    financialStale?: boolean;
  }) {
    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      organisation: row.organisation,
      site: row.site,
      mossAssessment: row.mossAssessment,
      financialLayerStatus: row.financialLayerStatus || 'DRAFT',
      financialStale: Boolean(row.financialStale),
      editable: EDITABLE_STATUSES.has(row.status),
      product: 'SOMOD',
      productName: 'Security Operating Model Optimisation Diagnostic',
    };
  }

  private assertEditable(status: SomodAssessmentStatus, action = 'edit') {
    if (!EDITABLE_STATUSES.has(status)) {
      throw new BadRequestException(
        `Cannot ${action} while status is ${status}. Return the assessment to In Progress first.`,
      );
    }
  }

  private buildSummary(assessment: {
    title: string;
    status: SomodAssessmentStatus;
    notes: string | null;
    organisation: { name: string };
    site: { name: string; siteCode: string } | null;
    mossAssessment: { reference: string; title: string } | null;
    financialLayerStatus?: string;
    financialStale?: boolean;
    financialCalculatedAt?: Date | null;
  }) {
    const financialReady =
      assessment.financialLayerStatus === 'CALCULATED' ||
      assessment.financialLayerStatus === 'IN_REVIEW' ||
      assessment.financialLayerStatus === 'APPROVED' ||
      assessment.financialLayerStatus === 'LOCKED';
    return {
      title: assessment.title,
      status: assessment.status,
      organisationName: assessment.organisation.name,
      siteLabel: assessment.site
        ? `${assessment.site.name} (${assessment.site.siteCode})`
        : null,
      mossReference: assessment.mossAssessment?.reference || null,
      notes: assessment.notes,
      financialLayerStatus: assessment.financialLayerStatus || 'DRAFT',
      financialStale: Boolean(assessment.financialStale),
      financialCalculatedAt: assessment.financialCalculatedAt || null,
      readyToSubmit: Boolean(
        financialReady &&
          !assessment.financialStale &&
          EDITABLE_STATUSES.has(assessment.status),
      ),
    };
  }

  async requireSomodAssessment(id: string, user: AuthUser) {
    const assessment = await this.prisma.somodAssessment.findUnique({
      where: { id },
      include: {
        organisation: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, siteCode: true } },
        mossAssessment: { select: { id: true, reference: true, title: true, productCode: true } },
      },
    });
    if (!assessment) throw new NotFoundException('SOMOD assessment not found.');

    if (!INTERNAL_ROLES.has(user.role)) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organisationId: {
            userId: user.id,
            organisationId: assessment.organisationId,
          },
        },
      });
      if (!membership) throw new ForbiddenException('You cannot access this SOMOD assessment.');
    }

    return assessment;
  }

  async dashboard(user: AuthUser) {
    const assessments = await this.list(user);
    const draft = assessments.filter(
      (a) => a.status === SomodAssessmentStatus.DRAFT || a.status === SomodAssessmentStatus.IN_PROGRESS,
    ).length;
    const awaitingReview = assessments.filter(
      (a) =>
        a.status === SomodAssessmentStatus.SUBMITTED ||
        a.status === SomodAssessmentStatus.REVIEWED,
    ).length;
    const approved = assessments.filter(
      (a) => a.status === SomodAssessmentStatus.APPROVED,
    ).length;
    const withPreferred = 0;
    const completed = assessments.filter((a) =>
      ['SUBMITTED', 'REVIEWED', 'APPROVED', 'ARCHIVED'].includes(a.status),
    ).length;

    const awaiting = assessments
      .filter(
        (a) =>
          a.status === SomodAssessmentStatus.SUBMITTED ||
          a.status === SomodAssessmentStatus.REVIEWED,
      )
      .slice(0, 6);

    return {
      product: 'SOMOD',
      productName: 'Security Operating Model Optimisation Diagnostic',
      counts: {
        active: assessments.length,
        draft,
        completed,
        awaitingReview,
        approved,
        withPreferred,
      },
      recent: assessments.slice(0, 8),
      awaitingReview: awaiting,
      engines: SOMOD_ENGINES.map((e) => ({ ...e, status: 'READY' })),
      scenarios: DEFAULT_SCENARIOS.map((s) => ({
        scenarioType: s.scenarioType,
        label: s.label,
        summary: s.summary,
      })),
      pipeline: [
        { key: 'DRAFT', label: 'Working', count: draft },
        { key: 'REVIEW', label: 'In review', count: awaitingReview },
        { key: 'APPROVED', label: 'Approved', count: approved },
      ],
      note: 'Configure the five engines, complete the financial setup, calculate Current financials, then submit for review.',
    };
  }

  async list(user: AuthUser) {
    const where = INTERNAL_ROLES.has(user.role)
      ? {}
      : {
          organisation: {
            memberships: { some: { userId: user.id } },
          },
        };

    const rows = await this.prisma.somodAssessment.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        organisation: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, siteCode: true } },
        mossAssessment: { select: { id: true, reference: true, title: true } },
      },
    });

    return rows.map((row) => this.mapListRow(row));
  }

  async create(
    input: {
      organisationId: string;
      siteId?: string;
      title?: string;
      notes?: string;
      mossAssessmentId?: string;
    },
    user: AuthUser,
  ) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: input.organisationId },
    });
    if (!organisation) throw new BadRequestException('Organisation not found.');

    if (!INTERNAL_ROLES.has(user.role)) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organisationId: { userId: user.id, organisationId: input.organisationId },
        },
      });
      if (!membership) {
        throw new ForbiddenException('You cannot create a SOMOD assessment for this organisation.');
      }
    }

    if (input.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
      if (!site || site.organisationId !== input.organisationId) {
        throw new BadRequestException('Site not found for this organisation.');
      }
    }

    if (input.mossAssessmentId) {
      const moss = await this.prisma.assessmentSession.findUnique({
        where: { id: input.mossAssessmentId },
      });
      if (!moss || moss.productCode !== ProductCode.MOSS) {
        throw new BadRequestException('Linked assessment must be a MOSS assessment.');
      }
      if (moss.organisationId !== input.organisationId) {
        throw new BadRequestException('MOSS assessment belongs to a different organisation.');
      }
    }

    const title = input.title?.trim() || `${organisation.name} SOMOD Assessment`;

    const assessment = await this.prisma.$transaction(async (tx) => {
      const reference = await generateSomodReference(tx);
      const created = await tx.somodAssessment.create({
        data: {
          reference,
          organisationId: organisation.id,
          siteId: input.siteId || null,
          mossAssessmentId: input.mossAssessmentId || null,
          createdById: user.id,
          title,
          notes: input.notes?.trim() || null,
          status: SomodAssessmentStatus.DRAFT,
        },
        include: {
          organisation: { select: { id: true, name: true } },
          site: { select: { id: true, name: true, siteCode: true } },
          mossAssessment: { select: { id: true, reference: true, title: true } },
        },
      });
      return created;
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_CREATED',
      entityType: 'SomodAssessment',
      entityId: assessment.id,
      organisationId: organisation.id,
      metadata: { reference: assessment.reference },
    });

    return this.getWorkspace(assessment.id, user);
  }

  async getWorkspace(id: string, user: AuthUser) {
    const assessment = await this.requireSomodAssessment(id, user);
    return {
      ...this.mapListRow(assessment),
      engines: this.engineSummaries(assessment),
      scenarios: DEFAULT_SCENARIOS.map((s) => ({
        scenarioType: s.scenarioType,
        label: s.label,
        summary: s.summary,
        sortOrder: s.sortOrder,
      })),
      summary: this.buildSummary(assessment as any),
      financial: {
        layerStatus: (assessment as any).financialLayerStatus || 'DRAFT',
        stale: Boolean((assessment as any).financialStale),
        calculatedAt: (assessment as any).financialCalculatedAt || null,
        approvedAt: (assessment as any).financialApprovedAt || null,
        formulaVersion: 'SOMOD_FINANCIAL_V1',
      },
      note: 'Configure the five engines, complete the financial setup, calculate Current financials, then submit for review.',
    };
  }

  async update(
    id: string,
    input: {
      title?: string;
      notes?: string | null;
      status?: SomodAssessmentStatus;
      siteId?: string | null;
      mossAssessmentId?: string | null;
    },
    user: AuthUser,
  ) {
    const existing = await this.requireSomodAssessment(id, user);
    if (input.status !== undefined) {
      throw new BadRequestException(
        'Use submit / mark-reviewed / approve / return endpoints to change workflow status.',
      );
    }
    this.assertEditable(existing.status, 'update');

    if (input.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
      if (!site || site.organisationId !== existing.organisationId) {
        throw new BadRequestException('Site not found for this organisation.');
      }
    }

    if (input.mossAssessmentId) {
      const moss = await this.prisma.assessmentSession.findUnique({
        where: { id: input.mossAssessmentId },
      });
      if (!moss || moss.productCode !== ProductCode.MOSS) {
        throw new BadRequestException('Linked assessment must be a MOSS assessment.');
      }
      if (moss.organisationId !== existing.organisationId) {
        throw new BadRequestException('MOSS assessment belongs to a different organisation.');
      }
    }

    if (input.title !== undefined && input.title.trim().length < 2) {
      throw new BadRequestException('Title must be at least 2 characters.');
    }

    await this.prisma.somodAssessment.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
        ...(input.mossAssessmentId !== undefined
          ? { mossAssessmentId: input.mossAssessmentId || null }
          : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_UPDATED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: existing.organisationId,
      metadata: input,
    });

    return this.getWorkspace(id, user);
  }

  async updateEngine(
    assessmentId: string,
    engineKey: string,
    payload: Record<string, unknown>,
    user: AuthUser,
  ) {
    const existing = await this.requireSomodAssessment(assessmentId, user);
    this.assertEditable(existing.status, 'update engines');
    const finStatus = (existing as any).financialLayerStatus as string | undefined;
    if (finStatus === 'APPROVED' || finStatus === 'LOCKED' || finStatus === 'IN_REVIEW') {
      throw new BadRequestException(
        `Financial layer is ${finStatus} — reopen or return before changing engine inputs.`,
      );
    }
    if (!(engineKey in ENGINE_FIELD_KEY)) {
      throw new BadRequestException(`Unknown engine key: ${engineKey}`);
    }
    const key = engineKey as EngineKey;
    const field = ENGINE_FIELD_KEY[key];
    const cleaned = sanitizeEnginePayload(key, payload || {});

    await this.prisma.somodAssessment.update({
      where: { id: assessmentId },
      data: {
        [field]: cleaned,
        financialStale: true,
        status:
          existing.status === SomodAssessmentStatus.DRAFT
            ? SomodAssessmentStatus.IN_PROGRESS
            : existing.status,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ENGINE_UPDATED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: existing.organisationId,
      metadata: { engineKey: key },
    });

    return this.getWorkspace(assessmentId, user);
  }

  async submit(id: string, user: AuthUser) {
    const assessment = await this.requireSomodAssessment(id, user);
    if (!EDITABLE_STATUSES.has(assessment.status)) {
      throw new BadRequestException(`Cannot submit from status ${assessment.status}.`);
    }

    const finStatus = (assessment as any).financialLayerStatus as string;
    const stale = Boolean((assessment as any).financialStale);
    if (stale || !['CALCULATED', 'IN_REVIEW', 'APPROVED', 'LOCKED'].includes(finStatus)) {
      throw new BadRequestException(
        'Run calculate-financials successfully (and resolve stale inputs) before submitting.',
      );
    }

    const outputs = await this.prisma.somodScenarioFinancialOutput.findMany({
      where: { somodAssessmentId: id },
    });
    const hasCurrent = outputs.some((o) => o.scenarioType === 'CURRENT');
    const hasOptimal = outputs.some((o) => o.scenarioType === 'RECOMMENDED_OPTIMAL');
    if (!hasCurrent || !hasOptimal) {
      throw new BadRequestException(
        'Current and Recommended Optimal financial outputs are required before submitting.',
      );
    }

    await this.prisma.somodAssessment.update({
      where: { id },
      data: { status: SomodAssessmentStatus.SUBMITTED },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_SUBMITTED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: { financialLayerStatus: finStatus },
    });

    return this.getWorkspace(id, user);
  }

  async markReviewed(id: string, user: AuthUser, note?: string) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may mark SOMOD assessments reviewed.');
    }
    const assessment = await this.requireSomodAssessment(id, user);
    if (assessment.status === SomodAssessmentStatus.REVIEWED) {
      return this.getWorkspace(id, user);
    }
    if (assessment.status === SomodAssessmentStatus.APPROVED) {
      throw new BadRequestException('Assessment is already approved.');
    }
    if (assessment.status !== SomodAssessmentStatus.SUBMITTED) {
      throw new BadRequestException('Submit the assessment before marking it reviewed.');
    }

    const noteTrim = note?.trim();
    await this.prisma.somodAssessment.update({
      where: { id },
      data: {
        status: SomodAssessmentStatus.REVIEWED,
        ...(noteTrim
          ? {
              notes: assessment.notes
                ? `${assessment.notes}\n\n[Review] ${noteTrim}`
                : `[Review] ${noteTrim}`,
            }
          : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_REVIEWED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: { note: noteTrim || null },
    });

    return this.getWorkspace(id, user);
  }

  async approve(id: string, user: AuthUser) {
    if (!hasRole(user, SOMOD_APPROVER_ROLES)) {
      throw new ForbiddenException(
        'Only reviewers or administrators may approve SOMOD assessments. Analysts/consultants cannot approve.',
      );
    }
    const assessment = await this.requireSomodAssessment(id, user);
    if (assessment.status === SomodAssessmentStatus.APPROVED) {
      return this.getWorkspace(id, user);
    }
    if (assessment.status !== SomodAssessmentStatus.REVIEWED) {
      throw new BadRequestException('Mark the assessment as reviewed before approval.');
    }

    await this.prisma.somodAssessment.update({
      where: { id },
      data: { status: SomodAssessmentStatus.APPROVED },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_APPROVED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: {},
    });

    return this.getWorkspace(id, user);
  }

  async archive(id: string, user: AuthUser) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may archive SOMOD assessments.');
    }
    const assessment = await this.requireSomodAssessment(id, user);
    if (assessment.status === SomodAssessmentStatus.ARCHIVED) {
      return this.getWorkspace(id, user);
    }
    if (
      assessment.status !== SomodAssessmentStatus.APPROVED &&
      assessment.status !== SomodAssessmentStatus.REVIEWED
    ) {
      throw new BadRequestException('Archive is available after review or approval.');
    }

    await this.prisma.somodAssessment.update({
      where: { id },
      data: { status: SomodAssessmentStatus.ARCHIVED },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_ARCHIVED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: { previousStatus: assessment.status },
    });

    return this.getWorkspace(id, user);
  }

  async unarchive(id: string, user: AuthUser) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may unarchive SOMOD assessments.');
    }
    const assessment = await this.requireSomodAssessment(id, user);
    if (assessment.status !== SomodAssessmentStatus.ARCHIVED) {
      throw new BadRequestException('Only archived assessments can be unarchived.');
    }

    await this.prisma.somodAssessment.update({
      where: { id },
      data: { status: SomodAssessmentStatus.IN_PROGRESS },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_UNARCHIVED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: {},
    });

    return this.getWorkspace(id, user);
  }

  async returnToInProgress(id: string, comment: string, user: AuthUser) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may return SOMOD assessments.');
    }
    if (!comment?.trim()) {
      throw new BadRequestException('A comment is required when returning the assessment.');
    }
    const assessment = await this.requireSomodAssessment(id, user);
    if (
      assessment.status !== SomodAssessmentStatus.SUBMITTED &&
      assessment.status !== SomodAssessmentStatus.REVIEWED
    ) {
      throw new BadRequestException(`Cannot return assessment from status ${assessment.status}.`);
    }

    const commentTrim = comment.trim();
    await this.prisma.somodAssessment.update({
      where: { id },
      data: {
        status: SomodAssessmentStatus.IN_PROGRESS,
        notes: assessment.notes
          ? `${assessment.notes}\n\n[Returned] ${commentTrim}`
          : `[Returned] ${commentTrim}`,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_RETURNED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: { comment: commentTrim },
    });

    return this.getWorkspace(id, user);
  }

  async remove(id: string, user: AuthUser) {
    const existing = await this.requireSomodAssessment(id, user);
    await this.prisma.somodAssessment.delete({ where: { id } });
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_ASSESSMENT_DELETED',
      entityType: 'SomodAssessment',
      entityId: id,
      organisationId: existing.organisationId,
      metadata: { reference: existing.reference },
    });
    return { ok: true };
  }
}
