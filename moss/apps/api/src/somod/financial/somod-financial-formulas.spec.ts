import { describe, expect, it } from 'vitest';
import { evaluateSafeExpression } from './somod-safe-expression';
import {
  calculateScenarioFinancials,
  deriveFinancialVariables,
  scenarioFactors,
  validateControlMapping,
  validateFinancialSetup,
} from './somod-financial-formulas';
import { assessMethodologyReadiness } from '../methodology/somod-methodology';

const validCost = {
  currency: 'ZAR',
  monthlyGuardCost: 12000,
  monthlySupervisorCost: 18000,
  daysPerMonth: 30,
  shiftHours: 12,
  responseDelayCostRate: 50,
  defaultIncidentSeverityMultiplier: 2,
  monthlyContractValue: 1_200_000,
  patrolValuePerMiss: 250,
  technologyCapexTotal: 600_000,
  technologyMonthlyOpex: 15_000,
  technologyLifespanMonths: 60,
};

describe('evaluateSafeExpression', () => {
  it('evaluates attendance penalty formula', () => {
    expect(
      evaluateSafeExpression('missed_shifts * daily_guard_cost * 1.5', {
        missed_shifts: 2,
        daily_guard_cost: 400,
      }),
    ).toBe(1200);
  });

  it('blocks Function/eval style payloads', () => {
    expect(() =>
      evaluateSafeExpression('constructor', { constructor: 1 }),
    ).toThrow(/Forbidden/);
  });

  it('blocks unknown identifiers', () => {
    expect(() => evaluateSafeExpression('missed_shifts * evil', { missed_shifts: 1 })).toThrow(
      /Unknown identifier/,
    );
  });

  it('never returns negative values', () => {
    expect(
      evaluateSafeExpression('expected_penalty - applied_penalty', {
        expected_penalty: 100,
        applied_penalty: 250,
      }),
    ).toBe(0);
  });
});

describe('legacy scenarioFactors', () => {
  it('is permanently disabled', () => {
    expect(() => scenarioFactors()).toThrow(/LEGACY scenarioFactors removed/);
  });
});

describe('calculateScenarioFinancials P0', () => {
  it('calculates CURRENT from entered deployment without inventing supervisors', () => {
    const result = calculateScenarioFinancials({
      cost: validCost,
      engines: {
        deploymentCapabilityJson: { headcount: 20, supervisorCount: 2 },
        costEfficiencyJson: { missedShifts: 4, missedPatrols: 0, responseDelayMinutes: 0 },
      },
      mappings: [
        {
          controlId: 'DEP-02',
          financialRelevance: true,
          costCategory: 'manpower_leakage',
          eventUnit: 'missed_shift',
          exposureFormula: 'missed_shifts * daily_guard_cost',
          recoverableFormula: 'expected_penalty - applied_penalty',
          cfoOutputCategory: 'recoverable_value',
          penalty: {
            formulaExpression: 'missed_shifts * daily_guard_cost * 1.5',
            isActive: true,
          },
        },
      ],
    });

    const current = result.scenarios.find((s) => s.scenarioType === 'CURRENT')!;
    expect(current.calculationStatus).toBe('CALCULATED');
    expect(current.monthlyManpowerCost).toBe(20 * 12000 + 2 * 18000);
    expect(current.effectivenessScore).toBeNull();
    expect(current.riskPosition).toBeNull();

    for (const type of ['RISK_ALIGNED', 'COST_EFFICIENT', 'RECOMMENDED_OPTIMAL'] as const) {
      const row = result.scenarios.find((s) => s.scenarioType === type)!;
      expect(row.calculationStatus).toBe('METHODOLOGY_REQUIRED');
      expect(row.monthlyTotalSecurityCost).toBeNull();
    }

    expect(result.cfo.comparisonAvailable).toBe(false);
    expect(result.cfo.monthlySavings).toBeNull();
    expect(result.cfo.optimalMonthlySpend).toBeNull();
  });

  it('does not invent headcount/10 supervisors', () => {
    const result = calculateScenarioFinancials({
      cost: validCost,
      engines: {
        deploymentCapabilityJson: { headcount: 20 },
        costEfficiencyJson: {},
      },
      mappings: [],
    });
    const current = result.scenarios.find((s) => s.scenarioType === 'CURRENT')!;
    expect(current.calculationStatus).toBe('CALCULATED');
    expect(current.monthlyManpowerCost).toBe(20 * 12000);
    expect(current.detail.supervisors).toBe(0);
  });
});

