/** Shared MOSS UI helpers — no scoring aggregation. */

export const MOSS_SCORE_LABELS: Record<number, string> = {
  0: 'Non-existent',
  1: 'Ad hoc',
  2: 'Basic',
  3: 'Effective',
  4: 'Optimised',
};

/** Assessor-chosen finding severity (manual; no auto score→severity mapping in v1). */
export const MOSS_FINDING_SEVERITIES = [
  { value: '', label: 'Not classified' },
  { value: 'INFORMATIONAL', label: 'Informational' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
] as const;

export const MOSS_FINDING_SEVERITY_LABELS: Record<string, string> = {
  INFORMATIONAL: 'Informational',
  LOW: 'Low',
  MEDIUM: 'Medium',
  MODERATE: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export function formatMossFindingSeverity(severity?: string | null): string {
  if (!severity) return 'Not classified';
  return MOSS_FINDING_SEVERITY_LABELS[severity] || severity.replace(/_/g, ' ');
}

export const MOSS_CONTROL_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  SCORED: 'Scored',
  NEEDS_EVIDENCE: 'Needs Evidence',
  COMPLETE: 'Complete',
};

export function formatMossControlStatus(status?: string | null): string {
  if (!status) return MOSS_CONTROL_STATUS_LABELS.NOT_STARTED;
  return MOSS_CONTROL_STATUS_LABELS[status] || status;
}

export function formatMossScore(score: number | null | undefined, labels?: Record<string, string>): string {
  if (score == null || Number.isNaN(score)) return 'Not Started';
  const label = labels?.[String(score)] || MOSS_SCORE_LABELS[score] || '';
  return label ? `${score} · ${label}` : String(score);
}

export function formatAssessmentProgress(scored: number, total: number, percent?: number): string {
  const pct = percent != null ? percent : total ? Math.round((scored / total) * 1000) / 10 : 0;
  return `${scored} / ${total} · ${pct}%`;
}

export const MOSS_ASSESSMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  REVIEWED: 'Reviewed',
  APPROVED: 'Approved',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

/** User-facing assessment session status (completion ≠ maturity score). */
export function formatMossAssessmentStatus(status?: string | null): string {
  if (!status) return MOSS_ASSESSMENT_STATUS_LABELS.DRAFT;
  return MOSS_ASSESSMENT_STATUS_LABELS[status] || status.replace(/_/g, ' ');
}

export function isEditableMossStatus(status?: string | null): boolean {
  return !status || ['DRAFT', 'IN_PROGRESS', 'AWAITING_CONTRIBUTOR'].includes(status);
}

/** Extract guidance for a selected 0–4 score from catalogue mossScoringRules. */
export function scoringGuidanceFor(
  rules: unknown,
  score: number | null | undefined,
): string | null {
  if (score == null || rules == null) return null;
  if (typeof rules === 'object' && !Array.isArray(rules)) {
    const record = rules as Record<string, unknown>;
    const value = record[String(score)] ?? record[score as unknown as string];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function listMethodologyItems(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)));
  }
  if (typeof value === 'object') {
    return Object.entries(value as object).map(([k, v]) =>
      `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
    );
  }
  return [String(value)];
}

export function hasFinancialMapping(mapping: Record<string, unknown> | null | undefined): boolean {
  if (!mapping) return false;
  const keys = [
    'eventUnit',
    'costCategory',
    'leakageQuantification',
    'formulaReference',
    'slaPenaltyLogic',
    'incidentToCostConversion',
    'financialRelevance',
  ];
  return keys.some((k) => {
    const v = mapping[k];
    if (v == null || v === '') return false;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return false;
    return true;
  });
}

export function mossApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    if (status === 404) return 'Assessment not found.';
    if (status === 403) return 'You do not have access to this MOSS assessment.';
    if (status === 401) return 'You need to sign in again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
