/**
 * Executive Advisory Diagnostic — structured diagnostic criteria scoring.
 *
 * Aligns with Executive Triage assurance semantics:
 * - High score = strong / controlled assurance
 * - Low score  = poor / high concern
 *
 * Persisted module `exposureRating` remains the legacy exposure mirror
 * (100 − assurance) so existing route-priority logic stays compatible.
 */

import {
  assuranceToExposureIndicator,
  clampScore,
  getAssuranceBand,
  type AssuranceBand,
  type EgtAssuranceVisual,
  resolveEgtAssuranceVisual,
} from './egt-assurance-scoring';
import { getRiskBand } from './scoring';
import type { RiskBand } from './types';

/** Likert scale shared across EAD diagnostic criteria. */
export const EAD_LIKERT_OPTIONS = [
  { value: 'NEVER', label: 'Never', shortLabel: 'Never' },
  { value: 'RARELY', label: 'Rarely', shortLabel: 'Rarely' },
  { value: 'SOMETIMES', label: 'Sometimes', shortLabel: 'Sometimes' },
  { value: 'MOSTLY', label: 'Mostly', shortLabel: 'Mostly' },
  { value: 'ALWAYS', label: 'Always', shortLabel: 'Always' },
  { value: 'NA', label: 'N/A', shortLabel: 'N/A' },
] as const;

export type EadLikertValue = (typeof EAD_LIKERT_OPTIONS)[number]['value'];

/**
 * Assurance contribution per answer (high = good).
 * Mirrors triage direction after exposure→assurance inversion
 * (Never ≈ exposure 100 → assurance 0; Always ≈ exposure 0 → assurance 100).
 */
export const EAD_LIKERT_ASSURANCE_SCORES: Record<Exclude<EadLikertValue, 'NA'>, number> = {
  NEVER: 0,
  RARELY: 25,
  SOMETIMES: 50,
  MOSTLY: 75,
  ALWAYS: 100,
};

export type EadDiagnosticCriterion = {
  code: string;
  title: string;
  question: string;
  allowNa: boolean;
  /** Defaults to true when omitted (Stage 1 behaviour). */
  isRequired?: boolean;
  helpText?: string | null;
};

/** Modules that use structured diagnostic scoring (all EAD working-paper modules). */
export const EAD_DIAGNOSTIC_MODULE_CODES = [
  'GOVERNANCE',
  'FINANCIAL',
  'CONTRACTUAL',
  'REPORTING',
  'RESILIENCE',
  'CONSEQUENCE',
] as const;

export type EadDiagnosticModuleCode = (typeof EAD_DIAGNOSTIC_MODULE_CODES)[number];

export const GOVERNANCE_CRITERIA: readonly EadDiagnosticCriterion[] = [
  {
    code: 'ASSIGNED',
    title: 'Assigned',
    question: 'Is accountability for security and risk outcomes clearly assigned to named executives?',
    allowNa: false,
  },
  {
    code: 'EXERCISED',
    title: 'Exercised',
    question: 'Do accountable executives actively exercise oversight through reviews, decisions and interventions?',
    allowNa: false,
  },
  {
    code: 'INDEPENDENT_TEST',
    title: 'Independently tested',
    question: 'Is accountability independently tested or challenged (for example by audit, assurance or the board)?',
    allowNa: false,
  },
  {
    code: 'REMEDIATION',
    title: 'Remediation',
    question: 'When accountability gaps are identified, are they escalated and remediated?',
    allowNa: false,
  },
] as const;

export const FINANCIAL_CRITERIA: readonly EadDiagnosticCriterion[] = [
  {
    code: 'TRACEABILITY',
    title: 'Traceability',
    question: 'Can security expenditure be traced to approved budgets, purchase orders and invoices?',
    allowNa: false,
  },
  {
    code: 'JUSTIFICATION',
    title: 'Justification',
    question: 'Is expenditure justified against a defined risk need or approved business case?',
    allowNa: false,
  },
  {
    code: 'VALUE_RECEIVED',
    title: 'Value received',
    question: 'Can delivered services or outcomes be evidenced against what was paid for?',
    allowNa: false,
  },
  {
    code: 'VARIANCE',
    title: 'Variance management',
    question: 'Where material spend variances arise, are they investigated and corrected?',
    allowNa: true,
  },
] as const;

export const CONTRACTUAL_CRITERIA: readonly EadDiagnosticCriterion[] = [
  {
    code: 'MEASURABLE',
    title: 'Measurable',
    question: 'Are contractual obligations defined in clear, measurable terms?',
    allowNa: false,
  },
  {
    code: 'MONITORED',
    title: 'Monitored',
    question: 'Is performance against contractual obligations actively monitored?',
    allowNa: false,
  },
  {
    code: 'ENFORCEABLE',
    title: 'Enforceable',
    question: 'Are contractual remedies and enforcement rights clear and usable in practice?',
    allowNa: false,
  },
  {
    code: 'APPLIED',
    title: 'Applied',
    question: 'Where obligations are missed, are contractual remedies applied?',
    allowNa: true,
  },
] as const;

