/**
 * SOMOD engine input helpers (handoff §3).
 * Calculation lives in financial/somod-financial-formulas.ts — not here.
 *
 * P0: sanitize preserves structured input capture only.
 * Do not invent residual-risk, coverage, automation, or optimisation weights.
 */

export type EngineKey =
  | 'RISK_REQUIREMENT'
  | 'DEPLOYMENT_CAPABILITY'
  | 'TECHNOLOGY'
  | 'COST_EFFICIENCY'
  | 'OPTIMISATION_TRADEOFF';

export type SomodScenarioKind =
  | 'CURRENT'
  | 'RISK_ALIGNED'
  | 'COST_EFFICIENT'
  | 'RECOMMENDED_OPTIMAL';

export const ENGINE_FIELD_KEY: Record<EngineKey, string> = {
  RISK_REQUIREMENT: 'riskRequirementJson',
  DEPLOYMENT_CAPABILITY: 'deploymentCapabilityJson',
  TECHNOLOGY: 'technologyJson',
  COST_EFFICIENCY: 'costEfficiencyJson',
  OPTIMISATION_TRADEOFF: 'optimisationTradeoffJson',
};

/** Scenario labels for UI / financial output display (handoff §1). */
export const DEFAULT_SCENARIOS: Array<{
  scenarioType: SomodScenarioKind;
  label: string;
  sortOrder: number;
  summary: string;
}> = [
  {
    scenarioType: 'CURRENT',
    label: 'Current',
    sortOrder: 1,
    summary: 'Baseline operating model from entered current-state data.',
  },
  {
    scenarioType: 'RISK_ALIGNED',
    label: 'Risk-Aligned',
    sortOrder: 2,
    summary: 'Requires approved derivation configuration.',
  },
  {
    scenarioType: 'COST_EFFICIENT',
    label: 'Cost-Efficient',
    sortOrder: 3,
    summary: 'Requires approved optimisation configuration.',
  },
  {
    scenarioType: 'RECOMMENDED_OPTIMAL',
    label: 'Recommended Optimal',
    sortOrder: 4,
    summary: 'Requires approved optimisation objective and constraints.',
  },
];

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

/** Sanitize engine JSON inputs that feed calculate-financials / capture. */
export function sanitizeEnginePayload(engineKey: EngineKey, raw: Record<string, unknown>) {
  if (engineKey === 'RISK_REQUIREMENT') {
    return {
      threatSummary: str(raw.threatSummary),
      assetSummary: str(raw.assetSummary),
      documentedRequirements: str(raw.documentedRequirements),
      notes: str(raw.notes),
      // Legacy fields retained if already stored; never invented on empty save.
      residualRisk: optionalNum(raw.residualRisk),
      controlCoverage: optionalNum(raw.controlCoverage),
    };
  }
  if (engineKey === 'DEPLOYMENT_CAPABILITY') {
    return {
      headcount: Math.max(0, Math.round(num(raw.headcount, 0))),
      supervisorCount: Math.max(0, Math.round(num(raw.supervisorCount ?? raw.supervisors, 0))),
      posts: str(raw.posts),
      shiftPatterns: str(raw.shiftPatterns),
      notes: str(raw.notes),
      // Legacy observational field — not used as methodology coverage score.
      coveragePercent: optionalNum(raw.coveragePercent),
    };
  }
  if (engineKey === 'TECHNOLOGY') {
    return {
      systemsSummary: str(raw.systemsSummary),
      technologyCapex: optionalNum(raw.technologyCapex),
      technologyMonthlyOpex: optionalNum(raw.technologyMonthlyOpex),
      notes: str(raw.notes),
      automationPercent: optionalNum(raw.automationPercent),
      techDebt: optionalNum(raw.techDebt),
    };
  }
  if (engineKey === 'COST_EFFICIENCY') {
    return {
      missedShifts: Math.max(0, Math.round(num(raw.missedShifts, 0))),
      missedPatrols: Math.max(0, Math.round(num(raw.missedPatrols, 0))),
      responseDelayMinutes: Math.max(0, num(raw.responseDelayMinutes, 0)),
      notes: str(raw.notes),
      // Leakage % is not an approved effectiveness methodology input.
      leakagePercent: optionalNum(raw.leakagePercent),
    };
  }
  return {
    notes: str(raw.notes),
    // Preferred balance is not a substitute for Engine 5 objective configuration.
    preferredBalance:
      raw.preferredBalance === 'risk' ||
      raw.preferredBalance === 'cost' ||
      raw.preferredBalance === 'balanced'
        ? raw.preferredBalance
        : null,
  };
}
