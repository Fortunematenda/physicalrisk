'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EXECUTIVE_ADVISORY_MODULES } from '@moss/shared';
import { FileText, Plus, Send } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { AdvisoryBreadcrumb } from '@/components/advisory/AdvisoryBreadcrumb';
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
  if (s === 'PUBLISHED') return <Badge variant="success">Published</Badge>;
  if (s === 'DRAFT') return <Badge variant="secondary">Draft</Badge>;
  if (s === 'ARCHIVED') return <Badge variant="outline">Archived</Badge>;
  return <Badge variant="outline">{status || '—'}</Badge>;
}

export default function EadDiagnosticTemplateAdminPage() {
  const { toast } = useToast();
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

  const load = useCallback(async () => {
    const rows = await apiFetch<TemplateVersion[]>('/admin/ead-diagnostic-template/versions');
    setVersions(rows);
    const published = rows.find((v) => v.status === 'PUBLISHED') || rows[0];
    if (published) {
      const full = await apiFetch<TemplateVersion>(
        `/admin/ead-diagnostic-template/versions/${published.id}`,
      );
      setActive(full);
    }
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  const questions = useMemo(
    () =>
      (active?.questions || [])
        .filter((q) => q.moduleCode === moduleCode)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [active, moduleCode],
  );

  const activeModule = EXECUTIVE_ADVISORY_MODULES.find((m) => m.code === moduleCode);

  async function openDraft() {
    setBusy(true);
    try {
      const draft = await apiFetch<TemplateVersion>('/admin/ead-diagnostic-template/draft', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const full = await apiFetch<TemplateVersion>(
        `/admin/ead-diagnostic-template/versions/${draft.id}`,
      );
      setActive(full);
      await load();
      toast({
        variant: 'success',
        title: 'Draft ready',
        description: 'Edit freely, then publish when the wording is ready for new diagnostics.',
      });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Unable to create draft', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!active) return;
    setBusy(true);
    try {
      const published = await apiFetch<TemplateVersion>(
        `/admin/ead-diagnostic-template/versions/${active.id}/publish`,
        { method: 'POST', body: JSON.stringify({ changeNote: active.changeNote || undefined }) },
      );
      setActive(published);
      await load();
      toast({
        variant: 'success',
        title: `Published v${published.versionNumber}`,
        description: 'New Executive Advisory Diagnostics will use this questionnaire.',
      });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Publish failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!editor || !active) return;
    if (active.status !== 'DRAFT') {
      toast({ variant: 'warning', title: 'Create a draft before editing the questionnaire.' });
      return;
    }
    setBusy(true);
    try {
      if (editor.mode === 'add') {
        await apiFetch(`/admin/ead-diagnostic-template/versions/${active.id}/questions`, {
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
          `/admin/ead-diagnostic-template/versions/${active.id}/questions/${editor.id}`,
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
      const full = await apiFetch<TemplateVersion>(
        `/admin/ead-diagnostic-template/versions/${active.id}`,
      );
      setActive(full);
      toast({ variant: 'success', title: 'Question saved' });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Save failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function archiveQuestion(id: string) {
    if (!active || active.status !== 'DRAFT') return;
    setBusy(true);
    try {
      await apiFetch(
        `/admin/ead-diagnostic-template/versions/${active.id}/questions/${id}/archive`,
        { method: 'POST' },
      );
      const full = await apiFetch<TemplateVersion>(
        `/admin/ead-diagnostic-template/versions/${active.id}`,
      );
      setActive(full);
    } catch (e: any) {
      toast({ variant: 'error', title: 'Archive failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function backfill() {
    setBusy(true);
    try {
      const res = await apiFetch<{ assessmentsBackfilled: number }>(
        '/admin/ead-diagnostic-template/backfill',
        { method: 'POST' },
      );
      toast({
        variant: 'success',
        title: 'Legacy backfill complete',
        description: `${res.assessmentsBackfilled} assessment(s) snapshotted.`,
      });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Backfill failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  const isDraft = active?.status === 'DRAFT';

  return (
    <AuthGate>
      <Shell
        title="Diagnostic questionnaire"
        hideSearch
        hideTitle
        headerLeading={<AdvisoryBreadcrumb current="Diagnostic questionnaire" />}
      >
        <div className="mx-auto max-w-5xl space-y-5 pb-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h1 className="m-0 text-xl font-semibold text-slate-900 sm:text-2xl">
                Diagnostic questionnaire
              </h1>
              <p className="m-0 max-w-2xl text-sm text-slate-600">
                Edit the Level 2 Executive Advisory Diagnostic questions admins and consultants run
                in engagements. Publish when ready — only <strong>new</strong> diagnostics pick up
                the change; existing ones keep their snapshotted wording.
              </p>
            </div>
            <Button asChild variant="outline" className="h-10 shrink-0">
              <Link href="/advisory">View engagements</Link>
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-5 sm:p-6">
              <div className="space-y-1">
                <CardTitle className="text-base">Version</CardTitle>
                <CardDescription>
                  {active
                    ? `${active.label || `Version ${active.versionNumber}`} · ${active._count?.questions ?? questions.length} questions in this module view`
                    : 'No template loaded yet'}
                </CardDescription>
              </div>
              {active ? statusBadge(active.status) : null}
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={() => void openDraft()}>
                  {isDraft ? 'Refresh draft' : 'Create / open draft'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !isDraft}
                  onClick={() => void publish()}
                >
                  <Send className="size-4" />
                  Publish for new diagnostics
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => void backfill()}>
                  Backfill legacy assessments
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
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
                      void apiFetch<TemplateVersion>(
                        `/admin/ead-diagnostic-template/versions/${v.id}`,
                      ).then(setActive);
                    }}
                  >
                    v{v.versionNumber} · {v.status}
                    {v._count?.assessments ? ` · ${v._count.assessments} used` : ''}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="p-5 sm:p-6">
              <CardTitle className="text-base">Modules</CardTitle>
              <CardDescription>
                Switch module to edit its diagnostic questions
                {activeModule ? ` — currently ${activeModule.name}` : ''}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="flex flex-wrap gap-2">
                {EXECUTIVE_ADVISORY_MODULES.map((m) => (
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
                  </button>
                ))}
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
                        <div className="min-w-0 space-y-1">
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
                        {isDraft ? (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                setEditor({
                                  mode: 'edit',
                                  id: q.id,
                                  title: q.title,
                                  questionText: q.questionText,
                                  helpText: q.helpText || '',
                                  allowNa: q.allowNa,
                                  isRequired: q.isRequired,
                                })
                              }
                            >
                              Edit
                            </Button>
                            {q.isActive ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void archiveQuestion(q.id)}
                              >
                                Archive
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                    <FileText className="mx-auto size-8 text-slate-300" aria-hidden="true" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No questions in this module</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {isDraft
                        ? 'Add a question to build out this module for future diagnostics.'
                        : 'Open a draft to add or edit questions.'}
                    </p>
                  </div>
                )}
              </div>

              {isDraft ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    setEditor({
                      mode: 'add',
                      title: '',
                      questionText: '',
                      helpText: '',
                      allowNa: false,
                      isRequired: true,
                    })
                  }
                >
                  <Plus className="size-4" />
                  Add question
                </Button>
              ) : (
                <p className="m-0 text-sm text-slate-500">
                  Create or open a draft above to edit questions for future assessments.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={Boolean(editor)} onOpenChange={(v) => !v && setEditor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editor?.mode === 'add' ? 'Add question' : 'Edit question'}
              </DialogTitle>
              <DialogDescription>
                Saved into the draft. Publish when you want new diagnostics to use this wording.
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
              <Button type="button" disabled={busy} onClick={() => void saveEditor()}>
                Save question
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
