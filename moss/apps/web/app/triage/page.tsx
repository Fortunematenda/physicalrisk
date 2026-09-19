'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  FileCheck,
  Mail,
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
  IconMoreVertical,
} from '@/components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { AnalystFilterSelect } from '@/components/triage/AnalystFilterSelect';
import { EgtAssuranceBandBadge } from '@/components/triage/EgtAssuranceBandBadge';
import { Card, CardContent } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { deriveEgtAssurancePresentation, SCL_ACTIVE_TRIAGE_QUESTION_CODES } from '@moss/shared';
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
  unreadReplyCount?: number;
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
    categoryScores?: Array<{ category?: string; name?: string; score?: number }> | null;
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

type KpiKey = 'total' | 'in_progress' | 'completed' | 'proposal' | 'diagnostic' | 'converted';

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
const REFRESH_MS = 45_000;

function localDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgoLocal(days: number) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return localDateInputValue(d);
}

function defaultDateRange() {
  return { from: daysAgoLocal(30), to: localDateInputValue() };
}

function startOfLocalDay(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfLocalDay(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function matchesCommercialIntent(row: TriageRow, intent: string) {
  const key = intent.trim().toLowerCase();
  if (!key) return true;
  if (key === 'proposal' || key === 'proposal_requested') {
    return row.displayStatus === 'PROPOSAL_REQUESTED' || row.intent === 'PROPOSAL_REQUESTED';
  }
  if (key === 'diagnostic' || key === 'requested') {
    return (
      Boolean(row.diagnosticRequestedAt) ||
      row.displayStatus === 'DIAGNOSTIC_REQUESTED' ||
      row.intent === 'DIAGNOSTIC_REQUESTED'
    );
  }
  if (key === 'proposal_in_preparation') return row.displayStatus === 'PROPOSAL_IN_PREPARATION';
  if (key === 'proposal_sent') return row.displayStatus === 'PROPOSAL_SENT';
  if (key === 'proposal_accepted') return row.displayStatus === 'PROPOSAL_ACCEPTED';
  if (key === 'proposal_declined') return row.displayStatus === 'PROPOSAL_DECLINED';
  return true;
}

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

function primaryEmail(raw?: string | null) {
  if (!raw) return '';
  return raw.split(/[,;]+/).map((part) => part.trim()).filter(Boolean)[0] || raw.trim();
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

function journeyNextAction(displayStatus: string, hasEngagement: boolean) {
  if (displayStatus === 'PROPOSAL_REQUESTED') return 'Action required';
  if (displayStatus === 'PROPOSAL_IN_PREPARATION') return 'Prepare proposal';
  if (displayStatus === 'PROPOSAL_SENT') return 'Awaiting client';
  if (displayStatus === 'PROPOSAL_ACCEPTED') return 'Ready for Level 2';
  if (displayStatus === 'PROPOSAL_DECLINED') return 'Review next step';
  if (displayStatus === 'DIAGNOSTIC_REQUESTED') return 'Schedule discussion';
  if (displayStatus === 'CONVERTED') return hasEngagement ? 'Open diagnostic' : 'Level 2 active';
  return null;
}

function needsAction(displayStatus: string, unreadCount = 0) {
  if (displayStatus === 'PROPOSAL_REQUESTED' || displayStatus === 'PROPOSAL_ACCEPTED') return true;
  return unreadCount > 0;
}

function questionnaireProgressLine(row: TriageRow) {
  const total = SCL_ACTIVE_TRIAGE_QUESTION_CODES.length || 15;
  if (row.completedAt) return `${total}/${total} complete`;
  const pct = Math.max(0, Math.min(99, row.progressPercent || 0));
  const answered = Math.max(0, Math.min(total, Math.round((pct / 100) * total)));
  return `${answered}/${total} complete`;
}

function liveUpdatedLabel(at: Date | null, refreshing: boolean) {
  if (refreshing) {
    return at ? `Updating… · ${fmtDateTime(at.toISOString())}` : 'Updating…';
  }
  if (!at) return 'Live';
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return 'Live · Updated just now';
  if (mins < 60) return `Live · Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Live · Updated ${hours}h ago`;
  return `Live · Updated ${fmtDate(at.toISOString())}`;
}

function scoreColor(score: number) {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#ca8a04';
  if (score >= 40) return '#d97706';
  return '#c41230';
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
    <div
      className="assess2-ring"
      title={value === null ? `${label}: —` : `${label}: ${clamped} / 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
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
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="assess2-ring-text"
        >
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

function AvatarChip({ name, tone = 'red' }: { name: string; tone?: 'red' | 'slate' }) {
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-wide text-white',
        tone === 'red' ? 'bg-[#c41230]' : 'bg-slate-400',
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
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
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [intent, setIntent] = useState('');
  const [analystFilter, setAnalystFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => defaultDateRange().from);
  const [dateTo, setDateTo] = useState(() => defaultDateRange().to);
  const [selectedKpi, setSelectedKpi] = useState<KpiKey>('total');
  const [busy, setBusy] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [createAnalystOpen, setCreateAnalystOpen] = useState(false);
  const loadInFlight = useRef(false);

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

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    const soft = Boolean(opts?.soft);
    if (!soft) setLoading(true);
    else setRefreshing(true);
    if (!soft) setError('');
    try {
      // Always load the full list; stage/intent/date/analyst/search filter client-side
      // so KPI totals stay stable and filters compose correctly.
      const data = await apiFetch<{ items: TriageRow[]; summary: Summary }>('/triage/submissions');
      setItems(data.items || []);
      setSummary(data.summary || EMPTY_SUMMARY);
      setLastUpdatedAt(new Date());
    } catch (e) {
      if (!soft) {
        setError(e instanceof Error ? e.message : 'Unable to load triage submissions.');
      }
    } finally {
      loadInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadAnalysts().catch(() => {
      setAnalysts([]);
      setCanCreateUsers(false);
    });
  }, [isAdmin]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void load({ soft: true });
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load({ soft: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromTs = dateFrom ? startOfLocalDay(dateFrom) : null;
    const toTs = dateTo ? endOfLocalDay(dateTo) : null;
    const rows = items.filter((row) => {
      if (status && row.displayStatus !== status) return false;
      if (!matchesCommercialIntent(row, intent)) return false;
      if (analystFilter) {
        if (analystFilter === '__unassigned__') {
          if (row.assignedAnalystId) return false;
        } else if (row.assignedAnalystId !== analystFilter) {
          return false;
        }
      }
      const activityDate = row.completedAt || row.updatedAt || row.createdAt;
      const activityTs = new Date(activityDate).getTime();
      if (fromTs != null && activityTs < fromTs) return false;
      if (toTs != null && activityTs > toTs) return false;
      if (!needle) return true;
      return [
        row.organisationName,
        row.firstName,
        row.lastName,
        row.email,
        row.phone,
        row.industry,
        row.assessment?.reference,
        row.proposalReference,
        statusLabel(row.displayStatus),
        commercialLabel(row.intent),
        analystName(row.assignedAnalyst),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
    return rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [items, query, status, intent, analystFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showingFrom = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(currentPage * pageSize, filtered.length);
  const defaults = defaultDateRange();
  const dateIsCustom = dateFrom !== defaults.from || dateTo !== defaults.to;
  const hasActiveFilters = Boolean(query || status || intent || analystFilter || dateIsCustom);

  useEffect(() => {
    setPage(1);
  }, [query, status, intent, analystFilter, dateFrom, dateTo, pageSize]);

  function clearFilters() {
    const next = defaultDateRange();
    setQuery('');
    setStatus('');
    setIntent('');
    setAnalystFilter('');
    setDateFrom(next.from);
    setDateTo(next.to);
    setSelectedKpi('total');
  }

  function setKpiFilter(key: KpiKey, nextStatus: string, nextIntent: string) {
    setSelectedKpi(key);
    setStatus(nextStatus);
    setIntent(nextIntent);
  }

  function onStageChange(next: string) {
    setStatus(next);
    setIntent('');
    setSelectedKpi(
      next === 'IN_PROGRESS'
        ? 'in_progress'
        : next === 'COMPLETED'
          ? 'completed'
          : next === 'CONVERTED'
            ? 'converted'
            : next === 'PROPOSAL_REQUESTED'
              ? 'proposal'
              : next === 'DIAGNOSTIC_REQUESTED'
                ? 'diagnostic'
                : 'total',
    );
  }

  function onIntentChange(next: string) {
    setIntent(next);
    setStatus('');
    setSelectedKpi(
      next === 'proposal' || next === 'proposal_requested'
        ? 'proposal'
        : next === 'diagnostic'
          ? 'diagnostic'
          : 'total',
    );
  }

  function onDateFromChange(next: string) {
    setDateFrom(next || defaultDateRange().from);
  }

  function onDateToChange(next: string) {
    setDateTo(next || defaultDateRange().to);
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
      await load({ soft: true });
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
      await load({ soft: true });
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

  async function deleteSubmission(row: TriageRow) {
    const label = row.organisationName || `${row.firstName} ${row.lastName}`.trim() || row.email;
    const ok = await confirm({
      title: 'Delete triage submission',
      description: `Delete the triage submission for “${label}”? This removes the submission, questionnaire responses, proposals, and related reports. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setMenuOpenId(null);
    setDeletingId(row.id);
    setError('');
    try {
      await apiFetch(`/triage/submissions/${row.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== row.id));
      setSummary((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      if (expandedId === row.id) setExpandedId(null);
      toast({
        id: `triage-delete-${row.id}`,
        variant: 'success',
        title: 'Submission deleted',
        description: `${label} was removed from triage.`,
      });
      void load({ soft: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to delete submission.';
      setError(message);
      toast({
        id: 'triage-delete-error',
        variant: 'error',
        title: 'Delete failed',
        description: message,
      });
    } finally {
      setDeletingId(null);
    }
  }

  const liveLabel = liveUpdatedLabel(lastUpdatedAt, refreshing);

  function kpiCardClass(key: KpiKey) {
    return cn(
      'min-h-[108px] rounded-xl border bg-white shadow-none transition-[border-color,box-shadow,background-color]',
      selectedKpi === key
        ? 'border-[#c41230]/35 bg-[#fff8f9] shadow-[inset_0_0_0_1px_rgba(196,18,48,0.08)]'
        : 'border-slate-200',
    );
  }

  return (
    <AuthGate>
      <Shell title="Executive Governance Triage" hideSearch>
        {error && <p className="error">{error}</p>}

        <div className="mb-5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 text-sm text-moss-muted">
            Level 1 questionnaire submissions and commercial progression.
          </p>
          <div
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500"
            aria-live="polite"
            title={refreshing ? 'Refreshing triage data' : 'Last data refresh'}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                refreshing ? 'animate-pulse bg-amber-500' : 'bg-emerald-500',
              )}
              aria-hidden="true"
            />
            <span>{liveLabel}</span>
          </div>
        </div>
        <div className="mb-5 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-stretch">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Submission activity
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('total', '', '')}>
                  <StatCard
                    icon={ClipboardList}
                    title="Total submissions"
                    value={summary.total}
                    description="All Level 1 submissions"
                    tone="blue"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('total')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('in_progress', 'IN_PROGRESS', '')}
                >
                  <StatCard
                    icon={Send}
                    title="In progress"
                    value={summary.inProgress}
                    description="Questionnaire incomplete"
                    tone="amber"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('in_progress')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('completed', 'COMPLETED', '')}
                >
                  <StatCard
                    icon={FileCheck}
                    title="Completed"
                    value={summary.completed}
                    description="Ready for review"
                    tone="violet"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('completed')}
                  />
                </button>
              </div>
            </div>

            <div className="hidden w-px bg-slate-200 xl:block" aria-hidden="true" />

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Commercial progression
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('proposal', '', 'proposal')}
                >
                  <StatCard
                    icon={MessageSquareWarning}
                    title="Proposal requests"
                    value={summary.proposalRequested}
                    description="Commercial action required"
                    tone="red"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('proposal')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('diagnostic', '', 'diagnostic')}
                >
                  <StatCard
                    icon={UserRound}
                    title="Diagnostic requested"
                    value={summary.diagnosticRequested}
                    description="Level 2 interest"
                    tone="amber"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('diagnostic')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('converted', 'CONVERTED', '')}
                >
                  <StatCard
                    icon={BadgeCheck}
                    title="Converted to Level 2"
                    value={summary.converted}
                    description="Successful conversions"
                    tone="green"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('converted')}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[240px] flex-[1_1_280px] max-w-xl">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search organisation, contact or reference…"
                  aria-label="Search triage submissions"
                  className="h-10"
                />
              </div>
              <FilterSelect
                value={status}
                onChange={onStageChange}
                placeholder="All stages"
                aria-label="Filter by stage"
                triggerClassName="h-10 w-full min-w-[150px]"
                className="min-w-[150px] flex-[0_1_170px]"
                options={[
                  { value: 'IN_PROGRESS', label: 'In progress' },
                  { value: 'COMPLETED', label: 'Completed' },
                  { value: 'REVIEWED', label: 'Reviewed' },
                  { value: 'CONTACTED', label: 'Contacted' },
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
                onChange={onIntentChange}
                placeholder="All commercial intent"
                aria-label="Filter commercial intent"
                triggerClassName="h-10 w-full min-w-[170px]"
                className="min-w-[170px] flex-[0_1_200px]"
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
              <div className="triage-date-range inline-flex h-10 min-w-[240px] flex-[0_1_280px] items-center gap-2 rounded-md border border-input bg-white px-3 text-sm">
                <span className="shrink-0 text-slate-400" aria-hidden="true">
                  <IconCalendar />
                </span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  aria-label="From date"
                  className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-700 outline-none"
                />
                <span className="shrink-0 text-slate-400">—</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => onDateToChange(e.target.value)}
                  aria-label="To date"
                  className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-700 outline-none"
                />
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="ml-auto text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="table-wrap">
            <table className="assess2-table triage-list-table">
              <thead>
                <tr>
                  <th className="assess2-expand-col" />
                  <th>Organisation / Contact</th>
                  <th className="triage-col-submission">Submission</th>
                  <th>Assurance</th>
                  <th>Journey Stage</th>
                  <th className="triage-col-analyst">Analyst</th>
                  <th>Last Activity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => {
                  const assurancePresentation = row.assessment
                    ? deriveEgtAssurancePresentation({
                        overallRiskScore: row.assessment.overallRiskScore,
                        categoryScores: (row.assessment.categoryScores || []).map((c: any) => ({
                          category: String(c.category || c.name || 'Category'),
                          score: Number(c.score) || 0,
                        })),
                      })
                    : null;
                  const score =
                    assurancePresentation?.assuranceScore != null
                      ? Math.round(assurancePresentation.assuranceScore)
                      : null;
                  const bandLabel = assurancePresentation?.assuranceBand.displayLabel || null;
                  const contactName = `${row.firstName} ${row.lastName}`.trim();
                  const expanded = expandedId === row.id;
                  const progressLine = questionnaireProgressLine(row);
                  const email = primaryEmail(row.email);
                  const unread = row.unreadReplyCount || 0;
                  const nextAction = journeyNextAction(
                    row.displayStatus,
                    Boolean(row.convertedEngagement?.id),
                  );
                  const actionable = needsAction(row.displayStatus, unread);
                  const analystLabel = analystName(row.assignedAnalyst) || 'Unassigned';
                  const activityAt = row.updatedAt || row.completedAt || row.createdAt;
                  const submissionAt = row.completedAt || row.createdAt;
                  const proposalRef = row.proposalReference || row.convertedEngagement?.reference || null;

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={cn(
                          'triage-list-row cursor-pointer transition-colors hover:bg-slate-50/80',
                          actionable && 'triage-list-row--action',
                        )}
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
                          <div className="flex items-start gap-2.5">
                            <AvatarChip name={row.organisationName || contactName} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold leading-snug text-slate-900">
                                {row.organisationName}
                              </p>
                              <p className="mt-0.5 truncate text-xs leading-snug text-slate-600">
                                {contactName || '—'}
                                {email ? ` · ${email}` : ''}
                              </p>
                              {row.industry ? (
                                <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-400">
                                  {row.industry}
                                </p>
                              ) : null}
                              {unread > 0 ? (
                                <Link
                                  href={`/triage/${row.id}?tab=communications`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline"
                                  title="Open communications"
                                >
                                  <Mail className="size-3" aria-hidden="true" />
                                  {unread} unread
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="triage-col-submission">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold leading-snug text-slate-900">
                              {row.assessment?.reference || '—'}
                            </p>
                            <p className="mt-0.5 text-xs leading-snug text-slate-500">{progressLine}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                              {fmtDateTime(submissionAt)}
                            </p>
                          </div>
                        </td>
                        <td>
                          <div className="assess2-scores assess2-scores-stack">
                            <ScoreRing value={score} label="EGT" />
                            {bandLabel ? (
                              <EgtAssuranceBandBadge
                                label={bandLabel}
                                visual={assurancePresentation?.visual}
                              />
                            ) : (
                              <span className="muted small">
                                {row.completedAt ? 'Recorded' : 'Pending'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="min-w-0 space-y-1">
                            <span className={`assess2-status-badge ${statusClass(row.displayStatus)}`}>
                              {statusLabel(row.displayStatus)}
                            </span>
                            {proposalRef ? (
                              <p className="text-xs font-medium text-slate-600">{proposalRef}</p>
                            ) : null}
                            {nextAction ? (
                              <p
                                className={cn(
                                  'text-[11px] leading-snug',
                                  actionable && nextAction === 'Action required'
                                    ? 'font-medium text-[#c41230]'
                                    : 'text-slate-500',
                                )}
                              >
                                {nextAction}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="triage-col-analyst">
                          {row.assignedAnalyst ? (
                            <div className="flex min-w-0 items-center gap-2">
                              <AvatarChip name={analystLabel} tone="slate" />
                              <span className="truncate text-sm font-medium text-slate-800">
                                {analystLabel}
                              </span>
                            </div>
                          ) : analysts.length ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <label className="sr-only" htmlFor={`assign-${row.id}`}>
                                Assign analyst
                              </label>
                              <select
                                id={`assign-${row.id}`}
                                className="triage-assign-link"
                                defaultValue=""
                                disabled={busy === row.id}
                                aria-label="Assign analyst"
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (next) void assignAnalyst(row, next);
                                  e.currentTarget.value = '';
                                }}
                              >
                                <option value="" disabled hidden>
                                  + Assign analyst
                                </option>
                                {analysts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {analystName(a)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="triage-assign-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCreateAnalystOpen(true);
                              }}
                            >
                              + Assign analyst
                            </button>
                          )}
                        </td>
                        <td>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800">{relativeTime(activityAt)}</p>
                            <p className="text-[11px] text-slate-400">{fmtDateTime(activityAt)}</p>
                          </div>
                        </td>
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
                              View submission
                            </Link>
                            {row.organisationId ? (
                              <Link
                                href={`/organisations/${row.organisationId}`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                View organisation
                              </Link>
                            ) : null}
                            <Link
                              href={`/triage/${row.id}?tab=communications`}
                              onClick={() => setMenuOpenId(null)}
                            >
                              View communications
                            </Link>
                            {row.proposalReference || row.proposalStatus ? (
                              <Link
                                href={`/triage/${row.id}/proposal`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                View proposal
                              </Link>
                            ) : row.completedAt && !row.convertedAt ? (
                              <Link
                                href={`/triage/${row.id}/proposal`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Create proposal
                              </Link>
                            ) : null}
                            {row.convertedEngagement?.id ? (
                              <Link
                                href={`/advisory/${row.convertedEngagement.id}`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Open Level 2
                              </Link>
                            ) : null}
                            {analysts.length ? (
                              <>
                                {row.assignedAnalystId && !row.convertedEngagement?.id && !row.convertedAt ? (
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
                                      {row.assignedAnalyst ? 'Reassign analyst' : 'Assign analyst'}
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
                            {isAdmin ? (
                              <button
                                type="button"
                                className="danger"
                                disabled={deletingId === row.id || busy === row.id}
                                onClick={() => void deleteSubmission(row)}
                              >
                                {deletingId === row.id ? 'Deleting…' : 'Delete'}
                              </button>
                            ) : null}
                          </RowActionsMenu>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="assess2-detail-row">
                          <td colSpan={8}>
                            <div className="grid gap-3 rounded-lg bg-slate-50 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Contact details
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {contactName || '—'}
                                </strong>
                                <span className="block text-xs text-slate-500">{email || row.email || '—'}</span>
                                <span className="block text-xs text-slate-500">{row.phone || 'No phone'}</span>
                                {row.industry ? (
                                  <span className="block text-xs text-slate-400">{row.industry}</span>
                                ) : null}
                              </div>
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Questionnaire progress
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {progressLine}
                                </strong>
                                <span className="block text-xs text-slate-500">
                                  {row.progressLabel || (row.completedAt ? 'Submitted' : 'In progress')}
                                </span>
                              </div>
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Assurance summary
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {score != null ? `${score} / 100` : '—'}
                                </strong>
                                <span className="block text-xs text-slate-500">
                                  {bandLabel || 'Pending'}
                                </span>
                              </div>
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Commercial progression
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {commercialLabel(row.intent)}
                                </strong>
                                <span className="block text-xs text-slate-500">
                                  {proposalRef
                                    || (row.proposalRequestedAt
                                      ? `Requested ${fmtDateTime(row.proposalRequestedAt)}`
                                      : row.diagnosticRequestedAt
                                        ? `Diagnostic ${fmtDateTime(row.diagnosticRequestedAt)}`
                                        : 'No commercial request yet')}
                                </span>
                              </div>
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Latest communication
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {unread > 0 ? `${unread} unread` : 'No unread'}
                                </strong>
                                <Link
                                  href={`/triage/${row.id}?tab=communications`}
                                  className="mt-1 inline-block text-xs font-medium text-[#c41230] hover:underline"
                                >
                                  Open communications
                                </Link>
                              </div>
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Assigned analyst
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {analystName(row.assignedAnalyst) || 'Unassigned'}
                                </strong>
                                <span className="block text-xs text-slate-500">
                                  {row.assignedAnalyst?.email || '—'}
                                </span>
                              </div>
                              <div>
                                <em className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Next recommended action
                                </em>
                                <strong className="mt-1 block text-sm text-slate-900">
                                  {nextAction || statusLabel(row.displayStatus)}
                                </strong>
                                <span className="block text-xs text-slate-500">
                                  {statusLabel(row.displayStatus)}
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
                {loading && !items.length && (
                  <tr>
                    <td colSpan={8} className="muted">
                      Loading triage submissions…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="org2-pagination border-t border-slate-100">
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
