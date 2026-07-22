export const RISK_COLORS = {
  low: '#16a34a',
  controlled: '#16a34a',
  moderate: '#f59e0b',
  high: '#ea580c',
  critical: '#991125',
} as const;

export const CHART_COLORS = {
  primary: '#d30f2f',
  secondary: '#2563eb',
  tertiary: '#0f766e',
  quaternary: '#7c3aed',
  muted: '#94a3b8',
  grid: '#e2e8f0',
} as const;

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'purple'
  | 'teal';

export type StatusKey =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'AWAITING_REVIEW'
  | 'IN_REVIEW'
  | 'REVIEWED'
  | 'APPROVED'
  | 'REPORT_GENERATED'
  | 'REPORT_ISSUED'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'CONNECTED'
  | 'RETRYING'
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL'
  | 'SENT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'QUEUED';

const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'info' },
  AWAITING_CONTRIBUTOR: { label: 'In Progress', tone: 'info' },
  SUBMITTED: { label: 'Submitted', tone: 'warning' },
  AUTOMATED_EVALUATION_COMPLETE: { label: 'Awaiting Review', tone: 'purple' },
  EVIDENCE_REVIEW: { label: 'Awaiting Review', tone: 'purple' },
  ANALYST_REVIEW: { label: 'Awaiting Review', tone: 'purple' },
  AWAITING_REVIEW: { label: 'Awaiting Review', tone: 'purple' },
  IN_REVIEW: { label: 'In Review', tone: 'purple' },
  REVIEWED: { label: 'Reviewed', tone: 'teal' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REPORT_GENERATED: { label: 'Report Generated', tone: 'teal' },
  REPORT_ISSUED: { label: 'Report Issued', tone: 'teal' },
  PENDING: { label: 'Pending', tone: 'warning' },
  SUCCESS: { label: 'Success', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  CONNECTED: { label: 'Connected', tone: 'success' },
  RETRYING: { label: 'Retrying', tone: 'purple' },
  LOW: { label: 'Low', tone: 'success' },
  CONTROLLED: { label: 'Controlled', tone: 'success' },
  MODERATE: { label: 'Moderate', tone: 'warning' },
  HIGH: { label: 'High', tone: 'danger' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
  SENT: { label: 'Sent', tone: 'success' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  QUEUED: { label: 'Queued', tone: 'info' },
};

export function resolveStatus(status: string | null | undefined) {
  if (!status) return { label: 'Unknown', tone: 'neutral' as StatusTone };
  const key = status.trim().toUpperCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] || {
    label: status.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: 'neutral' as StatusTone,
  };
}
