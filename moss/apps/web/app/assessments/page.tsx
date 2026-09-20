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
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import {
  IconChevronRight,
  IconMoreVertical,
} from '@/components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiFetch, money } from '@/lib/api';
import { getStoredUser, resolveMvpNavRole } from '@/lib/auth-user';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  return formatDate(iso);
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

type KpiKey =
  | 'total'
  | 'in_progress'
  | 'submitted'
  | 'awaiting_review'
  | 'approved'
  | 'report_issued';

export default function AssessmentsPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [items, setItems] = useState<Assessment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [analystFilter, setAnalystFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
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
      toast({ title: 'Assessment updated', variant: 'success' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update assessment.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAssessment(a: Assessment) {
    const label = a.reference || a.title;
    const ok = await confirm({
      title: 'Delete assessment',
      description: `Delete assessment “${label}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(a.id);
    setError('');
    try {
      await apiFetch(`/assessments/${a.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== a.id));
      if (editing?.id === a.id) setEditing(null);
      if (expandedId === a.id) setExpandedId(null);
      toast({ title: 'Assessment deleted', variant: 'success' });
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
    const q = query.trim().toLowerCase();
    return enriched.filter((a) => {
      if (selectedKpi && selectedKpi !== 'total' && a.uiStatus !== selectedKpi) return false;
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
  }, [
    enriched,
    query,
    selectedKpi,
    orgFilter,
    statusFilter,
    riskFilter,
    analystFilter,
    dateFrom,
    dateTo,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);
  const hasActiveFilters = Boolean(
    query ||
      orgFilter ||
      statusFilter ||
      riskFilter ||
      analystFilter ||
      dateFrom ||
      dateTo ||
      selectedKpi,
  );

  useEffect(() => {
    setPage(1);
  }, [query, selectedKpi, orgFilter, statusFilter, riskFilter, analystFilter, dateFrom, dateTo, pageSize]);

  function clearFilters() {
    setQuery('');
    setOrgFilter('');
    setStatusFilter('');
    setRiskFilter('');
    setAnalystFilter('');
    setDateFrom('');
    setDateTo('');
    setSelectedKpi(null);
  }

  function setKpiFilter(key: KpiKey) {
    setSelectedKpi((prev) => (prev === key ? null : key));
    if (key !== 'total') setStatusFilter('');
  }

  function kpiCardClass(key: KpiKey) {
    return cn(
      'min-h-[108px] rounded-xl border bg-white shadow-none transition-[border-color,box-shadow,background-color]',
      selectedKpi === key
        ? 'border-[#c41230]/35 bg-[#fff8f9] shadow-[inset_0_0_0_1px_rgba(196,18,48,0.08)]'
        : 'border-slate-200',
    );
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
    a.download = `scl-assessments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthGate>
      <Shell
        title="Security Cost Leakage"
        hideSearch
        hideTitle
        headerLeading={(
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
            <span className="truncate font-semibold text-slate-900">Security Cost Leakage</span>
          </nav>
        )}
      >
        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {editing ? (
          <Card className="mb-5 rounded-xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Edit assessment</CardTitle>
              <CardDescription>
                Update the assessment title shown in lists and reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={saveEdit}>
                <label className="grid max-w-xl gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">Title</span>
                  <Input
                    required
                    minLength={2}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={savingEdit}>
                    {savingEdit ? 'Saving…' : 'Save changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savingEdit}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <p className="m-0 max-w-2xl text-sm text-moss-muted">
            Level 3 Security Cost Leakage Assessment™ sessions across your organisations.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={exportCsv}>
              Export
            </Button>
            <Button asChild>
              <Link href="/assessments/new">+ New assessment</Link>
            </Button>
          </div>
        </div>

        <div className="mb-5 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-stretch">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Assessment activity
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('total')}>
                  <StatCard
                    icon={ClipboardList}
                    title="Total assessments"
                    value={summary.total}
                    description="Portfolio volume"
                    tone="blue"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('total')}
                  />
                </button>
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('in_progress')}>
                  <StatCard
                    icon={Send}
                    title="In progress"
                    value={summary.inProgress}
                    description="Active sessions"
                    tone="amber"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('in_progress')}
                  />
                </button>
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('submitted')}>
                  <StatCard
                    icon={Clock}
                    title="Submitted"
                    value={summary.submitted}
                    description="Ready for triage"
                    tone="violet"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('submitted')}
                  />
                </button>
              </div>
            </div>

            <div className="hidden w-px bg-slate-200 xl:block" aria-hidden="true" />

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Review &amp; delivery
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('awaiting_review')}>
                  <StatCard
                    icon={User}
                    title="Awaiting review"
                    value={summary.awaitingReview}
                    description="Analyst queue"
                    tone="amber"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('awaiting_review')}
                  />
                </button>
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('approved')}>
                  <StatCard
                    icon={BadgeCheck}
                    title="Approved"
                    value={summary.approved}
                    description="Verified assessments"
                    tone="green"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('approved')}
                  />
                </button>
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('report_issued')}>
                  <StatCard
                    icon={FileCheck}
                    title="Reports issued"
                    value={summary.reportsIssued}
                    description="Client deliverables"
                    tone="slate"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('report_issued')}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <Card className="mb-5 rounded-xl border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-[200px] flex-1 gap-1 text-sm">
                <span className="font-medium text-slate-700">Search</span>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search assessments…"
                  aria-label="Filter assessments"
                />
              </label>
              <label className="grid min-w-[160px] gap-1 text-sm">
                <span className="font-medium text-slate-700">Organisation</span>
                <FilterSelect
                  value={orgFilter}
                  onChange={setOrgFilter}
                  placeholder="All organisations"
                  options={organisations.map(([id, name]) => ({ value: id, label: name }))}
                />
              </label>
              <label className="grid min-w-[150px] gap-1 text-sm">
                <span className="font-medium text-slate-700">Status</span>
                <FilterSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="All statuses"
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'in_progress', label: 'In Progress' },
                    { value: 'submitted', label: 'Submitted' },
                    { value: 'awaiting_review', label: 'Awaiting Review' },
                    { value: 'approved', label: 'Approved' },
                    { value: 'report_issued', label: 'Report Issued' },
                  ]}
                />
              </label>
              <label className="grid min-w-[140px] gap-1 text-sm">
                <span className="font-medium text-slate-700">Risk</span>
                <FilterSelect
                  value={riskFilter}
                  onChange={setRiskFilter}
                  placeholder="All ratings"
                  options={['Critical', 'High', 'Moderate', 'Low'].map((band) => ({
                    value: band,
                    label: band,
                  }))}
                />
              </label>
              <label className="grid min-w-[150px] gap-1 text-sm">
                <span className="font-medium text-slate-700">Analyst</span>
                <FilterSelect
                  value={analystFilter}
                  onChange={setAnalystFilter}
                  placeholder="All analysts"
                  options={analysts.map(([id, name]) => ({ value: id, label: name }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">From</span>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">To</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" className="h-10" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Assessments</CardTitle>
            <CardDescription>
              {filtered.length} record{filtered.length === 1 ? '' : 's'}
              {hasActiveFilters ? ' (filtered)' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2" />
                    <th className="px-3 py-2">Assessment</th>
                    <th className="px-3 py-2">Organisation</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Risk</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Likely leakage</th>
                    <th className="px-3 py-2">Analyst</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((a) => {
                    const scli = a.snap ? Number(a.snap.overallRiskScore) : null;
                    const gov = a.snap?.maturityScore != null ? Number(a.snap.maturityScore) : null;
                    const leakage = Number(a.snap?.leakageResult?.likelyLeakageValue || 0);
                    const minLeak = Number(a.snap?.leakageResult?.minimumLeakageValue || 0);
                    const maxLeak = Number(
                      a.snap?.leakageResult?.maximumExposureValue ||
                        a.snap?.leakageResult?.recoverableHigh ||
                        0,
                    );
                    const band = a.snap?.riskBand;
                    const analystName = displayName(a.analyst);
                    const expanded = expandedId === a.id;

                    return (
                      <Fragment key={a.id}>
                        <tr className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              className={cn(
                                'inline-flex size-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800',
                                expanded && 'bg-slate-100 text-slate-800',
                              )}
                              aria-label={expanded ? 'Collapse row' : 'Expand row'}
                              onClick={() => setExpandedId((id) => (id === a.id ? null : a.id))}
                            >
                              <IconChevronRight
                                className={cn('size-4 transition-transform', expanded && 'rotate-90')}
                              />
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="leading-snug">
                              <Link
                                href={`/assessments/${a.id}`}
                                className="font-semibold text-slate-900 hover:underline"
                              >
                                {a.reference}
                              </Link>
                              <p className="m-0 text-xs text-slate-500">
                                {a.title || 'Security Risk Assessment'}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="leading-snug">
                              <p className="m-0 font-medium text-slate-900">
                                {a.organisation?.name || '—'}
                              </p>
                              <p className="m-0 text-xs text-slate-500">
                                {shortOrgId(a.organisation?.id) || '—'}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{formatDate(a.assessmentDate)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                                a.uiStatus === 'report_issued' || a.uiStatus === 'approved'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : a.uiStatus === 'awaiting_review' || a.uiStatus === 'submitted'
                                    ? 'bg-amber-50 text-amber-800'
                                    : 'bg-slate-100 text-slate-700',
                              )}
                            >
                              {uiStatusLabel(a.uiStatus)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {band ? (
                              <span className={`org2-risk-badge risk-${riskTone(band)}`}>
                                {band === 'Controlled' ? 'Low' : band}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="assess2-scores">
                              <ScoreRing
                                value={scli !== null && !Number.isNaN(scli) ? scli : null}
                                label="SCLI"
                              />
                              <ScoreRing
                                value={gov !== null && !Number.isNaN(gov) ? gov : null}
                                label="Gov"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {leakage > 0 ? (
                              <div className="leading-snug">
                                <p className="m-0 font-semibold text-slate-900">{money(leakage)}</p>
                                {minLeak > 0 || maxLeak > 0 ? (
                                  <p className="m-0 text-xs text-slate-500">
                                    ({money(minLeak)} – {money(maxLeak || leakage)})
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {analystName ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#c41230] text-[10px] font-semibold text-white">
                                  {initials(analystName)}
                                </span>
                                <span className="font-medium text-slate-800">{analystName}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500" title={formatDate(a.updatedAt)}>
                            {relativeTime(a.updatedAt)}
                          </td>
                          <td
                            className="org2-actions-cell px-3 py-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <RowActionsMenu
                              open={menuOpenId === a.id}
                              onClose={() => setMenuOpenId(null)}
                              trigger={(
                                <button
                                  type="button"
                                  className="org2-menu-btn"
                                  aria-label="Assessment actions"
                                  onClick={() =>
                                    setMenuOpenId((id) => (id === a.id ? null : a.id))
                                  }
                                >
                                  <IconMoreVertical />
                                </button>
                              )}
                            >
                              <Link
                                href={`/assessments/${a.id}`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Open assessment
                              </Link>
                              <Link
                                href={`/assessments/${a.id}/review`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Review
                              </Link>
                              {a.organisation?.id ? (
                                <Link
                                  href={`/organisations/${a.organisation.id}`}
                                  onClick={() => setMenuOpenId(null)}
                                >
                                  View organisation
                                </Link>
                              ) : null}
                              {isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(a)}
                                    disabled={busyId === a.id}
                                  >
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
                              ) : null}
                            </RowActionsMenu>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-slate-100 bg-slate-50/60">
                            <td colSpan={11} className="px-3 py-3">
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Progress
                                  </p>
                                  <p className="m-0 mt-1 font-semibold text-slate-900">
                                    {a.progress?.percent ?? 0}%
                                  </p>
                                  <p className="m-0 text-xs text-slate-500">
                                    {a.progress?.label || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Source
                                  </p>
                                  <p className="m-0 mt-1 font-semibold text-slate-900">
                                    {a.source === 'PUBLIC' ? 'Public lead' : 'Internal'}
                                  </p>
                                  <p className="m-0 text-xs text-slate-500">
                                    {a.publicLead?.email || a.createdBy?.email || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Reports
                                  </p>
                                  <p className="m-0 mt-1 font-semibold text-slate-900">
                                    {a.reports?.length || a._count?.reports || 0}
                                  </p>
                                  <p className="m-0 text-xs text-slate-500">
                                    {a.reports?.[0]?.status || 'None issued'}
                                  </p>
                                </div>
                                <div>
                                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Workflow
                                  </p>
                                  <p className="m-0 mt-1 font-semibold text-slate-900">
                                    {a.status.replaceAll('_', ' ')}
                                  </p>
                                  <p className="m-0 text-xs text-slate-500">
                                    Updated {formatDate(a.updatedAt)}
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!loading && !pageItems.length ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                        {hasActiveFilters
                          ? 'No assessments match the current filters.'
                          : 'No Cost Leakage assessments yet.'}
                      </td>
                    </tr>
                  ) : null}
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                        Loading assessments…
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                Showing {showingFrom} to {showingTo} of {filtered.length} assessments
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </Shell>
    </AuthGate>
  );
}
