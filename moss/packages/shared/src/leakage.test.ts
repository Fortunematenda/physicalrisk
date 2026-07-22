import { describe, expect, it } from 'vitest';
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

const calibration: ScliCalibrationInput = {
  annualSecurityContractValue: 10_000_000,
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

describe('SCLI leakage calculations', () => {
  it('returns ordered min ≤ likely ≤ max exposure values', () => {
    const result = calculateLeakage(calibration, assumptions, 62);
    expect(result.minimumLeakageValue).toBeLessThanOrEqual(result.likelyLeakageValue);
    expect(result.likelyLeakageValue).toBeLessThanOrEqual(result.maximumExposureValue);
    expect(result.recoverableLow).toBeLessThanOrEqual(result.recoverableHigh);
    expect(result.methodologyConfidence).toBeGreaterThan(0);
    expect(result.methodologyConfidence).toBeLessThanOrEqual(1);
  });

  it('scales with annual contract value', () => {
    const low = calculateLeakage({ ...calibration, annualSecurityContractValue: 1_000_000 }, assumptions, 62);
    const high = calculateLeakage({ ...calibration, annualSecurityContractValue: 20_000_000 }, assumptions, 62);
    expect(high.likelyLeakageValue).toBeGreaterThan(low.likelyLeakageValue);
  });
});
