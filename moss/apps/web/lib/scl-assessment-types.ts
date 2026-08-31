/** Shared types for the public SCL continuous assessment UI. */

import {
  EGT_OPERATIONAL_SITES_OPTIONS,
  EGT_SECURITY_EXPENDITURE_OPTIONS,
  SCL_ACTIVE_TRIAGE_QUESTION_CODES,
  SCL_RETIRED_TRIAGE_QUESTION_CODES,
  filterSclActiveTriageQuestions,
  isOperationalSitesSelectionComplete,
  isSclActiveTriageQuestionCode,
  isSecurityExpenditureSelectionComplete,
  operationalSitesLabelFromStored,
  operationalSitesValueFromStored,
  resolveOperationalSitesBandValue,
  resolveSecurityExpenditureBandValue,
  securityExpenditureLabelFromStored,
  securityExpenditureValueFromStored,
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
  /** C3 — operational sites band code from contact dropdown. */
  totalSites: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Job title / role (CRM jobTitle). */
  role: string;
  country: string;
  /** C5 — estimated annual security expenditure band code. */
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

/** Enterprise operational-site bands for new Level 1 submissions. */
export const SCL_SITE_COUNT_OPTIONS = EGT_OPERATIONAL_SITES_OPTIONS;

/** Enterprise annual security expenditure bands for new Level 1 submissions. */
export const SCL_SECURITY_EXPENDITURE_OPTIONS = EGT_SECURITY_EXPENDITURE_OPTIONS;

export {
  operationalSitesLabelFromStored as siteCountLabelFromStored,
  operationalSitesValueFromStored,
  securityExpenditureLabelFromStored,
  securityExpenditureValueFromStored,
  resolveOperationalSitesBandValue,
  resolveSecurityExpenditureBandValue,
  isOperationalSitesSelectionComplete,
  isSecurityExpenditureSelectionComplete,
};

/** @deprecated Use resolveOperationalSitesBandValue — band codes are stored, not counts. */
export function resolveSiteCountForScoring(selection: string | undefined | null): number | undefined {
  return resolveOperationalSitesBandValue(selection) ? 1 : undefined;
}

/** @deprecated Expenditure bands are indicative only; no amount is derived at Level 1. */
export function resolveSecurityExpenditureForScoring(
  selection: string | undefined | null,
): number | undefined {
  return resolveSecurityExpenditureBandValue(selection) ? undefined : undefined;
}

export function isSecurityExpenditureComplete(selection: string | undefined | null): boolean {
  return isSecurityExpenditureSelectionComplete(selection);
}

export type SclPublicResult = {
  assessmentId: string;
  reference: string;
  organisationName: string;
  prospectName: string;
  assessmentDateLabel: string;
  /** Prospect-facing assurance band label. */
  riskBand: string;
  assuranceBand?: string | null;
  accessibleLabel: string;
  colourName: string;
  bandIndex: 0 | 1 | 2 | 3;
  /** Prospect-facing assurance score 0–100 (higher = stronger assurance). */
  assuranceScore?: number | null;
  /** Internal exposure mirror 0–100 (higher = greater concern). */
  exposureIndicator?: number | null;
  /** Alias of assuranceScore for legacy call sites. */
  overallRiskScore?: number | null;
  /** Assurance-oriented category scores for dimension / priority panels. */
  categoryScores?: Array<{ category: string; score: number; exposureIndicator?: number }>;
  diagnosis: string;
  recommendedAction: string;
  campaignSummary: string;
  downloadUrl?: string | null;
  fileName?: string | null;
  reportId?: string | null;
};
