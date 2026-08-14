/**
 * Governed SOMOD financial calculations (handoff Engine 4).
 * CURRENT scenario only until client methodology configures other scenarios.
 * Never invents scenario multipliers, effectiveness scores, or optimisation blends.
 */

import { evaluateSafeExpression } from './somod-safe-expression';
import {
  assessMethodologyReadiness,
  type MethodologyComponent,
  type MethodologyReadiness,
} from '../methodology/somod-methodology';

export const SOMOD_FINANCIAL_FORMULA_VERSION = 'SOMOD_FINANCIAL_V2' as const;

export type CostVariables = {
  currency: string;
  monthlyGuardCost: number;
  monthlySupervisorCost: number;
  daysPerMonth: number;
  shiftHours: number;
  responseDelayCostRate: number;
  defaultIncidentSeverityMultiplier: number;
  monthlyContractValue: number;
  patrolValuePerMiss: number;
  technologyCapexTotal: number;
  technologyMonthlyOpex: number;
  technologyLifespanMonths: number | null;
};

export type DerivedVariables = {
  dailyGuardCost: number;
  hourlyGuardCost: number;
  monthlyTechnologyEquivalentCost: number;
};

export type ScenarioKind =
  | 'CURRENT'
  | 'RISK_ALIGNED'
  | 'COST_EFFICIENT'
  | 'RECOMMENDED_OPTIMAL';

export type CalculationStatus =
  | 'CALCULATED'
  | 'METHODOLOGY_REQUIRED'
  | 'INCOMPLETE'
  | 'STALE'
  | 'LEGACY_PLACEHOLDER';

export type ScenarioFinancialResult = {
  scenarioType: ScenarioKind;
  calculationStatus: CalculationStatus;
  methodologyMissing: MethodologyComponent[];
  monthlyManpowerCost: number | null;
  monthlyTechnologyCost: number | null;
  monthlyPenaltyExposure: number | null;
  monthlyOperationalLeakage: number | null;
  monthlyRecoverableValue: number | null;
  monthlyTotalSecurityCost: number | null;
  annualTotalSecurityCost: number | null;
  requiredCapitalInvestment: number | null;
  paybackMonths: number | null;
  /** Null until effectiveness_scoring methodology is configured. */
  effectivenessScore: number | null;
  /** Null until risk_position_scoring methodology is configured. */
  riskPosition: string | null;
  detail: Record<string, unknown>;
};

export type CfoDashboardResult = {
  currency: string;
  status: CalculationStatus | 'PARTIAL';
  message: string;
  currentMonthlySpend: number | null;
  optimalMonthlySpend: number | null;
  monthlySavings: number | null;
  annualSavings: number | null;
  currentMonthlyLeakage: number | null;
  optimalMonthlyLeakage: number | null;
  monthlyRecoverableValue: number | null;
  requiredCapitalInvestment: number | null;
  paybackMonths: number | null;
  currentEffectiveness: number | null;
  optimalEffectiveness: number | null;
  currentRiskPosition: string | null;
  optimalRiskPosition: string | null;
  comparisonAvailable: boolean;
  comparison: null | {
    baseline: 'CURRENT';
    recommended: 'RECOMMENDED_OPTIMAL';
    monthlySpendDelta: number;
    monthlyLeakageDelta: number;
    effectivenessDelta: number | null;
  };
};

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function clampNonNeg(n: number) {
  return Math.max(0, round2(n));
}

/** @deprecated Use evaluateSafeExpression — kept name for call-site compatibility. */
export function evaluateGovernedExpression(
  expression: string,
  context: Record<string, number>,
): number {
  return evaluateSafeExpression(expression, context);
}

