'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';

export type AssessmentDiagnosticQuestion = {
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
  removedAt?: string | null;
};

type EditorState = {
  mode: 'add' | 'edit';
  id?: string;
  title: string;
  questionText: string;
  helpText: string;
  allowNa: boolean;
  isRequired: boolean;
};

export function ManageDiagnosticQuestionsDialog({
  open,
  onOpenChange,
  assessmentId,
  moduleCode,
  moduleName,
  questions,
  locked,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessmentId: string;
  moduleCode: string;
  moduleName: string;
  questions: AssessmentDiagnosticQuestion[];
  locked?: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const active = useMemo(
    () => questions.filter((q) => q.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [questions],
  );
  const removed = useMemo(
    () => questions.filter((q) => !q.isActive).sort((a, b) => a.displayOrder - b.displayOrder),
    [questions],
  );

  async function refresh() {
    await onChanged();
  }

  async function saveEditor() {
    if (!editor) return;
    if (!editor.title.trim() || !editor.questionText.trim()) {
      toast({ variant: 'error', title: 'Title and question are required.' });
      return;
    }
    setBusy(true);
    try {
      if (editor.mode === 'add') {
        await apiFetch(`/advisory/${assessmentId}/diagnostic-questions`, {
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
        await apiFetch(`/advisory/${assessmentId}/diagnostic-questions/${editor.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: editor.title.trim(),
            questionText: editor.questionText.trim(),
            helpText: editor.helpText.trim(),
            allowNa: editor.allowNa,
            isRequired: editor.isRequired,
          }),
        });
      }
      setEditor(null);
      await refresh();
      toast({ variant: 'success', title: editor.mode === 'add' ? 'Question added' : 'Question updated' });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Unable to save question', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const ids = active.map((q) => q.id);
    const idx = ids.indexOf(id);
    const swap = idx + direction;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    const next = [...ids];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBusy(true);
    try {
      await apiFetch(`/advisory/${assessmentId}/modules/${moduleCode}/diagnostic-questions/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedIds: next }),
      });
      await refresh();
    } catch (e: any) {
      toast({ variant: 'error', title: 'Reorder failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(q: AssessmentDiagnosticQuestion) {
    const ok = await confirm({
      title: 'Remove diagnostic question?',
      description:
        'This question will be removed from the active assessment calculation. Existing answer history will be retained for audit purposes.',
      confirmLabel: 'Remove question',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/advisory/${assessmentId}/diagnostic-questions/${q.id}/remove`, {
        method: 'POST',
      });
      await refresh();
      toast({ variant: 'success', title: 'Question removed' });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Remove failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function restoreQuestion(q: AssessmentDiagnosticQuestion) {
    setBusy(true);
    try {
      await apiFetch(`/advisory/${assessmentId}/diagnostic-questions/${q.id}/restore`, {
        method: 'POST',
      });
      await refresh();
      toast({ variant: 'success', title: 'Question restored' });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Restore failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function duplicateQuestion(q: AssessmentDiagnosticQuestion) {
    setBusy(true);
    try {
      await apiFetch(`/advisory/${assessmentId}/diagnostic-questions/${q.id}/duplicate`, {
        method: 'POST',
      });
      await refresh();
      toast({ variant: 'success', title: 'Question duplicated' });
    } catch (e: any) {
      toast({ variant: 'error', title: 'Duplicate failed', description: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage {moduleName} questions</DialogTitle>
            <DialogDescription>
              Changes apply to this assessment only. Master template questions are managed separately
              under Admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {active.map((q, index) => (
              <div
                key={q.id}
                className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex shrink-0 flex-col gap-1 pt-0.5">
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                    disabled={locked || busy || index === 0}
                    aria-label="Move up"
                    onClick={() => void move(q.id, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                    disabled={locked || busy || index === active.length - 1}
                    aria-label="Move down"
                    onClick={() => void move(q.id, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold text-slate-900">{q.title}</p>
                  <p className="m-0 mt-1 text-sm text-slate-600">{q.questionText}</p>
                  <p className="m-0 mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {q.isRequired ? 'Required' : 'Optional'}
                    {q.allowNa ? ' · N/A allowed' : ''}
                  </p>
                </div>
                {!locked ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" disabled={busy}>
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Question actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
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
                        <Pencil className="size-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void duplicateQuestion(q)}>
                        <Copy className="size-3.5" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-700"
                        onClick={() => void removeQuestion(q)}
                      >
                        <Trash2 className="size-3.5" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ))}
          </div>

          {!locked ? (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-1.5"
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
              <Plus className="size-3.5" /> Add diagnostic question
            </Button>
          ) : null}

          {removed.length ? (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                className="text-xs font-semibold text-slate-600 hover:underline"
                onClick={() => setShowRemoved((v) => !v)}
              >
                {showRemoved ? 'Hide' : 'Show'} removed questions ({removed.length})
              </button>
              {showRemoved
                ? removed.map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-medium text-slate-700">{q.title}</p>
                        <p className="m-0 truncate text-xs text-slate-500">{q.questionText}</p>
                      </div>
                      {!locked ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void restoreQuestion(q)}
                        >
                          <RotateCcw className="size-3.5" /> Restore
                        </Button>
                      ) : null}
                    </div>
                  ))
                : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editor)} onOpenChange={(v) => !v && setEditor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === 'add' ? 'Add diagnostic question' : 'Edit diagnostic question'}
            </DialogTitle>
            <DialogDescription>
              Applies to this assessment only. Uses the standard Executive Advisory Likert scale.
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Short label *</Label>
                <Input
                  value={editor.title}
                  disabled={busy}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  placeholder="e.g. Correction"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Question *</Label>
                <Textarea
                  rows={3}
                  value={editor.questionText}
                  disabled={busy}
                  onChange={(e) => setEditor({ ...editor, questionText: e.target.value })}
                  placeholder="When failures occur..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Guidance / assessor note</Label>
                <Textarea
                  rows={2}
                  value={editor.helpText}
                  disabled={busy}
                  onChange={(e) => setEditor({ ...editor, helpText: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={editor.isRequired}
                  onCheckedChange={(v) => setEditor({ ...editor, isRequired: v === true })}
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={editor.allowNa}
                  onCheckedChange={(v) => setEditor({ ...editor, allowNa: v === true })}
                />
                Allow N/A
              </label>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void saveEditor()}>
              {editor?.mode === 'add' ? 'Add question' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
