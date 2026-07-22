'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Send,
} from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { RowActionsMenu } from '../../../components/RowActionsMenu';
import {
  IconCalendar,
  IconDownload,
  IconFilter,
  IconMoreVertical,
  IconRotateCcw,
  IconSend,
} from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch } from '../../../lib/api';

type EmailJob = {
  id: string;
  recipient: string;
  subject: string;
  template: string;
  status: string;
  attemptCount: number;
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
  organisationId?: string | null;
  organisationName?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  uiStatus?: 'delivered' | 'failed' | 'pending' | 'scheduled';
  emailType?: 'notification' | 'report' | 'alert' | 'system' | 'invite' | 'security';
  deliverability?: number | null;
  opened?: boolean;
};

type StatusTab = 'all' | 'delivered' | 'failed' | 'pending' | 'scheduled';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

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

function uiStatusOf(job: EmailJob): StatusTab {
  if (job.uiStatus) return job.uiStatus;
  if (job.status === 'SENT') return 'delivered';
  if (job.status === 'FAILED' || job.status === 'CANCELLED') return 'failed';
  if (job.status === 'QUEUED') return 'scheduled';
  return 'pending';
}

function typeLabel(type?: string) {
  switch (type) {
    case 'report': return 'Report';
    case 'alert': return 'Alert';
    case 'system': return 'System';
    case 'invite': return 'Invite';
    case 'security': return 'Security';
    default: return 'Notification';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'delivered': return 'Delivered';
    case 'failed': return 'Failed';
    case 'pending': return 'Pending';
    case 'scheduled': return 'Scheduled';
    default: return status;
  }
}

