import { describe, expect, it } from 'vitest';
import { calculateAssessmentScore, getRiskBand } from './scoring';

describe('SCLI scoring', () => {
  it('calculates a weighted score without truncating calculation precision', () => {
    const result = calculateAssessmentScore([
      { code: 'Q1', category: 'A', weight: 8, riskScore: 40 },
      { code: 'Q2', category: 'A', weight: 10, riskScore: 80 },
    ]);
    expect(result.overallRiskScore).toBeCloseTo(62.2222222222, 8);
    expect(result.riskBand).toBe('High');
  });

  it('uses workbook risk bands', () => {
    expect(getRiskBand(39.99)).toBe('Controlled');
    expect(getRiskBand(40)).toBe('Moderate');
    expect(getRiskBand(60)).toBe('High');
    expect(getRiskBand(75)).toBe('Critical');
  });
});
