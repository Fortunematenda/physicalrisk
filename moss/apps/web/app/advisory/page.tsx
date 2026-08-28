'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { getStoredUser, resolveMvpNavRole } from '@/lib/auth-user';

const LABELS: Record<string, string> = {
  EXECUTIVE_ADVISORY_DIAGNOSTIC: 'Executive Advisory Diagnostic',
  CONTRACT_SLA_ASSURANCE: 'Contract & SLA Assurance Review',
  VENDOR_PERFORMANCE_ASSURANCE: 'Vendor Performance Assurance Review',
  GOVERNANCE_EXECUTIVE_ASSURANCE: 'Security Governance & Executive Assurance Review',
  CYBER_PHYSICAL_DEPENDENCY: 'Cyber-Physical Dependency Review',
  SHIELD360: 'Shield 360',
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
  _count?: { evidence?: number; reports?: number };
};

export default function AdvisoryPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<AdvisoryRow[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';

  const load = () =>
    apiFetch<AdvisoryRow[]>('/advisory')
      .then(setItems)
      .catch((e: Error) => setError(e.message));

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
      setError('Engagement title must be at least 2 characters.');
      return;
    }
    setSavingEdit(true);
    setError('');
    try {
      await apiFetch(`/advisory/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setItems((prev) => prev.map((item) => (item.id === editing.id ? { ...item, title } : item)));
      setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update engagement.');
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
    setError('');
    try {
      await apiFetch(`/advisory/${row.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== row.id));
      if (editing?.id === row.id) setEditing(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete engagement.');
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
              Level 2 Executive Advisory Diagnostic → Level 3 focused assurance → sustainable remediation.
            </p>
          </div>
          <Button asChild>
            <Link href="/advisory/new">+ New engagement</Link>
          </Button>
        </div>
        {error ? <p className="error">{error}</p> : null}

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
                    <th className="px-3 py-2">Evidence</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const a = x.assignments?.find(
                      (row) => row.role === 'PRIMARY_ANALYST' && row.status !== 'CANCELLED',
                    );
                    const hasOutcome = Boolean(x.diagnosticOutcome?.confirmedAt) || OUTCOME_STATUSES.has(x.status);
                    const reportCount = x._count?.reports || 0;
                    return (
                      <tr key={x.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <Link href={`/advisory/${x.id}`}>
                            <strong>{x.reference}</strong>
                          </Link>
                        </td>
                        <td className="px-3 py-2">{x.organisation?.name}</td>
                        <td className="px-3 py-2">{LABELS[x.productCode] || x.productCode}</td>
                        <td className="px-3 py-2">
                          {a ? `${a.user.firstName} ${a.user.lastName}` : 'Unassigned'}
                        </td>
                        <td className="px-3 py-2">{x.status}</td>
                        <td className="px-3 py-2">{x._count?.evidence || 0}</td>
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
                            <Link href={`/advisory/${x.id}`} onClick={() => setMenuOpenId(null)}>
                              Open engagement
                            </Link>
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
                            {hasOutcome ? (
                              <Link href={`/advisory/${x.id}/outcome`} onClick={() => setMenuOpenId(null)}>
                                View outcome
                              </Link>
                            ) : null}
                            {reportCount > 0 ? (
                              <Link href="/reports#executive-advisory-reports" onClick={() => setMenuOpenId(null)}>
                                View reports
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
