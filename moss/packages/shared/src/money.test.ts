import { describe, expect, it } from 'vitest';
import { asFiniteNumber, formatZar, parseMoneyNumber } from './money';
import { calculateLeakage } from './leakage';
import type { ScliAssumptions, ScliCalibrationInput } from './types';

const assumptions: ScliAssumptions = {
  targetSitesPerInternalStaff: 25,
  guardForceSaturationPoint: 500,
  annualCostSaturationPoint: 50_000_000,
  protectedPremisesSaturationPoint: 200,
  geographicalFootprintSaturationPoint: 9,
  minimumLeakageCap: 0.12,
  minimumLeakageBaseFloor: 0.01,
  minimumManualRecordWeight: 0.02,
  minimumDelayedReportingWeight: 0.015,
  minimumSupervisoryProofGapWeight: 0.015,
  minimumAttendanceProofGapWeight: 0.015,
  minimumInternalCapacityGapWeight: 0.02,
  minimumScaleComplexityWeight: 0.01,
  minimumAllowanceComplexityWeight: 0.01,
  likelyLeakageCap: 0.25,
  likelySurveillanceGapWeight: 0.03,
  likelyAccessControlGapWeight: 0.025,
  likelyElectronicRecordGapWeight: 0.02,
  likelyRealtimePatrolGapWeight: 0.02,
  likelyManualRecordWeight: 0.02,
  likelyScaleComplexityWeight: 0.015,
  likelyAllowanceComplexityWeight: 0.015,
  maximumExposureCap: 0.4,
  maximumManualRecordWeight: 0.03,
  maximumDelayedReportingWeight: 0.025,
  maximumSupervisoryProofGapWeight: 0.02,
  maximumAttendanceProofGapWeight: 0.02,
  maximumSurveillanceGapWeight: 0.03,
  maximumElectronicRecordGapWeight: 0.02,
  maximumInternalCapacityGapWeight: 0.025,
  maximumAllowanceComplexityWeight: 0.02,
  recoverableLowFactor: 0.25,
  recoverableHighFactor: 0.65,
};

const baseCalibration: ScliCalibrationInput = {
  annualSecurityContractValue: 10_000_000,
  estimatedLossesLow: 0,
  estimatedLossesHigh: 0,
  protectedPremises: 40,
  guardForce: 120,
  internalSecurityTeamSize: 2,
  surveillanceCoverage: 0.6,
  accessControlCoverage: 0.5,
  integratedTechnologyCoverage: 0.4,
  technologySlaVerification: 0.5,
  manualRecordReliance: 0.4,
  realtimePatrolCoverage: 0.5,
  delayedPatrolReporting: 0.3,
  supervisoryProof: 0.5,
  attendanceProof: 0.5,
  allowanceFlags: [true, false, true, false, false],
};

/**
 * Regression: SCL R0 defect — monetary loss path
 * Input → stored numeric → calculated leakage echo → report DTO fields → PDF ZAR text
 */
describe('SCL monetary path (R0 defect regression)', () => {
  const cases: Array<{ label: string; input: unknown; stored: number | null; pdf: string }> = [
    { label: 'R50,000', input: 'R50,000', stored: 50_000, pdf: 'R50,000' },
    { label: 'R250,000', input: 'R250,000', stored: 250_000, pdf: 'R250,000' },
    { label: 'R1,200,000', input: 'R1,200,000', stored: 1_200_000, pdf: 'R1,200,000' },
    { label: 'R10,000,000', input: 'R10,000,000', stored: 10_000_000, pdf: 'R10,000,000' },
    { label: 'empty/not answered', input: '', stored: null, pdf: '—' },
  ];

  it.each(cases)('$label: parse → store → calc echo → formatZar', ({ input, stored, pdf }) => {
    // Input → parse (what API/frontend should persist)
    const parsed = parseMoneyNumber(input);
    expect(parsed).toBe(stored);

    // Stored value used in evaluate mapping (asFiniteNumber for calc; null→0 for leakage echo)
    const forCalc = asFiniteNumber(parsed, 0);
    expect(forCalc).toBe(stored ?? 0);

    // Calculated leakage result echoes C6/C7 estimates
    const leakage = calculateLeakage(
      {
        ...baseCalibration,
        annualSecurityContractValue: 10_000_000,
        estimatedLossesLow: forCalc,
        estimatedLossesHigh: forCalc,
      },
      assumptions,
      62,
    );
    expect(leakage.estimatedLossesLow).toBe(stored ?? 0);
    expect(leakage.estimatedLossesHigh).toBe(stored ?? 0);

    // When losses were answered, model leakage from C5 must not collapse to R0
    if (stored !== null && stored > 0) {
      expect(leakage.likelyLeakageValue).toBeGreaterThan(0);
      expect(formatZar(leakage.likelyLeakageValue)).not.toBe('R0');
      expect(formatZar(leakage.likelyLeakageValue)).toMatch(/^R[\d,]+$/);
    }

    // Report DTO / PDF display string
    expect(formatZar(stored)).toBe(pdf);
  });

  it('does not treat formatted C5 contract value as 0 (legacy Number() bug)', () => {
    const c5 = asFiniteNumber('R10,000,000', 0);
    expect(c5).toBe(10_000_000);
    const leakage = calculateLeakage({ ...baseCalibration, annualSecurityContractValue: c5 }, assumptions, 62);
    expect(leakage.minimumLeakageValue).toBeGreaterThan(0);
    expect(leakage.likelyLeakageValue).toBeGreaterThan(0);
    expect(formatZar(leakage.likelyLeakageValue)).not.toBe('R0');
  });

  it('formatZar matches required SA thousands separators', () => {
    expect(formatZar(1_200_000)).toBe('R1,200,000');
    expect(formatZar(250_000)).toBe('R250,000');
    expect(formatZar(null)).toBe('—');
    expect(formatZar(undefined)).toBe('—');
  });
});
