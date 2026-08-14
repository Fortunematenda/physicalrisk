'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  FileWarning,
  Plus,
  Shield,
  Sparkles,
} from 'lucide-react';

import { StatCard } from '@/components/dashboard/stat-card';
import { useConfirm } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { MossControlCodeSelect } from '@/components/moss/ControlCodeSelect';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { IconMoreVertical } from '@/components/NavIcons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '../../../../../lib/api';
import {
  MOSS_FINDING_SEVERITIES,
  formatMossFindingSeverity,
  mossApiErrorMessage,
} from '../../../../../lib/moss';

type FindingRow = {
  id: string;
  title: string;
  description?: string | null;
  controlCode?: string | null;
  domainCode?: string | null;
  severity?: string | null;
  severityDisplay?: string | null;
  score?: number | null;
  status?: string | null;
  createdAt?: string;
};

const severitySelectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export default function MossFindingsPage() {
  const id = String(useParams()?.id || '');
  const confirm = useConfirm();
  const [items, setItems] = useState<FindingRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [controlCode, setControlCode] = useState('');
  const [severity, setSeverity] = useState('');
  const [promoteFromControl, setPromoteFromControl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FindingRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSeverity, setEditSeverity] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    try {
      setError('');
      setLoading(true);
      const res = await apiFetch<FindingRow[] | { items?: FindingRow[] }>(
        `/moss/assessments/${id}/findings`,
      );
      setItems(Array.isArray(res) ? res : res.items || []);
    } catch (e) {
      setError(mossApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  const summary = useMemo(() => {
    const withControl = items.filter((f) => Boolean(f.controlCode)).length;
    const withScore = items.filter((f) => f.score != null).length;
    const unclassified = items.filter(
      (f) => !f.severity && (!f.severityDisplay || f.severityDisplay === 'Not classified'),
    ).length;
    return {
      total: items.length,
      withControl,
      withScore,
      unclassified,
    };
  }, [items]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await apiFetch(`/moss/assessments/${id}/findings`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: promoteFromControl ? undefined : description,
          controlCode,
          promoteFindingText: promoteFromControl,
          severity: severity || null,
        }),
      });
      setTitle('');
      setDescription('');
      setSeverity('');
      setPromoteFromControl(false);
      setNotice('Finding created.');
      await load();
    } catch (err) {
      setError(mossApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: FindingRow) {
    setEditing(row);
    setEditTitle(row.title);
    setEditDescription(row.description || '');
    setEditSeverity(row.severity === 'MODERATE' ? 'MEDIUM' : row.severity || '');
    setMenuOpenId(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const nextTitle = editTitle.trim();
    const nextDescription = editDescription.trim();
    if (!nextTitle) {
      setError('Finding title is required.');
      return;
    }
    if (!nextDescription) {
      setError('Finding description is required.');
      return;
    }
    setSavingEdit(true);
    setError('');
    setNotice('');
    try {
      const updated = await apiFetch<FindingRow>(`/moss/assessments/${id}/findings/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: nextTitle,
          description: nextDescription,
          severity: editSeverity || null,
        }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                title: nextTitle,
                description: nextDescription,
                severity: updated.severity ?? (editSeverity || null),
                severityDisplay:
                  updated.severityDisplay ||
                  formatMossFindingSeverity(editSeverity || null),
              }
            : item,
        ),
      );
      setEditing(null);
      setNotice('Finding updated.');
    } catch (err) {
      setError(mossApiErrorMessage(err, 'Unable to update finding.'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteFinding(row: FindingRow) {
    const ok = await confirm({
      title: 'Delete finding',
      description: `Delete finding “${row.title}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/moss/assessments/${id}/findings/${row.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== row.id));
      if (editing?.id === row.id) setEditing(null);
      setNotice('Finding deleted.');
    } catch (err) {
      setError(mossApiErrorMessage(err, 'Unable to delete finding.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Findings</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Record structured findings for this MOSS assessment. Set severity manually for each
            finding.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold">
          Severity · Manual
        </Badge>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileWarning}
          title="Total findings"
          value={summary.total}
          description="Recorded for this assessment"
          tone="violet"
          loading={loading}
        />
        <StatCard
          icon={Shield}
          title="Control-linked"
          value={summary.withControl}
          description="Tied to a control code"
          tone="blue"
          loading={loading}
        />
        <StatCard
          icon={AlertTriangle}
          title="Unclassified"
          value={summary.unclassified}
          description="No severity set yet"
          tone="amber"
          loading={loading}
        />
        <StatCard
          icon={Plus}
          title="With score"
          value={summary.withScore}
          description="Linked maturity score"
          tone="slate"
          loading={loading}
        />
      </div>

      <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="h-fit rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-4 text-[#c41230]" aria-hidden="true" />
              Add finding
            </CardTitle>
            <CardDescription>
              Choose a control and optional severity. Leave severity blank for “Not classified”.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="moss-finding-control">Control code</Label>
                <MossControlCodeSelect
                  id="moss-finding-control"
                  assessmentId={id}
                  value={controlCode}
                  onChange={setControlCode}
                  required
                  emptyLabel="Select control code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-finding-title">Title</Label>
                <Input
                  id="moss-finding-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short finding title"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-finding-severity">Severity</Label>
                <select
                  id="moss-finding-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className={severitySelectClass}
                >
                  {MOSS_FINDING_SEVERITIES.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <label
                htmlFor="moss-finding-promote"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3"
              >
                <Checkbox
                  id="moss-finding-promote"
                  checked={promoteFromControl}
                  onCheckedChange={(checked) => setPromoteFromControl(checked === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0 text-sm leading-snug text-slate-700">
                  Use control finding text (promote from workspace notes)
                </span>
              </label>
              <div className="space-y-2">
                <Label htmlFor="moss-finding-description">Description</Label>
                <Textarea
                  id="moss-finding-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    promoteFromControl
                      ? 'Optional — leave blank to use the control finding text'
                      : 'Describe the finding'
                  }
                  required={!promoteFromControl}
                  rows={5}
                  disabled={promoteFromControl}
                  className="min-h-[120px] resize-y"
                />
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="w-full bg-[#c41230] hover:bg-[#a10f28] sm:w-auto"
              >
                {saving ? 'Saving…' : 'Add finding'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recorded findings</CardTitle>
            <CardDescription>
              {summary.total === 0
                ? 'No structured findings yet for this assessment.'
                : `${summary.total} finding${summary.total === 1 ? '' : 's'} on file.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {!loading && items.length === 0 ? (
              <EmptyState
                icon={FileWarning}
                title="No findings yet"
                description="Add a structured finding or promote control notes from the Controls workspace."
              />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {items.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:bg-white"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="m-0 text-base font-semibold tracking-tight text-slate-900">
                          {f.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {f.controlCode ? (
                            <Badge variant="secondary" className="rounded-md font-semibold">
                              {f.controlCode}
                            </Badge>
                          ) : null}
                          {f.domainCode ? (
                            <Badge variant="outline" className="rounded-md font-semibold">
                              {f.domainCode}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={
                              f.severity && f.severity !== 'INFORMATIONAL' ? 'warning' : 'outline'
                            }
                            className="rounded-md font-semibold"
                          >
                            {f.severityDisplay || formatMossFindingSeverity(f.severity)}
                          </Badge>
                          {f.score != null ? (
                            <Badge variant="outline" className="rounded-md font-semibold text-slate-500">
                              Score {f.score}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        {f.createdAt ? (
                          <span className="text-xs font-medium text-slate-400">
                            {new Date(f.createdAt).toLocaleString()}
                          </span>
                        ) : null}
                        <RowActionsMenu
                          open={menuOpenId === f.id}
                          onClose={() => setMenuOpenId(null)}
                          trigger={(
                            <button
                              type="button"
                              className="org2-menu-btn"
                              aria-label="Finding actions"
                              disabled={busyId === f.id}
                              onClick={() =>
                                setMenuOpenId((openId) => (openId === f.id ? null : f.id))
                              }
                            >
                              <IconMoreVertical />
                            </button>
                          )}
                        >
                          <button type="button" role="menuitem" onClick={() => startEdit(f)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            disabled={busyId === f.id}
                            onClick={() => void deleteFinding(f)}
                          >
                            Delete
                          </button>
                        </RowActionsMenu>
                      </div>
                    </div>
                    {f.description ? (
                      <p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {f.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit finding</DialogTitle>
            <DialogDescription>
              Update the title, description, and assessor-chosen severity. Control linkage stays
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="moss-edit-finding-title">Title</Label>
              <Input
                id="moss-edit-finding-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="moss-edit-finding-severity">Severity</Label>
              <select
                id="moss-edit-finding-severity"
                value={editSeverity}
                onChange={(e) => setEditSeverity(e.target.value)}
                className={severitySelectClass}
              >
                {MOSS_FINDING_SEVERITIES.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="moss-edit-finding-description">Description</Label>
              <Textarea
                id="moss-edit-finding-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                required
                rows={5}
                className="min-h-[120px] resize-y"
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
    </div>
  );
}
