'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';

import { EmptyState } from '../../../../../components/common/empty-state';
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
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '../../../../../lib/api';
import {
  MOSS_FINDING_SEVERITIES,
  formatMossFindingSeverity,
  mossApiErrorMessage,
} from '../../../../../lib/moss';

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
  finding?: { id: string; title?: string | null; controlCode?: string | null } | null;
};

type FindingOption = {
  id: string;
  title: string;
  controlCode?: string | null;
};

export default function MossAssessmentActionsPage() {
  const assessmentId = String(useParams()?.id || '');
  const [items, setItems] = useState<ActionRow[]>([]);
  const [findings, setFindings] = useState<FindingOption[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    dueDate: '',
    ownerName: '',
    findingId: '',
  });

  async function load() {
    if (!assessmentId) return;
    setLoading(true);
    setError('');
    try {
      const [actions, findingRows] = await Promise.all([
        apiFetch<ActionRow[]>(`/moss/assessments/${assessmentId}/actions`),
        apiFetch<FindingOption[] | { items?: FindingOption[] }>(
          `/moss/assessments/${assessmentId}/findings`,
        ),
      ]);
      setItems(actions || []);
      setFindings(Array.isArray(findingRows) ? findingRows : findingRows.items || []);
    } catch (e: unknown) {
      setError(mossApiErrorMessage(e, 'Unable to load actions.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [assessmentId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (form.title.trim().length < 2) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/moss/assessments/${assessmentId}/actions`, {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
          ownerName: form.ownerName.trim() || undefined,
          findingId: form.findingId || undefined,
        }),
      });
      setOpen(false);
      setForm({
        title: '',
        description: '',
        priority: 'MEDIUM',
        dueDate: '',
        ownerName: '',
        findingId: '',
      });
      setNotice('Action item created.');
      await load();
    } catch (err: unknown) {
      setError(mossApiErrorMessage(err, 'Unable to create action.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-lg">Action plans</CardTitle>
            <CardDescription>
              Remediation items for this MOSS assessment. Optional link to a finding.
            </CardDescription>
          </div>
          <Button
            type="button"
            className="bg-[#c41230] hover:bg-[#a10f28]"
            onClick={() => {
              setError('');
              setOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            New action
          </Button>
        </CardHeader>
        <CardContent>
          {!loading && items.length === 0 ? (
            <EmptyState
              title="No actions yet."
              description="Create an action to track remediation against this assessment."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Finding</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        Loading…
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.reference}</strong>
                        </td>
                        <td>{item.title}</td>
                        <td>
                          {item.finding
                            ? `${item.finding.controlCode || 'Finding'} — ${item.finding.title || ''}`
                            : '—'}
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New action</DialogTitle>
            <DialogDescription>Create a remediation item for this assessment.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="grid gap-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="assess-action-title">Title *</Label>
              <Input
                id="assess-action-title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assess-action-finding">Finding (optional)</Label>
              <select
                id="assess-action-finding"
                value={form.findingId}
                onChange={(e) => setForm((f) => ({ ...f, findingId: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              >
                <option value="">None</option>
                {findings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {(f.controlCode ? `${f.controlCode} — ` : '') + f.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assess-action-description">Description</Label>
              <Textarea
                id="assess-action-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assess-action-priority">Priority</Label>
                <select
                  id="assess-action-priority"
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
                <Label htmlFor="assess-action-due">Due date</Label>
                <Input
                  id="assess-action-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assess-action-owner">Owner</Label>
              <Input
                id="assess-action-owner"
                value={form.ownerName}
                onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-[#c41230] hover:bg-[#a10f28]">
                {saving ? 'Creating…' : 'Create action'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
