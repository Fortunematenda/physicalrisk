'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  FileCheck,
  MessageSquareWarning,
  Send,
  UserRound,
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import {
  IconCalendar,
  IconChevronRight,
  IconDownload,
  IconFilter,
  IconMoreVertical,
  IconRotateCcw,
  IconSearch,
} from '@/components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { AnalystFilterSelect } from '@/components/triage/AnalystFilterSelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { getStoredUser, resolveMvpNavRole } from '@/lib/auth-user';

type Summary = {
  total: number;
  inProgress: number;
  completed: number;
  diagnosticRequested: number;
  proposalRequested: number;
  proposalActive: number;
  notContacted: number;
  converted: number;
  closed: number;
};

type TriageRow = {
  id: string;
  organisationName: string;
  organisationId?: string | null;
  industry?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  status: string;
  displayStatus: string;
  intent: string;
  progressPercent: number;
  progressLabel?: string | null;
  completedAt?: string | null;
  reviewedAt?: string | null;
  contactedAt?: string | null;
  diagnosticRequestedAt?: string | null;
  proposalStatus?: string;
  proposalRequestedAt?: string | null;
  proposalReference?: string | null;
  convertedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedAnalystId?: string | null;
  assignedAnalyst?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    systemRole?: string;
  } | null;
  assessment?: {
    id: string;
    reference: string;
    overallRiskScore?: number | null;
    riskBand?: string | null;
  } | null;
  convertedEngagement?: {
    id: string;
    reference: string;
    title: string;
    status: string;
  } | null;
};

type AnalystOption = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  systemRole: string;
};

const EMPTY_SUMMARY: Summary = {
  total: 0,
  inProgress: 0,
  completed: 0,
  diagnosticRequested: 0,
  proposalRequested: 0,
  proposalActive: 0,
  notContacted: 0,
  converted: 0,
  closed: 0,
};

const PAGE_SIZE_OPTIONS = [8, 10, 20, 50];

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'U'
  );
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    REVIEWED: 'Reviewed',
    CONTACTED: 'Contacted',
    DIAGNOSTIC_REQUESTED: 'Diagnostic requested',
    PROPOSAL_REQUESTED: 'Proposal requested',
    PROPOSAL_IN_PREPARATION: 'Proposal in preparation',
    PROPOSAL_SENT: 'Proposal sent',
    PROPOSAL_ACCEPTED: 'Proposal accepted',
    PROPOSAL_DECLINED: 'Proposal declined',
    CONVERTED: 'Converted to Level 2',
    CLOSED: 'Closed',
  };
  return labels[value] || value.replaceAll('_', ' ');
}

function statusClass(value: string) {
  if (value === 'PROPOSAL_REQUESTED' || value === 'PROPOSAL_ACCEPTED') return 'status-submitted';
  if (value === 'PROPOSAL_SENT' || value === 'PROPOSAL_IN_PREPARATION') return 'status-awaiting_review';
  if (value === 'DIAGNOSTIC_REQUESTED') return 'status-in_progress';
  if (value === 'CONVERTED') return 'status-approved';
  if (value === 'COMPLETED' || value === 'REVIEWED' || value === 'CONTACTED') return 'status-awaiting_review';
  if (value === 'CLOSED' || value === 'PROPOSAL_DECLINED') return 'status-draft';
  if (value === 'IN_PROGRESS') return 'status-in_progress';
  return 'status-draft';
}

function commercialLabel(intent: string) {
  const labels: Record<string, string> = {
    PROPOSAL_REQUESTED: 'Proposal requested',
    PROPOSAL_IN_PREPARATION: 'Proposal in preparation',
    PROPOSAL_SENT: 'Proposal sent',
    PROPOSAL_ACCEPTED: 'Proposal accepted',
    PROPOSAL_DECLINED: 'Proposal declined',
    DIAGNOSTIC_REQUESTED: 'Diagnostic requested',
    CONVERTED: 'Converted',
    NONE: 'No request',
  };
  return labels[intent] || intent.replaceAll('_', ' ');
}