export function validateFinancialSetup(input: Partial<CostVariables>): string[] {
  const errors: string[] = [];
  const currency = String(input.currency || '').trim().toUpperCase();
  if (!currency) errors.push('Currency is required.');
  if (!(num(input.monthlyContractValue) > 0)) errors.push('Monthly contract value must be greater than 0.');
  if (!(num(input.monthlyGuardCost) > 0)) errors.push('Monthly guard cost must be greater than 0.');
  if (!(num(input.monthlySupervisorCost) > 0)) errors.push('Monthly supervisor cost must be greater than 0.');
  const days = num(input.daysPerMonth);
  if (days < 28 || days > 31) errors.push('Days per month must be between 28 and 31 inclusive.');
  const shift = num(input.shiftHours);
  if (!(shift > 0) || shift > 24) errors.push('Shift hours must be greater than 0 and not exceed 24.');
  if (num(input.responseDelayCostRate) < 0) errors.push('Response delay cost rate must be >= 0.');
  const severity = num(input.defaultIncidentSeverityMultiplier);
  if (severity < 1 || severity > 5) errors.push('Default incident severity multiplier must be between 1 and 5.');
  if (num(input.patrolValuePerMiss) < 0) errors.push('Patrol value per miss must be >= 0.');
  if (num(input.technologyCapexTotal) < 0) errors.push('Technology CAPEX must be >= 0.');
  if (num(input.technologyMonthlyOpex) < 0) errors.push('Technology monthly OPEX must be >= 0.');
  const capex = num(input.technologyCapexTotal);
  const lifespan = input.technologyLifespanMonths == null ? null : num(input.technologyLifespanMonths);
  if (capex > 0 && (lifespan == null || lifespan < 1)) {
    errors.push('Technology lifespan months is mandatory when technology CAPEX is entered.');
  }
  return errors;
}

export function validateControlMapping(input: {
  financialRelevance: boolean;
  costCategory?: string | null;
  eventUnit?: string | null;
  cfoOutputCategory?: string | null;
}): string[] {
  if (!input.financialRelevance) return [];
  const errors: string[] = [];
  if (!String(input.costCategory || '').trim()) errors.push('Cost category is mandatory when control is financially relevant.');
  if (!String(input.eventUnit || '').trim()) errors.push('Event unit is mandatory when control is financially relevant.');
  if (!String(input.cfoOutputCategory || '').trim()) {
    errors.push('CFO output category is mandatory when control is financially relevant.');
  }
  return errors;
}

export function deriveFinancialVariables(cost: CostVariables): DerivedVariables {
  const days = Math.max(1, cost.daysPerMonth);
  const shift = Math.max(0.01, cost.shiftHours);
  const dailyGuardCost = round2(cost.monthlyGuardCost / days);
  const hourlyGuardCost = round2(dailyGuardCost / shift);
  const lifespan =
    cost.technologyLifespanMonths && cost.technologyLifespanMonths >= 1
      ? cost.technologyLifespanMonths
      : null;
  const monthlyCapexEquivalent =
    lifespan && cost.technologyCapexTotal > 0 ? cost.technologyCapexTotal / lifespan : 0;
  const monthlyTechnologyEquivalentCost = round2(
    monthlyCapexEquivalent + Math.max(0, cost.technologyMonthlyOpex),
  );
  return { dailyGuardCost, hourlyGuardCost, monthlyTechnologyEquivalentCost };
}

export const DEFAULT_GOVERNED_PENALTIES = [
  {
    penaltyKey: 'pen_attendance',
    penaltyName: 'Attendance Penalty',
    metricName: 'attendance_compliance_pct',
    thresholdType: 'minimum',
    thresholdValue: 0.98,
    unit: 'percentage',
    formulaExpression: 'missed_shifts * daily_guard_cost * 1.5',
    appliesToControlId: 'DEP-02',
  },
  {
    penaltyKey: 'pen_patrol',
    penaltyName: 'Patrol Miss Penalty',
    metricName: 'patrol_completion_pct',
    thresholdType: 'minimum',
    thresholdValue: 0.95,
    unit: 'percentage',
    formulaExpression: 'missed_patrols * patrol_value_per_miss',
    appliesToControlId: 'DEP-05',
  },
  {
    penaltyKey: 'pen_response',
    penaltyName: 'Response Delay Penalty',
    metricName: 'response_delay_minutes',
    thresholdType: 'maximum',
    thresholdValue: 15,
    unit: 'minutes',
    formulaExpression:
      'response_delay_minutes * response_delay_cost_rate * incident_severity_multiplier',
    appliesToControlId: 'OPS-01',
  },
] as const;

