/**
 * SOMOD methodology readiness — never invent weights or optimisation coefficients.
 */

export type MethodologyStatus =
  | 'CONFIGURED'
  | 'PARTIALLY_CONFIGURED'
  | 'METHODOLOGY_REQUIRED'
  | 'INVALID_CONFIGURATION';

export type MethodologyComponent =
  | 'risk_requirement_rules'
  | 'deployment_derivation_rules'
  | 'technology_substitution_rules'
  | 'optimisation_objective'
  | 'optimisation_constraints'
  | 'effectiveness_scoring'
  | 'risk_position_scoring'
  | 'scenario_risk_aligned_rules'
  | 'scenario_cost_efficient_rules'
  | 'scenario_recommended_optimal_rules'
  | 'financial_penalty_formulas'
  | 'financial_cost_variables';

export type MethodologyReadiness = {
  status: MethodologyStatus;
  ready: boolean;
  missing: MethodologyComponent[];
  configured: MethodologyComponent[];
  message: string;
};

/** Registry of methodology slots — all start unconfigured until client supplies them. */
export const SOMOD_METHODOLOGY_SLOTS: MethodologyComponent[] = [
  'risk_requirement_rules',
  'deployment_derivation_rules',
  'technology_substitution_rules',
  'optimisation_objective',
  'optimisation_constraints',
  'effectiveness_scoring',
  'risk_position_scoring',
  'scenario_risk_aligned_rules',
  'scenario_cost_efficient_rules',
  'scenario_recommended_optimal_rules',
];

/**
 * Assess readiness. Optional `configured` set comes from DB registry when present.
 * Financial cost variables and seeded penalty formulas are considered available for CURRENT only.
 */
export function assessMethodologyReadiness(input?: {
  configuredComponents?: MethodologyComponent[];
  hasFinancialModel?: boolean;
  hasActivePenalties?: boolean;
}): MethodologyReadiness {
  const configured = new Set<MethodologyComponent>(input?.configuredComponents || []);
  if (input?.hasFinancialModel) configured.add('financial_cost_variables');
  if (input?.hasActivePenalties) configured.add('financial_penalty_formulas');

  const missing = SOMOD_METHODOLOGY_SLOTS.filter((s) => !configured.has(s));
  const configuredList = [...configured];

  if (missing.length === SOMOD_METHODOLOGY_SLOTS.length && !configured.has('financial_cost_variables')) {
    return {
      status: 'METHODOLOGY_REQUIRED',
      ready: false,
      missing: [...SOMOD_METHODOLOGY_SLOTS, 'financial_cost_variables'],
      configured: configuredList,
      message: 'Financial setup is required before Current scenario results can be calculated.',
    };
  }

  if (missing.length > 0) {
    return {
      status: configured.has('financial_cost_variables')
        ? 'PARTIALLY_CONFIGURED'
        : 'METHODOLOGY_REQUIRED',
      ready: false,
      missing,
      configured: configuredList,
      message:
        'Optimisation scenarios beyond Current require approved configuration. Current financials can be calculated when financial setup is complete.',
    };
  }

  return {
    status: 'CONFIGURED',
    ready: true,
    missing: [],
    configured: configuredList,
    message: 'All methodology components are configured.',
  };
}

export function methodologyRequiredPayload(missing: MethodologyComponent[]) {
  return {
    status: 'METHODOLOGY_REQUIRED' as const,
    ready: false,
    missing,
  };
}
