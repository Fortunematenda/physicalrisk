import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SomodAssessmentStatus,
  SomodFinancialLayerStatus,
  SomodScenarioType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { ANALYST_ROLES, METHODOLOGY_ROLES, SOMOD_APPROVER_ROLES, hasRole } from '../../common/roles';
import { SomodAssessmentsService } from '../assessments/somod-assessments.service';
import { SomodMethodologyService } from '../methodology/somod-methodology.service';
import {
  DEFAULT_CONTROL_MAPPINGS,
  DEFAULT_GOVERNED_PENALTIES,
  SOMOD_FINANCIAL_FORMULA_VERSION,
  calculateScenarioFinancials,
  deriveFinancialVariables,
  moneyNumber,
  validateControlMapping,
  validateFinancialSetup,
  type CostVariables,
} from './somod-financial-formulas';

const EDITABLE = new Set<SomodAssessmentStatus>([
  SomodAssessmentStatus.DRAFT,
  SomodAssessmentStatus.IN_PROGRESS,
]);

@Injectable()
export class SomodFinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assessments: SomodAssessmentsService,
    private readonly methodology: SomodMethodologyService,
  ) {}

  private async loadAssessment(id: string, user: AuthUser) {
    return this.assessments.requireSomodAssessment(id, user);
  }

  private assertFinancialEditable(assessment: {
    status: SomodAssessmentStatus;
    financialLayerStatus: SomodFinancialLayerStatus;
  }) {
    if (!EDITABLE.has(assessment.status)) {
      throw new BadRequestException(
        `Assessment is ${assessment.status} — financial inputs are locked.`,
      );
    }
    if (
      assessment.financialLayerStatus === SomodFinancialLayerStatus.APPROVED ||
      assessment.financialLayerStatus === SomodFinancialLayerStatus.LOCKED ||
      assessment.financialLayerStatus === SomodFinancialLayerStatus.IN_REVIEW
    ) {
      throw new BadRequestException(
        `Financial layer is ${assessment.financialLayerStatus} — reopen or return before editing.`,
      );
    }
  }

  private toCostVariables(row: {
    currency: string;
    monthlyGuardCost: Prisma.Decimal | number;
    monthlySupervisorCost: Prisma.Decimal | number;
    daysPerMonth: number;
    shiftHours: Prisma.Decimal | number;
    responseDelayCostRate: Prisma.Decimal | number;
    defaultIncidentSeverityMultiplier: Prisma.Decimal | number;
    monthlyContractValue: Prisma.Decimal | number;
    patrolValuePerMiss: Prisma.Decimal | number;
    technologyCapexTotal: Prisma.Decimal | number;
    technologyMonthlyOpex: Prisma.Decimal | number;
    technologyLifespanMonths: number | null;
  }): CostVariables {
    return {
      currency: row.currency,
      monthlyGuardCost: moneyNumber(row.monthlyGuardCost),
      monthlySupervisorCost: moneyNumber(row.monthlySupervisorCost),
      daysPerMonth: row.daysPerMonth,
      shiftHours: moneyNumber(row.shiftHours),
      responseDelayCostRate: moneyNumber(row.responseDelayCostRate),
      defaultIncidentSeverityMultiplier: moneyNumber(row.defaultIncidentSeverityMultiplier),
      monthlyContractValue: moneyNumber(row.monthlyContractValue),
      patrolValuePerMiss: moneyNumber(row.patrolValuePerMiss),
      technologyCapexTotal: moneyNumber(row.technologyCapexTotal),
      technologyMonthlyOpex: moneyNumber(row.technologyMonthlyOpex),
      technologyLifespanMonths: row.technologyLifespanMonths,
    };
  }

  private mapFinancialModel(row: {
    id: string;
    currency: string;
    monthlyGuardCost: Prisma.Decimal;
    monthlySupervisorCost: Prisma.Decimal;
    daysPerMonth: number;
    shiftHours: Prisma.Decimal;
    responseDelayCostRate: Prisma.Decimal;
    defaultIncidentSeverityMultiplier: Prisma.Decimal;
    monthlyContractValue: Prisma.Decimal;
    patrolValuePerMiss: Prisma.Decimal;
    technologyCapexTotal: Prisma.Decimal;
    technologyMonthlyOpex: Prisma.Decimal;
    technologyLifespanMonths: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const cost = this.toCostVariables(row);
    const derived = deriveFinancialVariables(cost);
    return {
      id: row.id,
      currency: cost.currency,
      costVariables: {
        monthly_guard_cost: cost.monthlyGuardCost,
        monthly_supervisor_cost: cost.monthlySupervisorCost,
        days_per_month: cost.daysPerMonth,
        shift_hours: cost.shiftHours,
        response_delay_cost_rate: cost.responseDelayCostRate,
        default_incident_severity_multiplier: cost.defaultIncidentSeverityMultiplier,
        monthly_contract_value: cost.monthlyContractValue,
        patrol_value_per_miss: cost.patrolValuePerMiss,
        technology_capex_total: cost.technologyCapexTotal,
        technology_monthly_opex: cost.technologyMonthlyOpex,
        technology_lifespan_months: cost.technologyLifespanMonths,
      },
      derivedVariables: {
        daily_guard_cost: derived.dailyGuardCost,
        hourly_guard_cost: derived.hourlyGuardCost,
        monthly_technology_equivalent_cost: derived.monthlyTechnologyEquivalentCost,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      formulaVersion: SOMOD_FINANCIAL_FORMULA_VERSION,
    };
  }

  private async markStale(assessmentId: string) {
    const current = await this.prisma.somodAssessment.findUnique({
      where: { id: assessmentId },
      select: { financialLayerStatus: true },
    });
    if (!current) return;
    if (
      current.financialLayerStatus === SomodFinancialLayerStatus.APPROVED ||
      current.financialLayerStatus === SomodFinancialLayerStatus.LOCKED
    ) {
      return;
    }
    await this.prisma.somodAssessment.update({
      where: { id: assessmentId },
      data: { financialStale: true },
    });
  }

  async getFinancialModel(assessmentId: string, user: AuthUser) {
    await this.loadAssessment(assessmentId, user);
    const row = await this.prisma.somodFinancialModel.findUnique({
      where: { somodAssessmentId: assessmentId },
    });
    if (!row) {
      return {
        exists: false,
        financialModel: null,
        note: 'Create financial setup before calculating.',
      };
    }
    return { exists: true, financialModel: this.mapFinancialModel(row) };
  }

  async upsertFinancialModel(
    assessmentId: string,
    body: Record<string, unknown>,
    user: AuthUser,
  ) {
    const assessment = await this.loadAssessment(assessmentId, user);
    this.assertFinancialEditable(assessment as any);

    const cost: CostVariables = {
      currency: String(body.currency || 'ZAR').trim().toUpperCase() || 'ZAR',
      monthlyGuardCost: moneyNumber(body.monthly_guard_cost ?? body.monthlyGuardCost),
      monthlySupervisorCost: moneyNumber(
        body.monthly_supervisor_cost ?? body.monthlySupervisorCost,
      ),
      daysPerMonth: Math.round(moneyNumber(body.days_per_month ?? body.daysPerMonth)),
      shiftHours: moneyNumber(body.shift_hours ?? body.shiftHours),
      responseDelayCostRate: moneyNumber(
        body.response_delay_cost_rate ?? body.responseDelayCostRate,
      ),
      defaultIncidentSeverityMultiplier: moneyNumber(
        body.default_incident_severity_multiplier ??
          body.defaultIncidentSeverityMultiplier,
      ),
      monthlyContractValue: moneyNumber(
        body.monthly_contract_value ?? body.monthlyContractValue,
      ),
      patrolValuePerMiss: moneyNumber(
        body.patrol_value_per_miss ?? body.patrolValuePerMiss ?? 0,
      ),
      technologyCapexTotal: moneyNumber(
        body.technology_capex_total ?? body.technologyCapexTotal ?? 0,
      ),
      technologyMonthlyOpex: moneyNumber(
        body.technology_monthly_opex ?? body.technologyMonthlyOpex ?? 0,
      ),
      technologyLifespanMonths: (() => {
        const raw = body.technology_lifespan_months ?? body.technologyLifespanMonths;
        if (raw == null || raw === '') return null;
        return Math.round(moneyNumber(raw));
      })(),
    };

    const errors = validateFinancialSetup(cost);
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const data = {
      currency: cost.currency,
      monthlyGuardCost: cost.monthlyGuardCost,
      monthlySupervisorCost: cost.monthlySupervisorCost,
      daysPerMonth: cost.daysPerMonth,
      shiftHours: cost.shiftHours,
      responseDelayCostRate: cost.responseDelayCostRate,
      defaultIncidentSeverityMultiplier: cost.defaultIncidentSeverityMultiplier,
      monthlyContractValue: cost.monthlyContractValue,
      patrolValuePerMiss: cost.patrolValuePerMiss,
      technologyCapexTotal: cost.technologyCapexTotal,
      technologyMonthlyOpex: cost.technologyMonthlyOpex,
      technologyLifespanMonths: cost.technologyLifespanMonths,
    };

    const existing = await this.prisma.somodFinancialModel.findUnique({
      where: { somodAssessmentId: assessmentId },
    });

    const row = existing
      ? await this.prisma.somodFinancialModel.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.somodFinancialModel.create({
          data: { somodAssessmentId: assessmentId, ...data },
        });

    if (!existing) {
      await this.seedGovernedDefaults(assessmentId);
    }

    await this.markStale(assessmentId);
    await this.audit.record({
      userId: user.id,
      action: existing ? 'SOMOD_FINANCIAL_MODEL_UPDATED' : 'SOMOD_FINANCIAL_MODEL_CREATED',
      entityType: 'SomodFinancialModel',
      entityId: row.id,
      organisationId: assessment.organisationId,
      newValue: this.mapFinancialModel(row),
    });

    return this.getFinancialModel(assessmentId, user);
  }

  private async seedGovernedDefaults(assessmentId: string) {
    for (const pen of DEFAULT_GOVERNED_PENALTIES) {
      await this.prisma.somodPenaltyLibrary.upsert({
        where: {
          somodAssessmentId_penaltyKey: {
            somodAssessmentId: assessmentId,
            penaltyKey: pen.penaltyKey,
          },
        },
        create: {
          somodAssessmentId: assessmentId,
          penaltyKey: pen.penaltyKey,
          penaltyName: pen.penaltyName,
          metricName: pen.metricName,
          thresholdType: pen.thresholdType,
          thresholdValue: pen.thresholdValue,
          unit: pen.unit,
          formulaExpression: pen.formulaExpression,
          appliesToControlId: pen.appliesToControlId,
          isActive: true,
          isGoverned: true,
        },
        update: {},
      });
    }

    const penalties = await this.prisma.somodPenaltyLibrary.findMany({
      where: { somodAssessmentId: assessmentId },
    });
    const byKey = new Map(penalties.map((p) => [p.penaltyKey, p]));

    for (const mapping of DEFAULT_CONTROL_MAPPINGS) {
      const penalty = byKey.get(mapping.penaltyKey);
      await this.prisma.somodControlFinancialMapping.upsert({
        where: {
          somodAssessmentId_controlId: {
            somodAssessmentId: assessmentId,
            controlId: mapping.controlId,
          },
        },
        create: {
          somodAssessmentId: assessmentId,
          controlId: mapping.controlId,
          financialRelevance: mapping.financialRelevance,
          costCategory: mapping.costCategory,
          eventUnit: mapping.eventUnit,
          exposureFormula: mapping.exposureFormula,
          recoverableFormula: mapping.recoverableFormula,
          cfoOutputCategory: mapping.cfoOutputCategory,
          penaltyId: penalty?.id,
        },
        update: {},
      });
    }
  }

  async listPenalties(assessmentId: string, user: AuthUser) {
    await this.loadAssessment(assessmentId, user);
    const rows = await this.prisma.somodPenaltyLibrary.findMany({
      where: { somodAssessmentId: assessmentId, isActive: true },
      orderBy: { penaltyName: 'asc' },
    });
    return {
      penalties: rows.map((p) => ({
        id: p.id,
        penaltyKey: p.penaltyKey,
        penaltyName: p.penaltyName,
        metricName: p.metricName,
        thresholdType: p.thresholdType,
        thresholdValue: moneyNumber(p.thresholdValue),
        unit: p.unit,
        // Formula shown read-only; not editable for consultants
        formulaExpression: p.formulaExpression,
        appliesToControlId: p.appliesToControlId,
        isActive: p.isActive,
        isGoverned: p.isGoverned,
        editable: !p.isGoverned,
      })),
      note: 'Penalty formulas are governed and view-only for consultants.',
    };
  }

  async createPenalty(
    assessmentId: string,
    body: Record<string, unknown>,
    user: AuthUser,
  ) {
    const assessment = await this.loadAssessment(assessmentId, user);
    this.assertFinancialEditable(assessment as any);

    const penaltyKey = String(body.penaltyKey || body.penalty_id || '').trim();
    const penaltyName = String(body.penaltyName || body.penalty_name || '').trim();
    const metricName = String(body.metricName || body.metric_name || '').trim();
    const thresholdType = String(body.thresholdType || body.threshold_type || 'minimum').trim();
    const unit = String(body.unit || 'percentage').trim();
    if (!penaltyKey || !penaltyName || !metricName) {
      throw new BadRequestException('penaltyKey, penaltyName, and metricName are required.');
    }

    const canSetFormula = hasRole(user, METHODOLOGY_ROLES);
    if ((body.formulaExpression != null || body.formula_expression != null) && !canSetFormula) {
      throw new ForbiddenException(
        'Only methodology administrators may set penalty formula expressions.',
      );
    }
    const formulaExpression = canSetFormula
      ? String(
          body.formulaExpression || body.formula_expression || 'missed_shifts * daily_guard_cost',
        ).trim()
      : 'missed_shifts * daily_guard_cost';

    const row = await this.prisma.somodPenaltyLibrary.create({
      data: {
        somodAssessmentId: assessmentId,
        penaltyKey,
        penaltyName,
        metricName,
        thresholdType,
        thresholdValue: body.thresholdValue != null ? moneyNumber(body.thresholdValue) : null,
        unit,
        formulaExpression,
        appliesToControlId: body.appliesToControlId
          ? String(body.appliesToControlId)
          : null,
        isActive: true,
        isGoverned: false,
      },
    });

    await this.markStale(assessmentId);
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_PENALTY_CREATED',
      entityType: 'SomodPenaltyLibrary',
      entityId: row.id,
      organisationId: assessment.organisationId,
      newValue: row,
    });

    return this.listPenalties(assessmentId, user);
  }

  async updatePenalty(
    assessmentId: string,
    penaltyId: string,
    body: Record<string, unknown>,
    user: AuthUser,
  ) {
    const assessment = await this.loadAssessment(assessmentId, user);
    this.assertFinancialEditable(assessment as any);
    const row = await this.prisma.somodPenaltyLibrary.findFirst({
      where: { id: penaltyId, somodAssessmentId: assessmentId },
    });
    if (!row) throw new NotFoundException('Penalty rule not found.');

    const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'METHODOLOGY_ADMIN';
    if (row.isGoverned && !isAdmin) {
      // Consultants may only toggle active / threshold for governed rules — not formula
      const updated = await this.prisma.somodPenaltyLibrary.update({
        where: { id: row.id },
        data: {
          isActive: body.isActive == null ? row.isActive : Boolean(body.isActive),
          thresholdValue:
            body.thresholdValue == null
              ? row.thresholdValue
              : moneyNumber(body.thresholdValue),
        },
      });
      await this.markStale(assessmentId);
      await this.audit.record({
        userId: user.id,
        action: 'SOMOD_PENALTY_UPDATED',
        entityType: 'SomodPenaltyLibrary',
        entityId: updated.id,
        organisationId: assessment.organisationId,
        oldValue: row,
        newValue: updated,
        metadata: { governed: true, formulaUnchanged: true },
      });
      return this.listPenalties(assessmentId, user);
    }

    if (row.isGoverned && isAdmin && body.formulaExpression != null) {
      // Admin may change governed formula with audit
    }

    const updated = await this.prisma.somodPenaltyLibrary.update({
      where: { id: row.id },
      data: {
        penaltyName: body.penaltyName != null ? String(body.penaltyName) : row.penaltyName,
        metricName: body.metricName != null ? String(body.metricName) : row.metricName,
        thresholdType:
          body.thresholdType != null ? String(body.thresholdType) : row.thresholdType,
        thresholdValue:
          body.thresholdValue == null
            ? row.thresholdValue
            : moneyNumber(body.thresholdValue),
        unit: body.unit != null ? String(body.unit) : row.unit,
        formulaExpression:
          isAdmin && body.formulaExpression != null
            ? String(body.formulaExpression)
            : row.formulaExpression,
        appliesToControlId:
          body.appliesToControlId !== undefined
            ? body.appliesToControlId
              ? String(body.appliesToControlId)
              : null
            : row.appliesToControlId,
        isActive: body.isActive == null ? row.isActive : Boolean(body.isActive),
      },
    });

    await this.markStale(assessmentId);
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_PENALTY_UPDATED',
      entityType: 'SomodPenaltyLibrary',
      entityId: updated.id,
      organisationId: assessment.organisationId,
      oldValue: row,
      newValue: updated,
    });
    return this.listPenalties(assessmentId, user);
  }

  async listMappings(assessmentId: string, user: AuthUser) {
    await this.loadAssessment(assessmentId, user);
    const rows = await this.prisma.somodControlFinancialMapping.findMany({
      where: { somodAssessmentId: assessmentId },
      include: {
        penalty: {
          select: {
            id: true,
            penaltyKey: true,
            penaltyName: true,
            formulaExpression: true,
            isGoverned: true,
          },
        },
      },
      orderBy: { controlId: 'asc' },
    });
    return {
      mappings: rows.map((m) => ({
        id: m.id,
        controlId: m.controlId,
        financialRelevance: m.financialRelevance,
        costCategory: m.costCategory,
        eventUnit: m.eventUnit,
        exposureFormula: m.exposureFormula,
        recoverableFormula: m.recoverableFormula,
        cfoOutputCategory: m.cfoOutputCategory,
        penaltyId: m.penaltyId,
        penalty: m.penalty,
      })),
    };
  }

  async createMapping(
    assessmentId: string,
    body: Record<string, unknown>,
    user: AuthUser,
  ) {
    const assessment = await this.loadAssessment(assessmentId, user);
    this.assertFinancialEditable(assessment as any);
    const controlId = String(body.controlId || body.control_id || '').trim();
    if (!controlId) throw new BadRequestException('controlId is required.');
    const financialRelevance = Boolean(
      body.financialRelevance ?? body.financial_relevance ?? false,
    );
    const payload = {
      financialRelevance,
      costCategory: body.costCategory != null ? String(body.costCategory) : null,
      eventUnit: body.eventUnit != null ? String(body.eventUnit) : null,
      cfoOutputCategory:
        body.cfoOutputCategory != null ? String(body.cfoOutputCategory) : null,
    };
    const errors = validateControlMapping(payload);
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const row = await this.prisma.somodControlFinancialMapping.create({
      data: {
        somodAssessmentId: assessmentId,
        controlId,
        financialRelevance,
        costCategory: payload.costCategory,
        eventUnit: payload.eventUnit,
        exposureFormula:
          body.exposureFormula != null ? String(body.exposureFormula) : null,
        recoverableFormula:
          body.recoverableFormula != null ? String(body.recoverableFormula) : null,
        cfoOutputCategory: payload.cfoOutputCategory,
        penaltyId: body.penaltyId ? String(body.penaltyId) : null,
      },
    });

    await this.markStale(assessmentId);
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_CONTROL_FINANCIAL_MAPPING_CREATED',
      entityType: 'SomodControlFinancialMapping',
      entityId: row.id,
      organisationId: assessment.organisationId,
      newValue: row,
    });
    return this.listMappings(assessmentId, user);
  }

  async updateMapping(
    assessmentId: string,
    mappingId: string,
    body: Record<string, unknown>,
    user: AuthUser,
  ) {
    const assessment = await this.loadAssessment(assessmentId, user);
    this.assertFinancialEditable(assessment as any);
    const row = await this.prisma.somodControlFinancialMapping.findFirst({
      where: { id: mappingId, somodAssessmentId: assessmentId },
    });
    if (!row) throw new NotFoundException('Control financial mapping not found.');

    const financialRelevance =
      body.financialRelevance == null
        ? row.financialRelevance
        : Boolean(body.financialRelevance);
    const payload = {
      financialRelevance,
      costCategory:
        body.costCategory !== undefined
          ? body.costCategory
            ? String(body.costCategory)
            : null
          : row.costCategory,
      eventUnit:
        body.eventUnit !== undefined
          ? body.eventUnit
            ? String(body.eventUnit)
            : null
          : row.eventUnit,
      cfoOutputCategory:
        body.cfoOutputCategory !== undefined
          ? body.cfoOutputCategory
            ? String(body.cfoOutputCategory)
            : null
          : row.cfoOutputCategory,
    };
    const errors = validateControlMapping(payload);
    if (errors.length) throw new BadRequestException(errors.join(' '));

    const updated = await this.prisma.somodControlFinancialMapping.update({
      where: { id: row.id },
      data: {
        financialRelevance,
        costCategory: payload.costCategory,
        eventUnit: payload.eventUnit,
        cfoOutputCategory: payload.cfoOutputCategory,
        exposureFormula:
          body.exposureFormula !== undefined
            ? body.exposureFormula
              ? String(body.exposureFormula)
              : null
            : row.exposureFormula,
        recoverableFormula:
          body.recoverableFormula !== undefined
            ? body.recoverableFormula
              ? String(body.recoverableFormula)
              : null
            : row.recoverableFormula,
        penaltyId:
          body.penaltyId !== undefined
            ? body.penaltyId
              ? String(body.penaltyId)
              : null
            : row.penaltyId,
      },
    });

    await this.markStale(assessmentId);
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_CONTROL_FINANCIAL_MAPPING_UPDATED',
      entityType: 'SomodControlFinancialMapping',
      entityId: updated.id,
      organisationId: assessment.organisationId,
      oldValue: row,
      newValue: updated,
    });
    return this.listMappings(assessmentId, user);
  }

  async calculateFinancials(assessmentId: string, user: AuthUser) {
    const assessment = await this.loadAssessment(assessmentId, user);
    this.assertFinancialEditable(assessment as any);

    const model = await this.prisma.somodFinancialModel.findUnique({
      where: { somodAssessmentId: assessmentId },
    });
    if (!model) {
      throw new BadRequestException(
        'Financial model is required before calculation. Complete Financial Setup first.',
      );
    }

    const mappings = await this.prisma.somodControlFinancialMapping.findMany({
      where: { somodAssessmentId: assessmentId },
      include: { penalty: true },
    });

    for (const m of mappings) {
      const errors = validateControlMapping(m);
      if (errors.length) {
        throw new BadRequestException(`${m.controlId}: ${errors.join(' ')}`);
      }
    }

    const cost = this.toCostVariables(model);
    const setupErrors = validateFinancialSetup(cost);
    if (setupErrors.length) throw new BadRequestException(setupErrors.join(' '));

    const readiness = await this.methodology.getReadiness(assessmentId);
    let result;
    try {
      result = calculateScenarioFinancials({
        cost,
        engines: {
          riskRequirementJson: assessment.riskRequirementJson,
          deploymentCapabilityJson: assessment.deploymentCapabilityJson,
          technologyJson: assessment.technologyJson,
          costEfficiencyJson: assessment.costEfficiencyJson,
          optimisationTradeoffJson: assessment.optimisationTradeoffJson,
        },
        mappings: mappings.map((m) => ({
          controlId: m.controlId,
          financialRelevance: m.financialRelevance,
          costCategory: m.costCategory,
          eventUnit: m.eventUnit,
          exposureFormula: m.exposureFormula,
          recoverableFormula: m.recoverableFormula,
          cfoOutputCategory: m.cfoOutputCategory,
          penalty: m.penalty
            ? {
                formulaExpression: m.penalty.formulaExpression,
                isActive: m.penalty.isActive,
              }
            : null,
        })),
        methodology: readiness,
      });
    } catch (e) {
      await this.audit.record({
        userId: user.id,
        action: 'SOMOD_FINANCIALS_CALCULATION_FAILED',
        entityType: 'SomodAssessment',
        entityId: assessmentId,
        organisationId: assessment.organisationId,
        metadata: { error: e instanceof Error ? e.message : 'Calculation failed.' },
      });
      throw new BadRequestException(e instanceof Error ? e.message : 'Calculation failed.');
    }

    const current = result.scenarios.find((s) => s.scenarioType === 'CURRENT');
    if (!current) {
      throw new BadRequestException('Calculation must produce a Current scenario output.');
    }
    const moneyOrZero = (v: number | null | undefined) => (v == null ? 0 : v);

    await this.prisma.$transaction(async (tx) => {
      for (const scenario of result.scenarios) {
        await tx.somodScenarioFinancialOutput.upsert({
          where: {
            somodAssessmentId_scenarioType: {
              somodAssessmentId: assessmentId,
              scenarioType: scenario.scenarioType as SomodScenarioType,
            },
          },
          create: {
            somodAssessmentId: assessmentId,
            scenarioType: scenario.scenarioType as SomodScenarioType,
            calculationStatus: scenario.calculationStatus,
            methodologyMissing: scenario.methodologyMissing as Prisma.InputJsonValue,
            monthlyManpowerCost: moneyOrZero(scenario.monthlyManpowerCost),
            monthlyTechnologyCost: moneyOrZero(scenario.monthlyTechnologyCost),
            monthlyPenaltyExposure: moneyOrZero(scenario.monthlyPenaltyExposure),
            monthlyOperationalLeakage: moneyOrZero(scenario.monthlyOperationalLeakage),
            monthlyRecoverableValue: moneyOrZero(scenario.monthlyRecoverableValue),
            monthlyTotalSecurityCost: moneyOrZero(scenario.monthlyTotalSecurityCost),
            annualTotalSecurityCost: moneyOrZero(scenario.annualTotalSecurityCost),
            requiredCapitalInvestment: moneyOrZero(scenario.requiredCapitalInvestment),
            paybackMonths: scenario.paybackMonths,
            effectivenessScore: scenario.effectivenessScore,
            riskPosition: scenario.riskPosition,
            detailJson: scenario.detail as Prisma.InputJsonValue,
          },
          update: {
            calculationStatus: scenario.calculationStatus,
            methodologyMissing: scenario.methodologyMissing as Prisma.InputJsonValue,
            monthlyManpowerCost: moneyOrZero(scenario.monthlyManpowerCost),
            monthlyTechnologyCost: moneyOrZero(scenario.monthlyTechnologyCost),
            monthlyPenaltyExposure: moneyOrZero(scenario.monthlyPenaltyExposure),
            monthlyOperationalLeakage: moneyOrZero(scenario.monthlyOperationalLeakage),
            monthlyRecoverableValue: moneyOrZero(scenario.monthlyRecoverableValue),
            monthlyTotalSecurityCost: moneyOrZero(scenario.monthlyTotalSecurityCost),
            annualTotalSecurityCost: moneyOrZero(scenario.annualTotalSecurityCost),
            requiredCapitalInvestment: moneyOrZero(scenario.requiredCapitalInvestment),
            paybackMonths: scenario.paybackMonths,
            effectivenessScore: scenario.effectivenessScore,
            riskPosition: scenario.riskPosition,
            detailJson: scenario.detail as Prisma.InputJsonValue,
          },
        });
      }

      await tx.somodCfoDashboardSnapshot.create({
        data: {
          somodAssessmentId: assessmentId,
          currency: result.cfo.currency,
          currentMonthlySpend: moneyOrZero(result.cfo.currentMonthlySpend),
          optimalMonthlySpend: moneyOrZero(result.cfo.optimalMonthlySpend),
          monthlySavings: moneyOrZero(result.cfo.monthlySavings),
          annualSavings: moneyOrZero(result.cfo.annualSavings),
          currentMonthlyLeakage: moneyOrZero(result.cfo.currentMonthlyLeakage),
          optimalMonthlyLeakage: moneyOrZero(result.cfo.optimalMonthlyLeakage),
          monthlyRecoverableValue: moneyOrZero(result.cfo.monthlyRecoverableValue),
          requiredCapitalInvestment: moneyOrZero(result.cfo.requiredCapitalInvestment),
          paybackMonths: result.cfo.paybackMonths,
          currentEffectiveness: result.cfo.currentEffectiveness,
          optimalEffectiveness: result.cfo.optimalEffectiveness,
          currentRiskPosition: result.cfo.currentRiskPosition,
          optimalRiskPosition: result.cfo.optimalRiskPosition,
          isLocked: false,
          snapshotJson: {
            ...result.cfo,
            methodology: result.methodology,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.somodAssessment.update({
        where: { id: assessmentId },
        data: {
          financialLayerStatus: SomodFinancialLayerStatus.CALCULATED,
          financialStale: false,
          financialCalculatedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_FINANCIALS_CALCULATED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: assessment.organisationId,
      metadata: {
        formulaVersion: SOMOD_FINANCIAL_FORMULA_VERSION,
        scenarioCount: result.scenarios.length,
        methodologyStatus: result.methodology.status,
      },
    });

    return {
      formulaVersion: SOMOD_FINANCIAL_FORMULA_VERSION,
      derived: result.derived,
      scenarios: result.scenarios,
      cfoDashboard: result.cfo,
      methodology: result.methodology,
      financialLayerStatus: SomodFinancialLayerStatus.CALCULATED,
      financialStale: false,
    };
  }

  async getScenarioFinancials(assessmentId: string, user: AuthUser) {
    const assessment = await this.loadAssessment(assessmentId, user);
    const rows = await this.prisma.somodScenarioFinancialOutput.findMany({
      where: { somodAssessmentId: assessmentId },
      orderBy: { scenarioType: 'asc' },
    });
    return {
      financialLayerStatus: (assessment as any).financialLayerStatus,
      financialStale: (assessment as any).financialStale,
      financialCalculatedAt: (assessment as any).financialCalculatedAt,
      scenarios: rows.map((r) => {
        const status = (r as any).calculationStatus || 'CALCULATED';
        const isMoney = status === 'CALCULATED';
        return {
          scenarioType: r.scenarioType,
          calculationStatus: status,
          methodologyMissing: (r as any).methodologyMissing || [],
          monthlyManpowerCost: isMoney ? moneyNumber(r.monthlyManpowerCost) : null,
          monthlyTechnologyCost: isMoney ? moneyNumber(r.monthlyTechnologyCost) : null,
          monthlyPenaltyExposure: isMoney ? moneyNumber(r.monthlyPenaltyExposure) : null,
          monthlyOperationalLeakage: isMoney ? moneyNumber(r.monthlyOperationalLeakage) : null,
          monthlyRecoverableValue: isMoney ? moneyNumber(r.monthlyRecoverableValue) : null,
          monthlyTotalSecurityCost: isMoney ? moneyNumber(r.monthlyTotalSecurityCost) : null,
          annualTotalSecurityCost: isMoney ? moneyNumber(r.annualTotalSecurityCost) : null,
          requiredCapitalInvestment: isMoney ? moneyNumber(r.requiredCapitalInvestment) : null,
          paybackMonths:
            isMoney && r.paybackMonths != null ? moneyNumber(r.paybackMonths) : null,
          effectivenessScore: null,
          riskPosition: null,
          detail: r.detailJson,
        };
      }),
    };
  }

  async getCfoDashboard(assessmentId: string, user: AuthUser) {
    const assessment = await this.loadAssessment(assessmentId, user);
    const outputs = await this.prisma.somodScenarioFinancialOutput.findMany({
      where: { somodAssessmentId: assessmentId },
    });
    const current = outputs.find((o) => o.scenarioType === 'CURRENT');
    if (!current) {
      throw new BadRequestException(
        'CFO dashboard requires a Current scenario output. Run calculate-financials first.',
      );
    }

    const currentStatus = (current as any).calculationStatus || 'CALCULATED';
    const optimal = outputs.find((o) => o.scenarioType === 'RECOMMENDED_OPTIMAL');
    const optimalReady =
      optimal &&
      ((optimal as any).calculationStatus === 'CALCULATED') &&
      !(assessment as any).financialStale;

    if ((assessment as any).financialStale) {
      return {
        stale: true,
        ready: false,
        status: 'STALE',
        message: 'Financial inputs changed after calculation. Recalculate before using the dashboard.',
        latest: null,
        methodology: await this.methodology.getReadiness(assessmentId),
      };
    }

    const latest = await this.prisma.somodCfoDashboardSnapshot.findFirst({
      where: { somodAssessmentId: assessmentId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      throw new BadRequestException('No CFO dashboard snapshot found. Run calculate-financials.');
    }

    const snap = (latest.snapshotJson || {}) as Record<string, unknown>;
    return {
      stale: false,
      ready: currentStatus === 'CALCULATED',
      status: optimalReady ? 'CALCULATED' : 'PARTIAL',
      message: optimalReady
        ? 'Current and Recommended Optimal comparison available.'
        : 'Current financials are available. Recommended Optimal appears when optimisation configuration is approved.',
      financialLayerStatus: (assessment as any).financialLayerStatus,
      methodology: await this.methodology.getReadiness(assessmentId),
      latest: {
        id: latest.id,
        currency: latest.currency,
        currentMonthlySpend:
          currentStatus === 'CALCULATED' ? moneyNumber(latest.currentMonthlySpend) : null,
        optimalMonthlySpend: optimalReady ? moneyNumber(latest.optimalMonthlySpend) : null,
        monthlySavings: optimalReady ? moneyNumber(latest.monthlySavings) : null,
        annualSavings: optimalReady ? moneyNumber(latest.annualSavings) : null,
        currentMonthlyLeakage:
          currentStatus === 'CALCULATED' ? moneyNumber(latest.currentMonthlyLeakage) : null,
        optimalMonthlyLeakage: optimalReady ? moneyNumber(latest.optimalMonthlyLeakage) : null,
        monthlyRecoverableValue:
          currentStatus === 'CALCULATED' ? moneyNumber(latest.monthlyRecoverableValue) : null,
        requiredCapitalInvestment:
          currentStatus === 'CALCULATED' ? moneyNumber(latest.requiredCapitalInvestment) : null,
        paybackMonths:
          currentStatus === 'CALCULATED' && latest.paybackMonths != null
            ? moneyNumber(latest.paybackMonths)
            : null,
        currentEffectiveness: null,
        optimalEffectiveness: null,
        currentRiskPosition: null,
        optimalRiskPosition: null,
        comparisonAvailable: Boolean(optimalReady),
        isLocked: latest.isLocked,
        createdAt: latest.createdAt,
        snapshot: snap,
      },
    };
  }

  async submitFinancialLayer(assessmentId: string, user: AuthUser) {
    const assessment = await this.loadAssessment(assessmentId, user);
    if ((assessment as any).financialStale) {
      throw new BadRequestException('Recalculate financials before submitting for review.');
    }
    if ((assessment as any).financialLayerStatus !== SomodFinancialLayerStatus.CALCULATED) {
      throw new BadRequestException('Calculate financials before submitting for review.');
    }
    await this.prisma.somodAssessment.update({
      where: { id: assessmentId },
      data: { financialLayerStatus: SomodFinancialLayerStatus.IN_REVIEW },
    });
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_FINANCIAL_SUBMITTED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: assessment.organisationId,
    });
    return this.getCfoDashboard(assessmentId, user);
  }

  async approveFinancialLayer(assessmentId: string, user: AuthUser) {
    if (!hasRole(user, SOMOD_APPROVER_ROLES)) {
      throw new ForbiddenException(
        'Only reviewers or administrators may approve the financial layer. Analysts/consultants cannot approve.',
      );
    }
    const assessment = await this.loadAssessment(assessmentId, user);
    if ((assessment as any).financialStale) {
      throw new BadRequestException('Financial outputs are stale. Recalculate before approval.');
    }
    const outputs = await this.prisma.somodScenarioFinancialOutput.findMany({
      where: { somodAssessmentId: assessmentId },
    });
    const current = outputs.find((o) => o.scenarioType === 'CURRENT');
    if (!current || (current as any).calculationStatus !== 'CALCULATED') {
      throw new BadRequestException(
        'Cannot approve without a CALCULATED Current scenario. Methodology-required scenarios cannot be approved as calculated results.',
      );
    }
    const falselyCalculated = outputs.filter(
      (o) =>
        o.scenarioType !== 'CURRENT' && (o as any).calculationStatus === 'CALCULATED',
    );
    if (falselyCalculated.length) {
      throw new BadRequestException(
        'Non-Current scenarios marked CALCULATED without approved methodology. Recalculate under SOMOD_FINANCIAL_V2 before approval.',
      );
    }
    const legacy = outputs.filter((o) => (o as any).calculationStatus === 'LEGACY_PLACEHOLDER');
    if (legacy.length) {
      throw new BadRequestException(
        'Legacy placeholder scenario results exist. Recalculate under SOMOD_FINANCIAL_V2 before approval.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.somodAssessment.update({
        where: { id: assessmentId },
        data: {
          financialLayerStatus: SomodFinancialLayerStatus.APPROVED,
          financialApprovedAt: new Date(),
          financialApprovedById: user.id,
        },
      });
      await tx.somodCfoDashboardSnapshot.updateMany({
        where: { somodAssessmentId: assessmentId, isLocked: false },
        data: { isLocked: true },
      });
    });
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_FINANCIAL_APPROVED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: assessment.organisationId,
    });
    return this.getCfoDashboard(assessmentId, user);
  }

  async returnFinancialLayer(assessmentId: string, comment: string, user: AuthUser) {
    if (!hasRole(user, SOMOD_APPROVER_ROLES)) {
      throw new ForbiddenException(
        'Only reviewers or administrators may return the financial layer.',
      );
    }
    const assessment = await this.loadAssessment(assessmentId, user);
    await this.prisma.somodAssessment.update({
      where: { id: assessmentId },
      data: {
        financialLayerStatus: SomodFinancialLayerStatus.RETURNED,
        financialStale: true,
        notes: assessment.notes
          ? `${assessment.notes}\n\n[Financial return] ${comment}`
          : `[Financial return] ${comment}`,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_FINANCIAL_RETURNED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: assessment.organisationId,
      metadata: { comment },
    });
    return { ok: true, financialLayerStatus: SomodFinancialLayerStatus.RETURNED };
  }

  async reopenFinancialLayer(assessmentId: string, reason: string, user: AuthUser) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'METHODOLOGY_ADMIN') {
      throw new ForbiddenException(
        'Only administrators may reopen an approved financial layer.',
      );
    }
    if (!String(reason || '').trim()) {
      throw new BadRequestException('A reason is required to reopen the financial layer.');
    }
    const assessment = await this.loadAssessment(assessmentId, user);
    await this.prisma.somodAssessment.update({
      where: { id: assessmentId },
      data: {
        financialLayerStatus: SomodFinancialLayerStatus.DRAFT,
        financialStale: true,
        financialLockReason: reason.trim(),
        financialApprovedAt: null,
        financialApprovedById: null,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_FINANCIAL_REOPENED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: assessment.organisationId,
      metadata: { reason: reason.trim() },
    });
    return { ok: true, financialLayerStatus: SomodFinancialLayerStatus.DRAFT };
  }

  async getMethodology(assessmentId: string, user: AuthUser) {
    await this.loadAssessment(assessmentId, user);
    return this.methodology.getReadiness(assessmentId);
  }

  async getEngineReadiness(assessmentId: string, user: AuthUser) {
    await this.loadAssessment(assessmentId, user);
    const methodology = await this.methodology.getReadiness(assessmentId);
    return {
      methodology,
      engines: [
        {
          key: 'RISK_REQUIREMENT',
          status: 'METHODOLOGY_REQUIRED',
          missing: ['risk_requirement_rules'],
        },
        {
          key: 'DEPLOYMENT_CAPABILITY',
          status: 'METHODOLOGY_REQUIRED',
          missing: ['deployment_derivation_rules'],
        },
        {
          key: 'TECHNOLOGY',
          status: 'METHODOLOGY_REQUIRED',
          missing: ['technology_substitution_rules'],
        },
        {
          key: 'COST_EFFICIENCY',
          status: methodology.configured.includes('financial_cost_variables')
            ? 'PARTIAL'
            : 'METHODOLOGY_REQUIRED',
          missing: methodology.configured.includes('financial_cost_variables')
            ? []
            : ['financial_cost_variables'],
        },
        {
          key: 'OPTIMISATION_TRADEOFF',
          status: 'METHODOLOGY_REQUIRED',
          missing: ['optimisation_objective', 'optimisation_constraints'],
        },
      ],
    };
  }
}
