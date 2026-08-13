'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  Clock,
  FileEdit,
  Plus,
  Send,
  ShieldCheck,
} from 'lucide-react';

import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { EmptyState } from '../../../components/common/empty-state';
import { RowActionsMenu } from '../../../components/RowActionsMenu';
import { IconMoreVertical } from '../../../components/NavIcons';
import { StatCard } from '@/components/dashboard/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '../../../lib/api';
import { getStoredUser, resolveMvpNavRole } from '../../../lib/auth-user';
import {
  formatAssessmentProgress,
  formatMossAssessmentStatus,
  isEditableMossStatus,
  mossApiErrorMessage,
} from '../../../lib/moss';

type Row = {
  id: string;
  reference: string;
  title: string;
  status: string;
  submittedAt?: string | null;
  progressPercent: number;
  controlsScored: number;
  controlsTotal: number;
  updatedAt: string;
  organisation: { id?: string; name: string };
  site?: { name: string; siteCode: string } | null;
  catalogueVersion?: { version: string } | null;
};

export default function MossAssessmentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';

  function load() {
    setLoading(true);
    setError('');
    apiFetch<Row[]>('/moss/assessments')
      .then(setRows)
      .catch((e: unknown) => setError(mossApiErrorMessage(e, 'Unable to load MOSS assessments.')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const organisations = useMemo(
    () => [...new Set(rows.map((r) => r.organisation?.name).filter(Boolean))].sort(),
    [rows],
  );
  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].sort(),
    [rows],
  );

  const summary = useMemo(() => {
    const total = rows.length;
    const draft = rows.filter((r) => r.status === 'DRAFT' || r.status === 'IN_PROGRESS').length;
    const submitted = rows.filter((r) => r.status === 'SUBMITTED').length;
    const reviewed = rows.filter((r) => r.status === 'REVIEWED').length;
    const approved = rows.filter((r) => r.status === 'APPROVED').length;
    const completed = rows.filter((r) =>
      ['SUBMITTED', 'REVIEWED', 'APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED', 'CLOSED'].includes(
        r.status,
      ),
    ).length;
    return { total, draft, submitted, reviewed, approved, completed };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (organisation && row.organisation?.name !== organisation) return false;
      if (!q) return true;
      const hay = [
        row.reference,
        row.title,
        row.organisation?.name,
        row.site?.name,
        row.site?.siteCode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, status, organisation]);

  function openAssessment(id: string) {
    router.push(`/moss/assessments/${id}`);
  }

  function startEdit(row: Row) {
    setEditing({ id: row.id, title: row.title });
    setEditTitle(row.title);
    setMenuOpenId(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const title = editTitle.trim();
    if (!title) {
      setError('Assessment title is required.');
      return;
    }
    setSavingEdit(true);
    setError('');
    try {
      await apiFetch(`/moss/assessments/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      setRows((prev) =>
        prev.map((item) => (item.id === editing.id ? { ...item, title } : item)),
      );
      setEditing(null);
    } catch (err: unknown) {
      setError(mossApiErrorMessage(err, 'Unable to update assessment.'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteAssessment(row: Row) {
    const label = row.reference || row.title;
    const ok = window.confirm(`Delete MOSS assessment “${label}”? This cannot be undone.`);
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(row.id);
    setError('');
    try {
      await apiFetch(`/moss/assessments/${row.id}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      if (editing?.id === row.id) setEditing(null);
    } catch (err: unknown) {
      setError(mossApiErrorMessage(err, 'Unable to delete assessment.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AuthGate>
      <Shell title="MOSS Assessments" subtitle="Master Catalogue control assessments">
        {error ? <p className="error mb-4">{error}</p> : null}

        <div className="org2-actions-row mb-4">
          <Button asChild className="ml-auto bg-[#c41230] hover:bg-[#a10f28]">
            <Link href="/moss/assessments/new">
              <Plus className="size-4" aria-hidden="true" />
              New Assessment
            </Link>
          </Button>
        </div>

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={ClipboardList}
            title="Total Assessments"
            value={summary.total}
            description="Portfolio volume"
            tone="blue"
            loading={loading}
            error={error || undefined}
            onRetry={load}
          />
          <StatCard
            icon={FileEdit}
            title="In Progress"
            value={summary.draft}
            description="Draft / active sessions"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={Send}
            title="Submitted"
            value={summary.submitted}
            description="Ready for review"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={Clock}
            title="Reviewed"
            value={summary.reviewed}
            description="Awaiting approval"
            tone="teal"
            loading={loading}
          />
          <StatCard
            icon={BadgeCheck}
            title="Approved"
            value={summary.approved}
            description="Locked assessments"
            tone="green"
            loading={loading}
          />
          <StatCard
            icon={ShieldCheck}
            title="Completed"
            value={summary.completed}
            description="Submitted or later"
            tone="slate"
            loading={loading}
          />
        </div>

        <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="field">
              <label htmlFor="moss-assess-search">Search</label>
              <input
                id="moss-assess-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, organisation, site…"
              />
            </div>
            <div className="field">
              <label htmlFor="moss-assess-status">Status</label>
              <select
                id="moss-assess-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {formatMossAssessmentStatus(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="moss-assess-org">Organisation</label>
              <select
                id="moss-assess-org"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
              >
                <option value="">All organisations</option>
                {organisations.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            {!loading && filtered.length === 0 && !error ? (
              <EmptyState
                title="No MOSS assessments yet."
                description="Use New Assessment to evaluate controls against MOSS Master Catalogue v3.0."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Organisation</th>
                      <th>Site</th>
                      <th>Assessment Title</th>
                      <th>Catalogue</th>
                      <th>Assessment Progress</th>
                      <th>Status</th>
                      <th>Last Updated</th>
                      <th className="org2-actions-cell" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="muted">
                          Loading assessments…
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer transition-colors hover:bg-slate-50"
                          onClick={() => openAssessment(row.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openAssessment(row.id);
                            }
                          }}
                          tabIndex={0}
                          role="link"
                          aria-label={`Open assessment ${row.reference}`}
                        >
                          <td>
                            <strong className="text-slate-900">{row.reference}</strong>
                          </td>
                          <td>{row.organisation?.name}</td>
                          <td>
                            {row.site ? `${row.site.siteCode} — ${row.site.name}` : '—'}
                          </td>
                          <td>{row.title}</td>
                          <td>v{row.catalogueVersion?.version || '3.0'}</td>
                          <td>
                            {formatAssessmentProgress(
                              row.controlsScored,
                              row.controlsTotal,
                              row.progressPercent,
                            )}
                          </td>
                          <td>{formatMossAssessmentStatus(row.status)}</td>
                          <td>{new Date(row.updatedAt).toLocaleString()}</td>
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
                                  aria-label="Assessment actions"
                                  onClick={() =>
                                    setMenuOpenId((id) => (id === row.id ? null : row.id))
                                  }
                                >
                                  <IconMoreVertical />
                                </button>
                              )}
                            >
                              <Link
                                href={`/moss/assessments/${row.id}`}
                                onClick={() => setMenuOpenId(null)}
                              >
                                {row.submittedAt || !isEditableMossStatus(row.status)
                                  ? 'Open assessment'
                                  : 'Continue assessment'}
                              </Link>
                              {isAdmin ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(row)}
                                    disabled={busyId === row.id}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={() => void deleteAssessment(row)}
                                    disabled={busyId === row.id}
                                  >
                                    {busyId === row.id ? 'Deleting…' : 'Delete'}
                                  </button>
                                </>
                              ) : null}
                            </RowActionsMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(editing)}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit assessment</DialogTitle>
              <DialogDescription>
                Update the assessment title. Scoring and catalogue binding are unchanged.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="moss-edit-title">Title</Label>
                <Input
                  id="moss-edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit}
                  className="bg-[#c41230] hover:bg-[#a10f28]"
                >
                  {savingEdit ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