describe('deriveFinancialVariables', () => {
  it('matches handoff derived example', () => {
    const derived = deriveFinancialVariables(validCost);
    expect(derived.dailyGuardCost).toBe(400);
    expect(derived.hourlyGuardCost).toBeCloseTo(33.33, 2);
    expect(derived.monthlyTechnologyEquivalentCost).toBe(25000);
  });
});

describe('validateFinancialSetup', () => {
  it('accepts handoff example variables', () => {
    expect(validateFinancialSetup(validCost)).toEqual([]);
  });

  it('rejects a severity multiplier outside 1–5', () => {
    for (const bad of [9, 0, 5.01, 0.5]) {
      expect(
        validateFinancialSetup({ ...validCost, defaultIncidentSeverityMultiplier: bad }),
      ).toEqual(['Default incident severity multiplier must be between 1 and 5.']);
    }
    expect(validateFinancialSetup({ ...validCost, defaultIncidentSeverityMultiplier: 5 })).toEqual([]);
    expect(validateFinancialSetup({ ...validCost, defaultIncidentSeverityMultiplier: 1.5 })).toEqual([]);
  });

  it('accepts contract values in the millions and rejects values beyond the money limit', () => {
    expect(validateFinancialSetup({ ...validCost, monthlyContractValue: 2_500_000 })).toEqual([]);
    expect(validateFinancialSetup({ ...validCost, monthlyContractValue: 750_000_000.55 })).toEqual([]);
    expect(validateFinancialSetup({ ...validCost, monthlyContractValue: 1e15 })).toEqual([
      'Monthly contract value must not exceed 999,999,999,999.99.',
    ]);
  });

  it('accepts exact amounts that are not multiples of the UI increment', () => {
    expect(
      validateFinancialSetup({ ...validCost, monthlyGuardCost: 12_347.5, monthlySupervisorCost: 18_003 }),
    ).toEqual([]);
  });

  it('rejects more than two decimal places on money', () => {
    expect(validateFinancialSetup({ ...validCost, patrolValuePerMiss: 10.555 })).toEqual([
      'Patrol value per miss allows at most 2 decimal places.',
    ]);
  });

  it('requires whole numbers for days and lifespan instead of silently rounding', () => {
    expect(validateFinancialSetup({ ...validCost, daysPerMonth: 29.5 })).toEqual([
      'Days per month must be a whole number.',
    ]);
    expect(validateFinancialSetup({ ...validCost, technologyLifespanMonths: 12.5 })).toEqual([
      'Technology lifespan months must be a whole number.',
    ]);
  });

  it('reports missing, NaN and infinite values', () => {
    const errors = validateFinancialSetup({
      ...validCost,
      monthlyGuardCost: null as unknown as number,
      responseDelayCostRate: Number.NaN,
      patrolValuePerMiss: Number.POSITIVE_INFINITY,
    });
    expect(errors).toEqual([
      'Monthly guard cost is required.',
      'Response delay cost rate must be a valid number.',
      'Patrol value per miss must be a valid number.',
    ]);
  });

  it('rejects negative rates and unsupported currencies', () => {
    expect(validateFinancialSetup({ ...validCost, responseDelayCostRate: -1 })).toEqual([
      'Response delay cost rate must be between 0 and 999,999,999,999.99.',
    ]);
    expect(validateFinancialSetup({ ...validCost, currency: 'XYZ' })[0]).toMatch(/^Currency must be one of ZAR/);
    expect(validateFinancialSetup({ ...validCost, currency: 'usd' })).toEqual([]);
  });

  it('requires a lifespan when CAPEX is entered', () => {
    expect(
      validateFinancialSetup({ ...validCost, technologyLifespanMonths: null }),
    ).toEqual(['Technology lifespan months is mandatory when technology CAPEX is entered.']);
    expect(
      validateFinancialSetup({ ...validCost, technologyCapexTotal: 0, technologyLifespanMonths: null }),
    ).toEqual([]);
  });
});

describe('validateControlMapping', () => {
  it('requires categories when financially relevant', () => {
    expect(
      validateControlMapping({
        financialRelevance: true,
        costCategory: null,
        eventUnit: null,
        cfoOutputCategory: null,
      }).length,
    ).toBe(3);
  });
});

describe('assessMethodologyReadiness', () => {
  it('reports METHODOLOGY_REQUIRED for engine slots', () => {
    const r = assessMethodologyReadiness({ hasFinancialModel: true, hasActivePenalties: true });
    expect(r.status).toBe('PARTIALLY_CONFIGURED');
    expect(r.missing).toContain('optimisation_objective');
    expect(r.ready).toBe(false);
  });
});
