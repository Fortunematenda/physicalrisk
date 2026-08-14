'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, FileEdit, Plus, Shield, Trash2 } from 'lucide-react';

import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { EmptyState } from '../../../components/common/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '../../../lib/api';
import { formatSomodStatus, somodApiErrorMessage } from '../../../lib/somod';

type Row = {
  id: string;
  reference: string;
  title: string;
  status: string;
  updatedAt: string;
  organisation: { name: string };
  site?: { name: string; siteCode: string } | null;
  mossAssessment?: { reference: string } | null;
  preferredScenario?: { label: string; overallScore?: number | null } | null;
};

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'WORKING', label: 'Working (draft / in progress)' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export default function SomodAssessmentsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiFetch<Row[]>('/somod/assessments')
      .then(setRows)
      .catch((e: unknown) => setError(somodApiErrorMessage(e, 'Unable to load SOMOD assessments.')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const organisations = useMemo(
    () => [...new Set(rows.map((r) => r.organisation?.name).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (organisation && r.organisation?.name !== organisation) return false;
      if (status === 'WORKING') {
        if (r.status !== 'DRAFT' && r.status !== 'IN_PROGRESS') return false;
      } else if (status && r.status !== status) {
        return false;
      }
      if (!q) return true;
      return [r.reference, r.title, r.organisation?.name, r.site?.name, r.status, r.preferredScenario?.label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, status, organisation]);

  const draft = rows.filter((r) => r.status === 'DRAFT' || r.status === 'IN_PROGRESS').length;
  const completed = rows.filter((r) =>
    ['SUBMITTED', 'REVIEWED', 'APPROVED', 'ARCHIVED'].includes(r.status),
  ).length;

  async function deleteAssessment(row: Row, event: MouseEvent) {
    event.stopPropagation();
    const label = row.reference || row.title;
    const ok = await confirm({
      title: 'Delete assessment',
      description: `Delete SOMOD assessment “${label}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusyId(row.id);
    setError('');
    try {
      await apiFetch(`/somod/assessments/${row.id}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
    } catch (err: unknown) {
      setError(somodApiErrorMessage(err, 'Unable to delete assessment.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AuthGate>
      <Shell title="SOMOD Assessments" subtitle="Optimisation diagnostic workspace" hideSearch>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assessments…"
              className="max-w-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              aria-label="Filter by status"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              className="flex h-10 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              aria-label="Filter by organisation"
            >
              <option value="">All organisations</option>
              {organisations.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={() => router.push('/somod/assessments/new')}>
            <Plus className="size-4" aria-hidden="true" />
            New Assessment
          </Button>
        </div>

        {error ? <p className="error mb-4">{error}</p> : null}

        <div className="dash2-kpi-row mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={ClipboardList}
            title="Total"
            value={rows.length}
            description="SOMOD assessments"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={FileEdit}
            title="In progress"
            value={draft}
            description="Draft / in progress"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={Shield}
            title="Completed"
            value={completed}
            description="Submitted and beyond"
            tone="teal"
            loading={loading}
          />
        </div>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={ClipboardList}
                  title={rows.length === 0 ? 'No SOMOD assessments yet.' : 'No matching assessments.'}
                  description={
                    rows.length === 0
                      ? 'Create the first optimisation diagnostic for an organisation.'
                      : 'Try a different search or filter.'
                  }
                  action={
                    rows.length === 0 ? (
                      <Button type="button" onClick={() => router.push('/somod/assessments/new')}>
                        New Assessment
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Organisation</th>
                    <th className="px-4 py-3 font-semibold">Preferred</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Updated</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                      onClick={() => router.push(`/somod/assessments/${row.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.reference}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.title}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.organisation.name}
                        {row.site ? (
                          <span className="block text-xs text-slate-400">{row.site.name}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.preferredScenario ? (
                          <>
                            <span className="font-medium text-slate-900">
                              {row.preferredScenario.label}
                            </span>
                            {row.preferredScenario.overallScore != null ? (
                              <span className="block text-xs text-slate-400">
                                Score {row.preferredScenario.overallScore}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{formatSomodStatus(row.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-red-700 hover:bg-red-50 hover:text-red-800"
                          disabled={busyId === row.id}
                          onClick={(e) => void deleteAssessment(row, e)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          {busyId === row.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </Shell>
    </AuthGate>
  );
}
