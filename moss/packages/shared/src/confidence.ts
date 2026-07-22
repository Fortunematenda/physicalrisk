export interface ConfidenceInput {
  answeredQuestions: number;
  totalQuestions: number;
  unknownAnswers: number;
  evidenceSubmitted: number;
  evidenceExpected: number;
  evidenceVerified: number;
  consistencyScore?: number;
}

export function calculateEvidenceConfidence(input: ConfidenceInput): number {
  const completion = input.answeredQuestions / Math.max(1, input.totalQuestions);
  const knownAnswerRatio = 1 - input.unknownAnswers / Math.max(1, input.answeredQuestions);
  const submitted = input.evidenceSubmitted / Math.max(1, input.evidenceExpected);
  const verified = input.evidenceVerified / Math.max(1, input.evidenceExpected);
  const consistency = Math.min(1, Math.max(0, input.consistencyScore ?? 0.5));
  const score = completion * 0.15 + knownAnswerRatio * 0.15 + Math.min(1, submitted) * 0.25 + Math.min(1, verified) * 0.30 + consistency * 0.15;
  return Math.round(Math.min(1, Math.max(0, score)) * 10000) / 10000;
}
