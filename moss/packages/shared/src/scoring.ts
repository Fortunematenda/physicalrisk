import type { AssessmentScore, CategoryScore, QuestionScoreInput, RiskBand } from './types';

export function getRiskBand(score: number): RiskBand {
  if (score >= 75) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Controlled';
}

export function calculateAssessmentScore(items: QuestionScoreInput[]): AssessmentScore {
  if (!items.length) {
    return {
      overallRiskScore: 0,
      maturityScore: 100,
      riskBand: 'Controlled',
      categoryScores: [],
      totalWeightedScore: 0,
      totalWeight: 0,
    };
  }

  const categories = new Map<string, { weightedScore: number; totalWeight: number }>();
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const item of items) {
    const weight = Math.max(0, Number(item.weight) || 0);
    const risk = Math.min(100, Math.max(0, Number(item.riskScore) || 0));
    const weighted = weight * risk;
    totalWeight += weight;
    totalWeightedScore += weighted;
    const current = categories.get(item.category) ?? { weightedScore: 0, totalWeight: 0 };
    current.weightedScore += weighted;
    current.totalWeight += weight;
    categories.set(item.category, current);
  }

  const overallRiskScore = totalWeight ? totalWeightedScore / totalWeight : 0;
  const categoryScores: CategoryScore[] = [...categories.entries()].map(([category, value]) => ({
    category,
    score: value.totalWeight ? value.weightedScore / value.totalWeight : 0,
    weightedScore: value.weightedScore,
    totalWeight: value.totalWeight,
  }));

  return {
    overallRiskScore,
    maturityScore: 100 - overallRiskScore,
    riskBand: getRiskBand(overallRiskScore),
    categoryScores,
    totalWeightedScore,
    totalWeight,
  };
}