export default function EmailLogsPage() {
  const [items, setItems] = useState<EmailJob[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [headerSearch, setHeaderSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const load = () =>
    apiFetch<EmailJob[] | { items: EmailJob[] }>('/admin/emails')
      .then((data) => setItems(Array.isArray(data) ? data : (data.items || [])))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  const organisations = useMemo(() => {
    return [...new Set(items.map((i) => i.organisationName).filter(Boolean) as string[])].sort();
  }, [items]);

  const templates = useMemo(() => {
    return [...new Set(items.map((i) => i.template).filter(Boolean))].sort();
  }, [items]);

  const summary = useMemo(() => {
    const total = items.length;
    const delivered = items.filter((i) => uiStatusOf(i) === 'delivered').length;
    const failed = items.filter((i) => uiStatusOf(i) === 'failed').length;
    const pending = items.filter((i) => {
      const s = uiStatusOf(i);
      return s === 'pending' || s === 'scheduled';
    }).length;
    return {
      total,
      delivered,
      deliveredPct: total ? Math.round((delivered / total) * 1000) / 10 : 0,
      failed,
      failedPct: total ? Math.round((failed / total) * 1000) / 10 : 0,
      pending,
      pendingPct: total ? Math.round((pending / total) * 1000) / 10 : 0,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const q = (query || headerSearch).trim().toLowerCase();
    return items.filter((job) => {
      const status = uiStatusOf(job);
      if (tab !== 'all' && status !== tab) return false;
      if (statusFilter && status !== statusFilter) return false;
      if (typeFilter && (job.emailType || 'notification') !== typeFilter) return false;
      if (orgFilter && job.organisationName !== orgFilter) return false;
      if (templateFilter && job.template !== templateFilter) return false;
      if (q) {
        const hay = [job.recipient, job.subject, job.template, job.organisationName, job.errorMessage]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const when = job.sentAt || job.createdAt;
      if (dateFrom && new Date(when) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(when) > to) return false;
      }
      return true;
    });
  }, [items, tab, statusFilter, typeFilter, orgFilter, templateFilter, query, headerSearch, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);
  const detail = items.find((i) => i.id === detailId) || null;

  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, typeFilter, orgFilter, templateFilter, query, headerSearch, dateFrom, dateTo, pageSize]);

  const tabCounts = useMemo(() => ({
    all: items.length,
    delivered: items.filter((i) => uiStatusOf(i) === 'delivered').length,
    failed: items.filter((i) => uiStatusOf(i) === 'failed').length,
    pending: items.filter((i) => uiStatusOf(i) === 'pending').length,
    scheduled: items.filter((i) => uiStatusOf(i) === 'scheduled').length,
  }), [items]);

  function clearFilters() {
    setQuery('');
    setHeaderSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setOrgFilter('');
    setTemplateFilter('');
    setDateFrom('');
    setDateTo('');
    setTab('all');
  }

  function exportCsv() {
    const rows = [
      ['Date', 'To', 'Subject', 'Type', 'Organisation', 'Status', 'Template', 'Attempts', 'Error'],
      ...filtered.map((job) => [
        formatDateTime(job.sentAt || job.createdAt),
        job.recipient,
        job.subject,
        typeLabel(job.emailType),
        job.organisationName || '',
        statusLabel(uiStatusOf(job)),
        job.template,
        String(job.attemptCount),
        job.errorMessage || '',
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-email-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function processQueue() {
    setProcessing(true);
    setError('');
    setNotice('');
    try {
      const result = await apiFetch<{ processed?: number; skipped?: boolean }>('/admin/emails/process', {
        method: 'POST',
        body: '{}',
      });
      setNotice(`Processed ${result.processed || 0} job(s)${result.skipped ? ' (SMTP not configured)' : ''}.`);
      setLoading(true);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to process queue.');
    } finally {
      setProcessing(false);
    }
  }

  async function retry(id: string) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/emails/${id}/retry`, { method: 'POST', body: '{}' });
      setNotice('Email re-queued.');
      setMenuOpenId(null);
      setLoading(true);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to retry email.');
    }
  }

  return (
    <AuthGate>
      <Shell
        title="Email Logs"
        hideEyebrow
        subtitle="View and monitor all system emails and notifications."
        searchPlaceholder="Search emails, recipients…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export Logs
          </button>
          <button type="button" className="btn org2-add-btn" onClick={() => void processQueue()} disabled={processing}>
            <IconSend />
            {processing ? 'Processing…' : 'Process Queue'}
          </button>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={Send}
            title="Total Emails Sent"
            value={summary.total}
            description="All queued jobs"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={CheckCircle2}
            title="Delivered"
            value={`${summary.delivered} (${summary.deliveredPct}%)`}
            description="Successfully sent"
            tone="green"
            loading={loading}
          />
          <StatCard
            icon={AlertTriangle}
            title="Failed"
            value={`${summary.failed} (${summary.failedPct}%)`}
            description="Needs retry"
            tone="amber"
            trendTone={summary.failed > 0 ? 'down' : undefined}
            loading={loading}
          />
          <StatCard
            icon={Clock}
            title="Pending"
            value={`${summary.pending} (${summary.pendingPct}%)`}
            description="In queue / processing"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={Mail}
            title="Open Rate"
            value="—"
            description="Not tracked in MVP"
            tone="red"
            loading={loading}
          />
        </div>

        <section className="dash2-card org2-filters-card">
          <div className="assess2-filters email2-filters">
            <label className="assess2-date-range">
              <IconCalendar />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From date" />
              <span>—</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To date" />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Status (All Statuses)</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Email type">
              <option value="">Email Type (All Types)</option>
              {['notification', 'report', 'alert', 'system', 'invite', 'security'].map((t) => (
                <option key={t} value={t}>{typeLabel(t)}</option>
              ))}
            </select>
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organisation">
              <option value="">Organisation (All Organisations)</option>
              {organisations.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} aria-label="Template">
              <option value="">Template (All Templates)</option>
              {templates.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" className="dash2-filter-btn" title="Filters">
              <IconFilter />
              Filters
            </button>
            <button type="button" className="dash2-filter-btn" onClick={clearFilters}>
              <IconRotateCcw />
              Clear
            </button>
          </div>
        </section>

        <div className="meth2-tabs email2-tabs">
          {([
            ['all', `All Emails (${tabCounts.all})`],
            ['delivered', `Delivered (${tabCounts.delivered})`],
            ['failed', `Failed (${tabCounts.failed})`],
            ['pending', `Pending (${tabCounts.pending})`],
            ['scheduled', `Scheduled (${tabCounts.scheduled})`],
          ] as Array<[StatusTab, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'active' : ''}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="email2-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>Organisation</th>
                  <th>Status</th>
                  <th>Deliverability</th>
                  <th>Opened</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((job) => {
                  const status = uiStatusOf(job);
                  const deliverability = job.deliverability ?? (status === 'delivered' ? 100 : status === 'failed' ? 0 : null);
                  return (
                    <tr key={job.id}>
                      <td className="muted small">{formatDateTime(job.sentAt || job.createdAt)}</td>
                      <td><strong>{job.recipient}</strong></td>
                      <td>
                        <div className="email2-subject">
                          <strong>{job.subject}</strong>
                          <span className="muted small">{job.template}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`email2-type type-${job.emailType || 'notification'}`}>
                          {typeLabel(job.emailType)}
                        </span>
                      </td>
                      <td>{job.organisationName || '—'}</td>
                      <td>
                        <span className={`email2-status status-${status}`}>{statusLabel(status)}</span>
                      </td>
                      <td>
                        {deliverability === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={`email2-deliverability tone-${deliverability === 100 ? 'ok' : 'danger'}`}>
                            <i />
                            {deliverability}%
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`email2-opened ${job.opened ? 'yes' : 'no'}`}>
                          <i />
                          {job.opened ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="org2-actions-cell">
                        <RowActionsMenu
                          open={menuOpenId === job.id}
                          onClose={() => setMenuOpenId(null)}
                          trigger={(
                            <button
                              type="button"
                              className="org2-menu-btn"
                              aria-label="Email actions"
                              onClick={() => setMenuOpenId((id) => (id === job.id ? null : job.id))}
                            >
                              <IconMoreVertical />
                            </button>
                          )}
                        >
                          <button type="button" onClick={() => { setDetailId(job.id); setMenuOpenId(null); }}>
                            View details
                          </button>
                          {status === 'failed' && (
                            <button type="button" onClick={() => void retry(job.id)}>Retry</button>
                          )}
                        </RowActionsMenu>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !pageItems.length && (
                  <tr><td colSpan={9} className="muted">No emails match the current filters.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan={9} className="muted">Loading email logs…</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="org2-pagination">
            <span>
              Showing {showingFrom} to {showingTo} of {filtered.length} emails
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

        {detail && (
          <section className="dash2-card email2-detail">
            <div className="dash2-card-head">
              <div>
                <h2>Email details</h2>
                <p>{detail.subject}</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setDetailId(null)}>Close</button>
            </div>
            <div className="email2-detail-grid">
              <div><em>To</em><strong>{detail.recipient}</strong></div>
              <div><em>Status</em><strong>{statusLabel(uiStatusOf(detail))}</strong></div>
              <div><em>Template</em><strong>{detail.template}</strong></div>
              <div><em>Attempts</em><strong>{detail.attemptCount}</strong></div>
              <div><em>Organisation</em><strong>{detail.organisationName || '—'}</strong></div>
              <div><em>Sent</em><strong>{formatDateTime(detail.sentAt)}</strong></div>
              <div><em>Created</em><strong>{formatDateTime(detail.createdAt)}</strong></div>
              <div><em>Related</em><strong>{detail.relatedType || '—'}{detail.relatedId ? ` · ${detail.relatedId.slice(-8)}` : ''}</strong></div>
            </div>
            {detail.errorMessage && (
              <p className="error" style={{ marginTop: 12 }}>{detail.errorMessage}</p>
            )}
            {uiStatusOf(detail) === 'failed' && (
              <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => void retry(detail.id)}>
                Retry send
              </button>
            )}
          </section>
        )}
      </Shell>
    </AuthGate>
  );
}
