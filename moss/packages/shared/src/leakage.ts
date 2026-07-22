import type { LeakageResult, ScliAssumptions, ScliCalibrationInput } from './types';

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number(value) || 0));
const safe = (value: number) => Math.max(0, Number(value) || 0);
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export function calculateLeakage(
  input: ScliCalibrationInput,
  assumptions: ScliAssumptions,
  overallRiskScore: number,
): LeakageResult {
  const annualValue = safe(input.annualSecurityContractValue);
  const premises = safe(input.protectedPremises);
  const guardForce = safe(input.guardForce);
  const geographicalFootprint = Math.min(9, premises / 50);
  const surveillanceGap = 1 - clamp01(input.surveillanceCoverage);
  const accessControlGap = 1 - clamp01(input.accessControlCoverage);
  const electronicRecordMonitoringGap = 1 - clamp01(input.integratedTechnologyCoverage);
  const manualRecordRisk = clamp01(input.manualRecordReliance);
  const realtimePatrolGap = 1 - clamp01(input.realtimePatrolCoverage);
  const delayedPatrolRisk = clamp01(input.delayedPatrolReporting);
  const requiredInternalHeadcount = Math.max(1, Math.ceil(premises / assumptions.targetSitesPerInternalStaff));
  const internalCapacityGap = Math.max(0, (requiredInternalHeadcount - safe(input.internalSecurityTeamSize)) / requiredInternalHeadcount);
  const supervisoryProofGap = 1 - clamp01(input.supervisoryProof);
  const attendanceProofGap = 1 - clamp01(input.attendanceProof);
  const allowanceComplexity = average((input.allowanceFlags || []).map(flag => flag ? 1 : 0));
  const guardScale = Math.min(1, guardForce / assumptions.guardForceSaturationPoint);
  const costScale = Math.min(1, annualValue / assumptions.annualCostSaturationPoint);
  const premisesScale = Math.min(1, premises / assumptions.protectedPremisesSaturationPoint);
  const footprintScale = Math.min(1, geographicalFootprint / assumptions.geographicalFootprintSaturationPoint);
  const scaleComplexity = average([guardScale, costScale, premisesScale, footprintScale]);
  const questionnaireRiskFactor = clamp01(overallRiskScore / 100);
  const coverageQuality = average([
    clamp01(input.integratedTechnologyCoverage),
    clamp01(input.technologySlaVerification),
    clamp01(input.supervisoryProof),
    clamp01(input.attendanceProof),
  ]);

  const minimumLeakageRate = Math.min(
    assumptions.minimumLeakageCap,
    assumptions.minimumLeakageBaseFloor
      + manualRecordRisk * assumptions.minimumManualRecordWeight
      + delayedPatrolRisk * assumptions.minimumDelayedReportingWeight
      + supervisoryProofGap * assumptions.minimumSupervisoryProofGapWeight
      + attendanceProofGap * assumptions.minimumAttendanceProofGapWeight
      + internalCapacityGap * assumptions.minimumInternalCapacityGapWeight
      + scaleComplexity * assumptions.minimumScaleComplexityWeight
      + allowanceComplexity * assumptions.minimumAllowanceComplexityWeight,
  );

  const likelyLeakageRate = Math.min(
    assumptions.likelyLeakageCap,
    minimumLeakageRate
      + surveillanceGap * assumptions.likelySurveillanceGapWeight
      + accessControlGap * assumptions.likelyAccessControlGapWeight
      + electronicRecordMonitoringGap * assumptions.likelyElectronicRecordGapWeight
      + realtimePatrolGap * assumptions.likelyRealtimePatrolGapWeight
      + manualRecordRisk * assumptions.likelyManualRecordWeight
      + scaleComplexity * assumptions.likelyScaleComplexityWeight
      + allowanceComplexity * assumptions.likelyAllowanceComplexityWeight
      + questionnaireRiskFactor * 0.03,
  );

  const maximumExposureRate = Math.min(
    assumptions.maximumExposureCap,
    likelyLeakageRate
      + manualRecordRisk * assumptions.maximumManualRecordWeight
      + delayedPatrolRisk * assumptions.maximumDelayedReportingWeight
      + supervisoryProofGap * assumptions.maximumSupervisoryProofGapWeight
      + attendanceProofGap * assumptions.maximumAttendanceProofGapWeight
      + surveillanceGap * assumptions.maximumSurveillanceGapWeight
      + electronicRecordMonitoringGap * assumptions.maximumElectronicRecordGapWeight
      + internalCapacityGap * assumptions.maximumInternalCapacityGapWeight
      + allowanceComplexity * assumptions.maximumAllowanceComplexityWeight
      + questionnaireRiskFactor * 0.04,
  );

  const minimumLeakageValue = annualValue * minimumLeakageRate;
  const likelyLeakageValue = annualValue * likelyLeakageRate;
  const maximumExposureValue = annualValue * maximumExposureRate;

  return {
    geographicalFootprint,
    surveillanceGap,
    accessControlGap,
    electronicRecordMonitoringGap,
    manualRecordRisk,
    realtimePatrolGap,
    delayedPatrolRisk,
    requiredInternalHeadcount,
    internalCapacityGap,
    supervisoryProofGap,
    attendanceProofGap,
    allowanceComplexity,
    scaleComplexity,
    coverageQuality,
    methodologyConfidence: Math.max(0.35, Math.min(0.9, coverageQuality)),
    minimumLeakageRate,
    likelyLeakageRate,
    maximumExposureRate,
    minimumLeakageValue,
    likelyLeakageValue,
    maximumExposureValue,
    recoverableLow: minimumLeakageValue * assumptions.recoverableLowFactor,
    recoverableHigh: likelyLeakageValue * assumptions.recoverableHighFactor,
    likelyLeakagePerPremise: likelyLeakageValue / Math.max(1, premises),
    contractValuePerPremise: annualValue / Math.max(1, premises),
  };
}
