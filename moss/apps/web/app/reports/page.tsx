'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  FileCheck,
  FileText,
  Send,
} from 'lucide-react';
import { AuthGate } from '../../components/AuthGate';
import { Shell } from '../../components/Shell';
import { RowActionsMenu } from '../../components/RowActionsMenu';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconEye,
  IconFileText,
  IconMoreVertical,
  IconPlus,
  IconRotateCcw,
  IconSearch,
} from '../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch } from '../../lib/api';

type UserRef = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ReportRow = {
  id: string;
  reference: string;
  title: string;
  reportType: string;
  status: string;
  uiStatus: string;
  version: number;
  fileName?: string | null;
  fileSizeLabel?: string;
  generatedAt?: string | null;
  issuedAt?: string | null;
  createdAt: string;
  generatedBy?: UserRef | null;
  assessment?: {
    id: string;
    reference: string;
    title?: string;
    organisation?: { id: string; name: string };
  };
};

type ReportsResponse = {
  items?: ReportRow[];
  summary?: {
    total: number;
    preliminary: number;
    verified: number;
    issued: number;
    generated: number;
    draft: number;
    pending: number;
    failed: number;
  };
  deliveryHealth?: {
    sent: number;
    failed: number;
    pending: number;
    sentPct: number;
    failedPct: number;
    pendingPct: number;
  };
  recentActivity?: Array<{
    id: string;
    title: string;
    reference: string;
    reportId: string;
    at: string;
    tone: string;
  }>;
};

const PAGE_SIZE_OPTIONS = [8, 10, 20, 50];

