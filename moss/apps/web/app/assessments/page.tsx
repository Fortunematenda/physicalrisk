'use client';

import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  ClipboardList,
  Clock,
  FileCheck,
  Send,
  User,
} from 'lucide-react';
import { AuthGate } from '../../components/AuthGate';
import { Shell } from '../../components/Shell';
import { RowActionsMenu } from '../../components/RowActionsMenu';
import {
  IconCalendar,
  IconChevronRight,
  IconDownload,
  IconFilter,
  IconMoreVertical,
  IconPlus,
  IconRotateCcw,
  IconSearch,
} from '../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { apiFetch, money } from '../../lib/api';
import { getStoredUser, resolveMvpNavRole } from '../../lib/auth-user';

type UserRef = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type Assessment = {
  id: string;
  reference: string;
  title: string;
  status: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  organisation?: { id: string; name: string; industry?: string | null };
  organisationId?: string;
  createdBy?: UserRef | null;
  reviewedBy?: UserRef | null;
  assignments?: Array<{
    id: string;
    role: string;
    status: string;
    user?: UserRef | null;
  }>;
  scoreSnapshots?: Array<{
    overallRiskScore: number | string;
    maturityScore?: number | string;
    riskBand: string;
    leakageResult?: {
      minimumLeakageValue?: number;
      likelyLeakageValue?: number;
      maximumExposureValue?: number;
      recoverableLow?: number;
      recoverableHigh?: number;
    };
  }>;
  reports?: Array<{ id: string; status: string }>;
  _count?: { reports?: number };
  publicLead?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    status?: string;
    completedAt?: string | null;
  } | null;
  progress?: { percent: number; label: string };
};

type UiStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'awaiting_review'
  | 'approved'
  | 'report_issued';

const PAGE_SIZE_OPTIONS = [8, 10, 20, 50];

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

function relativeTime(iso: string) {
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

function mapUiStatus(a: Assessment): UiStatus {
  const status = a.status;
  const hasIssuedReport = (a.reports || []).some((r) => r.status === 'ISSUED')
    || ['REPORT_ISSUED', 'REPORT_GENERATED'].includes(status);
  if (hasIssuedReport) return 'report_issued';
  if (status === 'APPROVED') return 'approved';
  if (['ANALYST_REVIEW', 'EVIDENCE_REVIEW', 'QUALITY_ASSURANCE', 'REVIEWED', 'AUTOMATED_EVALUATION_COMPLETE'].includes(status)) {
    return 'awaiting_review';
  }
  if (status === 'SUBMITTED' || a.publicLead?.status === 'COMPLETED') return 'submitted';
  if (status === 'DRAFT') return 'draft';
  return 'in_progress';
}

function uiStatusLabel(status: UiStatus) {
  switch (status) {
    case 'draft': return 'Draft';
    case 'in_progress': return 'In Progress';
    case 'submitted': return 'Submitted';
    case 'awaiting_review': return 'Awaiting Review';
    case 'approved': return 'Approved';
    case 'report_issued': return 'Report Issued';
  }
}

function riskTone(band?: string) {
  const value = (band || '').toLowerCase();
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'moderate') return 'moderate';
  if (value === 'low' || value === 'controlled') return 'low';
  return 'none';
}

function scoreColor(score: number) {
  if (score >= 70) return '#c41230';
  if (score >= 45) return '#d97706';
  return '#059669';
}

