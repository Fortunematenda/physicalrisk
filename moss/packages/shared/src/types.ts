export type RiskBand = 'Controlled' | 'Moderate' | 'High' | 'Critical';

export interface QuestionScoreInput {
  code: string;
  category: string;
  weight: number;
  riskScore: number;
  responseLabel?: string;
}

export interface CategoryScore {
  category: string;
  score: number;
  weightedScore: number;
  totalWeight: number;
}

export interface AssessmentScore {
  overallRiskScore: number;
  maturityScore: number;
  riskBand: RiskBand;
  categoryScores: CategoryScore[];
  totalWeightedScore: number;
  totalWeight: number;
}

export interface ScliCalibrationInput {
  annualSecurityContractValue: number;
  protectedPremises: number;
  guardForce: number;
  internalSecurityTeamSize: number;
  integratedTechnologyCoverage: number;
  technologySlaVerification: number;
  manualRecordReliance: number;
  surveillanceCoverage: number;
  accessControlCoverage: number;
  realtimePatrolCoverage: number;
  delayedPatrolReporting: number;
  supervisoryProof: number;
  attendanceProof: number;
  allowanceFlags: boolean[];
}

export interface ScliAssumptions {
  minimumLeakageBaseFloor: number;
  minimumManualRecordWeight: number;
  minimumDelayedReportingWeight: number;
  minimumSupervisoryProofGapWeight: number;
  minimumAttendanceProofGapWeight: number;
  minimumInternalCapacityGapWeight: number;
  minimumScaleComplexityWeight: number;
  minimumAllowanceComplexityWeight: number;
  likelySurveillanceGapWeight: number;
  likelyAccessControlGapWeight: number;
  likelyElectronicRecordGapWeight: number;
  likelyRealtimePatrolGapWeight: number;
  likelyManualRecordWeight: number;
  likelyScaleComplexityWeight: number;
  likelyAllowanceComplexityWeight: number;
  maximumManualRecordWeight: number;
  maximumDelayedReportingWeight: number;
  maximumSupervisoryProofGapWeight: number;
  maximumAttendanceProofGapWeight: number;
  maximumSurveillanceGapWeight: number;
  maximumElectronicRecordGapWeight: number;
  maximumInternalCapacityGapWeight: number;
  maximumAllowanceComplexityWeight: number;
  guardForceSaturationPoint: number;
  annualCostSaturationPoint: number;
  protectedPremisesSaturationPoint: number;
  geographicalFootprintSaturationPoint: number;
  targetSitesPerInternalStaff: number;
  minimumLeakageCap: number;
  likelyLeakageCap: number;
  maximumExposureCap: number;
  recoverableLowFactor: number;
  recoverableHighFactor: number;
}

export interface LeakageResult {
  geographicalFootprint: number;
  surveillanceGap: number;
  accessControlGap: number;
  electronicRecordMonitoringGap: number;
  manualRecordRisk: number;
  realtimePatrolGap: number;
  delayedPatrolRisk: number;
  requiredInternalHeadcount: number;
  internalCapacityGap: number;
  supervisoryProofGap: number;
  attendanceProofGap: number;
  allowanceComplexity: number;
  scaleComplexity: number;
  coverageQuality: number;
  methodologyConfidence: number;
  minimumLeakageRate: number;
  likelyLeakageRate: number;
  maximumExposureRate: number;
  minimumLeakageValue: number;
  likelyLeakageValue: number;
  maximumExposureValue: number;
  recoverableLow: number;
  recoverableHigh: number;
  likelyLeakagePerPremise: number;
  contractValuePerPremise: number;
}
