'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EXECUTIVE_ADVISORY_MODULES } from '@moss/shared';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
        description: 'Edits apply to NEW assessments only after you publish.',
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
      toast({ variant: 'success', title: `Published v${published.versionNumber}` });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Publish failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveEditor() {
    if (!editor || !active) return;
    if (active.status !== 'DRAFT') {
      toast({ variant: 'warning', title: 'Create a draft before editing the template.' });
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
      toast({ variant: 'success', title: 'Template question saved' });
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

  return (
    <AuthGate>
      <Shell title="EAD diagnostic template">
        <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
          <div>
            <h1 className="m-0 text-2xl font-semibold text-slate-900">
              Executive Advisory Diagnostic Template
            </h1>
            <p className="m-0 mt-1 text-sm text-slate-600">
              Template changes apply to <strong>new assessments only</strong>. Existing assessments
              keep the question wording they were created with.
            </p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void openDraft()}>
              Create / open draft
            </Button>
            <Button
              type="button"
              disabled={busy || active?.status !== 'DRAFT'}
              onClick={() => void publish()}
            >
              Publish draft
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void backfill()}>
              Backfill legacy assessments
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="m-0 text-sm text-slate-700">
              Active version:{' '}
              <strong>
                {active
                  ? `${active.label || `v${active.versionNumber}`} (${active.status})`
                  : '—'}
              </strong>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    active?.id === v.id
                      ? 'border-[#c41230] bg-[#fdecee] text-[#c41230]'
                      : 'border-slate-200 text-slate-600'
                  }`}
                  onClick={() => {
                    void apiFetch<TemplateVersion>(
                      `/admin/ead-diagnostic-template/versions/${v.id}`,
                    ).then(setActive);
                  }}
                >
                  v{v.versionNumber} · {v.status}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXECUTIVE_ADVISORY_MODULES.map((m) => (
              <button
                key={m.code}
                type="button"
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                  moduleCode === m.code
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                onClick={() => setModuleCode(m.code)}
              >
                {m.name}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {questions.map((q) => (
              <div
                key={q.id}
                className={`rounded-lg border p-3 ${
                  q.isActive ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50 opacity-70'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="m-0 text-sm font-semibold text-slate-900">
                      {q.title}
                      {!q.isActive ? ' (archived)' : ''}
                    </p>
                    <p className="m-0 mt-1 text-sm text-slate-600">{q.questionText}</p>
                  </div>
                  {active?.status === 'DRAFT' ? (
                    <div className="flex gap-2">
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
                          variant="outline"
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
            ))}
          </div>

          {active?.status === 'DRAFT' ? (
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
              + Add question
            </Button>
          ) : (
            <p className="m-0 text-sm text-slate-500">
              Create a draft to edit template questions for future assessments.
            </p>
          )}
        </div>

        <Dialog open={Boolean(editor)} onOpenChange={(v) => !v && setEditor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editor?.mode === 'add' ? 'Add template question' : 'Edit template question'}
              </DialogTitle>
              <DialogDescription>
                This change applies to NEW assessments only after the draft is published. Existing
                assessments retain their snapshot wording.
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
                  <Label>Guidance</Label>
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
                Save for future assessments
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
