'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus } from 'lucide-react';
import { useConfirm } from '@/components/confirm-dialog';
import { IconMoreVertical } from '@/components/NavIcons';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';

export type TriageNoteCategory =
  | 'GENERAL'
  | 'CALL_OUTCOME'
  | 'FOLLOW_UP'
  | 'COMMERCIAL'
  | 'CONSULTANT_OBSERVATION'
  | 'CLIENT_REQUEST'
  | 'INTERNAL_DECISION';

export type TriageNoteItem = {
  id: string;
  body: string;
  category: TriageNoteCategory;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    systemRole: string;
  } | null;
};

const NOTE_CATEGORIES: Array<{ value: TriageNoteCategory; label: string }> = [
  { value: 'GENERAL', label: 'General' },
  { value: 'CALL_OUTCOME', label: 'Call outcome' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'COMMERCIAL', label: 'Commercial' },
  { value: 'CONSULTANT_OBSERVATION', label: 'Consultant observation' },
  { value: 'CLIENT_REQUEST', label: 'Client request' },
  { value: 'INTERNAL_DECISION', label: 'Internal decision' },
];

const CATEGORY_LABEL: Record<TriageNoteCategory, string> = Object.fromEntries(
  NOTE_CATEGORIES.map((c) => [c.value, c.label.toUpperCase()]),
) as Record<TriageNoteCategory, string>;

function categoryBadgeVariant(
  category: TriageNoteCategory,
): 'success' | 'warning' | 'info' | 'secondary' {
  if (category === 'CALL_OUTCOME') return 'info';
  if (category === 'COMMERCIAL' || category === 'CLIENT_REQUEST') return 'warning';
  if (category === 'INTERNAL_DECISION') return 'success';
  return 'secondary';
}

