'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  Clock,
  Send,
  User,
} from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { RowActionsMenu } from '../../../components/RowActionsMenu';
import {
  IconAlertTriangle,
  IconBadgeCheck,
  IconCalendar,
  IconClock,
  IconDownload,
  IconFilter,
  IconMoreVertical,
  IconRotateCcw,
  IconSearch,
} from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch, money } from '../../../lib/api';

type UserRef = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type QueueItem = {
  id: string;
  reference: string;
  title?: string;
  status: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  updatedAt: string;
  returnReason?: string | null;
  organisation?: { id: string; name: string };
  queueStatus: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  overdue: boolean;
  ageDays: number;
  dueDate: string;
  assignedAnalyst?: UserRef | null;
  scoreSnapshots?: Array<{
    overallRiskScore: number | string;
    riskBand: string;
    leakageResult?: { likelyLeakageValue?: number };
  }>;
  _count?: { evidence?: number; recommendations?: number; findings?: number };
};

type QueueResponse = {
  awaitingReview?: QueueItem[];
  all?: QueueItem[];
  summary?: {
    totalInQueue: number;
    awaitingReview: number;
    submittedToday: number;
    overdue: number;
    readyForApproval: number;
    avgReviewDays: number;
  };
  workload?: Array<{ id: string; name: string; email?: string | null; count: number }>;
};

const PAGE_SIZE_OPTIONS = [8, 10, 20, 50];

const QUEUE_COLORS: Record<string, string> = {
  awaiting_review: '#7c3aed',
  submitted: '#ea580c',
  needs_info: '#2563eb',
  reviewed: '#4f46e5',
  ready_for_approval: '#059669',
  overdue: '#c41230',
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
  return full || user.email || 'Analyst';
}

function shortOrgId(id?: string) {
  if (!id) return '';
  return `ORG-${id.slice(-5).toUpperCase()}`;
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

function riskTone(band?: string) {
  const value = (band || '').toLowerCase();
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'moderate') return 'moderate';
  if (value === 'low' || value === 'controlled') return 'low';
  return 'none';
}

function queueLabel(status: string) {
  switch (status) {
    case 'awaiting_review': return 'Awaiting Review';
    case 'submitted': return 'Submitted';
    case 'needs_info': return 'Needs Info';
    case 'reviewed': return 'Reviewed';
    case 'ready_for_approval': return 'Ready for Approval';
    case 'overdue': return 'Overdue';
    default: return status;
  }
}

function priorityLabel(p: string) {
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function scoreColor(score: number) {
  if (score >= 70) return '#c41230';
  if (score >= 45) return '#d97706';
  return '#059669';
}

function ScoreRing({ value }: { value: number | null }) {
  const size = 44;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value === null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const color = value === null ? '#cbd5e1' : scoreColor(clamped);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="queue2-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="queue2-ring-text">
        {value === null ? '—' : clamped.toFixed(0)}
      </text>
    </svg>
  );
}

function slaLabel(item: QueueItem) {
  const due = new Date(item.dueDate).getTime();
  const now = Date.now();
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (item.overdue || diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, tone: 'danger' as const };
  }
  if (diffDays === 0) return { text: 'Due today', tone: 'warn' as const };
  if (diffDays <= 1) return { text: 'Due in 1d', tone: 'warn' as const };
  return { text: `Due in ${diffDays}d`, tone: 'ok' as const };
}

