/**
 * Executive Advisory — report access helpers (Stage 11).
 * Assessment SUBMITTED ≠ report ready; treat them separately.
 */

export type LatestAdvisoryReport = {
  id: string;
  version: number;
  status: string;
  generatedAt?: string | null;
  title?: string | null;
  fileName?: string | null;
};

const FINISHED_ENGAGEMENT_STATUSES = new Set([
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'REPORT_GENERATED',
  'REPORT_ISSUED',
  'AUTOMATED_EVALUATION_COMPLETE',
  'EVIDENCE_REVIEW',
  'ANALYST_REVIEW',
  'QUALITY_ASSURANCE',
  'REMEDIATION_IN_PROGRESS',
  'REASSESSMENT_DUE',
]);

const READY_REPORT_STATUSES = new Set(['GENERATED', 'APPROVED', 'ISSUED']);

export function isAdvisoryReportReady(report?: LatestAdvisoryReport | null): boolean {
  if (!report?.id) return false;
  return READY_REPORT_STATUSES.has(String(report.status || '').toUpperCase());
}

export function advisoryReportHref(reportId: string): string {
  return `/reports/${reportId}?view=advisory`;
}

/** EAD completed diagnostics open the outcome screen; other advisory work opens the engagement. */
export function advisoryWorkspaceHref(input: {
  assessmentId: string;
  productCode?: string | null;
  hasOutcome?: boolean;
}): string {
  const id = String(input.assessmentId || '').trim();
  if (!id) return '/advisory';
  const code = String(input.productCode || '');
  if (code === 'EXECUTIVE_ADVISORY_DIAGNOSTIC' && input.hasOutcome) {
    return `/advisory/${id}/outcome`;
  }
  return `/advisory/${id}`;
}

/** Engagement is far enough along that generating a report is meaningful. */
export function canGenerateAdvisoryReport(input: {
  status: string;
  hasOutcome?: boolean;
  reportReady?: boolean;
}): boolean {
  if (input.reportReady) return false;
  if (input.hasOutcome) return true;
  return FINISHED_ENGAGEMENT_STATUSES.has(String(input.status || '').toUpperCase());
}

export function formatAdvisoryReportVersion(version?: number | null): string {
  if (version == null || !Number.isFinite(Number(version))) return '—';
  return `v${Number(version)}`;
}

export function pickLatestAdvisoryReport<T extends LatestAdvisoryReport>(
  reports: T[] | null | undefined,
): T | null {
  if (!Array.isArray(reports) || !reports.length) return null;
  const ready = reports.find((r) => isAdvisoryReportReady(r));
  if (ready) return ready;
  return reports.find((r) => String(r.status || '').toUpperCase() !== 'SUPERSEDED') || null;
}