export const DEFAULT_CONTROL_MAPPINGS = [
  {
    controlId: 'DEP-02',
    financialRelevance: true,
    costCategory: 'manpower_leakage',
    eventUnit: 'missed_shift',
    exposureFormula: 'missed_shifts * daily_guard_cost',
    recoverableFormula: 'expected_penalty - applied_penalty',
    cfoOutputCategory: 'recoverable_value',
    penaltyKey: 'pen_attendance',
  },
  {
    controlId: 'DEP-05',
    financialRelevance: true,
    costCategory: 'operational_leakage',
    eventUnit: 'missed_patrol',
    exposureFormula: 'missed_patrols * patrol_value_per_miss',
    recoverableFormula: 'expected_penalty - applied_penalty',
    cfoOutputCategory: 'recoverable_value',
    penaltyKey: 'pen_patrol',
  },
  {
    controlId: 'OPS-01',
    financialRelevance: true,
    costCategory: 'penalty_exposure',
    eventUnit: 'delay_minute',
    exposureFormula:
      'response_delay_minutes * response_delay_cost_rate * incident_severity_multiplier',
    recoverableFormula: 'expected_penalty - applied_penalty',
    cfoOutputCategory: 'recoverable_value',
    penaltyKey: 'pen_response',
  },
] as const;

type EngineSnapshot = {
  residualRisk: number | null;
  controlCoverage: number | null;
  headcount: number;
  /** Explicit user input only — never derived from headcount ratios. */
  supervisorCount: number;
  automationPercent: number | null;
  missedShifts: number;
  missedPatrols: number;
  responseDelayMinutes: number;
};

function readCurrentState(engines: {
  riskRequirementJson?: unknown;
  deploymentCapabilityJson?: unknown;
  technologyJson?: unknown;
  costEfficiencyJson?: unknown;
}): EngineSnapshot {
  const risk = (engines.riskRequirementJson || {}) as Record<string, unknown>;
  const deployment = (engines.deploymentCapabilityJson || {}) as Record<string, unknown>;
  const technology = (engines.technologyJson || {}) as Record<string, unknown>;
  const cost = (engines.costEfficiencyJson || {}) as Record<string, unknown>;

  const headcount = Math.max(0, Math.round(num(deployment.headcount, 0)));
  const supervisorRaw = deployment.supervisorCount ?? deployment.supervisors;
  const supervisorCount =
    supervisorRaw == null || supervisorRaw === ''
      ? 0
      : Math.max(0, Math.round(num(supervisorRaw, 0)));

  return {
    residualRisk:
      risk.residualRisk == null || risk.residualRisk === '' ? null : num(risk.residualRisk),
    controlCoverage:
      risk.controlCoverage == null || risk.controlCoverage === ''
        ? null
        : num(risk.controlCoverage),
    headcount,
    supervisorCount,
    automationPercent:
      technology.automationPercent == null || technology.automationPercent === ''
        ? null
        : num(technology.automationPercent),
    missedShifts: Math.max(0, Math.round(num(cost.missedShifts, 0))),
    missedPatrols: Math.max(0, Math.round(num(cost.missedPatrols, 0))),
    responseDelayMinutes: Math.max(0, num(cost.responseDelayMinutes, 0)),
  };
}

type MappingInput = {
  controlId: string;
  financialRelevance: boolean;
  costCategory: string | null;
  eventUnit: string | null;
  exposureFormula: string | null;
  recoverableFormula: string | null;
  cfoOutputCategory: string | null;
  penalty?: { formulaExpression: string; isActive: boolean } | null;
};

function methodologyBlockedResult(
  scenarioType: ScenarioKind,
  missing: MethodologyComponent[],
): ScenarioFinancialResult {
  return {
    scenarioType,
    calculationStatus: 'METHODOLOGY_REQUIRED',
    methodologyMissing: missing,
    monthlyManpowerCost: null,
    monthlyTechnologyCost: null,
    monthlyPenaltyExposure: null,
    monthlyOperationalLeakage: null,
    monthlyRecoverableValue: null,
    monthlyTotalSecurityCost: null,
    annualTotalSecurityCost: null,
    requiredCapitalInvestment: null,
    paybackMonths: null,
    effectivenessScore: null,
    riskPosition: null,
    detail: {
      status: 'METHODOLOGY_REQUIRED',
      formulaVersion: SOMOD_FINANCIAL_FORMULA_VERSION,
      message: 'Client methodology configuration is required before this scenario can be calculated.',
      missing,
    },
  };
}

