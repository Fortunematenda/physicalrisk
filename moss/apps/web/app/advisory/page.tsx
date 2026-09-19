'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  FileCheck,
  FileText,
  Send,
  UserRound,
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { AdvisoryBreadcrumb } from '@/components/advisory/AdvisoryBreadcrumb';
import { useConfirm } from '@/components/confirm-dialog';
import { StatCard } from '@/components/dashboard/stat-card';
import { IconMoreVertical } from '@/components/NavIcons';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { Shell } from '@/components/Shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import {
  advisoryReportHref,
  advisoryWorkspaceHref,
  advisoryWorkingPapersHref,
  canGenerateAdvisoryReport,
  formatAdvisoryReportVersion,
  isAdvisoryReportReady,
  type LatestAdvisoryReport,
} from '@/lib/advisory-report';
import { getStoredUser, resolveMvpNavRole } from '@/lib/auth-user';
import { formatDate } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  EXECUTIVE_ADVISORY_DIAGNOSTIC: 'Executive Advisory Diagnostic',
  CONTRACT_SLA_ASSURANCE: 'Contract & SLA Assurance Review',
  VENDOR_PERFORMANCE_ASSURANCE: 'Vendor Performance Assurance Review',
  GOVERNANCE_EXECUTIVE_ASSURANCE: 'Security Governance & Executive Assurance Review',
  CYBER_PHYSICAL_DEPENDENCY: 'Cyber-Physical Dependency Review',
  // Legacy label only — Shield 360 is retired and not selectable for new work.
  SHIELD360: 'Shield 360 (legacy)',
};

const OUTCOME_STATUSES = new Set([
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'REPORT_GENERATED',
  'REPORT_ISSUED',
]);

const IN_PROGRESS_STATUSES = new Set([
  'DRAFT',
  'IN_PROGRESS',
  'ASSIGNED',
  'READY_FOR_REVIEW',
]);

type AdvisoryRow = {
  id: string;
  reference: string;
  title: string;
  status: string;
  productCode: string;
  updatedAt: string;
  createdAt?: string;
  organisation?: { id: string; name: string };
  assignments?: Array<{
    role: string;
    status: string;
    user: { id?: string; firstName: string; lastName: string };
  }>;
  diagnosticOutcome?: {
    id: string;
    confirmedAt?: string | null;
    commercialStatus?: string | null;
  } | null;
  latestReport?: LatestAdvisoryReport | null;
  _count?: { evidence?: number; reports?: number };
};

type KpiKey = 'total' | 'in_progress' | 'outcome_ready' | 'report_ready' | 'unassigned' | 'level3';

function hasOutcome(row: AdvisoryRow) {
  return Boolean(row.diagnosticOutcome?.confirmedAt) || OUTCOME_STATUSES.has(row.status);
}

function isEad(row: AdvisoryRow) {
  return row.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
}

function isLevel3(row: AdvisoryRow) {
  return !isEad(row) && row.productCode !== 'SHIELD360';
}

function formatEngagementStatus(status: string) {
  return String(status || '')
    .trim()
    .replaceAll('_', ' ')
    .toUpperCase() || '—';
}

/** Presentation-only deliverable cell for the engagements table. */
function DeliverableCell({
  ead,
  outcomeReady,
  reportReady,
  reportVersion,
  status,
  viewHref,
}: {
  ead: boolean;
  outcomeReady: boolean;
  reportReady: boolean;
  reportVersion?: number | null;
  status: string;
  viewHref: string;
}) {
  if (ead && outcomeReady) {
    return (
      <div className="leading-snug">
        <p className="m-0 flex items-center gap-1.5 text-sm font-medium text-slate-900">
          <ClipboardList className="size-3.5 shrink-0 text-slate-500" aria-hidden />
          Assessment outcome
        </p>
        <p className="m-0 mt-0.5 text-xs text-slate-500">
          Ready
          <span className="text-slate-300"> · </span>
          <Link
            href={viewHref}
            className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            View
          </Link>
        </p>
      </div>
    );
  }

  if (reportReady) {
    return (
      <div className="leading-snug">
        <p className="m-0 flex items-center gap-1.5 text-sm font-medium text-slate-900">
          <FileText className="size-3.5 shrink-0 text-slate-500" aria-hidden />
          Assurance report
        </p>
        <p className="m-0 mt-0.5 text-xs text-slate-500">
          {formatAdvisoryReportVersion(reportVersion)}
          <span className="text-slate-300"> · </span>
          <Link
            href={viewHref}
            className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            View
          </Link>
        </p>
      </div>
    );
  }

  const draftLike = IN_PROGRESS_STATUSES.has(String(status || '').toUpperCase()) ||
    String(status || '').toUpperCase() === 'DRAFT';

  return (
    <span className="text-xs text-slate-400">
      {draftLike ? 'Not generated' : 'Not available yet'}
    </span>
  );
}

