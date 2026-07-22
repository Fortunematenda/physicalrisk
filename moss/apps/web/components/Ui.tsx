const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  REVIEWED: 'Reviewed',
  APPROVED: 'Approved',
  REPORT_GENERATED: 'Report generated',
  REPORT_ISSUED: 'Report issued',
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  VERIFIED: 'Accepted',
  SENT: 'Sent',
  FAILED: 'Failed',
  SUCCESS: 'Success',
  SYNCED: 'Success',
  AUTOMATED_EVALUATION_COMPLETE: 'Submitted',
  EVIDENCE_REVIEW: 'Submitted',
  ANALYST_REVIEW: 'Submitted',
  QUALITY_ASSURANCE: 'Submitted',
};

export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function StatusBadge({ value }: { value: string }) {
  const label = STATUS_LABELS[value] || value.replaceAll('_', ' ');
  const css = value === 'VERIFIED' ? 'accepted' : value.toLowerCase().replaceAll('_', '-');
  return <span className={`status status-${css}`}>{label}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) { return <div className="empty">{children}</div>; }
