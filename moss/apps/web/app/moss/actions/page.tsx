'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Plus,
} from 'lucide-react';

import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { EmptyState } from '../../../components/common/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { apiFetch } from '../../../lib/api';
import {
  MOSS_FINDING_SEVERITIES,
  formatMossFindingSeverity,
  mossApiErrorMessage,
} from '../../../lib/moss';

type MossAssessmentOption = {
  id: string;
  reference: string;
  title?: string | null;
  organisation?: { name?: string } | null;
};

type ActionRow = {
  id: string;
  reference: string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  dueDate?: string | null;
  progressPercent?: number;
  ownerName?: string | null;
  organisation?: { id: string; name: string } | null;
  assessment?: { id: string; reference: string; title?: string | null } | null;
  finding?: { id: string; title?: string | null; controlCode?: string | null } | null;
};

type Dashboard = {
  all: ActionRow[];
  overdue: ActionRow[];
  upcoming: ActionRow[];
};

const STATUS_OPTIONS = [
  'NOT_STARTED',
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'VERIFIED',
  'CANCELLED',
] as const;

export default function MossActionsPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [assessments, setAssessments] = useState<MossAssessmentOption[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assessmentId: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    dueDate: '',
    ownerName: '',
  });
  const [editItem, setEditItem] = useState<ActionRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    status: 'PLANNED',
    progressPercent: 0,
    ownerName: '',
    dueDate: '',
    comments: '',
  });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [dash, list] = await Promise.all([
        apiFetch<Dashboard>('/moss/actions/dashboard'),
        apiFetch<MossAssessmentOption[]>('/moss/assessments'),
      ]);
      setData(dash);
      setAssessments(list || []);
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to load MOSS action plans.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const openCount = useMemo(() => {
    const closed = new Set(['COMPLETED', 'VERIFIED', 'CANCELLED']);
    return (data?.all || []).filter((i) => !closed.has(i.status)).length;
  }, [data]);

  async function createAction(e: FormEvent) {
    e.preventDefault();
    if (!form.assessmentId || form.title.trim().length < 2) {
      setError('Assessment and title are required.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/moss/assessments/${form.assessmentId}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
          ownerName: form.ownerName.trim() || undefined,
        }),
      });
      setCreateOpen(false);
      setForm({
        assessmentId: '',
        title: '',
        description: '',
        priority: 'MEDIUM',
        dueDate: '',
        ownerName: '',
      });
      setNotice('Action item created.');
      await load();
    } catch (err: unknown) {
      setError(mossApiErrorMessage(err, 'Unable to create action item.'));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: ActionRow) {
    setEditItem(item);
    setEditForm({
      status: item.status || 'PLANNED',
      progressPercent: item.progressPercent || 0,
      ownerName: item.ownerName || '',
      dueDate: item.dueDate ? item.dueDate.slice(0, 10) : '',
      comments: '',
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editItem) return;
    setEditSaving(true);
    setError('');
    try {
      await apiFetch(`/actions/${editItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editForm.status,
          progressPercent: Number(editForm.progressPercent) || 0,
          ownerName: editForm.ownerName.trim() || undefined,
          dueDate: editForm.dueDate || null,
          comments: editForm.comments.trim() || undefined,
        }),
      });
      setEditItem(null);
      setNotice('Action item updated.');
      await load();
    } catch (err: unknown) {
      setError(mossApiErrorMessage(err, 'Unable to update action item.'));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <AuthGate>
      <Shell title="MOSS Action Plans" subtitle="Remediation tracking for MOSS assessments" hideSearch>
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              Track remediation actions linked to MOSS assessments, findings, and recommendations.
              Isolated from Cost Leakage action plans.
            </p>
            <Button
              type="button"
              className="bg-[#c41230] hover:bg-[#a10f28]"
              onClick={() => {
                setError('');
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              New action
            </Button>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={ClipboardList}
              title="Total actions"
              value={data?.all?.length ?? 0}
              description="MOSS portfolio"
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={Clock}
              title="Open"
              value={openCount}
              description="Not completed / verified"
              tone="amber"
              loading={loading}
            />
            <StatCard
              icon={AlertTriangle}
              title="Overdue"
              value={data?.overdue?.length ?? 0}
              description="Past due date"
              tone="red"
              loading={loading}
            />
            <StatCard
              icon={CheckCircle2}
              title="Upcoming"
              value={data?.upcoming?.length ?? 0}
              description="Due in future"
              tone="teal"
              loading={loading}
            />
          </div>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">All MOSS action items</CardTitle>
              <CardDescription>Create and progress remediation work across assessments.</CardDescription>
            </CardHeader>
            <CardContent>
              {!loading && !(data?.all?.length) ? (
                <EmptyState
                  title="No MOSS action items yet."
                  description="Create an action from this page or from a finding on an assessment."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Title</th>
                        <th>Organisation</th>
                        <th>Assessment</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Due</th>
                        <th>Progress</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="muted">
                            Loading…
                          </td>
                        </tr>
                      ) : (
                        (data?.all || []).map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>{item.reference}</strong>
                            </td>
                            <td>
                              <div className="font-medium text-slate-900">{item.title}</div>
                              {item.finding?.controlCode ? (
                                <div className="text-xs text-slate-500">
                                  Control {item.finding.controlCode}
                                </div>
                              ) : null}
                            </td>
                            <td>{item.organisation?.name || '—'}</td>
                            <td>
                              {item.assessment ? (
                                <Link
                                  href={`/moss/assessments/${item.assessment.id}`}
                                  className="font-medium text-slate-800 hover:underline"
                                >
                                  {item.assessment.reference}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              <Badge variant="secondary" className="rounded-md">
                                {formatMossFindingSeverity(item.priority)}
                              </Badge>
                            </td>
                            <td>{item.status.replaceAll('_', ' ')}</td>
                            <td>
                              {item.dueDate
                                ? new Date(item.dueDate).toLocaleDateString('en-ZA')
                                : '—'}
                            </td>
                            <td>{item.progressPercent ?? 0}%</td>
                            <td>
                              <Button type="button" variant="outline" size="sm" onClick={() => openEdit(item)}>
                                Update
                              </Button>
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
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New MOSS action</DialogTitle>
              <DialogDescription>
                Link remediation work to a MOSS assessment. Finding link is optional from this board.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={createAction} className="grid gap-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="moss-action-assessment">Assessment *</Label>
                <select
                  id="moss-action-assessment"
                  required
                  value={form.assessmentId}
                  onChange={(e) => setForm((f) => ({ ...f, assessmentId: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                >
                  <option value="">Select assessment</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.reference} — {a.organisation?.name || a.title || 'Assessment'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-action-title">Title *</Label>
                <Input
                  id="moss-action-title"
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-action-description">Description</Label>
                <Textarea
                  id="moss-action-description"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="moss-action-priority">Priority</Label>
                  <select
                    id="moss-action-priority"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  >
                    {MOSS_FINDING_SEVERITIES.filter((s) => s.value).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moss-action-due">Due date</Label>
                  <Input
                    id="moss-action-due"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-action-owner">Owner</Label>
                <Input
                  id="moss-action-owner"
                  value={form.ownerName}
                  onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
                  placeholder="Optional owner name"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#c41230] hover:bg-[#a10f28]">
                  {saving ? 'Creating…' : 'Create action'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(editItem)} onOpenChange={(open) => !open && setEditItem(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Update action</DialogTitle>
              <DialogDescription>
                {editItem?.reference} — {editItem?.title}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={saveEdit} className="grid gap-4 py-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="moss-edit-status">Status</Label>
                  <select
                    id="moss-edit-status"
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moss-edit-progress">Progress %</Label>
                  <Input
                    id="moss-edit-progress"
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.progressPercent}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, progressPercent: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="moss-edit-owner">Owner</Label>
                  <Input
                    id="moss-edit-owner"
                    value={editForm.ownerName}
                    onChange={(e) => setEditForm((f) => ({ ...f, ownerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moss-edit-due">Due date</Label>
                  <Input
                    id="moss-edit-due"
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-edit-comments">Comments</Label>
                <Textarea
                  id="moss-edit-comments"
                  rows={3}
                  value={editForm.comments}
                  onChange={(e) => setEditForm((f) => ({ ...f, comments: e.target.value }))}
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setEditItem(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editSaving} className="bg-[#c41230] hover:bg-[#a10f28]">
                  {editSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
