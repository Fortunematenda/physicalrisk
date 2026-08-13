'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  BookOpen,
  Lightbulb,
  Plus,
  Shield,
  Sparkles,
} from 'lucide-react';

import { StatCard } from '@/components/dashboard/stat-card';
import { EmptyState } from '@/components/common/empty-state';
import { MossControlCodeSelect } from '@/components/moss/ControlCodeSelect';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { IconMoreVertical } from '@/components/NavIcons';
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
import { apiFetch } from '../../../../../lib/api';
import { mossApiErrorMessage } from '../../../../../lib/moss';

type RecommendationRow = {
  id: string;
  title: string;
  summary: string;
  source?: string | null;
  controlCode?: string | null;
  domainCode?: string | null;
  status?: string | null;
  createdAt?: string;
};

export default function MossRecommendationsPage() {
  const id = String(useParams()?.id || '');
  const [items, setItems] = useState<RecommendationRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [controlCode, setControlCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecommendationRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editRecommendation, setEditRecommendation] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    try {
      setError('');
      setLoading(true);
      const res = await apiFetch<{ items?: RecommendationRow[] }>(
        `/moss/assessments/${id}/recommendations`,
      );
      setItems(res.items || []);
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
    const manual = items.filter((r) => (r.source || 'MANUAL') === 'MANUAL').length;
    const catalogue = items.filter((r) => r.source === 'CATALOGUE_TEMPLATE').length;
    const withControl = items.filter((r) => Boolean(r.controlCode)).length;
    return {
      total: items.length,
      manual,
      catalogue,
      withControl,
    };
  }, [items]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await apiFetch(`/moss/assessments/${id}/recommendations`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          recommendation,
          controlCode: controlCode || undefined,
          source: 'MANUAL',
        }),
      });
      setTitle('');
      setRecommendation('');
      setControlCode('');
      setNotice('Recommendation added.');
      await load();
    } catch (err) {
      setError(mossApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: RecommendationRow) {
    setEditing(row);
    setEditTitle(row.title);
    setEditRecommendation(row.summary || '');
    setMenuOpenId(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const nextTitle = editTitle.trim();
    const nextRecommendation = editRecommendation.trim();
    if (!nextTitle) {
      setError('Recommendation title is required.');
      return;
    }
    if (!nextRecommendation) {
      setError('Recommendation text is required.');
      return;
    }
    setSavingEdit(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/moss/assessments/${id}/recommendations/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle, recommendation: nextRecommendation }),
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === editing.id
            ? { ...item, title: nextTitle, summary: nextRecommendation }
            : item,
        ),
      );
      setEditing(null);
      setNotice('Recommendation updated.');
    } catch (err) {
      setError(mossApiErrorMessage(err, 'Unable to update recommendation.'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteRecommendation(row: RecommendationRow) {
    const ok = window.confirm(`Delete recommendation “${row.title}”? This cannot be undone.`);
    if (!ok) return;
    setMenuOpenId(null);
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/moss/assessments/${id}/recommendations/${row.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== row.id));
      if (editing?.id === row.id) setEditing(null);
      setNotice('Recommendation deleted.');
    } catch (err) {
      setError(mossApiErrorMessage(err, 'Unable to delete recommendation.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Recommendations</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Capture manual improvement actions for this MOSS assessment. Automatic recommendation
            rules remain pending methodology configuration.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold">
          Auto rules · Pending
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
          icon={Lightbulb}
          title="Total recommendations"
          value={summary.total}
          description="Recorded for this assessment"
          tone="violet"
          loading={loading}
        />
        <StatCard
          icon={Plus}
          title="Manual"
          value={summary.manual}
          description="Assessor-authored"
          tone="blue"
          loading={loading}
        />
        <StatCard
          icon={BookOpen}
          title="Catalogue templates"
          value={summary.catalogue}
          description="From control methodology"
          tone="teal"
          loading={loading}
        />
        <StatCard
          icon={Shield}
          title="Control-linked"
          value={summary.withControl}
          description="Tied to a control code"
          tone="slate"
          loading={loading}
        />
      </div>

      <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="h-fit rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-4 text-[#c41230]" aria-hidden="true" />
              Add recommendation
            </CardTitle>
            <CardDescription>
              Manual entry only. Rule-engine generation is disabled until methodology is confirmed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="moss-rec-control">Control code (optional)</Label>
                <MossControlCodeSelect
                  id="moss-rec-control"
                  assessmentId={id}
                  value={controlCode}
                  onChange={setControlCode}
                  allowEmpty
                  emptyLabel="No control linked"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-rec-title">Title</Label>
                <Input
                  id="moss-rec-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short recommendation title"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moss-rec-body">Recommendation</Label>
                <Textarea
                  id="moss-rec-body"
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  placeholder="Describe the recommended action, owner context, and expected outcome…"
                  required
                  rows={6}
                  className="min-h-[140px] resize-y"
                />
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="w-full bg-[#c41230] hover:bg-[#a10f28] sm:w-auto"
              >
                {saving ? 'Saving…' : 'Add recommendation'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recorded recommendations</CardTitle>
            <CardDescription>
              {summary.total === 0
                ? 'No recommendations yet for this assessment.'
                : `${summary.total} recommendation${summary.total === 1 ? '' : 's'} on file.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            {!loading && items.length === 0 ? (
              <EmptyState
                title="No recommendations yet"
                description="Add a manual recommendation to guide remediation and follow-up for this MOSS assessment."
              />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {items.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition-colors hover:bg-white"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="m-0 text-base font-semibold tracking-tight text-slate-900">
                          {r.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-md font-semibold">
                            {r.source || 'MANUAL'}
                          </Badge>
                          {r.controlCode ? (
                            <Badge variant="secondary" className="rounded-md font-semibold">
                              {r.controlCode}
                            </Badge>
                          ) : null}
                          {r.domainCode ? (
                            <Badge variant="secondary" className="rounded-md font-semibold">
                              {r.domainCode}
                            </Badge>
                          ) : null}
                          {r.status ? (
                            <Badge variant="outline" className="rounded-md font-semibold text-slate-500">
                              {r.status}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        {r.createdAt ? (
                          <span className="text-xs font-medium text-slate-400">
                            {new Date(r.createdAt).toLocaleString()}
                          </span>
                        ) : null}
                        <RowActionsMenu
                          open={menuOpenId === r.id}
                          onClose={() => setMenuOpenId(null)}
                          trigger={(
                            <button
                              type="button"
                              className="org2-menu-btn"
                              aria-label="Recommendation actions"
                              disabled={busyId === r.id}
                              onClick={() =>
                                setMenuOpenId((openId) => (openId === r.id ? null : r.id))
                              }
                            >
                              <IconMoreVertical />
                            </button>
                          )}
                        >
                          <button type="button" role="menuitem" onClick={() => startEdit(r)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            disabled={busyId === r.id}
                            onClick={() => void deleteRecommendation(r)}
                          >
                            Delete
                          </button>
                        </RowActionsMenu>
                      </div>
                    </div>
                    <p className="mt-3 mb-0 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {r.summary}
                    </p>
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
            <DialogTitle>Edit recommendation</DialogTitle>
            <DialogDescription>
              Update the title and recommendation text. Source and control linkage stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="moss-edit-rec-title">Title</Label>
              <Input
                id="moss-edit-rec-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="moss-edit-rec-body">Recommendation</Label>
              <Textarea
                id="moss-edit-rec-body"
                value={editRecommendation}
                onChange={(e) => setEditRecommendation(e.target.value)}
                required
                rows={6}
                className="min-h-[140px] resize-y"
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