const STATUS_COLORS: Record<string, string> = {
  issued: '#059669',
  generated: '#2563eb',
  pending: '#ea580c',
  draft: '#64748b',
  failed: '#c41230',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

function displayName(user?: UserRef | null) {
  if (!user) return '';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email || 'System';
}

function relativeTime(iso?: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function reportTypeLabel(type: string) {
  switch (type) {
    case 'PRELIMINARY_EXECUTIVE': return 'Preliminary Executive';
    case 'VERIFIED_EXECUTIVE': return 'Approved Executive';
    case 'ANALYST_WORKING_PAPER': return 'Analyst Working Paper';
    case 'EVIDENCE_REGISTER': return 'Evidence Register';
    case 'FINDINGS_REPORT': return 'Findings Report';
    case 'REMEDIATION_ACTION_PLAN': return 'Remediation Plan';
    case 'REASSESSMENT_COMPARISON': return 'Reassessment Comparison';
    default: return type.replaceAll('_', ' ');
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'issued': return 'Issued';
    case 'generated': return 'Generated';
    case 'pending': return 'Pending';
    case 'draft': return 'Draft';
    case 'failed': return 'Failed';
    default: return status;
  }
}

export default function ReportsIndexPage() {
  const [data, setData] = useState<ReportsResponse>({ items: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [analystFilter, setAnalystFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [assessments, setAssessments] = useState<Array<{ id: string; reference: string; title: string; organisation?: { name: string } }>>([]);
  const [generateId, setGenerateId] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = () =>
    apiFetch<ReportsResponse>('/reports')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const items = data.items || [];
  const summary = data.summary || {
    total: items.length,
    preliminary: 0,
    verified: 0,
    issued: 0,
    generated: 0,
    draft: 0,
    pending: 0,
    failed: 0,
  };
  const delivery = data.deliveryHealth || {
    sent: 0, failed: 0, pending: 0, sentPct: 0, failedPct: 0, pendingPct: 0,
  };
  const recentActivity = data.recentActivity || [];

  const organisations = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of items) {
      if (r.assessment?.organisation?.id) {
        map.set(r.assessment.organisation.id, r.assessment.organisation.name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const analysts = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of items) {
      if (r.generatedBy?.id) map.set(r.generatedBy.id, displayName(r.generatedBy));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(() => {
    const q = (query || headerSearch).trim().toLowerCase();
    return items.filter((r) => {
      if (q) {
        const hay = [
          r.reference,
          r.title,
          r.assessment?.reference,
          r.assessment?.organisation?.name,
          displayName(r.generatedBy),
          reportTypeLabel(r.reportType),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (orgFilter && r.assessment?.organisation?.id !== orgFilter) return false;
      if (typeFilter && r.reportType !== typeFilter) return false;
      if (statusFilter && r.uiStatus !== statusFilter) return false;
      if (analystFilter && r.generatedBy?.id !== analystFilter) return false;
      const when = r.generatedAt || r.createdAt;
      if (dateFrom && new Date(when) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(when) > to) return false;
      }
      return true;
    });
  }, [items, query, headerSearch, orgFilter, typeFilter, statusFilter, analystFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, headerSearch, orgFilter, typeFilter, statusFilter, analystFilter, dateFrom, dateTo, pageSize]);

  const statusDonut = useMemo(() => {
    const counts = {
      issued: summary.issued,
      generated: summary.generated,
      pending: summary.pending,
      draft: summary.draft,
      failed: summary.failed,
    };
    return (Object.entries(counts) as Array<[string, number]>)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        key,
        name: statusLabel(key),
        value,
        color: STATUS_COLORS[key],
      }));
  }, [summary]);

  const statusTotal = Math.max(summary.total, 1);

  function clearFilters() {
    setQuery('');
    setHeaderSearch('');
    setOrgFilter('');
    setTypeFilter('');
    setStatusFilter('');
    setAnalystFilter('');
    setDateFrom('');
    setDateTo('');
  }

  function exportCsv() {
    const rows = [
      ['Report Reference', 'Assessment', 'Organisation', 'Type', 'Status', 'Version', 'Generated By', 'Generated', 'Issued', 'File'],
      ...filtered.map((r) => [
        r.reference,
        r.assessment?.reference || '',
        r.assessment?.organisation?.name || '',
        reportTypeLabel(r.reportType),
        statusLabel(r.uiStatus),
        String(r.version),
        displayName(r.generatedBy),
        formatDateTime(r.generatedAt || r.createdAt),
        formatDateTime(r.issuedAt),
        r.fileName || r.fileSizeLabel || '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openGenerate() {
    setGenerateOpen(true);
    setError('');
    try {
      const list = await apiFetch<Array<{ id: string; reference: string; title: string; organisation?: { name: string }; status: string }>>('/assessments');
      const eligible = list.filter((a) =>
        ['SUBMITTED', 'REVIEWED', 'APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED', 'AUTOMATED_EVALUATION_COMPLETE', 'ANALYST_REVIEW'].includes(a.status),
      );
      setAssessments(eligible.length ? eligible : list.slice(0, 50));
      if (eligible[0] || list[0]) setGenerateId((eligible[0] || list[0]).id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load assessments.');
    }
  }

  async function generateReport() {
    if (!generateId) return;
    setGenerating(true);
    setError('');
    try {
      await apiFetch(`/reports/assessment/${generateId}/generate`, { method: 'POST', body: JSON.stringify({}) });
      setGenerateOpen(false);
      setLoading(true);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to generate report.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AuthGate>
      <Shell
        title="Reports"
        hideEyebrow
        subtitle="View, generate and manage all assessment reports."
        searchPlaceholder="Search reports…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn org2-add-btn" onClick={() => void openGenerate()}>
            <IconPlus />
            Generate Report
          </button>
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export
          </button>
        </div>

        {generateOpen && (
          <section className="dash2-card org2-create-card">
            <div className="dash2-card-head">
              <div>
                <h2>Generate report</h2>
                <p>Create a preliminary or approved executive PDF for an assessment</p>
              </div>
            </div>
            <div className="field" style={{ maxWidth: 520 }}>
              <label>Assessment</label>
              <select value={generateId} onChange={(e) => setGenerateId(e.target.value)}>
                <option value="">Select assessment</option>
                {assessments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.reference} — {a.organisation?.name || a.title}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button type="button" className="btn" disabled={!generateId || generating} onClick={() => void generateReport()}>
                {generating ? 'Generating…' : 'Generate PDF'}
              </button>
              <button type="button" className="btn secondary" onClick={() => setGenerateOpen(false)}>Cancel</button>
            </div>
          </section>
        )}

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={FileText}
            title="Total Reports"
            value={summary.total}
            description="Portfolio deliverables"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={ClipboardList}
            title="Preliminary Reports"
            value={summary.preliminary}
            description="Pre-approval packs"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={FileCheck}
            title="Approved Executive"
            value={summary.verified}
            description="Verified packs"
            tone="green"
            loading={loading}
          />
          <StatCard
            icon={Send}
            title="Issued"
            value={summary.issued}
            description="Client delivered"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={BadgeCheck}
            title="Generated"
            value={summary.generated}
            description="Awaiting issue"
            tone="slate"
            loading={loading}
          />
          <StatCard
            icon={AlertTriangle}
            title="Failed / Draft"
            value={summary.failed + summary.draft}
            description={summary.failed ? 'Needs attention' : 'Backlog drafts'}
            tone={summary.failed ? 'red' : 'slate'}
            trendTone={summary.failed > 0 ? 'down' : undefined}
            loading={loading}
          />
        </div>

        <section className="dash2-card org2-filters-card">
          <div className="assess2-filters">
            <label className="org2-filter-search">
              <IconSearch />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reports…"
                aria-label="Filter reports"
              />
            </label>
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organisation">
              <option value="">Organisation</option>
              {organisations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Report type">
              <option value="">Report Type</option>
              <option value="PRELIMINARY_EXECUTIVE">Preliminary Executive</option>
              <option value="VERIFIED_EXECUTIVE">Approved Executive</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Status</option>
              {['issued', 'generated', 'pending', 'draft', 'failed'].map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
            <select value={analystFilter} onChange={(e) => setAnalystFilter(e.target.value)} aria-label="Analyst">
              <option value="">Analyst</option>
              {analysts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label className="assess2-date-range">
              <IconCalendar />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
              <span>—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
            </label>
            <button type="button" className="dash2-filter-btn" onClick={clearFilters}>
              <IconRotateCcw />
              Clear
            </button>
          </div>
        </section>

        <div className="queue2-layout">
          <section className="dash2-card org2-table-card">
            <div className="table-wrap">
              <table className="reports2-table">
                <thead>
                  <tr>
                    <th>Report Reference</th>
                    <th>Assessment</th>
                    <th>Organisation</th>
                    <th>Report Type</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Generated By</th>
                    <th>Generated Date</th>
                    <th>Issued Date</th>
                    <th>File</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => {
                    const by = displayName(r.generatedBy);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/reports/${r.id}`}><strong>{r.reference}</strong></Link>
                        </td>
                        <td>
                          <div className="assess2-ref-cell">
                            {r.assessment?.id ? (
                              <Link href={`/assessments/${r.assessment.id}`}><strong>{r.assessment.reference}</strong></Link>
                            ) : <strong>—</strong>}
                            <span className="muted small">{r.assessment?.title || r.title}</span>
                          </div>
                        </td>
                        <td>{r.assessment?.organisation?.name || '—'}</td>
                        <td>{reportTypeLabel(r.reportType)}</td>
                        <td>
                          <span className={`reports2-status status-${r.uiStatus}`}>
                            {statusLabel(r.uiStatus)}
                          </span>
                        </td>
                        <td><strong>v{r.version}</strong></td>
                        <td>
                          {by ? (
                            <div className="assess2-analyst">
                              <span className="assess2-analyst-avatar">{initials(by)}</span>
                              <strong>{by}</strong>
                            </div>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td className="muted small">{formatDate(r.generatedAt || r.createdAt)}</td>
                        <td className="muted small">{formatDate(r.issuedAt)}</td>
                        <td className="muted small">{r.fileSizeLabel || 'PDF'}</td>
                        <td>
                          <div className="reports2-actions">
                            <Link href={`/reports/${r.id}`} className="reports2-icon-btn" title="View" aria-label="View report">
                              <IconEye />
                            </Link>
                            <Link href={`/reports/${r.id}`} className="reports2-icon-btn" title="Download" aria-label="Download report">
                              <IconDownload />
                            </Link>
                            <RowActionsMenu
                              open={menuOpenId === r.id}
                              onClose={() => setMenuOpenId(null)}
                              trigger={(
                                <button
                                  type="button"
                                  className="org2-menu-btn"
                                  aria-label="More actions"
                                  onClick={() => setMenuOpenId((id) => (id === r.id ? null : r.id))}
                                >
                                  <IconMoreVertical />
                                </button>
                              )}
                            >
                              <Link href={`/reports/${r.id}`} onClick={() => setMenuOpenId(null)}>Open report</Link>
                              {r.assessment?.id && (
                                <Link href={`/assessments/${r.assessment.id}/review`} onClick={() => setMenuOpenId(null)}>Open review</Link>
                              )}
                              {r.assessment?.organisation?.id && (
                                <Link href={`/organisations/${r.assessment.organisation.id}`} onClick={() => setMenuOpenId(null)}>View organisation</Link>
                              )}
                            </RowActionsMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !pageItems.length && (
                    <tr><td colSpan={11} className="muted">No reports match the current filters.</td></tr>
                  )}
                  {loading && (
                    <tr><td colSpan={11} className="muted">Loading reports…</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="org2-pagination">
              <span>
                Showing {showingFrom} to {showingTo} of {filtered.length} reports
              </span>
              <div className="org2-pagination-controls">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2)
                  .reduce<number[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - arr[idx - 1] > 1) acc.push(-1);
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, idx) => (
                    n === -1 ? (
                      <span key={`gap-${idx}`} className="org2-page-gap">…</span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        className={n === currentPage ? 'active' : ''}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    )
                  ))}
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size} / page</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <aside className="queue2-side">
            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Report Status Breakdown</h2>
                  <p>Portfolio distribution</p>
                </div>
              </div>
              <div className="dash2-donut-wrap compact">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={statusDonut.length ? statusDonut : [{ name: 'Empty', value: 1, color: '#e5e7eb' }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(statusDonut.length ? statusDonut : [{ name: 'Empty', value: 1, color: '#e5e7eb' }]).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash2-donut-center">
                  <span>REPORTS</span>
                  <strong>{summary.total}</strong>
                  <em>Total</em>
                </div>
              </div>
              <ul className="dash2-legend">
                {statusDonut.map((entry) => (
                  <li key={entry.key}>
                    <i style={{ background: entry.color }} />
                    <span>{entry.name}</span>
                    <strong>{entry.value}</strong>
                    <em>{Math.round((entry.value / statusTotal) * 100)}%</em>
                  </li>
                ))}
                {!statusDonut.length && <li className="muted dash2-legend-empty">No reports yet.</li>}
              </ul>
            </section>

            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Recent Activity</h2>
                  <p>Latest report events</p>
                </div>
                <Link href="/admin/audit-logs" className="queue2-view-all">View all</Link>
              </div>
              <ul className="reports2-activity">
                {recentActivity.map((item) => (
                  <li key={item.id}>
                    <span className={`reports2-activity-icon tone-${item.tone}`}>
                      {item.tone === 'ok' ? <IconCheckCircle /> : item.tone === 'danger' ? <IconAlertTriangle /> : <IconFileText />}
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <Link href={`/reports/${item.reportId}`}>{item.reference}</Link>
                      <em>{relativeTime(item.at)}</em>
                    </div>
                  </li>
                ))}
                {!recentActivity.length && <li className="muted">No recent report activity.</li>}
              </ul>
            </section>

            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Delivery Health</h2>
                  <p>Report email outcomes</p>
                </div>
                <Link href="/admin/emails" className="queue2-view-all">View all</Link>
              </div>
              <ul className="reports2-delivery">
                <li>
                  <span className="reports2-delivery-icon ok"><IconCheckCircle /></span>
                  <div>
                    <strong>Email Success</strong>
                    <em>{delivery.sent} ({delivery.sentPct}%)</em>
                  </div>
                </li>
                <li>
                  <span className="reports2-delivery-icon danger"><IconAlertTriangle /></span>
                  <div>
                    <strong>Failed Deliveries</strong>
                    <em>{delivery.failed} ({delivery.failedPct}%)</em>
                  </div>
                </li>
                <li>
                  <span className="reports2-delivery-icon warn"><IconClock /></span>
                  <div>
                    <strong>Pending Issues</strong>
                    <em>{delivery.pending} ({delivery.pendingPct}%)</em>
                  </div>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </Shell>
    </AuthGate>
  );
}