export const REPORTING_CRITERIA: readonly EadDiagnosticCriterion[] = [
  {
    code: 'COMPLETE',
    title: 'Complete',
    question: 'Does executive reporting cover material risks, incidents and assurance gaps?',
    allowNa: false,
  },
  {
    code: 'RELIABLE',
    title: 'Reliable',
    question: 'Is reported information verified or supported by evidence before escalation?',
    allowNa: false,
  },
  {
    code: 'TIMELY',
    title: 'Timely',
    question: 'Is information provided in time for executives to act?',
    allowNa: false,
  },
  {
    code: 'DECISION_USEFUL',
    title: 'Decision-useful',
    question: 'Do executives use reporting to drive decisions and follow-up actions?',
    allowNa: false,
  },
] as const;

export const RESILIENCE_CRITERIA: readonly EadDiagnosticCriterion[] = [
  {
    code: 'DEPENDENCY_MAPPED',
    title: 'Dependencies mapped',
    question: 'Are critical service and technology dependencies identified and mapped?',
    allowNa: false,
  },
  {
    code: 'WARNING_INDICATORS',
    title: 'Early warning',
    question: 'Are early-warning indicators or monitoring in place for critical dependencies?',
    allowNa: false,
  },
  {
    code: 'FAILURE_RESPONSE',
    title: 'Failure response',
    question: 'Are failure-response and continuity arrangements defined and tested?',
    allowNa: false,
  },
  {
    code: 'SINGLE_POINTS',
    title: 'Single points of failure',
    question: 'Are known single points of failure mitigated or formally accepted?',
    allowNa: true,
  },
] as const;

export const CONSEQUENCE_CRITERIA: readonly EadDiagnosticCriterion[] = [
  {
    code: 'CORRECTION',
    title: 'Correction',
    question: 'When failures occur, are corrective actions consistently implemented?',
    allowNa: false,
  },
  {
    code: 'RECOVERY',
    title: 'Recovery',
    question: 'When failures occur, are recovery actions consistently completed and verified?',
    allowNa: false,
  },
  {
    code: 'PENALTIES',
    title: 'Penalties',
    question: 'Where contractually applicable, are penalties or consequences consistently applied for failures?',
    allowNa: true,
  },
  {
    code: 'ESCALATION',
    title: 'Escalation',
    question: 'Are material or repeated failures appropriately escalated to management/executive level?',
    allowNa: false,
  },
] as const;

export type ConsequenceCriterionCode = (typeof CONSEQUENCE_CRITERIA)[number]['code'];

export const EAD_MODULE_CRITERIA: Record<EadDiagnosticModuleCode, readonly EadDiagnosticCriterion[]> = {
  GOVERNANCE: GOVERNANCE_CRITERIA,
  FINANCIAL: FINANCIAL_CRITERIA,
  CONTRACTUAL: CONTRACTUAL_CRITERIA,
  REPORTING: REPORTING_CRITERIA,
  RESILIENCE: RESILIENCE_CRITERIA,
  CONSEQUENCE: CONSEQUENCE_CRITERIA,
};

export function isEadDiagnosticModuleCode(value: unknown): value is EadDiagnosticModuleCode {
  return typeof value === 'string' && (EAD_DIAGNOSTIC_MODULE_CODES as readonly string[]).includes(value);
}

export function getEadModuleCriteria(moduleCode: string): readonly EadDiagnosticCriterion[] | null {
  if (!isEadDiagnosticModuleCode(moduleCode)) return null;
  return EAD_MODULE_CRITERIA[moduleCode];
}

export type EadDiagnosticAnswers = Partial<Record<string, EadLikertValue | null>>;

export type EadDiagnosticResponseSnapshot = {
  version: 1;
  moduleCode: string;
  answers: EadDiagnosticAnswers;
  /** Per-criterion contribution at save time (auditable). */
  criterionScores: Array<{
    code: string;
    value: EadLikertValue;
    assuranceScore: number | null;
  }>;
  calculatedAssuranceScore: number | null;
  calculatedExposureIndicator: number | null;
  calculatedAt: string;
};

export type EadDiagnosticScoreResult = {
  assuranceScore: number | null;
  exposureIndicator: number | null;
  assuranceBand: AssuranceBand | null;
  visual: EgtAssuranceVisual | null;
  exposureBand: RiskBand | null;
  answeredCount: number;
  applicableCount: number;
  allRequiredAnswered: boolean;
  criterionScores: Array<{
    code: string;
    value: EadLikertValue;
    assuranceScore: number | null;
  }>;
};

export function isEadLikertValue(value: unknown): value is EadLikertValue {
  return typeof value === 'string' && EAD_LIKERT_OPTIONS.some((o) => o.value === value);
}

export function likertToAssuranceScore(value: EadLikertValue): number | null {
  if (value === 'NA') return null;
  return EAD_LIKERT_ASSURANCE_SCORES[value];
}