export default function ReviewQueuePage() {
  const [data, setData] = useState<QueueResponse>({ awaitingReview: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [analystFilter, setAnalystFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<QueueResponse>('/analyst/queue')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const items = data.awaitingReview || data.all || [];
  const summary = data.summary || {
    totalInQueue: items.length,
    awaitingReview: items.filter((i) => i.queueStatus === 'awaiting_review').length,
    submittedToday: 0,
    overdue: items.filter((i) => i.queueStatus === 'overdue').length,
    readyForApproval: items.filter((i) => ['ready_for_approval', 'reviewed'].includes(i.queueStatus)).length,
    avgReviewDays: 0,
  };
  const workload = data.workload || [];

  const organisations = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of items) {
      if (a.organisation?.id) map.set(a.organisation.id, a.organisation.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const analysts = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of items) {
      if (a.assignedAnalyst?.id) map.set(a.assignedAnalyst.id, displayName(a.assignedAnalyst));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(() => {
    const q = (query || headerSearch).trim().toLowerCase();
    return items.filter((a) => {
      if (q) {
        const hay = [a.reference, a.title, a.organisation?.name, displayName(a.assignedAnalyst)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (orgFilter && a.organisation?.id !== orgFilter) return false;
      if (statusFilter && a.queueStatus !== statusFilter) return false;
      const band = a.scoreSnapshots?.[0]?.riskBand || '';
      if (riskFilter) {
        if (riskFilter === 'Low') {
          if (!['Low', 'Controlled'].includes(band)) return false;
        } else if (band !== riskFilter) return false;
      }
      if (analystFilter && a.assignedAnalyst?.id !== analystFilter) return false;
      const submitted = a.submittedAt || a.updatedAt;
      if (dateFrom && new Date(submitted) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(submitted) > to) return false;
      }
      return true;
    });
  }, [items, query, headerSearch, orgFilter, statusFilter, riskFilter, analystFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, headerSearch, orgFilter, statusFilter, riskFilter, analystFilter, dateFrom, dateTo, pageSize]);

  const queueDonut = useMemo(() => {
    const counts: Record<string, number> = {
      awaiting_review: 0,
      submitted: 0,
      needs_info: 0,
      reviewed: 0,
      ready_for_approval: 0,
      overdue: 0,
    };
    for (const item of items) {
      if (counts[item.queueStatus] !== undefined) counts[item.queueStatus] += 1;
    }
    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name: queueLabel(name), key: name, value, color: QUEUE_COLORS[name] }));
  }, [items]);

  const alerts = useMemo(() => {
    const list: Array<{ tone: 'danger' | 'warn' | 'info'; title: string; detail: string }> = [];
    if (summary.overdue > 0) {
      list.push({
        tone: 'danger',
        title: `${summary.overdue} assessment${summary.overdue === 1 ? '' : 's'} overdue`,
        detail: 'SLA breached — prioritise immediately',
      });
    }
    const missingEvidence = items.filter((i) => !(i._count?.evidence)).length;
    if (missingEvidence > 0) {
      list.push({
        tone: 'warn',
        title: `${missingEvidence} missing evidence packs`,
        detail: 'Request files before approval',
      });
    }
    if (summary.readyForApproval > 0) {
      list.push({
        tone: 'info',
        title: `${summary.readyForApproval} ready for approval`,
        detail: 'Reviewed and waiting on final sign-off',
      });
    }
    if (!list.length) {
      list.push({ tone: 'info', title: 'Queue is clear', detail: 'No urgent review alerts right now' });
    }
    return list.slice(0, 4);
  }, [items, summary]);

  const maxWorkload = Math.max(1, ...workload.map((w) => w.count));

  function clearFilters() {
    setQuery('');
    setHeaderSearch('');
    setOrgFilter('');
    setStatusFilter('');
    setRiskFilter('');
    setAnalystFilter('');
    setDateFrom('');
    setDateTo('');
  }

  function exportCsv() {
    const rows = [
      ['Reference', 'Organisation', 'Submitted', 'Queue Status', 'Risk', 'SCLI', 'Leakage', 'Evidence', 'Analyst', 'Priority', 'Due'],
      ...filtered.map((a) => {
        const snap = a.scoreSnapshots?.[0];
        return [
          a.reference,
          a.organisation?.name || '',
          formatDateTime(a.submittedAt || a.updatedAt),
          queueLabel(a.queueStatus),
          snap?.riskBand || '',
          snap ? String(Number(snap.overallRiskScore).toFixed(1)) : '',
          String(snap?.leakageResult?.likelyLeakageValue || ''),
          String(a._count?.evidence || 0),
          displayName(a.assignedAnalyst),
          priorityLabel(a.priority),
          formatDateTime(a.dueDate),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-review-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthGate>
      <Shell
        title="Review Queue"
        hideEyebrow
        subtitle="Review submitted assessments awaiting analyst review and approval."
        searchPlaceholder="Search assessments, organisation…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export
          </button>
          <button type="button" className="btn secondary org2-export-btn" onClick={() => setShowFilters((v) => !v)}>
            <IconFilter />
            {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={ClipboardList}
            title="Total In Queue"
            value={summary.totalInQueue}
            description="Active review backlog"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={Clock}
            title="Awaiting Review"
            value={summary.awaitingReview}
            description="Needs analyst action"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={Send}
            title="Submitted Today"
            value={summary.submittedToday}
            description="New intake"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={AlertTriangle}
            title="Overdue Reviews"
            value={summary.overdue}
            description="SLA breached"
            tone="red"
            trendTone={summary.overdue > 0 ? 'down' : undefined}
            loading={loading}
          />
          <StatCard
            icon={BadgeCheck}
            title="Ready for Approval"
            value={summary.readyForApproval}
            description="Reviewed / QA"
            tone="green"
            loading={loading}
          />
          <StatCard
            icon={User}
            title="Avg Review Time"
            value={`${summary.avgReviewDays}d`}
            description="Queue age / cycle time"
            tone="slate"
            loading={loading}
          />
        </div>

        {showFilters && (
          <section className="dash2-card org2-filters-card">
            <div className="assess2-filters">
              <label className="org2-filter-search">
                <IconSearch />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search assessments…"
                  aria-label="Filter review queue"
                />
              </label>
              <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organisation">
                <option value="">Organisation</option>
                {organisations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
                <option value="">Status</option>
                {['awaiting_review', 'submitted', 'needs_info', 'reviewed', 'ready_for_approval', 'overdue'].map((s) => (
                  <option key={s} value={s}>{queueLabel(s)}</option>
                ))}
              </select>
              <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Risk rating">
                <option value="">Risk Rating</option>
                {['Critical', 'High', 'Moderate', 'Low'].map((band) => <option key={band} value={band}>{band}</option>)}
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
        )}

        <div className="queue2-layout">
          <section className="dash2-card org2-table-card">
            <div className="table-wrap">
              <table className="queue2-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Organisation</th>
                    <th>Submitted Date</th>
                    <th>Queue Status</th>
                    <th>Risk Rating</th>
                    <th>SCLI Score</th>
                    <th>Likely Leakage (ZAR)</th>
                    <th>Evidence</th>
                    <th>Assigned Analyst</th>
                    <th>Priority</th>
                    <th>SLA / Age</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((a) => {
                    const snap = a.scoreSnapshots?.[0];
                    const score = snap ? Number(snap.overallRiskScore) : null;
                    const leakage = Number(snap?.leakageResult?.likelyLeakageValue || 0);
                    const evidenceCount = a._count?.evidence || 0;
                    const analystName = displayName(a.assignedAnalyst);
                    const sla = slaLabel(a);
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="assess2-ref-cell">
                            <Link href={`/assessments/${a.id}/review`}><strong>{a.reference}</strong></Link>
                            <span className="muted small">{a.title || 'Security Risk Assessment'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="assess2-org-cell">
                            <strong>{a.organisation?.name || '—'}</strong>
                            <span className="muted small">{shortOrgId(a.organisation?.id)}</span>
                          </div>
                        </td>
                        <td className="muted small">{formatDateTime(a.submittedAt || a.updatedAt)}</td>
                        <td>
                          <span className={`queue2-status status-${a.queueStatus}`}>
                            {queueLabel(a.queueStatus)}
                          </span>
                        </td>
                        <td>
                          {snap?.riskBand ? (
                            <span className={`org2-risk-badge risk-${riskTone(snap.riskBand)}`}>
                              {snap.riskBand === 'Controlled' ? 'Low' : snap.riskBand}
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td><ScoreRing value={score !== null && !Number.isNaN(score) ? score : null} /></td>
                        <td>{leakage > 0 ? <strong>{money(leakage)}</strong> : <span className="muted">—</span>}</td>
                        <td>
                          {evidenceCount > 0 ? (
                            <span className="queue2-evidence ok">{evidenceCount} file{evidenceCount === 1 ? '' : 's'}</span>
                          ) : (
                            <span className="queue2-evidence missing">Missing</span>
                          )}
                        </td>
                        <td>
                          {analystName ? (
                            <div className="assess2-analyst">
                              <span className="assess2-analyst-avatar">{initials(analystName)}</span>
                              <strong>{analystName}</strong>
                            </div>
                          ) : <span className="muted">Unassigned</span>}
                        </td>
                        <td>
                          <span className={`queue2-priority priority-${a.priority}`}>
                            {priorityLabel(a.priority)}
                          </span>
                        </td>
                        <td>
                          <span className={`queue2-sla tone-${sla.tone}`}>
                            <i />
                            {sla.text}
                          </span>
                        </td>
                        <td className="org2-actions-cell">
                          <RowActionsMenu
                            open={menuOpenId === a.id}
                            onClose={() => setMenuOpenId(null)}
                            trigger={(
                              <button
                                type="button"
                                className="org2-menu-btn"
                                aria-label="Queue actions"
                                onClick={() => setMenuOpenId((id) => (id === a.id ? null : a.id))}
                              >
                                <IconMoreVertical />
                              </button>
                            )}
                          >
                            <Link href={`/assessments/${a.id}/review`} onClick={() => setMenuOpenId(null)}>Open review</Link>
                            <Link href={`/assessments/${a.id}`} onClick={() => setMenuOpenId(null)}>Open assessment</Link>
                            {a.organisation?.id && (
                              <Link href={`/organisations/${a.organisation.id}`} onClick={() => setMenuOpenId(null)}>View organisation</Link>
                            )}
                          </RowActionsMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && !pageItems.length && (
                    <tr><td colSpan={12} className="muted">No assessments in the review queue match these filters.</td></tr>
                  )}
                  {loading && (
                    <tr><td colSpan={12} className="muted">Loading review queue…</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="org2-pagination">
              <span>
                Showing {showingFrom} to {showingTo} of {filtered.length} assessments
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
                  <h2>Queue Summary</h2>
                  <p>Status mix across the backlog</p>
                </div>
              </div>
              <div className="dash2-donut-wrap compact">
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie
                      data={queueDonut.length ? queueDonut : [{ name: 'Empty', value: 1, color: '#e5e7eb' }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {(queueDonut.length ? queueDonut : [{ name: 'Empty', value: 1, color: '#e5e7eb' }]).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash2-donut-center">
                  <span>QUEUE</span>
                  <strong>{summary.totalInQueue}</strong>
                  <em>Total</em>
                </div>
              </div>
              <ul className="dash2-legend">
                {queueDonut.map((entry) => (
                  <li key={entry.key}>
                    <i style={{ background: entry.color }} />
                    <span>{entry.name}</span>
                    <strong>{entry.value}</strong>
                  </li>
                ))}
                {!queueDonut.length && <li className="muted dash2-legend-empty">No queue items yet.</li>}
              </ul>
            </section>

            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Review Alerts</h2>
                  <p>Items needing attention</p>
                </div>
                <Link href="/assessments/assigned" className="queue2-view-all">View all</Link>
              </div>
              <ul className="dash2-alerts">
                {alerts.map((alert) => (
                  <li key={alert.title} className={`dash2-alert dash2-alert-${alert.tone === 'danger' ? 'danger' : alert.tone === 'warn' ? 'warn' : 'info'}`}>
                    <span className="dash2-alert-icon">
                      {alert.tone === 'danger' ? <IconAlertTriangle /> : alert.tone === 'warn' ? <IconClock /> : <IconBadgeCheck />}
                    </span>
                    <div>
                      <strong>{alert.title}</strong>
                      <span>{alert.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="dash2-card">
              <div className="dash2-card-head">
                <div>
                  <h2>Analyst Workload</h2>
                  <p>Assigned reviews in queue</p>
                </div>
                <Link href="/assessments" className="queue2-view-all">View all</Link>
              </div>
              <ul className="queue2-workload">
                {workload.slice(0, 6).map((w) => (
                  <li key={w.id}>
                    <span className="assess2-analyst-avatar">{initials(w.name)}</span>
                    <div className="queue2-workload-body">
                      <div className="queue2-workload-top">
                        <strong>{w.name}</strong>
                        <em>{w.count}</em>
                      </div>
                      <div className="queue2-workload-bar">
                        <span style={{ width: `${Math.max(8, (w.count / maxWorkload) * 100)}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
                {!workload.length && <li className="muted">No analyst assignments yet.</li>}
              </ul>
            </section>
          </aside>
        </div>
      </Shell>
    </AuthGate>
  );
}