function riskTone(band?: string | null) {
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

function analystName(user?: AnalystOption | TriageRow['assignedAnalyst'] | null) {
  if (!user) return '';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email || 'Analyst';
}

export default function TriageSubmissionsPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const { toast } = useToast();
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';
  const [items, setItems] = useState<TriageRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [canCreateUsers, setCanCreateUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [intent, setIntent] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [analystFilter, setAnalystFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [createAnalystOpen, setCreateAnalystOpen] = useState(false);

  function openSubmission(id: string) {
    router.push(`/triage/${id}`);
  }

  async function loadAnalysts() {
    const [rows, caps] = await Promise.all([
      apiFetch<AnalystOption[]>('/admin/users/analysts'),
      apiFetch<{ localUserAdmin?: boolean }>('/admin/users/capabilities').catch(() => ({ localUserAdmin: false })),
    ]);
    setAnalysts(rows);
    setCanCreateUsers(Boolean(caps.localUserAdmin) && isAdmin);
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (intent) params.set('intent', intent);
      const qs = params.toString();
      const data = await apiFetch<{ items: TriageRow[]; summary: Summary }>(
        `/triage/submissions${qs ? `?${qs}` : ''}`,
      );
      setItems(data.items || []);
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load triage submissions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [intent]);

  useEffect(() => {
    void loadAnalysts().catch(() => {
      setAnalysts([]);
      setCanCreateUsers(false);
    });
  }, [isAdmin]);

  const organisations = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of items) {
      const key = row.organisationId || row.organisationName;
      if (key) map.set(key, row.organisationName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = (query || headerSearch).trim().toLowerCase();
    const rows = items.filter((row) => {
      if (status && row.displayStatus !== status) return false;
      if (orgFilter) {
        const key = row.organisationId || row.organisationName;
        if (key !== orgFilter) return false;
      }
      if (analystFilter) {
        if (analystFilter === '__unassigned__') {
          if (row.assignedAnalystId) return false;
        } else if (row.assignedAnalystId !== analystFilter) {
          return false;
        }
      }
      const activityDate = row.completedAt || row.updatedAt || row.createdAt;
      if (dateFrom) {
        if (new Date(activityDate) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(activityDate) > to) return false;
      }
      if (!needle) return true;
      return [
        row.organisationName,
        row.firstName,
        row.lastName,
        row.email,
        row.industry,
        row.assessment?.reference,
        row.proposalReference,
        analystName(row.assignedAnalyst),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [items, query, headerSearch, status, orgFilter, analystFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query, headerSearch, status, intent, orgFilter, analystFilter, dateFrom, dateTo, pageSize]);

  function clearFilters() {
    setQuery('');
    setHeaderSearch('');
    setStatus('');
    setIntent('');
    setOrgFilter('');
    setAnalystFilter('');
    setDateFrom('');
    setDateTo('');
  }

  function setKpiFilter(nextStatus: string, nextIntent: string) {
    setStatus(nextStatus);
    setIntent(nextIntent);
  }

  async function mark(row: TriageRow, next: 'REVIEWED' | 'CONTACTED' | 'CLOSED') {
    setBusy(row.id);
    setMenuOpenId(null);
    setError('');
    try {
      await apiFetch(`/triage/submissions/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update submission.');
    } finally {
      setBusy(null);
    }
  }

  async function assignAnalyst(row: TriageRow, analystId: string) {
    setBusy(row.id);
    setError('');
    try {
      await apiFetch(`/triage/submissions/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedAnalystId: analystId || '' }),
      });
      await load();
      setMenuOpenId(null);
      const assigned = analysts.find((a) => a.id === analystId);
      const person = analystName(assigned) || analystName(row.assignedAnalyst) || 'Analyst';
      toast({
        id: `triage-assign-${row.id}`,
        variant: 'success',
        title: analystId ? 'Analyst assigned' : 'Analyst unassigned',
        description: analystId
          ? `${person} is now assigned to ${row.organisationName}.`
          : `${row.organisationName} no longer has an assigned analyst.`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to assign analyst.';
      setError(message);
      toast({
        id: 'triage-assign-error',
        variant: 'error',
        title: 'Assignment failed',
        description: message,
      });
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const rows = [
      [
        'Organisation',
        'Contact',
        'Email',
        'Industry',
        'Reference',
        'Stage',
        'Commercial Intent',
        'Risk Band',
        'Score',
        'Proposal Reference',
        'Completed',
        'Updated',
      ],
      ...filtered.map((row) => [
        row.organisationName,
        `${row.firstName} ${row.lastName}`.trim(),
        row.email,
        row.industry || '',
        row.assessment?.reference || '',
        statusLabel(row.displayStatus),
        commercialLabel(row.intent),
        row.assessment?.riskBand || '',
        row.assessment?.overallRiskScore != null ? String(Math.round(row.assessment.overallRiskScore)) : '',
        row.proposalReference || '',
        row.completedAt || '',
        row.updatedAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `executive-governance-triage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthGate>
      <Shell
        title="Executive Governance Triage"
        hideEyebrow
        subtitle="Level 1 questionnaire submissions and commercial intent. Proposal requests are high priority."
        searchPlaceholder="Search triage submissions…"
        searchValue={headerSearch}
        onSearch={setHeaderSearch}
      >
        {error && <p className="error">{error}</p>}

        <div className="org2-actions-row">
          <button type="button" className="btn secondary org2-export-btn" onClick={exportCsv}>
            <IconDownload />
            Export
          </button>
          <button type="button" className="btn secondary org2-export-btn" onClick={() => void load()} disabled={loading}>
            <IconRotateCcw />
            Refresh
          </button>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('', '')}>
            <StatCard
              icon={ClipboardList}
              title="Total submissions"
              value={summary.total}
              description="All Level 1 leads"
              tone="blue"
              loading={loading}
            />
          </button>
          <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('IN_PROGRESS', '')}>
            <StatCard
              icon={Send}
              title="In progress"
              value={summary.inProgress}
              description="Possible follow-up"
              tone="amber"
              loading={loading}
            />
          </button>
          <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('COMPLETED', '')}>
            <StatCard
              icon={FileCheck}
              title="Completed"
              value={summary.completed}
              description="Questionnaire received"
              tone="violet"
              loading={loading}
            />
          </button>
          <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('', 'proposal')}>
            <StatCard
              icon={MessageSquareWarning}
              title="Proposal requests"
              value={summary.proposalRequested}
              description="Action required"
              tone="red"
              loading={loading}
            />
          </button>
          <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('', 'diagnostic')}>
            <StatCard
              icon={UserRound}
              title="Diagnostic requested"
              value={summary.diagnosticRequested}
              description="Executive Discussion"
              tone="amber"
              loading={loading}
            />
          </button>
          <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('CONVERTED', '')}>
            <StatCard
              icon={BadgeCheck}
              title="Converted to Level 2"
              value={summary.converted}
              description={`${summary.notContacted} not contacted`}
              tone="green"
              loading={loading}
            />
          </button>
        </div>

        <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-[1_1_240px] max-w-md">
                <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                  <IconSearch />
                </span>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search triage submissions…"
                  aria-label="Filter triage submissions"
                  className="h-10 pl-9"
                />
              </div>
              <FilterSelect
                value={orgFilter}
                onChange={setOrgFilter}
                placeholder="Organisation"
                aria-label="Organisation"
                triggerClassName="h-10 w-full min-w-[160px]"
                className="min-w-[160px] flex-[0_1_180px]"
                options={organisations.map(([id, name]) => ({ value: id, label: name }))}
              />
              <FilterSelect
                value={status}
                onChange={setStatus}
                placeholder="All stages"
                aria-label="Filter by stage"
                triggerClassName="h-10 w-full min-w-[150px]"
                className="min-w-[150px] flex-[0_1_170px]"
                options={[
                  { value: 'IN_PROGRESS', label: 'In progress' },
                  { value: 'COMPLETED', label: 'Completed' },
                  { value: 'PROPOSAL_REQUESTED', label: 'Proposal requested' },
                  { value: 'PROPOSAL_IN_PREPARATION', label: 'Proposal in preparation' },
                  { value: 'PROPOSAL_SENT', label: 'Proposal sent' },
                  { value: 'PROPOSAL_ACCEPTED', label: 'Proposal accepted' },
                  { value: 'PROPOSAL_DECLINED', label: 'Proposal declined' },
                  { value: 'DIAGNOSTIC_REQUESTED', label: 'Diagnostic requested' },
                  { value: 'CONVERTED', label: 'Converted to Level 2' },
                  { value: 'CLOSED', label: 'Closed' },
                ]}
              />
              <FilterSelect
                value={intent}
                onChange={setIntent}
                placeholder="All commercial intent"
                aria-label="Filter commercial intent"
                triggerClassName="h-10 w-full min-w-[180px]"
                className="min-w-[180px] flex-[0_1_200px]"
                options={[
                  { value: 'proposal', label: 'Proposal requested' },
                  { value: 'proposal_in_preparation', label: 'Proposal in preparation' },
                  { value: 'proposal_sent', label: 'Proposal sent' },
                  { value: 'proposal_accepted', label: 'Proposal accepted' },
                  { value: 'proposal_declined', label: 'Proposal declined' },
                  { value: 'diagnostic', label: 'Diagnostic requested' },
                ]}
              />
              <div className="min-w-[180px] flex-[0_1_200px]">
                <AnalystFilterSelect
                  value={analystFilter}
                  onChange={setAnalystFilter}
                  options={analysts.map((a) => ({ id: a.id, label: analystName(a) }))}
                  canAddNew={canCreateUsers}
                  onAddNew={() => setCreateAnalystOpen(true)}
                  className="h-10 w-full"
                />
              </div>
              <div className="inline-flex h-10 min-w-[240px] flex-[0_1_280px] items-center gap-2 rounded-md border border-input bg-white px-3 text-sm">
                <span className="shrink-0 text-slate-400">
                  <IconCalendar />
                </span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="From date"
                  className="h-8 min-w-0 flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
                />
                <span className="shrink-0 text-slate-400">—</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="To date"
                  className="h-8 min-w-0 flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button type="button" variant="outline" className="h-10 shrink-0" title="Filters">
                <IconFilter />
                Filters
              </Button>
              <Button type="button" variant="outline" className="h-10 shrink-0" onClick={clearFilters}>
                <IconRotateCcw />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="dash2-card org2-table-card">
          <div className="table-wrap">
            <table className="assess2-table">
              <thead>
                <tr>
                  <th className="assess2-expand-col" />
                  <th>Organisation / contact</th>
                  <th>Questionnaire</th>
                  <th>Indication</th>
                  <th>Stage</th>
                  <th>Analyst</th>
                  <th>Commercial Intent</th>
                  <th>Last activity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => {
                  const score =
                    row.assessment?.overallRiskScore != null
                      ? Math.round(Number(row.assessment.overallRiskScore))
                      : null;
                  const band = row.assessment?.riskBand;
                  const contactName = `${row.firstName} ${row.lastName}`.trim();
                  const expanded = expandedId === row.id;
                  const progress = row.completedAt
                    ? 100
                    : Math.max(0, Math.min(99, row.progressPercent || 0));

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                        onClick={() => openSubmission(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openSubmission(row.id);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open triage submission for ${row.organisationName}`}
                      >
                        <td
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={`assess2-expand-btn${expanded ? ' open' : ''}`}
                            aria-label={expanded ? 'Collapse row' : 'Expand row'}
                            onClick={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                          >
                            <IconChevronRight />
                          </button>
                        </td>
                        <td>
                          <div className="assess2-org-cell">
                            <strong>{row.organisationName}</strong>
                            <span className="muted small">
                              {contactName} · {row.email}
                            </span>
                            {row.industry ? <span className="muted small">{row.industry}</span> : null}
                          </div>
                        </td>
                        <td>
                          <div className="assess2-ref-cell">
                            <strong>{row.assessment?.reference || '—'}</strong>
                            <span className="muted small">
                              {row.completedAt ? '15/15 complete' : `${progress}% complete`}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="assess2-scores assess2-scores-stack">
                            <ScoreRing value={score} label="EGT" />
                            {band ? (
                              <span className={`org2-risk-badge risk-${riskTone(band)}`}>
                                {band === 'Controlled' ? 'Low' : band}
                              </span>
                            ) : (
                              <span className="muted small">{row.completedAt ? 'Recorded' : 'Pending'}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`assess2-status-badge ${statusClass(row.displayStatus)}`}>
                            {statusLabel(row.displayStatus)}
                          </span>
                        </td>
                        <td>
                          {row.assignedAnalyst ? (
                            <div className="assess2-ref-cell">
                              <strong>{analystName(row.assignedAnalyst)}</strong>
                              <span className="muted small">{row.assignedAnalyst.email || 'Assigned'}</span>
                            </div>
                          ) : (
                            <span className="muted">Unassigned</span>
                          )}
                        </td>
                        <td>
                          <div className="assess2-ref-cell">
                            <strong className={row.intent === 'NONE' ? 'muted' : undefined}>
                              {commercialLabel(row.intent)}
                            </strong>
                            {row.proposalReference ? (
                              <span className="muted small">{row.proposalReference}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="muted">{relativeTime(row.updatedAt)}</td>
                        <td
                          className="org2-actions-cell"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <RowActionsMenu
                            open={menuOpenId === row.id}
                            onClose={() => setMenuOpenId(null)}
                            trigger={(
                              <button
                                type="button"
                                className="org2-menu-btn"
                                aria-label="Triage actions"
                                onClick={() => setMenuOpenId((id) => (id === row.id ? null : row.id))}
                              >
                                <IconMoreVertical />
                              </button>
                            )}
                          >
                            <Link href={`/triage/${row.id}`} onClick={() => setMenuOpenId(null)}>
                              Open details
                            </Link>
                            {row.convertedEngagement?.id ? (
                              <Link
                                href={`/advisory/${row.convertedEngagement.id}`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Open Level 2 engagement
                              </Link>
                            ) : null}
                            {analysts.length ? (
                              <>
                                {row.assignedAnalyst ? (
                                  <p className="m-0 px-3 py-1 text-xs text-slate-600">
                                    Assigned to{' '}
                                    <strong className="font-semibold text-slate-900">
                                      {analystName(row.assignedAnalyst)}
                                    </strong>
                                  </p>
                                ) : null}
                                {row.assignedAnalystId ? (
                                  <button
                                    type="button"
                                    disabled={busy === row.id}
                                    onClick={() => void assignAnalyst(row, '')}
                                  >
                                    Unassign analyst
                                  </button>
                                ) : null}
                                <div
                                  className="px-2 py-1"
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  <select
                                    aria-label={row.assignedAnalyst ? 'Reassign analyst' : 'Assign analyst'}
                                    className="org2-menu-select"
                                    defaultValue=""
                                    disabled={busy === row.id}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      if (next) void assignAnalyst(row, next);
                                      e.currentTarget.value = '';
                                    }}
                                  >
                                    <option value="" disabled hidden>
                                      {row.assignedAnalyst ? 'Reassign' : 'Assign'}
                                    </option>
                                    {analysts.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {analystName(a)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            ) : null}
                            {row.completedAt && !row.reviewedAt && !row.closedAt ? (
                              <button
                                type="button"
                                disabled={busy === row.id}
                                onClick={() => void mark(row, 'REVIEWED')}
                              >
                                Mark reviewed
                              </button>
                            ) : null}
                            {row.completedAt && !row.contactedAt && !row.closedAt ? (
                              <button
                                type="button"
                                disabled={busy === row.id}
                                onClick={() => void mark(row, 'CONTACTED')}
                              >
                                Mark contacted
                              </button>
                            ) : null}
                            {row.completedAt && !row.closedAt ? (
                              <button
                                type="button"
                                className="danger"
                                disabled={busy === row.id}
                                onClick={() => void mark(row, 'CLOSED')}
                              >
                                Close
                              </button>
                            ) : null}
                          </RowActionsMenu>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="assess2-detail-row">
                          <td colSpan={9}>
                            <div className="assess2-detail">
                              <div>
                                <em>Progress</em>
                                <strong>{progress}%</strong>
                                <span>{row.progressLabel || (row.completedAt ? 'Complete' : 'In progress')}</span>
                              </div>
                              <div>
                                <em>Contact</em>
                                <strong>{contactName || '—'}</strong>
                                <span>{row.phone || row.email}</span>
                              </div>
                              <div>
                                <em>Assigned analyst</em>
                                <strong>{analystName(row.assignedAnalyst) || 'Unassigned'}</strong>
                                <span>{row.assignedAnalyst?.email || '—'}</span>
                              </div>
                              <div>
                                <em>Commercial</em>
                                <strong>{commercialLabel(row.intent)}</strong>
                                <span>
                                  {row.proposalRequestedAt
                                    ? `Proposal ${fmtDateTime(row.proposalRequestedAt)}`
                                    : row.diagnosticRequestedAt
                                      ? `Diagnostic ${fmtDateTime(row.diagnosticRequestedAt)}`
                                      : 'No commercial request yet'}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {!loading && !pageItems.length && (
                  <tr>
                    <td colSpan={8} className="muted">
                      No triage submissions match the current filters.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={8} className="muted">
                      Loading triage submissions…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="org2-pagination">
            <span>
              Showing {showingFrom} to {showingTo} of {filtered.length} submissions
            </span>
            <div className="org2-pagination-controls">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2)
                .reduce<number[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) acc.push(-1);
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, idx) =>
                  (n === -1 ? (
                    <span key={`gap-${idx}`} className="org2-page-gap">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      className={n === currentPage ? 'active' : ''}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )),
                )}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
              <FilterSelect
                value={String(pageSize)}
                onChange={(next) => setPageSize(Number(next))}
                placeholder="Rows / page"
                aria-label="Rows per page"
                includeAll={false}
                triggerClassName="h-9 min-w-[110px]"
                options={PAGE_SIZE_OPTIONS.map((size) => ({
                  value: String(size),
                  label: `${size} / page`,
                }))}
              />
            </div>
          </div>
        </section>

        <CreateUserDialog
          open={createAnalystOpen}
          onOpenChange={setCreateAnalystOpen}
          defaultRole="ANALYST"
          allowedRoles={['ANALYST', 'REVIEWER']}
          title="Add analyst"
          description="Create a user with the Analyst role. They will appear in the triage analyst filter and can be assigned to submissions."
          onCreated={(user) => {
            void loadAnalysts().then(() => setAnalystFilter(user.id));
          }}
        />
      </Shell>
    </AuthGate>
  );
}