export function averageAssuranceScores(scores: number[]): number | null {
  if (!scores.length) return null;
  const sum = scores.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

/** Score from an explicit criteria list (assessment snapshot or template). */
export function scoreEadDiagnosticCriteria(
  criteria: readonly EadDiagnosticCriterion[],
  answers: EadDiagnosticAnswers,
): EadDiagnosticScoreResult {
  if (!criteria.length) {
    return {
      assuranceScore: null,
      exposureIndicator: null,
      assuranceBand: null,
      visual: null,
      exposureBand: null,
      answeredCount: 0,
      applicableCount: 0,
      allRequiredAnswered: true,
      criterionScores: [],
    };
  }

  const criterionScores: EadDiagnosticScoreResult['criterionScores'] = [];
  const applicableScores: number[] = [];
  let answeredCount = 0;

  for (const criterion of criteria) {
    const raw = answers[criterion.code];
    if (!isEadLikertValue(raw)) continue;
    answeredCount += 1;
    const assuranceScore = likertToAssuranceScore(raw);
    criterionScores.push({ code: criterion.code, value: raw, assuranceScore });
    if (assuranceScore != null) applicableScores.push(assuranceScore);
  }

  const assuranceScore = averageAssuranceScores(applicableScores);
  const exposureIndicator = assuranceScore == null ? null : assuranceToExposureIndicator(assuranceScore);
  const allRequiredAnswered = criteria.every((c) => {
    if (c.isRequired === false) return true;
    const v = answers[c.code];
    if (!isEadLikertValue(v)) return false;
    if (!c.allowNa && v === 'NA') return false;
    return true;
  });

  return {
    assuranceScore,
    exposureIndicator,
    assuranceBand: assuranceScore == null ? null : getAssuranceBand(assuranceScore),
    visual: assuranceScore == null ? null : resolveEgtAssuranceVisual(assuranceScore),
    exposureBand: exposureIndicator == null ? null : getRiskBand(clampScore(exposureIndicator)),
    answeredCount,
    applicableCount: applicableScores.length,
    allRequiredAnswered,
    criterionScores,
  };
}

/** Score any EAD module from its hard-coded criteria set (legacy / fallback). */
export function scoreEadDiagnostic(
  moduleCode: string,
  answers: EadDiagnosticAnswers,
): EadDiagnosticScoreResult {
  const criteria = getEadModuleCriteria(moduleCode);
  if (!criteria) {
    return scoreEadDiagnosticCriteria([], answers);
  }
  return scoreEadDiagnosticCriteria(criteria, answers);
}

export function buildEadDiagnosticSnapshot(
  moduleCode: string,
  answers: EadDiagnosticAnswers,
  now = new Date(),
  criteria?: readonly EadDiagnosticCriterion[],
): EadDiagnosticResponseSnapshot {
  const scored = criteria
    ? scoreEadDiagnosticCriteria(criteria, answers)
    : scoreEadDiagnostic(moduleCode, answers);
  return {
    version: 1,
    moduleCode,
    answers: { ...answers },
    criterionScores: scored.criterionScores,
    calculatedAssuranceScore: scored.assuranceScore,
    calculatedExposureIndicator: scored.exposureIndicator,
    calculatedAt: now.toISOString(),
  };
}

/** @deprecated Prefer scoreEadDiagnostic('CONSEQUENCE', answers) */
export function scoreConsequenceDiagnostic(answers: EadDiagnosticAnswers): EadDiagnosticScoreResult {
  return scoreEadDiagnostic('CONSEQUENCE', answers);
}

/** @deprecated Prefer buildEadDiagnosticSnapshot('CONSEQUENCE', answers) */
export function buildConsequenceDiagnosticSnapshot(
  answers: EadDiagnosticAnswers,
  now = new Date(),
): EadDiagnosticResponseSnapshot {
  return buildEadDiagnosticSnapshot('CONSEQUENCE', answers, now);
}

export function parseDiagnosticResponses(raw: unknown): EadDiagnosticResponseSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<EadDiagnosticResponseSnapshot>;
  if (row.version !== 1 || !row.answers || typeof row.answers !== 'object') return null;
  return {
    version: 1,
    moduleCode: String(row.moduleCode || ''),
    answers: row.answers as EadDiagnosticAnswers,
    criterionScores: Array.isArray(row.criterionScores) ? row.criterionScores : [],
    calculatedAssuranceScore:
      row.calculatedAssuranceScore == null ? null : Number(row.calculatedAssuranceScore),
    calculatedExposureIndicator:
      row.calculatedExposureIndicator == null ? null : Number(row.calculatedExposureIndicator),
    calculatedAt: String(row.calculatedAt || ''),
  };
}

/** Options shown for a criterion (omit N/A when not allowed). */
export function likertOptionsForCriterion(allowNa: boolean) {
  return allowNa ? [...EAD_LIKERT_OPTIONS] : EAD_LIKERT_OPTIONS.filter((o) => o.value !== 'NA');
}
