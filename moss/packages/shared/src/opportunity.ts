export interface OpportunityInput {
  overallRiskScore: number;
  annualContractValue: number;
  likelyLeakageValue: number;
  recoverableHigh: number;
  executiveAssuranceScore: number;
  executiveUrgency?: number;
  engagementReadiness?: number;
  evidenceConfidence?: number;
}

const clamp100 = (value: number) => Math.min(100, Math.max(0, Number(value) || 0));

export function calculateOpportunityScore(input: OpportunityInput): number {
  const financialMateriality = clamp100((input.likelyLeakageValue / Math.max(1, input.annualContractValue)) / 0.12 * 100);
  const recoverability = clamp100((input.recoverableHigh / Math.max(1, input.likelyLeakageValue)) * 100);
  const raw = clamp100(input.overallRiskScore) * 0.25
    + financialMateriality * 0.25
    + clamp100(input.executiveAssuranceScore) * 0.20
    + recoverability * 0.15
    + clamp100(input.executiveUrgency ?? 50) * 0.10
    + clamp100(input.engagementReadiness ?? 50) * 0.05;
  const confidenceModifier = 0.7 + Math.min(1, Math.max(0, input.evidenceConfidence ?? 0.5)) * 0.3;
  return Math.round(raw * confidenceModifier * 100) / 100;
}