function fmtNoteTime(value: string) {
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function authorLabel(author: TriageNoteItem['author']) {
  if (!author) return 'Physical Risk Staff';
  const name = [author.firstName, author.lastName].filter(Boolean).join(' ').trim();
  return name || author.email || 'Staff';
}

function authorInitials(author: TriageNoteItem['author']) {
  if (!author) return 'PR';
  const a = (author.firstName || author.email || '?').charAt(0).toUpperCase();
  const b = (author.lastName || '').charAt(0).toUpperCase();
  return `${a}${b}`.slice(0, 2);
}

function roleLabel(role?: string | null) {
  if (!role) return '';
  return role.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function NoteBody({ body }: { body: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = body.length > 320;
  const shown = long && !expanded ? `${body.slice(0, 320).trim()}…` : body;

  return (
    <div className="space-y-2">
      <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{shown}</p>
      {long ? (
        <button
          type="button"
          className="text-xs font-medium text-moss-info hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

type Props = {
  submissionId: string;
  initialNotes?: TriageNoteItem[];
  onNotesChange?: (notes: TriageNoteItem[]) => void;
};

export function TriageNotesPanel({ submissionId, initialNotes = [], onNotesChange }: Props) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [notes, setNotes] = useState<TriageNoteItem[]>(initialNotes);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [draftCategory, setDraftCategory] = useState<TriageNoteCategory>('GENERAL');
  const [busy, setBusy] = useState(false);
  const [addedFlash, setAddedFlash] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState<TriageNoteCategory>('GENERAL');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const categoryOptions = useMemo(
    () => NOTE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
    [],
  );

  const updateNotes = useCallback(
    (next: TriageNoteItem[]) => {
      setNotes(next);
      onNotesChange?.(next);
    },
    [onNotesChange],
  );

  function resetComposer() {
    setComposerOpen(false);
    setDraftBody('');
    setDraftCategory('GENERAL');
  }

  async function addNote() {
    const body = draftBody.trim();
    if (!body) return;
    setBusy(true);
    try {
      const created = await apiFetch<TriageNoteItem>(`/triage/submissions/${submissionId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body, category: draftCategory }),
      });
      updateNotes([created, ...notes]);
      resetComposer();
      setAddedFlash(true);
      toast({
        id: `triage-note-added-${created.id}`,
        variant: 'success',
        title: 'Note added',
        description: 'Internal note recorded on this triage submission.',
      });
      window.setTimeout(() => setAddedFlash(false), 2000);
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Unable to add note',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(noteId: string) {
    const body = editBody.trim();
    if (!body) return;
    setBusy(true);
    try {
      const updated = await apiFetch<TriageNoteItem>(
        `/triage/submissions/${submissionId}/notes/${noteId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ body, category: editCategory }),
        },
      );
      updateNotes(notes.map((n) => (n.id === noteId ? updated : n)));
      setEditingId(null);
      toast({
        variant: 'success',
        title: 'Note updated',
        description: 'Changes have been saved.',
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Unable to update note',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeNote(note: TriageNoteItem) {
    const ok = await confirm({
      title: 'Delete note',
      description: 'This internal note will be removed from the timeline. The action is recorded in audit history.',
      confirmLabel: 'Delete note',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/notes/${note.id}`, { method: 'DELETE' });
      updateNotes(notes.filter((n) => n.id !== note.id));
      toast({
        variant: 'success',
        title: 'Note deleted',
        description: 'The note was removed from this submission.',
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Unable to delete note',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Internal notes</CardTitle>
            <CardDescription>Private to Physical Risk staff. Not shown to the client.</CardDescription>
          </div>
          {!composerOpen ? (
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 whitespace-nowrap px-3"
              disabled={busy}
              onClick={() => setComposerOpen(true)}
            >
              <Plus className="size-4" />
              {notes.length ? 'Add note' : 'Add first note'}
            </Button>
          ) : null}
        </CardHeader>

        {composerOpen ? (
          <CardContent className="border-t border-slate-100 pt-4">
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="grid gap-2 sm:max-w-xs">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
                <FilterSelect
                  value={draftCategory}
                  onChange={(v) => setDraftCategory(v as TriageNoteCategory)}
                  options={categoryOptions}
                  placeholder="General"
                  includeAll={false}
                  disabled={busy}
                  triggerClassName="h-10 w-full bg-white"
                />
              </div>
              <Textarea
                rows={4}
                className="min-h-[100px] resize-y bg-white"
                placeholder="Write an internal note…"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                disabled={busy}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" className="h-9" disabled={busy} onClick={resetComposer}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="h-9 gap-1.5"
                  disabled={busy || !draftBody.trim()}
                  onClick={() => void addNote()}
                >
                  {addedFlash ? (
                    <>
                      <CheckCircle2 className="size-4" />
                      Added ✓
                    </>
                  ) : (
                    'Add note'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        ) : null}
      </Card>

      {!notes.length && !composerOpen ? (
        <Card className="rounded-xl border-dashed border-slate-200 bg-slate-50/40 shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="m-0 text-sm text-slate-600">No internal notes yet.</p>
            <Button type="button" className="h-9" onClick={() => setComposerOpen(true)}>
              Add first note
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {notes.length ? (
        <div className="triage-notes-scroll max-h-[calc(100dvh-22rem)] overflow-y-auto overscroll-y-contain pr-1">
          <div className="space-y-3">
            {notes.map((note) => {
          const editing = editingId === note.id;
          const edited = note.updatedAt !== note.createdAt;

          return (
            <Card key={note.id} className="rounded-xl border-slate-200 shadow-sm">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
                        {authorInitials(note.author)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-1">
                      <Badge variant={categoryBadgeVariant(note.category)} className="shrink-0 whitespace-nowrap">
                        {CATEGORY_LABEL[note.category]}
                      </Badge>
                      <p className="m-0 text-sm font-semibold text-slate-900">{authorLabel(note.author)}</p>
                      <p className="m-0 text-xs text-slate-500">
                        {note.author?.systemRole ? `${roleLabel(note.author.systemRole)} · ` : ''}
                        {fmtNoteTime(note.createdAt)}
                        {edited ? ' · edited' : ''}
                      </p>
                    </div>
                  </div>
                  {!editing && (note.canEdit || note.canDelete) ? (
                    <RowActionsMenu
                      open={menuOpenId === note.id}
                      onClose={() => setMenuOpenId(null)}
                      trigger={(
                        <button
                          type="button"
                          className="org2-menu-btn"
                          aria-label="Note actions"
                          disabled={busy}
                          onClick={() => setMenuOpenId((id) => (id === note.id ? null : note.id))}
                        >
                          <IconMoreVertical />
                        </button>
                      )}
                    >
                      {note.canEdit ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setMenuOpenId(null);
                            setEditingId(note.id);
                            setEditBody(note.body);
                            setEditCategory(note.category);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      {note.canDelete ? (
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            setMenuOpenId(null);
                            void removeNote(note);
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </RowActionsMenu>
                  ) : null}
                </div>

                {editing ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <FilterSelect
                      value={editCategory}
                      onChange={(v) => setEditCategory(v as TriageNoteCategory)}
                      options={categoryOptions}
                      placeholder="General"
                      includeAll={false}
                      disabled={busy}
                      triggerClassName="h-10 w-full max-w-xs bg-white"
                    />
                    <Textarea
                      rows={4}
                      className="min-h-[100px] resize-y bg-white"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={busy}
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !editBody.trim()}
                        onClick={() => void saveEdit(note.id)}
                      >
                        Save changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <NoteBody body={note.body} />
                )}
              </CardContent>
            </Card>
          );
        })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