function calculateCurrentFinancials(input: {
  cost: CostVariables;
  engines: EngineSnapshot;
  mappings: MappingInput[];
  derived: DerivedVariables;
}): ScenarioFinancialResult {
  const { cost, engines, mappings, derived } = input;

  if (engines.headcount <= 0 && engines.supervisorCount <= 0) {
    return {
      ...methodologyBlockedResult('CURRENT', []),
      calculationStatus: 'INCOMPLETE',
      detail: {
        status: 'INCOMPLETE',
        message:
          'Enter current deployment headcount and/or supervisor count before calculating Current financials.',
        formulaVersion: SOMOD_FINANCIAL_FORMULA_VERSION,
      },
    };
  }

  const monthlyManpowerCost = clampNonNeg(
    engines.headcount * cost.monthlyGuardCost +
      engines.supervisorCount * cost.monthlySupervisorCost,
  );
  const monthlyTechnologyCost = clampNonNeg(derived.monthlyTechnologyEquivalentCost);
  const requiredCapitalInvestment = clampNonNeg(cost.technologyCapexTotal);

  const ctxBase: Record<string, number> = {
    missed_shifts: engines.missedShifts,
    missed_patrols: engines.missedPatrols,
    response_delay_minutes: engines.responseDelayMinutes,
    daily_guard_cost: derived.dailyGuardCost,
    hourly_guard_cost: derived.hourlyGuardCost,
    patrol_value_per_miss: cost.patrolValuePerMiss,
    response_delay_cost_rate: cost.responseDelayCostRate,
    incident_severity_multiplier: cost.defaultIncidentSeverityMultiplier,
    monthly_guard_cost: cost.monthlyGuardCost,
    monthly_contract_value: cost.monthlyContractValue,
  };

  let monthlyOperationalLeakage = 0;
  let monthlyPenaltyExposure = 0;
  let monthlyRecoverableValue = 0;
  const controlDetails: Array<Record<string, unknown>> = [];

  for (const mapping of mappings.filter((m) => m.financialRelevance)) {
    const exposureExpr = mapping.exposureFormula || mapping.penalty?.formulaExpression || '0';
    const exposure = evaluateSafeExpression(exposureExpr, ctxBase);
    const expectedPenalty = mapping.penalty?.isActive
      ? evaluateSafeExpression(mapping.penalty.formulaExpression, ctxBase)
      : exposure;
    const appliedPenalty = clampNonNeg(expectedPenalty);
    const recoverableCtx = {
      ...ctxBase,
      expected_penalty: expectedPenalty,
      applied_penalty: appliedPenalty,
      exposure,
    };
    const recoverable = mapping.recoverableFormula
      ? evaluateSafeExpression(mapping.recoverableFormula, recoverableCtx)
      : clampNonNeg(expectedPenalty - appliedPenalty);

    monthlyOperationalLeakage += exposure;
    monthlyPenaltyExposure += appliedPenalty;
    monthlyRecoverableValue += recoverable;
    controlDetails.push({
      controlId: mapping.controlId,
      costCategory: mapping.costCategory,
      exposure,
      expectedPenalty,
      appliedPenalty,
      recoverable,
      cfoOutputCategory: mapping.cfoOutputCategory,
    });
  }

  monthlyOperationalLeakage = clampNonNeg(monthlyOperationalLeakage);
  monthlyPenaltyExposure = clampNonNeg(monthlyPenaltyExposure);
  monthlyRecoverableValue = clampNonNeg(monthlyRecoverableValue);

  const monthlyTotalSecurityCost = clampNonNeg(
    monthlyManpowerCost +
      monthlyTechnologyCost +
      monthlyPenaltyExposure +
      monthlyOperationalLeakage,
  );
  const annualTotalSecurityCost = clampNonNeg(monthlyTotalSecurityCost * 12);

  const paybackMonths =
    requiredCapitalInvestment > 0 && monthlyRecoverableValue > 0
      ? round2(requiredCapitalInvestment / monthlyRecoverableValue)
      : requiredCapitalInvestment > 0
        ? null
        : 0;

  return {
    scenarioType: 'CURRENT',
    calculationStatus: 'CALCULATED',
    methodologyMissing: [],
    monthlyManpowerCost,
    monthlyTechnologyCost,
    monthlyPenaltyExposure,
    monthlyOperationalLeakage,
    monthlyRecoverableValue,
    monthlyTotalSecurityCost,
    annualTotalSecurityCost,
    requiredCapitalInvestment,
    paybackMonths,
    effectivenessScore: null,
    riskPosition: null,
    detail: {
      formulaVersion: SOMOD_FINANCIAL_FORMULA_VERSION,
      headcount: engines.headcount,
      supervisors: engines.supervisorCount,
      missedShifts: engines.missedShifts,
      missedPatrols: engines.missedPatrols,
      responseDelayMinutes: engines.responseDelayMinutes,
      controls: controlDetails,
      note: 'Effectiveness and risk position scoring are not available in this release.',
    },
  };
}

