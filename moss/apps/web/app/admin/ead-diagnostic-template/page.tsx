'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EXECUTIVE_ADVISORY_MODULES } from '@moss/shared';
import { FileText, Pencil, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { AdvisoryBreadcrumb } from '@/components/advisory/AdvisoryBreadcrumb';
import { useConfirm } from '@/components/confirm-dialog';
import { Shell } from '@/components/Shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type TemplateVersion = {
  id: string;
  versionNumber: number;
  status: string;
  label?: string | null;
  changeNote?: string | null;
  questions?: TemplateQuestion[];
  _count?: { questions: number; assessments: number };
};

type TemplateQuestion = {
  id: string;
  moduleCode: string;
  questionCode: string;
  title: string;
  questionText: string;
  helpText?: string | null;
  displayOrder: number;
  allowNa: boolean;
  isRequired: boolean;
  isActive: boolean;
};

function statusBadge(status?: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'PUBLISHED') return <Badge variant="success">Published · live for new diagnostics</Badge>;
  if (s === 'DRAFT') return <Badge variant="warning">Draft · editable</Badge>;
  if (s === 'ARCHIVED') return <Badge variant="outline">Archived</Badge>;
  return <Badge variant="outline">{status || '—'}</Badge>;
}

function pickPreferredVersion(rows: TemplateVersion[], preferId?: string | null) {
  if (preferId) {
    const match = rows.find((v) => v.id === preferId);
    if (match) return match;
  }
  return rows.find((v) => v.status === 'DRAFT') || rows.find((v) => v.status === 'PUBLISHED') || rows[0] || null;
}

export default function EadDiagnosticTemplateAdminPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [active, setActive] = useState<TemplateVersion | null>(null);
  const [moduleCode, setModuleCode] = useState(String(EXECUTIVE_ADVISORY_MODULES[0]?.code || 'CONSEQUENCE'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<{
    mode: 'add' | 'edit';
    id?: string;
    title: string;
    questionText: string;
    helpText: string;
    allowNa: boolean;
    isRequired: boolean;
  } | null>(null);

  const loadVersion = useCallback(async (versionId: string) => {
    const full = await apiFetch<TemplateVersion>(
      `/admin/ead-diagnostic-template/versions/${versionId}`,
    );
    setActive(full);
    return full;
  }, []);

  const load = useCallback(
    async (preferVersionId?: string | null) => {
      const rows = await apiFetch<TemplateVersion[]>('/admin/ead-diagnostic-template/versions');
      setVersions(rows);
      const preferred = pickPreferredVersion(rows, preferVersionId);
      if (preferred) {
        await loadVersion(preferred.id);
      } else {
        // First visit — seed published template then open a draft for editing.
        await apiFetch('/admin/ead-diagnostic-template/published');
        const draft = await apiFetch<TemplateVersion>('/admin/ead-diagnostic-template/draft', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        const refreshed = await apiFetch<TemplateVersion[]>('/admin/ead-diagnostic-template/versions');
        setVersions(refreshed);
        await loadVersion(draft.id);
      }
    },
    [loadVersion],
  );

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, [load]);

  const questions = useMemo(
    () =>
      (active?.questions || [])
        .filter((q) => q.moduleCode === moduleCode)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [active, moduleCode],
  );

  const activeModule = EXECUTIVE_ADVISORY_MODULES.find((m) => m.code === moduleCode);
  const isDraft = active?.status === 'DRAFT';
  const isPublished = active?.status === 'PUBLISHED';

  async function ensureDraft(): Promise<TemplateVersion | null> {
    if (active?.status === 'DRAFT') return active;
    setBusy(true);
    try {
      const draft = await apiFetch<TemplateVersion>('/admin/ead-diagnostic-template/draft', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const full = await loadVersion(draft.id);
      const rows = await apiFetch<TemplateVersion[]>('/admin/ead-diagnostic-template/versions');
      setVersions(rows);
      toast({
        variant: 'success',
        title: 'Editing unlocked',
        description: 'You are now on a draft. Changes apply to new diagnostics only after you publish.',
      });
      return full;
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Unable to start editing',
        description: e instanceof Error ? e.message : 'Draft could not be created.',
      });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startEditQuestion(q: TemplateQuestion) {
    const draft = await ensureDraft();
    if (!draft) return;
    const draftQuestion =
      (draft.questions || []).find(
        (row) => row.moduleCode === q.moduleCode && row.questionCode === q.questionCode,
      ) ||
      (draft.questions || []).find(
        (row) => row.moduleCode === q.moduleCode && row.title === q.title,
      ) ||
      q;
    setEditor({
      mode: 'edit',
      id: draftQuestion.id,
      title: draftQuestion.title,
      questionText: draftQuestion.questionText,
      helpText: draftQuestion.helpText || '',
      allowNa: draftQuestion.allowNa,
      isRequired: draftQuestion.isRequired,
    });
  }

  async function startAddQuestion() {
    const draft = await ensureDraft();
    if (!draft) return;
    setEditor({
      mode: 'add',
      title: '',
      questionText: '',
      helpText: '',
      allowNa: false,
      isRequired: true,
    });
  }

  async function publish() {
    const draft = isDraft ? active : await ensureDraft();
    if (!draft || draft.status !== 'DRAFT') return;
    setBusy(true);
    try {
      const published = await apiFetch<TemplateVersion>(
        `/admin/ead-diagnostic-template/versions/${draft.id}/publish`,
        { method: 'POST', body: JSON.stringify({ changeNote: draft.changeNote || undefined }) },
      );
      await load(published.id);
      toast({
        variant: 'success',
        title: `Published v${published.versionNumber}`,
        description: 'New Executive Advisory Diagnostics will use this questionnaire.',
      });
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Publish failed',
        description: e instanceof Error ? e.message : 'Could not publish.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!editor) return;
    const draft = await ensureDraft();
    if (!draft) return;
    setBusy(true);
    try {
      if (editor.mode === 'add') {
        await apiFetch(`/admin/ead-diagnostic-template/versions/${draft.id}/questions`, {
          method: 'POST',
          body: JSON.stringify({
            moduleCode,
            title: editor.title.trim(),
            questionText: editor.questionText.trim(),
            helpText: editor.helpText.trim() || undefined,
            allowNa: editor.allowNa,
            isRequired: editor.isRequired,
          }),
        });
      } else if (editor.id) {
        await apiFetch(
          `/admin/ead-diagnostic-template/versions/${draft.id}/questions/${editor.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: editor.title.trim(),
              questionText: editor.questionText.trim(),
              helpText: editor.helpText.trim(),
              allowNa: editor.allowNa,
              isRequired: editor.isRequired,
            }),
          },
        );
      }
      setEditor(null);
      await loadVersion(draft.id);
      const rows = await apiFetch<TemplateVersion[]>('/admin/ead-diagnostic-template/versions');
      setVersions(rows);
      toast({ variant: 'success', title: 'Question saved' });
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Could not save question.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function archiveQuestion(q: TemplateQuestion) {
    const draft = await ensureDraft();
    if (!draft) return;
    setBusy(true);
    try {
      let questionId = q.id;
      const match = (draft.questions || []).find(
        (row) =>
          row.moduleCode === q.moduleCode &&
          (row.questionCode === q.questionCode || row.id === q.id),
      );
      if (match) questionId = match.id;
      await apiFetch(
        `/admin/ead-diagnostic-template/versions/${draft.id}/questions/${questionId}/archive`,
        { method: 'POST' },
      );
      await loadVersion(draft.id);
      toast({ variant: 'success', title: 'Question archived' });
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Archive failed',
        description: e instanceof Error ? e.message : 'Could not archive.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function restoreQuestion(q: TemplateQuestion) {
    const draft = await ensureDraft();
    if (!draft) return;
    setBusy(true);
    try {
      let questionId = q.id;
      const match = (draft.questions || []).find(
        (row) =>
          row.moduleCode === q.moduleCode &&
          (row.questionCode === q.questionCode || row.id === q.id),
      );
      if (match) questionId = match.id;
      await apiFetch(
        `/admin/ead-diagnostic-template/versions/${draft.id}/questions/${questionId}/restore`,
        { method: 'POST' },
      );
      await loadVersion(draft.id);
      toast({ variant: 'success', title: 'Question restored' });
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Restore failed',
        description: e instanceof Error ? e.message : 'Could not restore.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuestion(q: TemplateQuestion) {
    const ok = await confirm({
      title: 'Delete question',
      description: `Permanently delete “${q.title}”? This cannot be undone. Prefer Archive if you may want it back later.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    const draft = await ensureDraft();
    if (!draft) return;
    setBusy(true);
    try {
      let questionId = q.id;
      const match = (draft.questions || []).find(
        (row) =>
          row.moduleCode === q.moduleCode &&
          (row.questionCode === q.questionCode || row.id === q.id),
      );
      if (match) questionId = match.id;
      await apiFetch(
        `/admin/ead-diagnostic-template/versions/${draft.id}/questions/${questionId}/delete`,
        { method: 'POST' },
      );
      await loadVersion(draft.id);
      toast({ variant: 'success', title: 'Question deleted' });
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Could not delete.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <Shell
        title="Diagnostic questionnaire"
        hideSearch
        hideTitle
        headerLeading={<AdvisoryBreadcrumb current="Diagnostic questionnaire" />}
      >
        <div className="w-full space-y-5 pb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 className="m-0 text-xl font-semibold text-slate-900 sm:text-2xl">
                Diagnostic questionnaire
              </h1>
              <p className="m-0 max-w-3xl text-sm text-slate-600">
                Edit the questions consultants answer on Executive Advisory Diagnostics. Use{' '}
                <strong>Edit</strong> or <strong>Add question</strong> anytime — a draft is created
                automatically. <strong>Publish</strong> when new diagnostics should use your wording.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-10 shrink-0">
                <Link href="/advisory">View engagements</Link>
              </Button>
              <Button
                type="button"
                className="h-10 shrink-0"
                disabled={busy || (!isDraft && !isPublished)}
                onClick={() => void publish()}
              >
                <Send className="size-4" />
                Publish
              </Button>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load questionnaire</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-5 sm:p-6">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  {active
                    ? active.label || `Version ${active.versionNumber}`
                    : 'Loading questionnaire…'}
                </CardTitle>
                <CardDescription>
                  {isDraft
                    ? 'You can edit questions below. Publish when ready for new diagnostics.'
                    : isPublished
                      ? 'This version is live. Click Edit on any question to start a draft automatically.'
                      : 'Select or create a version to manage questions.'}
                </CardDescription>
              </div>
              {active ? statusBadge(active.status) : null}
            </CardHeader>
            {versions.length > 1 ? (
              <CardContent className="flex flex-wrap gap-2 border-t border-slate-100 p-5 pt-4 sm:px-6">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                      active?.id === v.id
                        ? 'border-[#c41230] bg-[#fdecee] text-[#c41230]'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                    onClick={() => {
                      void loadVersion(v.id).catch((e: Error) =>
                        toast({ variant: 'error', title: 'Unable to open version', description: e.message }),
                      );
                    }}
                  >
                    v{v.versionNumber} · {v.status}
                    {v._count?.assessments ? ` · ${v._count.assessments} used` : ''}
                  </button>
                ))}
              </CardContent>
            ) : null}
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-5 sm:p-6">
              <div className="space-y-1">
                <CardTitle className="text-base">Questions by module</CardTitle>
                <CardDescription>
                  {activeModule
                    ? `Editing ${activeModule.name} (${questions.length} question${questions.length === 1 ? '' : 's'})`
                    : 'Select a module'}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0"
                disabled={busy || !active}
                onClick={() => void startAddQuestion()}
              >
                <Plus className="size-4" />
                Add question
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="flex flex-wrap gap-2">
                {EXECUTIVE_ADVISORY_MODULES.map((m) => {
                  const count = (active?.questions || []).filter(
                    (q) => q.moduleCode === m.code && q.isActive,
                  ).length;
                  return (
                    <button
                      key={m.code}
                      type="button"
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                        moduleCode === m.code
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                      )}
                      onClick={() => setModuleCode(m.code)}
                    >
                      {m.name}
                      <span className={cn('ml-1.5 text-xs', moduleCode === m.code ? 'text-white/70' : 'text-slate-400')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {questions.length ? (
                  questions.map((q) => (
                    <div
                      key={q.id}
                      className={cn(
                        'rounded-lg border p-4',
                        q.isActive
                          ? 'border-slate-200 bg-white'
                          : 'border-dashed border-slate-200 bg-slate-50/80 opacity-70',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="m-0 text-sm font-semibold text-slate-900">{q.title}</p>
                            {!q.isActive ? (
                              <Badge variant="outline">Archived</Badge>
                            ) : q.isRequired ? (
                              <Badge variant="secondary">Required</Badge>
                            ) : null}
                            {q.allowNa ? <Badge variant="outline">N/A allowed</Badge> : null}
                          </div>
                          <p className="m-0 text-sm leading-relaxed text-slate-600">{q.questionText}</p>
                          {q.helpText ? (
                            <p className="m-0 text-xs text-slate-500">{q.helpText}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void startEditQuestion(q)}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          {q.isActive ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => void archiveQuestion(q)}
                            >
                              Archive
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void restoreQuestion(q)}
                            >
                              <RotateCcw className="size-3.5" />
                              Restore
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={busy}
                            onClick={() => void deleteQuestion(q)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
                    <FileText className="mx-auto size-8 text-slate-300" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No questions in this module</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Add a question to include this module in future diagnostics.
                    </p>
                    <Button
                      type="button"
                      className="mt-4"
                      disabled={busy || !active}
                      onClick={() => void startAddQuestion()}
                    >
                      <Plus className="size-4" />
                      Add question
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={Boolean(editor)} onOpenChange={(v) => !v && setEditor(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editor?.mode === 'add' ? 'Add question' : 'Edit question'}
              </DialogTitle>
              <DialogDescription>
                Saved to the draft. Publish from the top of the page when new diagnostics should use
                this wording.
              </DialogDescription>
            </DialogHeader>
            {editor ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Short label *</Label>
                  <Input
                    value={editor.title}
                    onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Question *</Label>
                  <Textarea
                    rows={3}
                    value={editor.questionText}
                    onChange={(e) => setEditor({ ...editor, questionText: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Guidance for consultants</Label>
                  <Textarea
                    rows={2}
                    value={editor.helpText}
                    onChange={(e) => setEditor({ ...editor, helpText: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editor.isRequired}
                    onCheckedChange={(v) => setEditor({ ...editor, isRequired: v === true })}
                  />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editor.allowNa}
                    onCheckedChange={(v) => setEditor({ ...editor, allowNa: v === true })}
                  />
                  Allow N/A
                </label>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditor(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || !editor?.title.trim() || !editor?.questionText.trim()}
                onClick={() => void saveEditor()}
              >
                Save question
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
