'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  FileText,
  FilterX,
  Info,
  ListChecks,
  MoreVertical,
  Send,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { FilterBar } from '@/components/common/filter-bar';
import { LoadingSkeleton } from '@/components/common/loading-skeleton';
import { StatusBadge } from '@/components/common/status-badge';
import { ChartCard } from '@/components/dashboard/chart-card';
import { DonutChartCard } from '@/components/dashboard/donut-chart-card';
import { MiniTrendChart } from '@/components/dashboard/mini-trend-chart';
import { StatCard } from '@/components/dashboard/stat-card';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { ensureSsoUser, getStoredUser, getUserDisplayName } from '@/lib/auth-user';
import { formatRelative, formatScore, formatZar } from '@/lib/format';
import { cn } from '@/lib/utils';

type Assessment = {
  id: string;
  reference: string;
  status: string;
  source?: string;
  updatedAt: string;
  createdAt: string;
  organisation?: { id: string; name: string };
  organisationId?: string;
  scoreSnapshots?: Array<{
    overallRiskScore: number | string;
    riskBand: string;
    categoryScores?: Array<{ category: string; score: number | string }>;
    leakageResult?: {
      minimumLeakageValue?: number;
      likelyLeakageValue?: number;
      maximumExposureValue?: number;
      recoverableLow?: number;
      recoverableHigh?: number;
    };
  }>;
  _count?: { reports?: number };
  reports?: Array<{ id: string; status: string }>;
};

const RISK_COLORS = {
  Low: '#22c55e',
  Controlled: '#22c55e',
  Moderate: '#f59e0b',
  High: '#f97316',
  Critical: '#c41230',
};

const STATUS_COLORS = {
  inProgress: '#64748b',
  submitted: '#c41230',
  reviewed: '#d97706',
  approved: '#0a684a',
  reports: '#2563eb',
};

const STATUS_OPTIONS = [
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'REPORT_GENERATED',
  'REPORT_ISSUED',
] as const;

function riskScoreChipClass(score: number | null, band?: string) {
  const value = (band || '').toLowerCase();
  if (value === 'critical' || value === 'high' || (score !== null && score >= 60)) {
    return 'bg-red-50 text-red-600';
  }
  if (value === 'moderate' || (score !== null && score >= 45)) {
    return 'bg-amber-50 text-amber-700';
  }
  if (value === 'low' || value === 'controlled' || score !== null) {
    return 'bg-emerald-50 text-emerald-700';
  }
  return 'bg-slate-100 text-slate-500';
}

function formatCompactRelative(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatRelative(date);
}