/**
 * Production financial calculation.
 * CURRENT: governed cost math from entered current-state + financial model.
 * RISK_ALIGNED / COST_EFFICIENT / RECOMMENDED_OPTIMAL: METHODOLOGY_REQUIRED (no multipliers / blends).
 */
export function calculateScenarioFinancials(input: {
  cost: CostVariables;
  engines: {
    riskRequirementJson?: unknown;
    deploymentCapabilityJson?: unknown;
    technologyJson?: unknown;
    costEfficiencyJson?: unknown;
    optimisationTradeoffJson?: unknown;
  };
  mappings: MappingInput[];
  methodology?: MethodologyReadiness;
}): {
  scenarios: ScenarioFinancialResult[];
  cfo: CfoDashboardResult;
  derived: DerivedVariables;
  methodology: MethodologyReadiness;
} {
  const setupErrors = validateFinancialSetup(input.cost);
  if (setupErrors.length) throw new Error(setupErrors.join(' '));
  for (const mapping of input.mappings) {
    const mappingErrors = validateControlMapping(mapping);
    if (mappingErrors.length) throw new Error(`${mapping.controlId}: ${mappingErrors.join(' ')}`);
  }

  const derived = deriveFinancialVariables(input.cost);
  const snapshot = readCurrentState(input.engines);
  const methodology =
    input.methodology ||
    assessMethodologyReadiness({
      hasFinancialModel: true,
      hasActivePenalties: input.mappings.some((m) => m.penalty?.isActive),
    });

  const current = calculateCurrentFinancials({
    cost: input.cost,
    engines: snapshot,
    mappings: input.mappings,
    derived,
  });

  const scenarios: ScenarioFinancialResult[] = [
    current,
    methodologyBlockedResult('RISK_ALIGNED', [
      'scenario_risk_aligned_rules',
      'risk_requirement_rules',
      'deployment_derivation_rules',
    ]),
    methodologyBlockedResult('COST_EFFICIENT', [
      'scenario_cost_efficient_rules',
      'optimisation_constraints',
      'technology_substitution_rules',
    ]),
    methodologyBlockedResult('RECOMMENDED_OPTIMAL', [
      'scenario_recommended_optimal_rules',
      'optimisation_objective',
      'optimisation_constraints',
    ]),
  ];

  const currentOk = current.calculationStatus === 'CALCULATED' && current.monthlyTotalSecurityCost != null;
  const cfo: CfoDashboardResult = {
    currency: input.cost.currency,
    status: currentOk ? 'PARTIAL' : current.calculationStatus,
    message: currentOk
      ? 'Current financials calculated. Other scenario comparisons appear when optimisation configuration is approved.'
      : String(current.detail.message || 'Current financials incomplete.'),
    currentMonthlySpend: current.monthlyTotalSecurityCost,
    optimalMonthlySpend: null,
    monthlySavings: null,
    annualSavings: null,
    currentMonthlyLeakage: current.monthlyOperationalLeakage,
    optimalMonthlyLeakage: null,
    monthlyRecoverableValue: current.monthlyRecoverableValue,
    requiredCapitalInvestment: current.requiredCapitalInvestment,
    paybackMonths: current.paybackMonths,
    currentEffectiveness: null,
    optimalEffectiveness: null,
    currentRiskPosition: null,
    optimalRiskPosition: null,
    comparisonAvailable: false,
    comparison: null,
  };

  return { scenarios, cfo, derived, methodology };
}

/** @deprecated Unsafe placeholder — permanently disabled. */
export function scenarioFactors(): never {
  throw new Error(
    'LEGACY scenarioFactors removed: unapproved multipliers must not produce SOMOD results.',
  );
}

export function moneyNumber(value: unknown): number {
  if (typeof value === 'object' && value != null && 'toNumber' in value) {
    return num((value as { toNumber: () => number }).toNumber());
  }
  return num(value);
}
