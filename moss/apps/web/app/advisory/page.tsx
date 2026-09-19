'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { useConfirm } from '@/components/confirm-dialog';
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
import { useToast } from '@/components/ui/toast';

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

type AdvisoryRow = {
  id: string;
  reference: string;
  title: string;
  status: string;
  productCode: string;
  updatedAt: string;
  organisation?: { id: string; name: string };
  assignments?: Array<{
    role: string;
    status: string;
    user: { firstName: string; lastName: string };
  }>;
  diagnosticOutcome?: { id: string; confirmedAt?: string | null } | null;
  latestReport?: LatestAdvisoryReport | null;
  _count?: { evidence?: number; reports?: number };
};

export default function AdvisoryPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [items, setItems] = useState<AdvisoryRow[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';

  const showError = (description: string, title = 'Unable to continue') => {
    toast({ title, description, variant: 'error' });
  };

  const load = () =>
    apiFetch<AdvisoryRow[]>('/advisory')
      .then(setItems)
      .catch((e: Error) => showError(e.message, 'Unable to load engagements'));

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(
    () => (filter === 'ALL' ? items : items.filter((x) => x.productCode === filter)),
    [items, filter],
  );

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
        router.push(advisoryReportHref(report.id));
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
      <Shell title="Executive Advisory">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-xl font-semibold">Paid diagnostics and focused assurance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Level 2 Executive Advisory Diagnostic → Level 3 focused assurance.
            </p>
          </div>
          <Button asChild>
            <Link href="/advisory/new">+ New engagement</Link>
          </Button>
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
            <div className="max-w-md space-y-2">
              <p className="text-sm font-medium">Product</p>
              <FilterSelect
                value={filter}
                onChange={setFilter}
                includeAll={false}
                placeholder="All advisory products"
                options={[
                  { value: 'ALL', label: 'All advisory products' },
                  ...Object.entries(LABELS).map(([k, v]) => ({ value: k, label: v })),
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Engagements</CardTitle>
            <CardDescription>{rows.length} record{rows.length === 1 ? '' : 's'}</CardDescription>
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
                    <th className="px-3 py-2">Report</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const a = x.assignments?.find(
                      (row) => row.role === 'PRIMARY_ANALYST' && row.status !== 'CANCELLED',
                    );
                    const hasOutcome =
                      Boolean(x.diagnosticOutcome?.confirmedAt) || OUTCOME_STATUSES.has(x.status);
                    const isEad = x.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
                    const reportReady = isAdvisoryReportReady(x.latestReport);
                    const workspaceHref = advisoryWorkspaceHref({
                      assessmentId: x.id,
                      productCode: x.productCode,
                      reference: x.reference,
                      hasOutcome,
                    });
                    const showGenerate = canGenerateAdvisoryReport({
                      status: x.status,
                      hasOutcome,
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
                          hasOutcome && isEad
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
                          <div className="leading-snug">
                            <span>{x.status}</span>
                            {reportReady ? (
                              <span className="mt-0.5 block text-xs text-moss-success">Report ready</span>
                            ) : hasOutcome && isEad ? (
                              <span className="mt-0.5 block text-xs text-moss-success">Outcome ready</span>
                            ) : hasOutcome ? (
                              <span className="mt-0.5 block text-xs text-slate-500">No report yet</span>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className="px-3 py-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {reportReady && x.latestReport ? (
                            <div className="leading-snug">
                              <span className="font-medium text-slate-900">
                                {formatAdvisoryReportVersion(x.latestReport.version)}
                              </span>
                              <Link
                                href={advisoryReportHref(x.latestReport.id)}
                                className="mt-0.5 block text-xs font-medium text-[#c41230] hover:underline"
                              >
                                View
                              </Link>
                            </div>
                          ) : hasOutcome && isEad ? (
                            <div className="leading-snug">
                              <span className="font-medium text-slate-900">Outcome</span>
                              <Link
                                href={workspaceHref}
                                className="mt-0.5 block text-xs font-medium text-[#c41230] hover:underline"
                              >
                                View
                              </Link>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{new Date(x.updatedAt).toLocaleDateString('en-ZA')}</td>
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
                              {hasOutcome && isEad
                                ? 'Open diagnostic outcome'
                                : 'Open engagement'}
                            </Link>
                            {hasOutcome && isEad ? (
                              <Link
                                href={advisoryWorkingPapersHref(x.id)}
                                onClick={() => setMenuOpenId(null)}
                              >
                                Open working papers
                              </Link>
                            ) : null}
                            {reportReady && x.latestReport ? (
                              <Link
                                href={advisoryReportHref(x.latestReport.id)}
                                onClick={() => setMenuOpenId(null)}
                              >
                                View PDF report
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
                        No advisory engagements yet.
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
