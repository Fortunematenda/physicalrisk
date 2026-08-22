/** Shared types for the public SCL continuous assessment UI. */

import {
  SCL_ACTIVE_TRIAGE_QUESTION_CODES,
  SCL_RETIRED_TRIAGE_QUESTION_CODES,
  filterSclActiveTriageQuestions,
  isSclActiveTriageQuestionCode,
} from '@moss/shared';

export {
  SCL_ACTIVE_TRIAGE_QUESTION_CODES,
  SCL_RETIRED_TRIAGE_QUESTION_CODES,
  filterSclActiveTriageQuestions,
  isSclActiveTriageQuestionCode,
};

/** Alias kept for existing call sites — same 15 codes as website + admin. */
export const SCL_PUBLIC_TRIAGE_QUESTION_CODES = SCL_ACTIVE_TRIAGE_QUESTION_CODES;

export type InputDef = {
  code: string;
  label: string;
  guidance?: string;
  valueType: string;
  required: boolean;
  options?: string[];
  defaultValue?: unknown;
};

export type QuestionOption = {
  id: string;
  label: string;
  riskScore: number;
  sortOrder: number;
};

export type Question = {
  code: string;
  category: string;
  text: string;
  weight: number;
  evidenceHint?: string;
  options: QuestionOption[];
};

export type ContactDetails = {
  organisationName: string;
  industry: string;
  /** C3 — site-count band label from contact dropdown (mapped to a count on submit). */
  totalSites: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Job title / role (CRM jobTitle). */
  role: string;
  country: string;
  /** C5 — estimated annual security expenditure band label. */
  securityExpenditure: string;
  primaryConcern: string;
};

/** Executive job titles for the public contact step (design reference). */
export const SCL_JOB_TITLE_OPTIONS = [
  'CFO',
  'CEO',
  'COO',
  'Security Executive',
  'Procurement Executive',
  'Risk Executive',
  'Governance / Audit Executive',
  'Other',
] as const;

export function isJobTitleValueComplete(value: unknown): boolean {
  const v = String(value ?? '').trim();
  if (!v) return false;
  if (/^other$/i.test(v)) return false;
  return true;
}

export const SCL_COUNTRY_OPTIONS = [
  'South Africa',
  'Namibia',
  'Botswana',
  'Zimbabwe',
  'Mozambique',
  'Lesotho',
  'Eswatini',
  'Other',
] as const;

/**
 * Operational sites bands matching the approved contact-form reference.
 * Count is the provisional scoring value for C3.
 */
export const SCL_SITE_COUNT_OPTIONS = [
  { label: '1 site', count: 1 },
  { label: '2–5 sites', count: 3 },
  { label: '6–20 sites', count: 12 },
  { label: '21–50 sites', count: 35 },
  { label: 'More than 50 sites', count: 75 },
] as const;

/**
 * Estimated annual security expenditure bands for contact capture → C5.
 * Non-disclosure options removed (Wayne): sliding bands already avoid precise disclosure.
 */
export const SCL_SECURITY_EXPENDITURE_OPTIONS = [
  { label: 'Below R2 million', amount: 1_000_000 },
  { label: 'R2–R10 million', amount: 6_000_000 },
  { label: 'R10–R50 million', amount: 30_000_000 },
  { label: 'R50–R100 million', amount: 75_000_000 },
  { label: 'Above R100 million', amount: 150_000_000 },
] as const;

export function resolveSiteCountForScoring(selection: string | undefined | null): number | undefined {
  const label = String(selection || '').trim();
  if (!label) return undefined;
  const match = SCL_SITE_COUNT_OPTIONS.find((o) => o.label === label);
  if (match) return match.count;
  const n = Number(label.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function resolveSecurityExpenditureForScoring(
  selection: string | undefined | null,
): number | undefined {
  const label = String(selection || '').trim();
  if (!label) return undefined;
  const match = SCL_SECURITY_EXPENDITURE_OPTIONS.find((o) => o.label === label);
  if (!match) return undefined;
  return match.amount;
}

export function isSecurityExpenditureComplete(selection: string | undefined | null): boolean {
  return resolveSecurityExpenditureForScoring(selection) != null;
}

/** Map a stored C3 number back to the nearest dropdown label for resume/display. */
export function siteCountLabelFromStored(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const asLabel = String(value).trim();
  if (SCL_SITE_COUNT_OPTIONS.some((o) => o.label === asLabel)) return asLabel;
  const n = Number(asLabel.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return '';
  let bestLabel: string = SCL_SITE_COUNT_OPTIONS[0].label;
  let bestDist = Math.abs(n - SCL_SITE_COUNT_OPTIONS[0].count);
  for (const opt of SCL_SITE_COUNT_OPTIONS) {
    const dist = Math.abs(n - opt.count);
    if (dist < bestDist) {
      bestLabel = opt.label;
      bestDist = dist;
    }
  }
  return bestLabel;
}

export function securityExpenditureLabelFromStored(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const asLabel = String(value).trim();
  if (SCL_SECURITY_EXPENDITURE_OPTIONS.some((o) => o.label === asLabel)) return asLabel;
  // Legacy non-disclosure labels from older drafts
  if (/^prefer not to say$/i.test(asLabel) || /^not known$/i.test(asLabel)) return '';
  const n = Number(asLabel.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return '';
  let best: (typeof SCL_SECURITY_EXPENDITURE_OPTIONS)[number] = SCL_SECURITY_EXPENDITURE_OPTIONS[0];
  let bestDist = Math.abs(n - best.amount);
  for (const opt of SCL_SECURITY_EXPENDITURE_OPTIONS) {
    const dist = Math.abs(n - opt.amount);
    if (dist < bestDist) {
      best = opt;
      bestDist = dist;
    }
  }
  return best.label;
}

export type SclPublicResult = {
  assessmentId: string;
  reference: string;
  organisationName: string;
  prospectName: string;
  assessmentDateLabel: string;
  riskBand: string;
  accessibleLabel: string;
  colourName: string;
  bandIndex: 0 | 1 | 2 | 3;
  /** Governed overall risk score 0–100 (higher = more leakage exposure). */
  overallRiskScore?: number | null;
  /** Governed category scores for dimension / priority panels. */
  categoryScores?: Array<{ category: string; score: number }>;
  diagnosis: string;
  recommendedAction: string;
  campaignSummary: string;
  downloadUrl?: string | null;
  fileName?: string | null;
  reportId?: string | null;
};