function ScoreRing({ value, label }: { value: number | null; label: string }) {
  const size = 46;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value === null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const color = value === null ? '#cbd5e1' : scoreColor(clamped);

  return (
    <div className="assess2-ring" title={`${label}: ${value === null ? '—' : clamped.toFixed(0)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="assess2-ring-text">
          {value === null ? '—' : clamped.toFixed(0)}
        </text>
      </svg>
      <span>{label}</span>
    </div>
  );
}

function shortOrgId(id?: string) {
  if (!id) return '';
  return `ORG-${id.slice(-5).toUpperCase()}`;
}

export default function AssessmentsPage() {
  const [items, setItems] = useState<Assessment[]>([]);
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';

  const load = () =>
    apiFetch<Assessment[]>('/assessments')
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  function startEdit(a: Assessment) {
    setEditing({ id: a.id, title: a.title });
    setEditTitle(a.title);
    setMenuOpenId(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const title = editTitle.trim();
    if (title.length < 2) {
      setError('Assessment title must be at least 2 characters.');
      return;
    }
    setSavingEdit(true);
    setError('');
    try {
      await apiFetch(`/assessments/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setItems((prev) => prev.map((item) => (item.id === editing.id ? { ...item, title } : item)));
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update assessment.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAssessment(a: Assessment) {
    const label = a.reference || a.title;
    const ok = window.confirm(`Delete assessment “${label}”? This cannot be undone.`);
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(a.id);
    setError('');
    try {
      await apiFetch(`/assessments/${a.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== a.id));
      if (editing?.id === a.id) setEditing(null);
      if (expandedId === a.id) setExpandedId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete assessment.');
    } finally {
      setBusyId(null);
    }
  }

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
      const analyst = a.assignments?.find((x) => x.role === 'PRIMARY_ANALYST')?.user
        || a.reviewedBy
        || a.createdBy;
      if (analyst?.id) map.set(analyst.id, displayName(analyst));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const enriched = useMemo(() => {
    return items.map((a) => {
      const uiStatus = mapUiStatus(a);
      const snap = a.scoreSnapshots?.[0];
      const analyst = a.assignments?.find((x) => x.role === 'PRIMARY_ANALYST')?.user
        || a.reviewedBy
        || a.createdBy
        || null;
      const assessmentDate = a.submittedAt || a.publicLead?.completedAt || a.createdAt;
      return { ...a, uiStatus, snap, analyst, assessmentDate };
    });
  }, [items]);

  const summary = useMemo(() => {
    const counts = {
      total: enriched.length,
      inProgress: 0,
      submitted: 0,
      awaitingReview: 0,
      approved: 0,
      reportsIssued: 0,
    };
    for (const a of enriched) {
      if (a.uiStatus === 'in_progress') counts.inProgress += 1;
      if (a.uiStatus === 'submitted') counts.submitted += 1;
      if (a.uiStatus === 'awaiting_review') counts.awaitingReview += 1;
      if (a.uiStatus === 'approved') counts.approved += 1;
      if (a.uiStatus === 'report_issued') counts.reportsIssued += 1;
    }
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = (query || headerSearch).trim().toLowerCase();
    return enriched.filter((a) => {
      if (q) {
        const hay = [
          a.reference,
          a.title,
          a.organisation?.name,
          a.organisation?.industry,
          a.publicLead?.email,
          displayName(a.analyst),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (orgFilter && a.organisation?.id !== orgFilter) return false;
      if (statusFilter && a.uiStatus !== statusFilter) return false;
      const band = a.snap?.riskBand || '';
      if (riskFilter) {
        if (riskFilter === 'Low') {
          if (!['Low', 'Controlled'].includes(band)) return false;
        } else if (band !== riskFilter) return false;
      }
      if (analystFilter && a.analyst?.id !== analystFilter) return false;
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(a.assessmentDate) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(a.assessmentDate) > to) return false;
      }
      return true;
    });
  }, [enriched, query, headerSearch, orgFilter, statusFilter, riskFilter, analystFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, headerSearch, orgFilter, statusFilter, riskFilter, analystFilter, dateFrom, dateTo, pageSize]);

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
      ['Reference', 'Title', 'Organisation', 'Date', 'Status', 'Risk', 'SCLI Score', 'Governance Score', 'Likely Leakage', 'Analyst', 'Updated'],
      ...filtered.map((a) => {
        const leakage = Number(a.snap?.leakageResult?.likelyLeakageValue || 0);
        return [
          a.reference,
          a.title,
          a.organisation?.name || '',
          formatDate(a.assessmentDate),
          uiStatusLabel(a.uiStatus),
          a.snap?.riskBand || '',
          a.snap ? String(Number(a.snap.overallRiskScore).toFixed(1)) : '',
          a.snap?.maturityScore != null ? String(Number(a.snap.maturityScore).toFixed(1)) : '',
          leakage ? String(leakage) : '',
          displayName(a.analyst),
          formatDate(a.updatedAt),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moss-assessments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthGate>
      <Shell
        title="Assessments"
        hideEyebrow
        subtitle="View and manage all assessments across your organisations."
        searchPlaceholder="Search assessments…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}

        {editing && (
          <form className="dash2-card org2-create-card" onSubmit={saveEdit}>
            <div className="dash2-card-head">
              <div>
                <h2>Edit assessment</h2>
                <p>Update the assessment title shown in lists and reports</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Title</label>
                <input
                  required
                  minLength={2}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button className="btn" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={savingEdit}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export
          </button>
          <Link href="/assessments/new" className="btn org2-add-btn">
            <IconPlus />
            New Assessment
          </Link>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={ClipboardList}
            title="Total Assessments"
            value={summary.total}
            description="Portfolio volume"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={Send}
            title="In Progress"
            value={summary.inProgress}
            description="Active sessions"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={Clock}
            title="Submitted"
            value={summary.submitted}
            description="Ready for triage"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={User}
            title="Awaiting Review"
            value={summary.awaitingReview}
            description="Analyst queue"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={BadgeCheck}
            title="Approved"
            value={summary.approved}
            description="Verified assessments"
            tone="green"
            loading={loading}
          />
          <StatCard
            icon={FileCheck}
            title="Reports Issued"
            value={summary.reportsIssued}
            description="Client deliverables"
            tone="slate"
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
                placeholder="Search assessments…"
                aria-label="Filter assessments"
              />
            </label>
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} aria-label="Organisation">
              <option value="">Organisation</option>
              {organisations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
              <option value="">Status</option>
              <option value="draft">Draft</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="awaiting_review">Awaiting Review</option>
              <option value="approved">Approved</option>
              <option value="report_issued">Report Issued</option>
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

        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="assess2-table">
              <thead>
                <tr>
                  <th className="assess2-expand-col" />
                  <th>Assessment</th>
                  <th>Organisation</th>
                  <th>Assessment Date</th>
                  <th>Status</th>
                  <th>Risk Rating</th>
                  <th>Score</th>
                  <th>Likely Leakage (ZAR)</th>
                  <th>Responsible Analyst</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((a) => {
                  const scli = a.snap ? Number(a.snap.overallRiskScore) : null;
                  const gov = a.snap?.maturityScore != null ? Number(a.snap.maturityScore) : null;
                  const leakage = Number(a.snap?.leakageResult?.likelyLeakageValue || 0);
                  const minLeak = Number(a.snap?.leakageResult?.minimumLeakageValue || 0);
                  const maxLeak = Number(a.snap?.leakageResult?.maximumExposureValue || a.snap?.leakageResult?.recoverableHigh || 0);
                  const band = a.snap?.riskBand;
                  const analystName = displayName(a.analyst);
                  const expanded = expandedId === a.id;

                  return (
                    <Fragment key={a.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className={`assess2-expand-btn${expanded ? ' open' : ''}`}
                            aria-label={expanded ? 'Collapse row' : 'Expand row'}
                            onClick={() => setExpandedId((id) => (id === a.id ? null : a.id))}
                          >
                            <IconChevronRight />
                          </button>
                        </td>
                        <td>
                          <div className="assess2-ref-cell">
                            <Link href={`/assessments/${a.id}`}><strong>{a.reference}</strong></Link>
                            <span className="muted small">{a.title || 'Security Risk Assessment'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="assess2-org-cell">
                            <strong>{a.organisation?.name || '—'}</strong>
                            <span className="muted small">{shortOrgId(a.organisation?.id)}</span>
                          </div>
                        </td>
                        <td>{formatDate(a.assessmentDate)}</td>
                        <td>
                          <span className={`assess2-status-badge status-${a.uiStatus}`}>
                            {uiStatusLabel(a.uiStatus)}
                          </span>
                        </td>
                        <td>
                          {band ? (
                            <span className={`org2-risk-badge risk-${riskTone(band)}`}>
                              {band === 'Controlled' ? 'Low' : band}
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>
                          <div className="assess2-scores">
                            <ScoreRing value={scli !== null && !Number.isNaN(scli) ? scli : null} label="SCLI" />
                            <ScoreRing value={gov !== null && !Number.isNaN(gov) ? gov : null} label="Gov" />
                          </div>
                        </td>
                        <td>
                          {leakage > 0 ? (
                            <div className="assess2-leakage">
                              <strong>{money(leakage)}</strong>
                              {(minLeak > 0 || maxLeak > 0) && (
                                <span className="muted small">
                                  ({money(minLeak)} – {money(maxLeak || leakage)})
                                </span>
                              )}
                            </div>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>
                          {analystName ? (
                            <div className="assess2-analyst">
                              <span className="assess2-analyst-avatar">{initials(analystName)}</span>
                              <strong>{analystName}</strong>
                            </div>
                          ) : <span className="muted">Unassigned</span>}
                        </td>
                        <td className="muted">{relativeTime(a.updatedAt)}</td>
                        <td className="org2-actions-cell">
                          <RowActionsMenu
                            open={menuOpenId === a.id}
                            onClose={() => setMenuOpenId(null)}
                            trigger={(
                              <button
                                type="button"
                                className="org2-menu-btn"
                                aria-label="Assessment actions"
                                onClick={() => setMenuOpenId((id) => (id === a.id ? null : a.id))}
                              >
                                <IconMoreVertical />
                              </button>
                            )}
                          >
                            <Link href={`/assessments/${a.id}`} onClick={() => setMenuOpenId(null)}>Open assessment</Link>
                            <Link href={`/assessments/${a.id}/review`} onClick={() => setMenuOpenId(null)}>Review</Link>
                            {a.organisation?.id && (
                              <Link href={`/organisations/${a.organisation.id}`} onClick={() => setMenuOpenId(null)}>View organisation</Link>
                            )}
                            {isAdmin && (
                              <>
                                <button type="button" onClick={() => startEdit(a)} disabled={busyId === a.id}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => void deleteAssessment(a)}
                                  disabled={busyId === a.id}
                                >
                                  {busyId === a.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            )}
                          </RowActionsMenu>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="assess2-detail-row">
                          <td colSpan={11}>
                            <div className="assess2-detail">
                              <div>
                                <em>Progress</em>
                                <strong>{a.progress?.percent ?? 0}%</strong>
                                <span>{a.progress?.label || '—'}</span>
                              </div>
                              <div>
                                <em>Source</em>
                                <strong>{a.source === 'PUBLIC' ? 'Public lead' : 'Internal'}</strong>
                                <span>{a.publicLead?.email || a.createdBy?.email || '—'}</span>
                              </div>
                              <div>
                                <em>Reports</em>
                                <strong>{a.reports?.length || a._count?.reports || 0}</strong>
                                <span>{a.reports?.[0]?.status || 'None issued'}</span>
                              </div>
                              <div>
                                <em>Workflow</em>
                                <strong>{a.status.replaceAll('_', ' ')}</strong>
                                <span>Updated {formatDate(a.updatedAt)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && !pageItems.length && (
                  <tr><td colSpan={11} className="muted">No assessments match the current filters.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan={11} className="muted">Loading assessments…</td></tr>
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
      </Shell>
    </AuthGate>
  );
}
