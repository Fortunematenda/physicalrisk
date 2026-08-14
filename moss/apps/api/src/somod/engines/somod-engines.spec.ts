import { describe, expect, it } from 'vitest';
import { sanitizeEnginePayload } from './somod-engines';

describe('sanitizeEnginePayload', () => {
  it('captures risk requirement text without inventing scores', () => {
    const cleaned = sanitizeEnginePayload('RISK_REQUIREMENT', {
      threatSummary: '  perimeter intrusion  ',
      assetSummary: 'warehouse',
      documentedRequirements: 'SOP-01',
      notes: '  hello  ',
    });
    expect(cleaned).toEqual({
      threatSummary: 'perimeter intrusion',
      assetSummary: 'warehouse',
      documentedRequirements: 'SOP-01',
      notes: 'hello',
      residualRisk: null,
      controlCoverage: null,
    });
  });

  it('does not invent residual risk defaults', () => {
    const cleaned = sanitizeEnginePayload('RISK_REQUIREMENT', {});
    expect(cleaned.residualRisk).toBeNull();
    expect(cleaned.controlCoverage).toBeNull();
  });

  it('stores explicit deployment headcount and supervisors only', () => {
    const cleaned = sanitizeEnginePayload('DEPLOYMENT_CAPABILITY', {
      headcount: 20,
      supervisorCount: 2,
      posts: 'Gate A',
      shiftPatterns: '2x12',
    });
    expect(cleaned).toMatchObject({
      headcount: 20,
      supervisorCount: 2,
      posts: 'Gate A',
      shiftPatterns: '2x12',
    });
    expect(cleaned.coveragePercent).toBeNull();
  });

  it('keeps leakage event counts for financial calculation', () => {
    const cleaned = sanitizeEnginePayload('COST_EFFICIENCY', {
      missedShifts: 4,
      missedPatrols: 2,
      responseDelayMinutes: 15,
    });
    expect(cleaned).toMatchObject({
      missedShifts: 4,
      missedPatrols: 2,
      responseDelayMinutes: 15,
      leakagePercent: null,
    });
  });

  it('does not invent optimisation preferredBalance', () => {
    const cleaned = sanitizeEnginePayload('OPTIMISATION_TRADEOFF', { notes: 'pending' });
    expect(cleaned).toEqual({ notes: 'pending', preferredBalance: null });
  });
});