export default function DashboardPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [organisations, setOrganisations] = useState<unknown[]>([]);
  const [emails, setEmails] = useState<
    Array<{ status: string; subject?: string; updatedAt?: string; createdAt?: string }>
  >([]);
  const [crmLogs, setCrmLogs] = useState<
    Array<{ status: string; message?: string; createdAt?: string }>
  >([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [userName, setUserName] = useState('there');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = (await ensureSsoUser()) || getStoredUser();
      if (cancelled) return;
      setUserName(getUserDisplayName(user).split(' ')[0] || 'there');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch<Assessment[]>('/assessments'),
      apiFetch('/organisations'),
      apiFetch('/admin/emails').catch(() => []),
      apiFetch('/integrations/espocrm/logs').catch(() => []),
    ])
      .then(([a, o, e, c]) => {
        setAssessments(a);
        setOrganisations(o);
        setEmails(e);
        const logs = Array.isArray(c) ? c : Array.isArray((c as { items?: unknown[] })?.items)
          ? (c as { items: Array<{ status: string; message?: string; createdAt?: string }> }).items
          : [];
        setCrmLogs(logs);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { hasSsoSession } = await import('@/lib/sso');
      const { getToken } = await import('@/lib/api');
      if (cancelled) return;
      // AuthGate wraps the UI, but this page's hooks still run while gated —
      // wait for a real session before hitting /api/gw.
      if ((await hasSsoSession()) || getToken()) {
        loadData();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const filtered = useMemo(() => {
    return assessments.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      const d = new Date(a.updatedAt || a.createdAt).getTime();
      if (fromDate && d < new Date(fromDate).getTime()) return false;
      if (toDate && d > new Date(toDate).getTime() + 86400000) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${a.reference} ${a.organisation?.name || ''} ${a.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assessments, statusFilter, fromDate, toDate, search]);

  const leakageTrends = useMemo(() => {
    const sorted = [...filtered]
      .filter((a) => a.scoreSnapshots?.[0]?.leakageResult)
      .sort(
        (a, b) =>
          new Date(a.updatedAt || a.createdAt).getTime() -
          new Date(b.updatedAt || b.createdAt).getTime(),
      );

    const pick = (key: keyof NonNullable<
      NonNullable<Assessment['scoreSnapshots']>[number]['leakageResult']
    >) =>
      sorted.map(
        (a) => Number(a.scoreSnapshots?.[0]?.leakageResult?.[key] || 0),
      );

    return {
      likely: pick('likelyLeakageValue'),
      minimum: pick('minimumLeakageValue'),
      maximum: pick('maximumExposureValue'),
      recoverable: pick('recoverableHigh'),
    };
  }, [filtered]);

  /** Month-over-month % change for KPI cards (real counts, not dummy). */
  const kpiTrends = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = thisMonthStart;
    const prevLabel = prevMonthStart.toLocaleString('en-ZA', { month: 'short', year: 'numeric' });
    const compareLabel = `vs ${prevLabel}`;

    const inRange = (iso: string, start: Date, end: Date) => {
      const t = new Date(iso).getTime();
      return t >= start.getTime() && t < end.getTime();
    };

    const matchers = {
      orgs: (_a: Assessment) => true,
      inProgress: (a: Assessment) =>
        ['DRAFT', 'IN_PROGRESS', 'AWAITING_CONTRIBUTOR'].includes(a.status),
      submitted: (a: Assessment) =>
        ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'EVIDENCE_REVIEW', 'ANALYST_REVIEW'].includes(
          a.status,
        ),
      awaitingReview: (a: Assessment) =>
        ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'EVIDENCE_REVIEW', 'ANALYST_REVIEW'].includes(
          a.status,
        ),
      approved: (a: Assessment) =>
        ['APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED'].includes(a.status),
      reportsIssued: (a: Assessment) =>
        a.status === 'REPORT_ISSUED' || (a._count?.reports || 0) > 0,
    } as const;

    const pctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const forMatcher = (match: (a: Assessment) => boolean) => {
      const current = filtered.filter(
        (a) => match(a) && inRange(a.updatedAt || a.createdAt, thisMonthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      ).length;
      const previous = filtered.filter(
        (a) => match(a) && inRange(a.updatedAt || a.createdAt, prevMonthStart, prevMonthEnd),
      ).length;
      // Prefer portfolio totals when monthly buckets are sparse
      const currentTotal = filtered.filter(match).length;
      const percent = pctChange(
        current || currentTotal,
        previous || Math.max(currentTotal - current, 0),
      );
      return {
        percent,
        direction: (percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral',
        compareLabel,
      };
    };

    // Organisations: compare assessment activity volume as proxy when org createdAt is unavailable
    const orgCurrent = filtered.filter((a) =>
      inRange(a.updatedAt || a.createdAt, thisMonthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    ).length;
    const orgPrevious = filtered.filter((a) =>
      inRange(a.updatedAt || a.createdAt, prevMonthStart, prevMonthEnd),
    ).length;
    const orgPercent = pctChange(
      orgCurrent || organisations.length,
      orgPrevious || Math.max(organisations.length - orgCurrent, 0),
    );

    return {
      orgs: {
        percent: orgPercent,
        direction: (orgPercent > 0 ? 'up' : orgPercent < 0 ? 'down' : 'neutral') as 'up' | 'down' | 'neutral',
        compareLabel,
      },
      inProgress: forMatcher(matchers.inProgress),
      submitted: forMatcher(matchers.submitted),
      awaitingReview: forMatcher(matchers.awaitingReview),
      approved: forMatcher(matchers.approved),
      reportsIssued: forMatcher(matchers.reportsIssued),
    };
  }, [filtered, organisations.length]);

  const summary = useMemo(() => {
    const snapshots = filtered
      .map((a) => a.scoreSnapshots?.[0])
      .filter(Boolean) as NonNullable<Assessment['scoreSnapshots']>;
    const riskCounts = {
      Low: snapshots.filter((s) => ['Low', 'Controlled'].includes(s.riskBand)).length,
      Moderate: snapshots.filter((s) => s.riskBand === 'Moderate').length,
      High: snapshots.filter((s) => s.riskBand === 'High').length,
      Critical: snapshots.filter((s) => s.riskBand === 'Critical').length,
    };
    const scored = snapshots.map((s) => Number(s.overallRiskScore) || 0);
    const avgScore = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0;
    const dominantRisk =
      (Object.entries(riskCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as keyof typeof RISK_COLORS) ||
      'Moderate';

    const categoryMap = new Map<string, number[]>();
    for (const snap of snapshots) {
      for (const cat of snap.categoryScores || []) {
        const list = categoryMap.get(cat.category) || [];
        list.push(Number(cat.score) || 0);
        categoryMap.set(cat.category, list);
      }
    }
    const topCategories = [...categoryMap.entries()]
      .map(([category, scores]) => ({
        category,
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
        spark: scores.slice(-7),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const likely = snapshots.reduce(
      (sum, s) => sum + Number(s.leakageResult?.likelyLeakageValue || 0),
      0,
    );
    const minimum = snapshots.reduce(
      (sum, s) => sum + Number(s.leakageResult?.minimumLeakageValue || 0),
      0,
    );
    const maximum = snapshots.reduce(
      (sum, s) => sum + Number(s.leakageResult?.maximumExposureValue || 0),
      0,
    );
    const recoverable = snapshots.reduce(
      (sum, s) => sum + Number(s.leakageResult?.recoverableHigh || 0),
      0,
    );

    const inProgress = filtered.filter((a) =>
      ['DRAFT', 'IN_PROGRESS', 'AWAITING_CONTRIBUTOR'].includes(a.status),
    ).length;
    const submitted = filtered.filter((a) =>
      ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'EVIDENCE_REVIEW', 'ANALYST_REVIEW'].includes(
        a.status,
      ),
    ).length;
    const reviewed = filtered.filter((a) => a.status === 'REVIEWED').length;
    const approved = filtered.filter((a) =>
      ['APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED'].includes(a.status),
    ).length;
    const reportsIssued = filtered.filter(
      (a) => a.status === 'REPORT_ISSUED' || (a._count?.reports || 0) > 0,
    ).length;

    return {
      riskCounts,
      avgScore,
      dominantRisk,
      topCategories,
      likely,
      minimum,
      maximum,
      recoverable,
      inProgress,
      submitted,
      reviewed,
      approved,
      reportsIssued,
      awaitingReview: submitted,
      orgs: organisations.length,
      total: filtered.length,
      failedEmails: emails.filter((e) => e.status === 'FAILED').length,
      failedCrm: crmLogs.filter((c) => c.status === 'FAILED').length,
    };
  }, [filtered, organisations, emails, crmLogs]);

  const statusDonut = useMemo(() => {
    const items = [
      { name: 'In Progress', value: summary.inProgress, color: STATUS_COLORS.inProgress },
      { name: 'Submitted', value: summary.submitted, color: STATUS_COLORS.submitted },
      { name: 'Reviewed', value: summary.reviewed, color: STATUS_COLORS.reviewed },
      { name: 'Approved', value: summary.approved, color: STATUS_COLORS.approved },
      { name: 'Reports', value: summary.reportsIssued, color: STATUS_COLORS.reports },
    ].filter((i) => i.value > 0);
    return items.length ? items : [{ name: 'No data', value: 1, color: '#e5e7eb' }];
  }, [summary]);

  const riskDonut = useMemo(() => {
    const items = [
      { name: 'Low', value: summary.riskCounts.Low, color: RISK_COLORS.Low },
      { name: 'Moderate', value: summary.riskCounts.Moderate, color: RISK_COLORS.Moderate },
      { name: 'High', value: summary.riskCounts.High, color: RISK_COLORS.High },
      { name: 'Critical', value: summary.riskCounts.Critical, color: RISK_COLORS.Critical },
    ].filter((i) => i.value > 0);
    return items.length ? items : [{ name: 'No scores', value: 1, color: '#e5e7eb' }];
  }, [summary]);

  const riskTotal =
    summary.riskCounts.Low +
      summary.riskCounts.Moderate +
      summary.riskCounts.High +
      summary.riskCounts.Critical || 1;

  const alerts = useMemo(() => {
    const items: Array<{ tone: 'danger' | 'warn' | 'info' | 'ok'; title: string; when: string }> =
      [];
    for (const email of emails.filter((e) => e.status === 'FAILED').slice(0, 2)) {
      items.push({
        tone: 'danger',
        title: `Email failed${email.subject ? `: ${email.subject}` : ''}`,
        when: formatRelative(email.updatedAt || email.createdAt),
      });
    }
    for (const log of crmLogs.filter((c) => c.status === 'FAILED').slice(0, 2)) {
      items.push({
        tone: 'warn',
        title: log.message || 'EspoCRM sync failed',
        when: formatRelative(log.createdAt),
      });
    }
    if (summary.awaitingReview > 0) {
      items.push({
        tone: 'info',
        title: `${summary.awaitingReview} assessment(s) awaiting review`,
        when: 'now',
      });
    }
    if (!items.length) {
      items.push({ tone: 'ok', title: 'All systems healthy', when: 'now' });
    }
    return items.slice(0, 5);
  }, [emails, crmLogs, summary.awaitingReview]);

  const recent = filtered.slice(0, 6);
  const notificationCount = summary.awaitingReview + summary.failedEmails + summary.failedCrm;

  const clearFilters = () => {
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setSearch('');
  };

  const dominantRiskLabel =
    summary.dominantRisk === 'Controlled' ? 'Low' : summary.dominantRisk;

  return (
    <AuthGate>
      <AppShell
        title="Dashboard"
        subtitle={`Welcome back, ${userName}. Here's what's happening with your assessments.`}
        searchPlaceholder="Search assessments…"
        searchValue={search}
        onSearch={setSearch}
        notificationCount={notificationCount}
        mailCount={summary.failedEmails}
      >
        {error && (
          <ErrorState message={error} onRetry={loadData} className="mb-6" />
        )}

        <FilterBar
          className="mb-6"
          clearAction={
            (statusFilter || fromDate || toDate || search) ? (
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                <FilterX className="size-4" />
                Clear filters
              </Button>
            ) : undefined
          }
        >
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="dashboard-from">From</Label>
            <Input
              id="dashboard-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="dashboard-to">To</Label>
            <Input
              id="dashboard-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-2">
            <Label htmlFor="dashboard-status">Status</Label>
            <select
              id="dashboard-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </FilterBar>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={Building2}
            title="Total Organisations"
            value={summary.orgs}
            tone="red"
            trendPercent={kpiTrends.orgs.percent}
            trendDirection={kpiTrends.orgs.direction}
            trendCompareLabel={kpiTrends.orgs.compareLabel}
            loading={loading}
          />
          <StatCard
            icon={ClipboardList}
            title="Assessments In Progress"
            value={summary.inProgress}
            tone="blue"
            trendPercent={kpiTrends.inProgress.percent}
            trendDirection={kpiTrends.inProgress.direction}
            trendTone="warning"
            trendCompareLabel={kpiTrends.inProgress.compareLabel}
            loading={loading}
          />
          <StatCard
            icon={Send}
            title="Submitted"
            value={summary.submitted}
            tone="amber"
            trendPercent={kpiTrends.submitted.percent}
            trendDirection={kpiTrends.submitted.direction}
            trendCompareLabel={kpiTrends.submitted.compareLabel}
            loading={loading}
          />
          <StatCard
            icon={User}
            title="Awaiting Review"
            value={summary.awaitingReview}
            tone="violet"
            trendPercent={kpiTrends.awaitingReview.percent}
            trendDirection={kpiTrends.awaitingReview.direction}
            trendTone={kpiTrends.awaitingReview.percent >= 0 ? 'down' : 'up'}
            trendCompareLabel={kpiTrends.awaitingReview.compareLabel}
            loading={loading}
          />
          <StatCard
            icon={ShieldCheck}
            title="Approved"
            value={summary.approved}
            tone="green"
            trendPercent={kpiTrends.approved.percent}
            trendDirection={kpiTrends.approved.direction}
            trendCompareLabel={kpiTrends.approved.compareLabel}
            loading={loading}
          />
          <StatCard
            icon={FileText}
            title="Reports Issued"
            value={summary.reportsIssued}
            tone="teal"
            trendPercent={kpiTrends.reportsIssued.percent}
            trendDirection={kpiTrends.reportsIssued.direction}
            trendCompareLabel={kpiTrends.reportsIssued.compareLabel}
            loading={loading}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Risk &amp; Leakage Overview</CardTitle>
              <CardDescription>
                Portfolio SCLI risk and estimated leakage exposure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="min-w-0">
                  <DonutChartCard
                    data={riskDonut}
                    innerRadius="62%"
                    outerRadius="88%"
                    heightClassName="h-[210px] sm:h-[240px]"
                    center={
                      <>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-moss-muted">
                          SCLI Risk Score
                        </span>
                        <strong className="text-2xl font-bold text-moss-text">
                          {loading ? '—' : formatScore(summary.avgScore, 0)}
                        </strong>
                        <em
                          className="text-xs font-medium not-italic"
                          style={{ color: RISK_COLORS[summary.dominantRisk] || '#c41230' }}
                        >
                          {dominantRiskLabel} Risk
                        </em>
                      </>
                    }
                  />
                  <ul className="mt-4 space-y-2">
                    {(['Low', 'Moderate', 'High', 'Critical'] as const).map((band) => {
                      const value = summary.riskCounts[band];
                      const pct = Math.round((value / riskTotal) * 100);
                      return (
                        <li
                          key={band}
                          className="grid min-w-0 grid-cols-[auto_1fr_auto_auto] items-center gap-2 text-sm"
                        >
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: RISK_COLORS[band] }}
                          />
                          <span className="truncate text-moss-muted">{band}</span>
                          <strong className="font-semibold text-moss-text">{value}</strong>
                          <em className="w-10 text-right text-xs not-italic text-moss-muted">
                            {pct}%
                          </em>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    {
                      label: 'Estimated Likely Leakage',
                      value: summary.likely,
                      trend: leakageTrends.likely,
                      color: '#c41230',
                    },
                    {
                      label: 'Minimum Leakage',
                      value: summary.minimum,
                      trend: leakageTrends.minimum,
                      color: '#f59e0b',
                    },
                    {
                      label: 'Maximum Exposure',
                      value: summary.maximum,
                      trend: leakageTrends.maximum,
                      color: '#9e0e26',
                    },
                    {
                      label: 'Recoverable High',
                      value: summary.recoverable,
                      trend: leakageTrends.recoverable,
                      color: '#0a684a',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="min-w-0 rounded-lg border border-moss-border bg-moss-page/50 p-3"
                    >
                      <span className="block text-xs text-moss-muted">{item.label}</span>
                      <strong className="mt-1 block truncate text-base font-bold text-moss-text">
                        {loading ? '—' : formatZar(item.value)}
                      </strong>
                      <MiniTrendChart data={item.trend} color={item.color} className="mt-2" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <ChartCard
            title="Assessments by Status"
            description="Current pipeline distribution"
          >
            <div className="grid min-w-0 h-full grid-cols-1 gap-4 sm:grid-cols-2">
              <DonutChartCard
                data={statusDonut}
                innerRadius="55%"
                outerRadius="78%"
                heightClassName="h-full min-h-[190px]"
                center={
                  <>
                    <strong className="text-2xl font-bold text-moss-text">
                      {loading ? '—' : summary.total}
                    </strong>
                    <span className="text-xs text-moss-muted">Total</span>
                  </>
                }
              />
              <ul className="flex min-w-0 flex-col justify-center space-y-2">
                {[
                  { label: 'In Progress', value: summary.inProgress, color: STATUS_COLORS.inProgress },
                  { label: 'Submitted', value: summary.submitted, color: STATUS_COLORS.submitted },
                  { label: 'Reviewed', value: summary.reviewed, color: STATUS_COLORS.reviewed },
                  { label: 'Approved', value: summary.approved, color: STATUS_COLORS.approved },
                  {
                    label: 'Reports Issued',
                    value: summary.reportsIssued,
                    color: STATUS_COLORS.reports,
                  },
                ].map((row) => (
                  <li
                    key={row.label}
                    className="grid min-w-0 grid-cols-[auto_1fr_auto_auto] items-center gap-2 text-sm"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: row.color }}
                    />
                    <span className="truncate text-moss-muted">{row.label}</span>
                    <strong className="font-semibold text-moss-text">{row.value}</strong>
                    <em className="w-10 text-right text-xs not-italic text-moss-muted">
                      {summary.total ? Math.round((row.value / summary.total) * 100) : 0}%
                    </em>
                  </li>
                ))}
              </ul>
            </div>
          </ChartCard>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="min-w-0 xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
              <CardTitle className="text-base font-semibold text-moss-text">
                Recent Assessments
              </CardTitle>
              <Link
                href="/assessments"
                className="shrink-0 text-sm font-medium text-moss-info hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent className="min-w-0 pt-0">
              {loading ? (
                <LoadingSkeleton variant="table-rows" count={6} />
              ) : recent.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No assessments found"
                  description="No assessments match the current filters."
                />
              ) : (
                <div className="min-w-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-moss-muted">
                          Assessment
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-moss-muted">
                          Organisation
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-moss-muted">
                          Status
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-moss-muted">
                          Risk Score
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-moss-muted">
                          Updated
                        </TableHead>
                        <TableHead className="w-10 p-2">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((a) => {
                        const snap = a.scoreSnapshots?.[0];
                        const rawScore = snap ? Number(snap.overallRiskScore) : null;
                        const score =
                          rawScore !== null && !Number.isNaN(rawScore) ? rawScore : null;
                        const orgId = a.organisation?.id || a.organisationId;
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="min-w-0">
                              <Link
                                href={`/assessments/${a.id}`}
                                className="font-semibold text-moss-text hover:underline"
                              >
                                {a.reference}
                              </Link>
                            </TableCell>
                            <TableCell className="min-w-0 truncate text-moss-muted">
                              {a.organisation?.name || '—'}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={a.status} />
                            </TableCell>
                            <TableCell>
                              {score !== null ? (
                                <span
                                  className={cn(
                                    'inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                                    riskScoreChipClass(score, snap?.riskBand),
                                  )}
                                >
                                  {formatScore(score, 0)}
                                </span>
                              ) : (
                                <span className="text-moss-muted">—</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-moss-muted">
                              {formatCompactRelative(a.updatedAt)}
                            </TableCell>
                            <TableCell className="w-10 p-2 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-moss-muted hover:text-moss-text"
                                    aria-label={`Actions for ${a.reference}`}
                                  >
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/assessments/${a.id}`}>Open assessment</Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/assessments/${a.id}/review`}>Open review</Link>
                                  </DropdownMenuItem>
                                  {orgId ? (
                                    <DropdownMenuItem asChild>
                                      <Link href={`/organisations/${orgId}`}>
                                        View organisation
                                      </Link>
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Risk Categories</CardTitle>
              <CardDescription>Highest average category scores</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.topCategories.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No scored categories"
                  description="Category scores will appear once assessments are evaluated."
                  className="py-8"
                />
              ) : (
                <ul className="space-y-3">
                  {summary.topCategories.map((cat) => (
                    <li
                      key={cat.category}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-moss-border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-moss-text">
                          {cat.category}
                        </strong>
                        <MiniTrendChart
                          data={cat.spark}
                          color="#c41230"
                          className="mt-1 max-w-[140px]"
                        />
                      </div>
                      <span className="shrink-0 text-sm font-bold text-moss-red">
                        {formatScore(cat.score, 1)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 xl:col-span-3">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-base">System Alerts</CardTitle>
                <CardDescription>Email, CRM and review signals</CardDescription>
              </div>
              <Button asChild variant="link" size="sm" className="shrink-0 px-0">
                <Link href="/admin/emails">Email logs</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {alerts.map((alert, index) => (
                  <li
                    key={`${alert.title}-${index}`}
                    className={cn(
                      'flex min-w-0 items-start gap-3 rounded-lg border p-3',
                      alert.tone === 'danger' && 'border-moss-danger/30 bg-moss-danger/5',
                      alert.tone === 'warn' && 'border-moss-warning/30 bg-moss-warning/5',
                      alert.tone === 'info' && 'border-moss-info/30 bg-moss-info/5',
                      alert.tone === 'ok' && 'border-moss-success/30 bg-moss-success/5',
                    )}
                  >
                    <span className="shrink-0 text-moss-muted">
                      {alert.tone === 'danger' && <XCircle className="size-4 text-moss-danger" />}
                      {alert.tone === 'warn' && (
                        <AlertTriangle className="size-4 text-moss-warning" />
                      )}
                      {alert.tone === 'info' && <Info className="size-4 text-moss-info" />}
                      {alert.tone === 'ok' && (
                        <CheckCircle2 className="size-4 text-moss-success" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-sm text-moss-text">{alert.title}</strong>
                      <span className="text-xs text-moss-muted">{alert.when}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </AuthGate>
  );
}