function primaryAnalyst(row: AdvisoryRow) {
  return row.assignments?.find(
    (a) => a.role === 'PRIMARY_ANALYST' && a.status !== 'CANCELLED',
  );
}

function matchesKpi(row: AdvisoryRow, key: KpiKey | null) {
  if (!key || key === 'total') return true;
  if (key === 'in_progress') {
    return IN_PROGRESS_STATUSES.has(row.status) || (!hasOutcome(row) && row.status !== 'CLOSED');
  }
  if (key === 'outcome_ready') return hasOutcome(row) && isEad(row);
  if (key === 'report_ready') return isAdvisoryReportReady(row.latestReport);
  if (key === 'unassigned') return !primaryAnalyst(row);
  if (key === 'level3') return isLevel3(row);
  return true;
}

export default function AdvisoryPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [items, setItems] = useState<AdvisoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';

  const showError = (description: string, title = 'Unable to continue') => {
    toast({ title, description, variant: 'error' });
  };

  const load = () => {
    setLoading(true);
    return apiFetch<AdvisoryRow[]>('/advisory')
      .then(setItems)
      .catch((e: Error) => showError(e.message, 'Unable to load engagements'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const total = items.length;
    const inProgress = items.filter(
      (r) => IN_PROGRESS_STATUSES.has(r.status) || (!hasOutcome(r) && r.status !== 'CLOSED'),
    ).length;
    const outcomeReady = items.filter((r) => hasOutcome(r) && isEad(r)).length;
    const reportReady = items.filter((r) => isAdvisoryReportReady(r.latestReport)).length;
    const unassigned = items.filter((r) => !primaryAnalyst(r)).length;
    const level3 = items.filter((r) => isLevel3(r)).length;
    return { total, inProgress, outcomeReady, reportReady, unassigned, level3 };
  }, [items]);

  const statusOptions = useMemo(() => {
    const set = new Set(items.map((r) => r.status).filter(Boolean));
    return Array.from(set)
      .sort()
      .map((value) => ({ value, label: value.replace(/_/g, ' ') }));
  }, [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      if (productFilter !== 'ALL' && row.productCode !== productFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (!matchesKpi(row, selectedKpi)) return false;
      if (!q) return true;
      const hay = [
        row.reference,
        row.title,
        row.organisation?.name,
        LABELS[row.productCode],
        row.productCode,
        row.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, productFilter, statusFilter, selectedKpi, query]);

  const hasActiveFilters =
    productFilter !== 'ALL' || Boolean(statusFilter) || Boolean(query.trim()) || Boolean(selectedKpi);

  function clearFilters() {
    setProductFilter('ALL');
    setStatusFilter('');
    setQuery('');
    setSelectedKpi(null);
  }

  function setKpiFilter(key: KpiKey) {
    setSelectedKpi((prev) => (prev === key ? null : key));
    if (key === 'in_progress') setStatusFilter('');
    if (key === 'level3') setProductFilter('ALL');
  }

  function kpiCardClass(key: KpiKey) {
    return cn(
      'min-h-[108px] rounded-xl border bg-white shadow-none transition-[border-color,box-shadow,background-color]',
      selectedKpi === key
        ? 'border-[#c41230]/35 bg-[#fff8f9] shadow-[inset_0_0_0_1px_rgba(196,18,48,0.08)]'
        : 'border-slate-200',
    );
  }

  function startEdit(row: AdvisoryRow) {
    setEditing({ id: row.id, title: row.title });
    setEditTitle(row.title);
    setMenuOpenId(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const title = editTitle.trim();
    if (title.length < 2) {
      showError('Engagement title must be at least 2 characters.', 'Invalid title');
      return;
    }
    setSavingEdit(true);
    try {
      await apiFetch(`/advisory/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setItems((prev) => prev.map((item) => (item.id === editing.id ? { ...item, title } : item)));
      setEditing(null);
      toast({ title: 'Engagement updated', variant: 'success' });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Unable to update engagement.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteEngagement(row: AdvisoryRow) {
    const ok = await confirm({
      title: 'Delete engagement',
      description: `Delete engagement “${row.reference}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(row.id);
    try {
      await apiFetch(`/advisory/${row.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== row.id));
      if (editing?.id === row.id) setEditing(null);
      toast({ title: 'Engagement deleted', variant: 'success' });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Unable to delete engagement.', 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  async function generateReport(row: AdvisoryRow) {
    setMenuOpenId(null);
    setBusyId(row.id);
    try {
      const report = await apiFetch<{ id: string }>(`/advisory/${row.id}/generate-report`, {
        method: 'POST',
      });
      toast({
        title: 'Report generated successfully',
        description: 'Opening the on-screen report preview.',
        variant: 'success',
      });
      await load();
      if (report?.id) {
        if (row.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC') {
          router.push(`/advisory/${row.id}/outcome`);
        } else {
          router.push(advisoryReportHref(report.id));
        }
      }
    } catch (err: unknown) {
      showError(
        err instanceof Error ? err.message : 'Unable to generate the report.',
        'Report generation failed',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AuthGate>
      <Shell
        title="Diagnostics & assurance"
        hideTitle
        headerLeading={<AdvisoryBreadcrumb current="Diagnostics & assurance" root />}
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <p className="m-0 max-w-2xl text-sm text-moss-muted">
            Level 2 Executive Advisory Diagnostic → Level 3 focused assurance.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/advisory/new">+ New engagement</Link>
            </Button>
            {isAdmin ? (
              <Button asChild variant="outline">
                <Link href="/admin/ead-diagnostic-template">Diagnostic questionnaire</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mb-5 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-stretch">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Engagement activity
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('total')}>
                  <StatCard
                    icon={ClipboardList}
                    title="Total engagements"
                    value={summary.total}
                    description="All advisory work"
                    tone="blue"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('total')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('in_progress')}
                >
                  <StatCard
                    icon={Send}
                    title="In progress"
                    value={summary.inProgress}
                    description="Active diagnostics"
                    tone="amber"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('in_progress')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('outcome_ready')}
                >
                  <StatCard
                    icon={FileCheck}
                    title="Outcome ready"
                    value={summary.outcomeReady}
                    description="Executive Advisory outcomes"
                    tone="violet"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('outcome_ready')}
                  />
                </button>
              </div>
            </div>

            <div className="hidden w-px bg-slate-200 xl:block" aria-hidden="true" />

            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Delivery &amp; coverage
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('report_ready')}
                >
                  <StatCard
                    icon={FileText}
                    title="Report ready"
                    value={summary.reportReady}
                    description="Level 3 assurance PDFs"
                    tone="green"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('report_ready')}
                  />
                </button>
                <button
                  type="button"
                  className="triage2-kpi-btn"
                  onClick={() => setKpiFilter('unassigned')}
                >
                  <StatCard
                    icon={UserRound}
                    title="Unassigned"
                    value={summary.unassigned}
                    description="Needs consultant"
                    tone="amber"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('unassigned')}
                  />
                </button>
                <button type="button" className="triage2-kpi-btn" onClick={() => setKpiFilter('level3')}>
                  <StatCard
                    icon={BadgeCheck}
                    title="Level 3 engagements"
                    value={summary.level3}
                    description="Focused assurance"
                    tone="teal"
                    loading={loading && !items.length}
                    textWrap
                    className={kpiCardClass('level3')}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {editing ? (
          <Card className="mb-4 max-w-2xl rounded-xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Edit engagement</CardTitle>
              <CardDescription>Update the engagement title shown across MOSS.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveEdit} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 space-y-2">
                  <label className="text-sm font-medium" htmlFor="edit-advisory-title">
                    Title
                  </label>
                  <Input
                    id="edit-advisory-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    disabled={savingEdit}
                  />
                </div>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[240px] flex-[1_1_280px] max-w-xl">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search organisation, reference or title…"
                  aria-label="Search advisory engagements"
                  className="h-10"
                />
              </div>
              <FilterSelect
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="All statuses"
                aria-label="Filter by status"
                triggerClassName="h-10 w-full min-w-[150px]"
                className="min-w-[150px] flex-[0_1_170px]"
                options={statusOptions}
              />
              <FilterSelect
                value={productFilter}
                onChange={setProductFilter}
                includeAll={false}
                placeholder="All products"
                aria-label="Filter by product"
                triggerClassName="h-10 w-full min-w-[200px]"
                className="min-w-[200px] flex-[0_1_240px]"
                options={[
                  { value: 'ALL', label: 'All advisory products' },
                  ...Object.entries(LABELS).map(([k, v]) => ({ value: k, label: v })),
                ]}
              />
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

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Engagements</CardTitle>
            <CardDescription>
              {rows.length} record{rows.length === 1 ? '' : 's'}
              {hasActiveFilters ? ' (filtered)' : ''}
              {' · '}
              Level 2 produces an Assessment Outcome; Level 3 produces an Assurance Report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Organisation</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Consultant</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Deliverable</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const a = primaryAnalyst(x);
                    const outcomeReady = hasOutcome(x);
                    const ead = isEad(x);
                    const reportReady = isAdvisoryReportReady(x.latestReport);
                    const workspaceHref = advisoryWorkspaceHref({
                      assessmentId: x.id,
                      productCode: x.productCode,
                      reference: x.reference,
                      hasOutcome: outcomeReady,
                    });
                    const showGenerate = canGenerateAdvisoryReport({
                      status: x.status,
                      hasOutcome: outcomeReady,
                      reportReady,
                    });
                    return (
                      <tr
                        key={x.id}
                        className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/80"
                        onClick={() => router.push(workspaceHref)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            router.push(workspaceHref);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={
                          outcomeReady && ead
                            ? `Open diagnostic outcome ${x.reference}`
                            : `Open engagement ${x.reference}`
                        }
                      >
                        <td className="px-3 py-2">
                          <strong>{x.reference}</strong>
                        </td>
                        <td className="px-3 py-2">{x.organisation?.name}</td>
                        <td className="px-3 py-2">{LABELS[x.productCode] || x.productCode}</td>
                        <td className="px-3 py-2">
                          {a ? `${a.user.firstName} ${a.user.lastName}` : 'Unassigned'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-sm text-slate-800">
                            {formatEngagementStatus(x.status)}
                          </span>
                        </td>
                        <td
                          className="px-3 py-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <DeliverableCell
                            ead={ead}
                            outcomeReady={outcomeReady}
                            reportReady={reportReady}
                            reportVersion={x.latestReport?.version}
                            status={x.status}
                            viewHref={
                              ead && outcomeReady
                                ? workspaceHref
                                : reportReady && x.latestReport
                                  ? advisoryReportHref(x.latestReport.id)
                                  : workspaceHref
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {formatDate(x.updatedAt)}
                        </td>
                        <td
                          className="org2-actions-cell px-3 py-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <RowActionsMenu
                            open={menuOpenId === x.id}
                            onClose={() => setMenuOpenId(null)}
                            trigger={(
                              <button
                                type="button"
                                className="org2-menu-btn"
                                aria-label="Engagement actions"
                                onClick={() => setMenuOpenId((id) => (id === x.id ? null : x.id))}
                              >
                                <IconMoreVertical />
                              </button>
                            )}
                          >
                            <Link href={workspaceHref} onClick={() => setMenuOpenId(null)}>
                              {outcomeReady && ead
                                ? 'Open diagnostic outcome'
                                : 'Open engagement'}
                            </Link>
                            {outcomeReady && ead ? (
                              <Link
                                href={advisoryWorkingPapersHref(x.id)}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Open working papers
                              </Link>
                            ) : null}
                            {showGenerate ? (
                              <button
                                type="button"
                                disabled={busyId === x.id}
                                onClick={() => void generateReport(x)}
                              >
                                {busyId === x.id ? 'Generating…' : 'Generate report'}
                              </button>
                            ) : null}
                            {x.organisation?.id ? (
                              <Link
                                href={`/organisations/${x.organisation.id}`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                View organisation
                              </Link>
                            ) : null}
                            {!a ? (
                              <Link href={`/advisory/${x.id}`} onClick={() => setMenuOpenId(null)}>
                                Assign consultant
                              </Link>
                            ) : null}
                            {isAdmin ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(x)}
                                  disabled={busyId === x.id}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => void deleteEngagement(x)}
                                  disabled={busyId === x.id}
                                >
                                  {busyId === x.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            ) : null}
                          </RowActionsMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        {hasActiveFilters
                          ? 'No engagements match the current filters.'
                          : 'No advisory engagements yet.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </Shell>
    </AuthGate>
  );
}
