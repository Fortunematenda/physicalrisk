'use client';

/**
 * Full-page proposal workspace (no modal).
 * Rich-text editors; changes autosave in the background.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { flushSync } from 'react-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Upload,
  AlertCircle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/filter-select';
import { PdfPreviewDialog } from '@/components/triage/proposal/PdfPreviewDialog';
import { Shell } from '@/components/Shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { flushAllRichTextEditors, RichTextEditor } from '@/components/ui/rich-text-editor';
import { useToast } from '@/components/ui/toast';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { uploadTriageProposal } from '@/lib/triage-proposal-upload';
import { cn } from '@/lib/utils';
import {
  PROPOSAL_CURRENCY_OPTIONS,
  PROPOSAL_EXPENSE_UNIT_OPTIONS,
  PROPOSAL_SECTION_HEADING_KEYS,
  PROPOSAL_SECTION_HEADING_LABELS,
  DEFAULT_PROPOSAL_SECTION_HEADINGS,
  clientFeeTotals,
  currencyUnitLabel,
  draftToPayload,
  feesIntroductionForDisplay,
  feesIntroductionForSave,
  formatMoney,
  normalizeProposalCurrency,
  proposalFieldDomId,
  proposalValidationTarget,
  recalcExpenseLine,
  recalcLineItemFee,
  withDefaultRoleRates,
  workspaceToDraft,
  type ProposalExpenseLineItem,
  type ProposalFeeLineItem,
  type ProposalPhase,
  type ProposalSectionHeadingKey,
  type ProposalTeamMember,
  type ProposalTimelineRow,
  type ProposalWorkspace,
  type ProposalWorkspaceDraft,
} from './proposal-workspace-types';

const WORKSPACE_TABS = new Set([
  'overview',
  'client',
  'understanding',
  'scope',
  'methodology',
  'sections',
  'timeline',
  'fees',
  'team',
  'terms',
]);

/** Build fee line items 1:1 from timeline Gantt rows (phase + description). */
function syncFeeLinesFromTimeline(draft: ProposalWorkspaceDraft): ProposalFeeLineItem[] {
  const timelineRows = draft.contentSnapshot.timelineRows || [];
  // No timeline rows yet — leave existing fee lines alone (new proposals / blank timeline).
  if (!timelineRows.length) return draft.contentSnapshot.feeLineItems;

  const existing = draft.contentSnapshot.feeLineItems || [];
  const used = new Set<number>();

  // Strict 1:1 with timeline — deleting a timeline phase drops its fee row.
  return timelineRows.map((tl, index) => {
    const phaseNum = String(tl.sequence || index + 1);
    const name = String(tl.name || '').trim();
    const matchIndex = existing.findIndex((row, i) => {
      if (used.has(i)) return false;
      const phase = String(row.phase || '').trim();
      const desc = String(row.description || '').trim();
      return (
        phase === phaseNum
        || (name && desc === name)
        || row.sequence === (tl.sequence || index + 1)
      );
    });
    if (matchIndex >= 0) {
      used.add(matchIndex);
      const row = existing[matchIndex];
      return withDefaultRoleRates(
        {
          ...row,
          phase: String(row.phase || '').trim() || phaseNum,
          description: String(row.description || '').trim() || name,
          sequence: index + 1,
        },
        draft.analystHourlyRate,
        draft.specialistHourlyRate,
      );
    }
    return withDefaultRoleRates(
      {
        id: `fee-tl-${tl.sequence || index + 1}-${index}`,
        phase: phaseNum,
        description: name,
        dataAnalystHours: null,
        dataAnalystRate: null,
        specialistHours: null,
        specialistRate: null,
        hours: null,
        rate: null,
        fee: 0,
        sequence: index + 1,
      },
      draft.analystHourlyRate,
      draft.specialistHourlyRate,
    );
  });
}

function feeLinesFingerprint(rows: ProposalFeeLineItem[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      phase: r.phase,
      description: r.description,
      sequence: r.sequence,
      dataAnalystHours: r.dataAnalystHours,
      dataAnalystRate: r.dataAnalystRate,
      specialistHours: r.specialistHours,
      specialistRate: r.specialistRate,
      fee: r.fee,
    })),
  );
}

function humanizeProposalWorkspaceStatus(status?: string | null) {
  const raw = String(status || 'DRAFT').trim().toUpperCase();
  const map: Record<string, string> = {
    DRAFT: 'In preparation',
    INTERNAL_REVIEW: 'Internal review',
    APPROVED: 'Approved',
    SENT: 'Sent',
    VIEWED: 'Viewed',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
    WITHDRAWN: 'Withdrawn',
  };
  return map[raw] || raw.replaceAll('_', ' ');
}

function draftFingerprint(draft: ProposalWorkspaceDraft): string {
  return JSON.stringify(draftToPayload(draft, clientFeeTotals(draft)));
}

function tabPanelClass(extra?: string) {
  return cn('mt-0 space-y-4 outline-none', extra);
}

/** Keep TipTap editors mounted across tabs so blank lines / draft text are not lost. */
function richTabClass(active: boolean, extra?: string) {
  return cn(
    tabPanelClass(extra),
    // forceMount keeps TipTap alive; must not leave inactive panels in normal flow
    // (otherwise Overview shows a huge empty scroll under Introduction).
    !active &&
      'pointer-events-none absolute left-0 right-0 top-0 z-[-1] h-0 overflow-hidden opacity-0 proposal-tab-inactive',
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</span>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  fieldId,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  fieldId?: string;
  highlight?: boolean;
}) {
  const minHeight =
    rows <= 2 ? 'min-h-[88px]' : rows <= 3 ? 'min-h-[112px]' : rows <= 6 ? 'min-h-[160px]' : rows <= 10 ? 'min-h-[240px]' : 'min-h-[320px]';
  // Cap tall fields so Scope / Approach (and others) keep a stable editor chrome;
  // page still scrolls when the inner editor is at its scroll edge.
  // Terms/legal fields (rows >= 10) get a taller viewport so long wording is not clipped.
  const maxHeight =
    rows <= 2
      ? 'max-h-[200px]'
      : rows <= 3
        ? 'max-h-[260px]'
        : rows <= 6
          ? 'max-h-[360px]'
          : rows <= 10
            ? 'max-h-[520px]'
            : 'max-h-[720px]';
  return (
    <div
      id={fieldId ? proposalFieldDomId(fieldId) : undefined}
      className={cn(
        'grid min-w-0 gap-1.5 rounded-md transition-[box-shadow,background-color]',
        highlight && 'bg-amber-50/80 p-2 ring-2 ring-amber-400 ring-offset-2',
      )}
    >
      <FieldLabel>{label}</FieldLabel>
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeightClassName={minHeight}
        maxHeightClassName={maxHeight}
        className="min-w-0 w-full"
      />
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
  fieldId,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  fieldId?: string;
  highlight?: boolean;
}) {
  return (
    <label
      id={fieldId ? proposalFieldDomId(fieldId) : undefined}
      className={cn(
        'grid gap-1.5 rounded-md transition-[box-shadow,background-color]',
        highlight && 'bg-amber-50/80 p-2 ring-2 ring-amber-400 ring-offset-2',
        className,
      )}
    >
      <FieldLabel>{label}</FieldLabel>
      <Input
        type={type}
        className="bg-white"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

type Props = {
  submissionId: string;
  onSaved?: () => Promise<void> | void;
  busy?: boolean;
  /**
   * When opened from Diagnostics & assurance, keep nav/back on the EAD outcome —
   * never send the user into the Level 1 triage commercial workspace.
   */
  eadContext?: {
    assessmentId: string;
    reference?: string | null;
    proposalId?: string;
  } | null;
};

export function ProposalWorkspace({
  submissionId,
  onSaved,
  busy = false,
  eadContext = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalIdParam =
    searchParams.get('proposalId') || eadContext?.proposalId || '';
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autosaveLabel, setAutosaveLabel] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState('overview');
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const [highlightFieldId, setHighlightFieldId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ProposalWorkspace | null>(null);
  const [draft, setDraft] = useState<ProposalWorkspaceDraft | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ bytes: ArrayBuffer; title: string } | null>(null);
  /** After submit, form is locked until the analyst explicitly unlocks re-editing. */
  const [editingUnlocked, setEditingUnlocked] = useState(false);

  const hasDraftRef = useRef(false);
  const isDirtyRef = useRef(false);
  const draftRef = useRef<ProposalWorkspaceDraft | null>(null);
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    hasDraftRef.current = Boolean(draft);
    draftRef.current = draft;
  }, [draft]);

  /**
   * Push TipTap DOM state into React draft.
   * Never blur on background autosave — that steals focus mid-keystroke.
   * Explicit Save / Preview / Leave may blur so native inputs also commit.
   */
  function syncEditorsIntoDraft(opts?: { blurActive?: boolean }): ProposalWorkspaceDraft | null {
    if (opts?.blurActive && typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') active.blur();
    }
    flushSync(() => {
      flushAllRichTextEditors();
    });
    return draftRef.current;
  }

  const draftStorageKey = `moss-proposal-ws-draft:v6:${submissionId}:${proposalIdParam || 'default'}`;

  const workspaceQuery = proposalIdParam
    ? `?proposalId=${encodeURIComponent(proposalIdParam)}`
    : '';

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const ws = await apiFetch<ProposalWorkspace>(
        `/triage/submissions/${submissionId}/proposal-workspace${workspaceQuery}`,
      );
      const nextDraft = workspaceToDraft(ws);
      const serverFingerprint = draftFingerprint(nextDraft);
      let restored: ProposalWorkspaceDraft | null = null;
      try {
        const raw = window.sessionStorage.getItem(draftStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as ProposalWorkspaceDraft;
          if (parsed && draftFingerprint(parsed) !== serverFingerprint) {
            const readable = (v: string | undefined) =>
              String(v || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim().length > 0;
            restored = {
              ...parsed,
              understandingOfNeeds: readable(parsed.understandingOfNeeds)
                ? parsed.understandingOfNeeds
                : nextDraft.understandingOfNeeds,
              methodology: readable(parsed.methodology) ? parsed.methodology : nextDraft.methodology,
              approach: readable(parsed.approach) ? parsed.approach : nextDraft.approach,
              clientObjective: readable(parsed.clientObjective)
                ? parsed.clientObjective
                : nextDraft.clientObjective,
              indicativeScope: readable(parsed.indicativeScope)
                ? parsed.indicativeScope
                : nextDraft.indicativeScope,
            };
          }
        }
      } catch {
        // ignore
      }
      setWorkspace(ws);
      setDraft(restored || nextDraft);
      setSavedFingerprint(serverFingerprint);
      if (restored) {
        toast({
          title: 'Unsaved edits restored',
          description: 'Your previous proposal edits were recovered.',
        });
      }
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Could not load proposal workspace',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [submissionId, toast, draftStorageKey, workspaceQuery]);

  useEffect(() => {
    void loadWorkspace();
  }, [submissionId, loadWorkspace, proposalIdParam]);

  // Deep-link from readiness “Complete missing information” (?tab=&field=).
  useEffect(() => {
    focusAppliedRef.current = false;
    const fieldParam = searchParams?.get('field')?.trim() || '';
    const tabParam = searchParams?.get('tab')?.trim() || '';
    const fromField = fieldParam ? proposalValidationTarget(fieldParam) : null;
    const nextTab = WORKSPACE_TABS.has(tabParam)
      ? tabParam
      : fromField && WORKSPACE_TABS.has(fromField.tab)
        ? fromField.tab
        : '';
    const nextFieldId = fromField?.fieldId || fieldParam || null;

    if (nextTab) {
      setTab(nextTab);
    } else {
      try {
        const savedTab = window.sessionStorage.getItem(`moss-proposal-ws-tab:${submissionId}`);
        if (savedTab && WORKSPACE_TABS.has(savedTab)) setTab(savedTab);
        else setTab('overview');
      } catch {
        setTab('overview');
      }
    }

    setFocusFieldId(nextFieldId);
    setHighlightFieldId(nextFieldId);
  }, [submissionId, searchParams]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(`moss-proposal-ws-tab:${submissionId}`, tab);
    } catch {
      // ignore
    }
  }, [submissionId, tab]);

  // When opening Fees (or timeline rows change), prepopulate fee phases from Timeline.
  const timelineSyncKey = useMemo(
    () =>
      JSON.stringify(
        (draft?.contentSnapshot.timelineRows || []).map((r) => ({
          sequence: r.sequence,
          name: r.name,
        })),
      ),
    [draft?.contentSnapshot.timelineRows],
  );

  useEffect(() => {
    if (tab !== 'fees' || loading) return;
    const current = draftRef.current;
    if (!current) return;
    if (!(current.contentSnapshot.timelineRows || []).length) return;
    const synced = syncFeeLinesFromTimeline(current);
    if (feeLinesFingerprint(synced) === feeLinesFingerprint(current.contentSnapshot.feeLineItems)) {
      return;
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const nextLines = syncFeeLinesFromTimeline(prev);
      if (feeLinesFingerprint(nextLines) === feeLinesFingerprint(prev.contentSnapshot.feeLineItems)) {
        return prev;
      }
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, feeLineItems: nextLines },
      };
      draftRef.current = next;
      return next;
    });
  }, [tab, loading, timelineSyncKey]);

  // After the target tab mounts, scroll/focus the missing field.
  useEffect(() => {
    if (loading || !focusFieldId || focusAppliedRef.current) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(proposalFieldDomId(focusFieldId));
      if (!el) return;
      focusAppliedRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.querySelector<HTMLElement>(
        'input, textarea, [contenteditable="true"], button',
      );
      focusable?.focus({ preventScroll: true });
      window.setTimeout(() => setHighlightFieldId(null), 4000);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loading, focusFieldId, tab, draft]);

  const feeTotals = useMemo(() => {
    if (!draft) return null;
    return clientFeeTotals(draft);
  }, [draft]);

  const currencyLabel = draft ? currencyUnitLabel(draft.currency) : 'ZAR';

  const isDirty = Boolean(draft && savedFingerprint && draftFingerprint(draft) !== savedFingerprint);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!draft || !isDirty) return;
    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [draft, isDirty, draftStorageKey]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      try {
        if (draftRef.current) {
          window.sessionStorage.setItem(draftStorageKey, JSON.stringify(draftRef.current));
        }
      } catch {
        // ignore
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [draftStorageKey]);

  function clearDraftBackup() {
    try {
      window.sessionStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }
  }

  function patchDraft(partial: Partial<ProposalWorkspaceDraft>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      draftRef.current = next;
      return next;
    });
  }

  function patchContent(partial: Partial<ProposalWorkspaceDraft['contentSnapshot']>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, ...partial },
      };
      draftRef.current = next;
      return next;
    });
  }

  function updatePhase(index: number, field: keyof ProposalPhase, value: string | number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const phases = [...prev.contentSnapshot.phases];
      phases[index] = { ...phases[index], [field]: value };
      const next = { ...prev, contentSnapshot: { ...prev.contentSnapshot, phases } };
      draftRef.current = next;
      return next;
    });
  }

  function addPhase() {
    if (!draft) return;
    const nextSeq = draft.contentSnapshot.phases.length + 1;
    patchContent({
      phases: [
        ...draft.contentSnapshot.phases,
        {
          sequence: nextSeq,
          name: `Phase ${nextSeq}`,
          keyActivities: '',
          deliverables: '',
          startWeek: nextSeq * 2 - 1,
          endWeek: nextSeq * 2,
        },
      ],
    });
  }

  function removePhase(index: number) {
    if (!draft) return;
    patchContent({
      phases: draft.contentSnapshot.phases.filter((_, i) => i !== index),
    });
  }

  function customSections() {
    return draft?.contentSnapshot.customSections || [];
  }

  function addCustomSection() {
    if (!draft) return;
    const sections = [...(draft.contentSnapshot.customSections || [])];
    sections.push({
      id: `section-${Date.now()}`,
      title: '',
      body: '',
      sequence: sections.length,
      pageBreak: true,
    });
    patchContent({ customSections: sections });
  }

  function updateCustomSection(
    index: number,
    field: 'title' | 'body' | 'pageBreak',
    value: string | boolean,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const sections = [...(prev.contentSnapshot.customSections || [])];
      sections[index] = { ...sections[index], [field]: value };
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, customSections: sections },
      };
      draftRef.current = next;
      return next;
    });
  }

  function removeCustomSection(index: number) {
    if (!draft) return;
    patchContent({
      customSections: (draft.contentSnapshot.customSections || []).filter((_, i) => i !== index),
    });
  }

  function updateSectionHeading(key: ProposalSectionHeadingKey, value: string) {
    if (!draft) return;
    const next = { ...(draft.contentSnapshot.sectionHeadings || {}) };
    const trimmed = value.trim();
    if (!trimmed || trimmed === DEFAULT_PROPOSAL_SECTION_HEADINGS[key]) {
      delete next[key];
    } else {
      next[key] = trimmed;
    }
    patchContent({ sectionHeadings: next });
  }

  function updateFeeLine(index: number, field: keyof ProposalFeeLineItem, value: string | number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const feeLineItems = [...prev.contentSnapshot.feeLineItems];
      const row = { ...feeLineItems[index], [field]: value };
      feeLineItems[index] = recalcLineItemFee(row);
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, feeLineItems },
      };
      draftRef.current = next;
      return next;
    });
  }

  function addFeeRow() {
    if (!draft) return;
    const seq = draft.contentSnapshot.feeLineItems.length + 1;
    patchContent({
      feeLineItems: [
        ...draft.contentSnapshot.feeLineItems,
        {
          id: `fee-${Date.now()}`,
          phase: '',
          description: '',
          dataAnalystHours: null,
          dataAnalystRate: Number(draft.analystHourlyRate) || 985,
          specialistHours: null,
          specialistRate: Number(draft.specialistHourlyRate) || 1825,
          hours: null,
          rate: null,
          fee: 0,
          sequence: seq,
        },
      ],
    });
  }

  function removeFeeRow(index: number) {
    if (!draft) return;
    patchContent({
      feeLineItems: draft.contentSnapshot.feeLineItems.filter((_, i) => i !== index),
    });
  }

  function updateExpenseLine(
    index: number,
    field: keyof ProposalExpenseLineItem,
    value: string | number,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const expenseLineItems = [...(prev.contentSnapshot.expenseLineItems || [])];
      const row = { ...expenseLineItems[index], [field]: value };
      expenseLineItems[index] = recalcExpenseLine(row);
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, expenseLineItems },
      };
      draftRef.current = next;
      return next;
    });
  }

  function addExpenseRow() {
    if (!draft) return;
    const seq = (draft.contentSnapshot.expenseLineItems || []).length + 1;
    patchContent({
      includeExpenses: true,
      expenseLineItems: [
        ...(draft.contentSnapshot.expenseLineItems || []),
        {
          id: `exp-${Date.now()}`,
          description: '',
          unit: 'Day',
          quantity: null,
          unitCharge: null,
          total: 0,
          sequence: seq,
        },
      ],
    });
  }

  function removeExpenseRow(index: number) {
    if (!draft) return;
    patchContent({
      expenseLineItems: (draft.contentSnapshot.expenseLineItems || []).filter((_, i) => i !== index),
    });
  }

  function updateTimeline(index: number, field: keyof ProposalTimelineRow, value: string | number) {
    setDraft((prev) => {
      if (!prev) return prev;
      const timelineRows = [...prev.contentSnapshot.timelineRows];
      timelineRows[index] = { ...timelineRows[index], [field]: value };
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, timelineRows },
      };
      draftRef.current = next;
      return next;
    });
  }

  function addTimelineRow() {
    if (!draft) return;
    const seq = draft.contentSnapshot.timelineRows.length + 1;
    patchContent({
      timelineRows: [
        ...draft.contentSnapshot.timelineRows,
        { name: '', startWeek: seq, endWeek: seq + 1, sequence: seq },
      ],
    });
  }

  function removeTimelineRow(index: number) {
    if (!draft) return;
    const removed = draft.contentSnapshot.timelineRows[index];
    const nextTimeline = draft.contentSnapshot.timelineRows
      .filter((_, i) => i !== index)
      .map((row, i) => ({ ...row, sequence: i + 1 }));
    const removedPhase = String(removed?.sequence || index + 1);
    const removedName = String(removed?.name || '').trim();
    // Drop the matching fee row immediately when a timeline phase is deleted.
    const nextFees = draft.contentSnapshot.feeLineItems
      .filter((row) => {
        const phase = String(row.phase || '').trim();
        const desc = String(row.description || '').trim();
        if (phase && phase === removedPhase) return false;
        if (removedName && desc === removedName) return false;
        if (row.sequence === (removed?.sequence || index + 1)) return false;
        return true;
      });
    const draftAfter: ProposalWorkspaceDraft = {
      ...draft,
      contentSnapshot: {
        ...draft.contentSnapshot,
        timelineRows: nextTimeline,
        feeLineItems: nextFees,
      },
    };
    // Re-sync so remaining fees stay 1:1 with timeline (phase numbers renumber).
    const syncedFees = syncFeeLinesFromTimeline(draftAfter);
    patchContent({
      timelineRows: nextTimeline,
      feeLineItems: syncedFees,
    });
  }

  function updateTeamMember(index: number, field: keyof ProposalTeamMember, value: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const members = [...prev.contentSnapshot.teamMembers];
      members[index] = { ...members[index], [field]: value };
      const next = {
        ...prev,
        contentSnapshot: { ...prev.contentSnapshot, teamMembers: members },
      };
      draftRef.current = next;
      return next;
    });
  }

  function addTeamMember() {
    if (!draft) return;
    const order = draft.contentSnapshot.teamMembers.length + 1;
    patchContent({
      teamMembers: [
        ...draft.contentSnapshot.teamMembers,
        { name: '', role: '', displayOrder: order },
      ],
    });
  }

  async function persistDraft(
    opts: {
      quiet?: boolean;
      skipParentReload?: boolean;
      draftOverride?: ProposalWorkspaceDraft | null;
    } = {},
  ) {
    const source = opts.draftOverride ?? draftRef.current;
    if (!source) return false;
    const totals = clientFeeTotals(source);
    const localSnapshot = source;
    const activeProposalId = workspace?.proposalId || proposalIdParam || undefined;
    const saved = await apiFetch<ProposalWorkspace>(
      `/triage/submissions/${submissionId}/proposal-workspace`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ...draftToPayload(source, totals),
          ...(activeProposalId ? { proposalId: activeProposalId } : {}),
        }),
      },
    );
    const nextDraft = workspaceToDraft(saved);
    setWorkspace(saved);
    const mergedDraft: ProposalWorkspaceDraft = {
      ...nextDraft,
      introduction: localSnapshot.introduction,
      understandingOfNeeds: localSnapshot.understandingOfNeeds,
      clientObjective: localSnapshot.clientObjective,
      sitesOrBusinessUnits: localSnapshot.sitesOrBusinessUnits,
      indicativeScope: localSnapshot.indicativeScope,
      methodology: localSnapshot.methodology,
      approach: localSnapshot.approach,
      exclusions: localSnapshot.exclusions,
      assumptions: localSnapshot.assumptions,
      statementOfResponsibility: localSnapshot.statementOfResponsibility,
      termsAndConditions: localSnapshot.termsAndConditions,
      acceptanceTerms: localSnapshot.acceptanceTerms,
      timelineNarrative: localSnapshot.timelineNarrative,
      deliverables: localSnapshot.deliverables,
      terms: localSnapshot.terms,
      paymentTerms: localSnapshot.paymentTerms,
      subtitle: localSnapshot.subtitle,
      contentSnapshot: localSnapshot.contentSnapshot,
    };
    setDraft(mergedDraft);
    draftRef.current = mergedDraft;
    setSavedFingerprint(draftFingerprint(mergedDraft));
    clearDraftBackup();
    setLastSavedAt(new Date());
    if (!opts.skipParentReload && onSaved) await onSaved();
    if (!opts.quiet) {
      toast({ title: 'Saved', description: 'Proposal changes saved.' });
    }
    return true;
  }

  async function generatePdfSilent() {
    const activeProposalId = workspace?.proposalId || proposalIdParam || undefined;
    await apiFetch(`/triage/submissions/${submissionId}/proposal-generate${workspaceQuery}`, {
      method: 'POST',
      body: JSON.stringify(activeProposalId ? { proposalId: activeProposalId } : {}),
    });
    try {
      const ws = await apiFetch<ProposalWorkspace>(
        `/triage/submissions/${submissionId}/proposal-workspace${workspaceQuery}`,
      );
      setWorkspace(ws);
    } catch {
      // non-fatal
    }
    if (onSaved) await onSaved();
  }

  async function save() {
    setSaving(true);
    setAutosaveLabel('saving');
    try {
      const latest = syncEditorsIntoDraft({ blurActive: true });
      if (!latest) return;
      await persistDraft({ quiet: true, draftOverride: latest });
      setAutosaveLabel('saved');
      toast({
        title: 'Saved',
        description: 'Proposal changes saved.',
      });
    } catch (e) {
      setAutosaveLabel('error');
      toast({
        variant: 'error',
        title: 'Could not save changes. Try again.',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function openPreviewPdf() {
    const blob = await apiFetchBlob(`/triage/submissions/${submissionId}/proposal-preview${workspaceQuery}`);
    const bytes = await blob.arrayBuffer();
    setPdfPreview({ bytes, title: 'Proposal preview' });
  }

  async function persistIfNeeded(latest: ProposalWorkspaceDraft) {
    // Compare fingerprints directly — isDirtyRef can lag one render behind TipTap flush.
    if (draftFingerprint(latest) === savedFingerprint) return true;
    return persistDraft({ quiet: true, draftOverride: latest });
  }

  async function downloadPdf() {
    setSaving(true);
    try {
      const latest = syncEditorsIntoDraft({ blurActive: true });
      if (!latest) return;
      await persistIfNeeded(latest);
      await generatePdfSilent();
      const proposalId = workspace?.proposalId;
      if (proposalId) {
        const data = await apiFetch<{ url: string }>(
          `/triage/submissions/${submissionId}/proposals/${proposalId}/download`,
        );
        if (data?.url) {
          // Force download via signed URL (attachment disposition).
          window.open(data.url, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      // Fallback: download the freshly rendered preview bytes.
      const blob = await apiFetchBlob(`/triage/submissions/${submissionId}/proposal-preview${workspaceQuery}`);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Physical_Risk_Proposal_${workspace?.organisationName || 'Client'}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Download failed',
        description: e instanceof Error ? e.message : 'Unable to download proposal.',
      });
    } finally {
      setSaving(false);
    }
  }

  /** Open stored/live PDF in the in-app viewer (no regenerate — avoids popup blockers). */
  async function viewPdf() {
    setSaving(true);
    try {
      const status = String(workspace?.status || '');
      const alreadySent = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(status);
      // Prefer the stored document when already sent; otherwise live preview.
      const proposalId = workspace?.proposalId;
      if (alreadySent && proposalId) {
        try {
          const data = await apiFetch<{ url: string }>(
            `/triage/submissions/${submissionId}/proposals/${proposalId}/download`,
          );
          if (data?.url) {
            const res = await fetch(data.url);
            if (res.ok) {
              const bytes = await res.arrayBuffer();
              setPdfPreview({ bytes, title: 'Proposal PDF' });
              return;
            }
          }
        } catch {
          // Fall through to live preview.
        }
      }
      await openPreviewPdf();
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Unable to open PDF',
        description: e instanceof Error ? e.message : 'Preview failed.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function previewProposal() {
    setSaving(true);
    try {
      const latest = syncEditorsIntoDraft({ blurActive: true });
      if (!latest) return;
      await persistIfNeeded(latest);
      // Preview re-renders live — do not store/generate first (that path feels like a download).
      await openPreviewPdf();
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Preview failed',
        description: e instanceof Error ? e.message : 'Unable to preview proposal.',
      });
    } finally {
      setSaving(false);
    }
  }

  function focusValidationField(field?: string | null) {
    const target = proposalValidationTarget(field);
    setTab(target.tab);
    setFocusFieldId(target.fieldId);
    setHighlightFieldId(target.fieldId);
  }

  async function sendProposalToClient() {
    setSaving(true);
    try {
      const latest = syncEditorsIntoDraft({ blurActive: true });
      if (!latest) return;
      await persistIfNeeded(latest);

      const ws = await apiFetch<ProposalWorkspace>(
        `/triage/submissions/${submissionId}/proposal-workspace${workspaceQuery}`,
      );
      setWorkspace(ws);
      const blocking = (ws.validationIssues || []).filter((i) => i.blocking);
      if (!ws.readyToSend || blocking.length > 0) {
        const first = blocking[0];
        if (first) focusValidationField(first.field);
        toast({
          variant: 'error',
          title: 'Proposal incomplete',
          description: first?.message || 'Complete required fields before submitting.',
        });
        return;
      }

      await apiFetch(`/triage/submissions/${submissionId}/proposal-send`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      clearDraftBackup();
      if (onSaved) await onSaved();
      toast({
        title: 'Proposal sent successfully',
        description: 'The client has been emailed and the proposal status is Sent.',
      });
      const eadId =
        eadContext?.assessmentId || workspace?.proposalSource?.eadAssessmentId || null;
      const fromEad =
        Boolean(eadContext?.assessmentId) ||
        workspace?.proposalSource?.type === 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
      router.push(
        fromEad && eadId
          ? `/advisory/${eadId}/outcome`
          : `/triage/${submissionId}?tab=commercial`,
      );
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Send failed',
        description: e instanceof Error ? e.message : 'Unable to send proposal.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function uploadExternal(file: File) {
    setSaving(true);
    try {
      await uploadTriageProposal(submissionId, file);
      await loadWorkspace();
      if (onSaved) await onSaved();
      toast({ title: 'Proposal uploaded' });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function goBack() {
    if (isDirtyRef.current) {
      setAutosaveLabel('saving');
      setSaving(true);
      try {
        const latest = syncEditorsIntoDraft({ blurActive: true });
        if (latest) {
          await persistDraft({ quiet: true, skipParentReload: true, draftOverride: latest });
        }
        clearDraftBackup();
        router.push(leaveHref);
        return;
      } catch {
        setAutosaveLabel('error');
        setDiscardOpen(true);
        return;
      } finally {
        setSaving(false);
      }
    }
    clearDraftBackup();
    router.push(leaveHref);
  }

  function discardAndLeave() {
    setDiscardOpen(false);
    setDraft(null);
    setSavedFingerprint('');
    clearDraftBackup();
    router.push(leaveHref);
  }

  const isBusy = busy || loading || saving;
  const proposalSent = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(
    String(workspace?.status || ''),
  );
  const formLocked = proposalSent && !editingUnlocked;
  const isEadProposal =
    Boolean(eadContext?.assessmentId) ||
    workspace?.proposalSource?.type === 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
  const eadAssessmentId =
    eadContext?.assessmentId || workspace?.proposalSource?.eadAssessmentId || null;
  const eadReference =
    eadContext?.reference || workspace?.proposalSource?.eadReference || null;
  /** Keep triage and EAD commercial paths separate — never mix breadcrumbs or leave targets. */
  const leaveHref =
    isEadProposal && eadAssessmentId
      ? `/advisory/${eadAssessmentId}/outcome`
      : `/triage/${submissionId}?tab=commercial`;

  // Background autosave after typing pauses — never blur or flip `saving` (that freezes the form).
  const draftFpWhileDirty = isDirty && draft ? draftFingerprint(draft) : '';
  useEffect(() => {
    if (!isDirty || loading || formLocked || !draft || !draftFpWhileDirty) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setAutosaveLabel('saving');
        try {
          // No blur — keep caret/selection while the user may still be mid-thought.
          const latest = syncEditorsIntoDraft({ blurActive: false }) ?? draftRef.current;
          if (!latest) return;
          if (draftFingerprint(latest) === savedFingerprint) {
            setAutosaveLabel('idle');
            return;
          }
          await persistDraft({ quiet: true, skipParentReload: true, draftOverride: latest });
          setAutosaveLabel('saved');
        } catch {
          setAutosaveLabel('error');
        }
      })();
    }, 1800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, loading, formLocked, draftFpWhileDirty, savedFingerprint]);

  const guardDirtyNav = (e: MouseEvent) => {
    if (isDirtyRef.current) {
      e.preventDefault();
      void goBack();
    }
  };

  const headerLeading = isEadProposal ? (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <Link
        href={leaveHref}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label="Back to diagnostic outcome"
        onClick={guardDirtyNav}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
      <Link
        href="/advisory"
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        Diagnostics &amp; assurance
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      <Link
        href={leaveHref}
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
        onClick={guardDirtyNav}
      >
        {eadReference || 'Diagnostic outcome'}
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      <span className="truncate font-semibold text-slate-900">
        {workspace?.proposalNumber || 'Proposal'}
      </span>
    </nav>
  ) : (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
      <Link
        href={leaveHref}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        aria-label="Back to triage submission"
        onClick={guardDirtyNav}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
      <Link
        href="/triage"
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        Executive Triage
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      <Link
        href={leaveHref}
        className="font-medium text-slate-500 transition-colors hover:text-slate-800"
        onClick={guardDirtyNav}
      >
        Triage submissions
      </Link>
      <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
      <span className="truncate font-semibold text-slate-900">
        {workspace?.proposalNumber || 'Proposal workspace'}
      </span>
    </nav>
  );

  const actionButtons = (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <span className="mr-1 text-xs text-slate-500" aria-live="polite">
        {formLocked
          ? null
          : autosaveLabel === 'saving'
            ? 'Saving…'
            : autosaveLabel === 'saved'
              ? 'Saved'
              : autosaveLabel === 'error'
                ? 'Save failed — retrying when you edit'
                : isDirty
                  ? 'Unsaved changes…'
                  : null}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        disabled={isBusy || loading || !draft || proposalSent}
        onClick={() => void save()}
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save changes
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={isBusy}>
            More
            <ChevronDown className="size-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem disabled={isBusy} onSelect={() => void downloadPdf()}>
            <Download className="size-4" />
            Download PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isBusy || formLocked || loading || !draft}
            onSelect={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            Upload external proposal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {formLocked ? (
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={isBusy}
          onClick={() => void viewPdf()}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          View PDF
        </Button>
      ) : proposalSent ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isBusy || isDirty}
            onClick={() => setEditingUnlocked(false)}
          >
            <Lock className="size-4" />
            Lock editing
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isBusy || loading || !draft}
            onClick={() => void previewProposal()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={isBusy || loading || !draft}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Save &amp; regenerate PDF
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={isBusy || loading || !draft}
            onClick={() => void previewProposal()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={isBusy || loading || !draft}
            onClick={() => void sendProposalToClient()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit
          </Button>
        </>
      )}
    </div>
  );

  if (loading || !draft) {
    return (
      <Shell title="Proposal workspace" hideSearch hideTitle headerLeading={headerLeading}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-slate-400" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Proposal workspace"
      hideSearch
      hideTitle
      headerLeading={headerLeading}
    >
      <div className="triage-detail-workspace space-y-4 pb-8">
        <div className="flex flex-wrap items-center justify-end gap-2">{actionButtons}</div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadExternal(file);
            e.target.value = '';
          }}
        />

        {isEadProposal && workspace?.status === 'ACCEPTED' && eadAssessmentId ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
            <p className="m-0 font-semibold">Proposal accepted</p>
            <p className="m-0 mt-1 text-emerald-800">
              Create Level 3 delivery engagements from the{' '}
              <Link
                href={`/advisory/${eadAssessmentId}/outcome`}
                className="font-semibold underline underline-offset-2"
              >
                diagnostic outcome
              </Link>
              — not from this proposal editor.
            </p>
          </div>
        ) : null}

        {formLocked ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Lock className="size-3.5 text-slate-500" aria-hidden="true" />
                Proposal submitted — editing locked
              </p>
              <p className="m-0 text-sm text-slate-600">
                Review tabs below, or enable re-editing to update content and regenerate the PDF.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 shrink-0"
              disabled={isBusy}
              onClick={() => {
                setEditingUnlocked(true);
                toast({
                  title: 'Re-editing enabled',
                  description: 'You can update the proposal. Save & regenerate PDF when finished.',
                });
              }}
            >
              <Pencil className="size-4" />
              Enable re-editing
            </Button>
          </div>
        ) : proposalSent ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 text-sm font-semibold text-amber-950">Re-editing unlocked</p>
              <p className="m-0 text-sm text-amber-900/80">
                Changes autosave. Use Save &amp; regenerate PDF, then resend from Commercial if the client needs the updated file.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={isBusy || isDirty}
              onClick={() => setEditingUnlocked(false)}
            >
              <Lock className="size-4" />
              Lock editing
            </Button>
          </div>
        ) : null}

        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (!formLocked) syncEditorsIntoDraft({ blurActive: false });
            setTab(next);
          }}
        >
          <TabsList className="h-auto max-w-full shrink-0 flex-wrap justify-start gap-1 bg-slate-100 p-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="client">Client</TabsTrigger>
            <TabsTrigger value="understanding">Understanding</TabsTrigger>
            <TabsTrigger value="scope">Scope</TabsTrigger>
            <TabsTrigger value="methodology">Methodology</TabsTrigger>
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="fees">Fees</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="terms">Terms</TabsTrigger>
          </TabsList>

          <div
            className={cn(
              'relative pb-8 pt-4 transition-[opacity,filter]',
              formLocked && 'pointer-events-none select-none opacity-55 grayscale-[0.35]',
            )}
            aria-disabled={formLocked || undefined}
            // @ts-expect-error inert is widely supported; React 18 typings omit it
            inert={formLocked ? '' : undefined}
          >
            {/* Tab bodies — page scrolls as a whole (no nested overflow trap) */}
            <TabsContent value="overview" className={tabPanelClass()}>
              <div
                id={proposalFieldDomId('overview')}
                className={cn(
                  'grid gap-3 rounded-md sm:grid-cols-3',
                  highlightFieldId === 'overview' && 'bg-amber-50/80 p-2 ring-2 ring-amber-400 ring-offset-2',
                )}
              >
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="m-0 text-xs text-slate-500">Status</p>
                  <Badge variant="secondary" className="mt-1">
                    {humanizeProposalWorkspaceStatus(workspace?.status)}
                  </Badge>
                  {String(workspace?.status || '').toUpperCase() === 'DRAFT' ? (
                    <p className="m-0 mt-1.5 text-[11px] leading-snug text-slate-500">
                      Stays in preparation until the proposal is sent or marked accepted on the
                      diagnostic outcome.
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="m-0 text-xs text-slate-500">Version</p>
                  <p className="m-0 mt-1 font-semibold">{workspace?.versionLabel || `v${workspace?.version || 1}`}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="m-0 text-xs text-slate-500">Total (VAT incl)</p>
                  <p className="m-0 mt-1 font-semibold">
                    {feeTotals ? formatMoney(feeTotals.grandTotal, draft.currency) : '—'}
                  </p>
                </div>
              </div>
              <label className="grid max-w-xs gap-1.5">
                <FieldLabel>Proposal currency</FieldLabel>
                <FilterSelect
                  value={normalizeProposalCurrency(draft.currency)}
                  onChange={(v) => patchDraft({ currency: normalizeProposalCurrency(v) })}
                  options={[...PROPOSAL_CURRENCY_OPTIONS]}
                  placeholder="Select currency"
                  includeAll={false}
                  triggerClassName="h-10 w-full bg-white"
                />
              </label>
              <FieldInput
                label="Subtitle"
                fieldId="subtitle"
                highlight={highlightFieldId === 'subtitle'}
                value={draft.subtitle}
                onChange={(v) => patchDraft({ subtitle: v })}
                placeholder="Optional proposal subtitle"
              />
              <FieldTextarea
                label="Introduction (legacy letter)"
                value={draft.introduction}
                onChange={(v) => patchDraft({ introduction: v })}
                rows={3}
              />
            </TabsContent>

            <TabsContent value="client" className="mt-0 grid gap-4 sm:grid-cols-2">
              <FieldInput
                label="Organisation"
                fieldId="organisationName"
                highlight={highlightFieldId === 'organisationName'}
                value={draft.organisationName}
                onChange={(v) => patchDraft({ organisationName: v })}
              />
              <FieldInput
                label="Addressed to"
                fieldId="addressedTo"
                highlight={highlightFieldId === 'addressedTo'}
                value={draft.addressedTo}
                onChange={(v) => patchDraft({ addressedTo: v })}
              />
              <FieldInput label="Job title" value={draft.jobTitle} onChange={(v) => patchDraft({ jobTitle: v })} />
              <FieldInput
                label="Email"
                type="text"
                value={draft.email}
                onChange={(v) => patchDraft({ email: v })}
                placeholder="name@company.com; second@company.com"
              />
              <p className="sm:col-span-2 -mt-2 text-xs text-slate-500">
                Separate multiple proposal recipients with a comma or semicolon.
              </p>
              <FieldInput label="Phone" value={draft.phone} onChange={(v) => patchDraft({ phone: v })} className="sm:col-span-2" />
              <FieldInput label="Project sponsor" value={draft.projectSponsor} onChange={(v) => patchDraft({ projectSponsor: v })} />
              <FieldInput label="Project champion" value={draft.projectChampion} onChange={(v) => patchDraft({ projectChampion: v })} />
            </TabsContent>

            <TabsContent value="understanding" forceMount className={richTabClass(tab === 'understanding')}>
              <FieldTextarea
                label="Understanding your needs"
                fieldId="understandingOfNeeds"
                highlight={highlightFieldId === 'understandingOfNeeds'}
                value={draft.understandingOfNeeds}
                onChange={(v) => patchDraft({ understandingOfNeeds: v })}
                rows={8}
                placeholder="Narrative derived from triage — editable before send"
              />
            </TabsContent>

            <TabsContent value="scope" forceMount className={richTabClass(tab === 'scope')}>
              <FieldTextarea
                label="Client objectives"
                fieldId="clientObjective"
                highlight={highlightFieldId === 'clientObjective'}
                value={draft.clientObjective}
                onChange={(v) => patchDraft({ clientObjective: v })}
              />
              <FieldInput label="Sites / business units" value={draft.sitesOrBusinessUnits} onChange={(v) => patchDraft({ sitesOrBusinessUnits: v })} />
              <FieldTextarea
                label="Indicative scope"
                fieldId="indicativeScope"
                highlight={highlightFieldId === 'indicativeScope'}
                value={draft.indicativeScope}
                onChange={(v) => patchDraft({ indicativeScope: v })}
              />
              <FieldTextarea label="Approach" value={draft.approach} onChange={(v) => patchDraft({ approach: v })} />
              <FieldTextarea
                label="Deliverables"
                fieldId="deliverables"
                highlight={highlightFieldId === 'deliverables'}
                value={draft.deliverables}
                onChange={(v) => patchDraft({ deliverables: v })}
              />
              <FieldTextarea label="Exclusions" value={draft.exclusions} onChange={(v) => patchDraft({ exclusions: v })} rows={3} />
            </TabsContent>

            <TabsContent value="methodology" forceMount className={richTabClass(tab === 'methodology')}>
              <FieldTextarea label="Methodology" value={draft.methodology} onChange={(v) => patchDraft({ methodology: v })} rows={6} />
              <div
                id={proposalFieldDomId('phases')}
                className={cn(
                  'space-y-3 rounded-md transition-[box-shadow,background-color]',
                  highlightFieldId === 'phases' && 'bg-amber-50/80 p-2 ring-2 ring-amber-400 ring-offset-2',
                )}
              >
                <div className="flex items-center justify-between">
                  <FieldLabel>Project phases</FieldLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addPhase}>
                    <Plus className="size-4" />
                    Add phase
                  </Button>
                </div>
                {draft.contentSnapshot.phases.map((phase, index) => (
                  <div key={`phase-${phase.sequence}-${index}`} className="space-y-2 rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        className="bg-white font-medium"
                        value={phase.name}
                        onChange={(e) => updatePhase(index, 'name', e.target.value)}
                        placeholder="Phase name"
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => removePhase(index)}>
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </div>
                    <RichTextEditor
                      value={phase.keyActivities}
                      onChange={(v) => updatePhase(index, 'keyActivities', v)}
                      placeholder="Key activities"
                      minHeightClassName="min-h-[88px]"
                    />
                    <RichTextEditor
                      value={phase.deliverables}
                      onChange={(v) => updatePhase(index, 'deliverables', v)}
                      placeholder="Deliverables"
                      minHeightClassName="min-h-[88px]"
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="sections" forceMount className={richTabClass(tab === 'sections')}>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
                Rename PDF section headings (Contents page + page headers), and add optional custom
                sections after Deliverables and before Proposed fees.
              </div>

              <div className="space-y-3">
                <FieldLabel>PDF section headings</FieldLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PROPOSAL_SECTION_HEADING_KEYS.map((key) => {
                    const current =
                      draft.contentSnapshot.sectionHeadings?.[key]
                      || DEFAULT_PROPOSAL_SECTION_HEADINGS[key];
                    return (
                      <FieldInput
                        key={key}
                        label={PROPOSAL_SECTION_HEADING_LABELS[key]}
                        value={current}
                        onChange={(v) => updateSectionHeading(key, v)}
                        placeholder={DEFAULT_PROPOSAL_SECTION_HEADINGS[key]}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <FieldLabel>Custom PDF sections</FieldLabel>
                <Button type="button" variant="outline" size="sm" onClick={addCustomSection}>
                  <Plus className="size-4" />
                  Add section
                </Button>
              </div>
              {customSections().map((section, index) => (
                <div key={section.id || `custom-${index}`} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1 bg-white font-medium"
                      value={section.title}
                      onChange={(e) => updateCustomSection(index, 'title', e.target.value)}
                      placeholder="Section title (appears in Contents)"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCustomSection(index)}>
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </div>
                  <RichTextEditor
                    value={section.body}
                    onChange={(v) => updateCustomSection(index, 'body', v)}
                    placeholder="Section body…"
                    minHeightClassName="min-h-[120px]"
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-slate-300"
                      checked={section.pageBreak !== false}
                      onChange={(e) => updateCustomSection(index, 'pageBreak', e.target.checked)}
                    />
                    Start on a new page
                  </label>
                </div>
              ))}
              {!customSections().length ? (
                <p className="text-sm text-muted-foreground">
                  No custom sections yet. Added sections appear in the PDF Contents list.
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="fees" forceMount className={richTabClass(tab === 'fees')}>
              <label className="grid max-w-xs gap-1.5">
                <FieldLabel>Proposal currency</FieldLabel>
                <FilterSelect
                  value={normalizeProposalCurrency(draft.currency)}
                  onChange={(v) => patchDraft({ currency: normalizeProposalCurrency(v) })}
                  options={[...PROPOSAL_CURRENCY_OPTIONS]}
                  placeholder="Select currency"
                  includeAll={false}
                  triggerClassName="h-10 w-full bg-white"
                />
                <span className="text-[11px] text-slate-400">
                  All rates, fees, and totals below use this currency.
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <FieldInput
                  label={`Analyst rate (${currencyLabel}/hr)`}
                  type="number"
                  value={draft.analystHourlyRate}
                  onChange={(v) => {
                    const previous = Number(draft.analystHourlyRate);
                    const nextDefault = Number(v);
                    setDraft((prev) => {
                      if (!prev) return prev;
                      const feeLineItems =
                        Number.isFinite(nextDefault) && nextDefault >= 0
                          ? prev.contentSnapshot.feeLineItems.map((row) => {
                              const current = row.dataAnalystRate;
                              if (
                                current == null
                                || (Number.isFinite(previous) && current === previous)
                              ) {
                                return withDefaultRoleRates(
                                  { ...row, dataAnalystRate: nextDefault },
                                  v,
                                  prev.specialistHourlyRate,
                                );
                              }
                              return row;
                            })
                          : prev.contentSnapshot.feeLineItems;
                      const next = {
                        ...prev,
                        analystHourlyRate: v,
                        contentSnapshot: { ...prev.contentSnapshot, feeLineItems },
                      };
                      draftRef.current = next;
                      return next;
                    });
                  }}
                />
                <FieldInput
                  label={`Specialist rate (${currencyLabel}/hr)`}
                  type="number"
                  value={draft.specialistHourlyRate}
                  onChange={(v) => {
                    const previous = Number(draft.specialistHourlyRate);
                    const nextDefault = Number(v);
                    setDraft((prev) => {
                      if (!prev) return prev;
                      const feeLineItems =
                        Number.isFinite(nextDefault) && nextDefault >= 0
                          ? prev.contentSnapshot.feeLineItems.map((row) => {
                              const current = row.specialistRate;
                              if (
                                current == null
                                || (Number.isFinite(previous) && current === previous)
                              ) {
                                return withDefaultRoleRates(
                                  { ...row, specialistRate: nextDefault },
                                  prev.analystHourlyRate,
                                  v,
                                );
                              }
                              return row;
                            })
                          : prev.contentSnapshot.feeLineItems;
                      const next = {
                        ...prev,
                        specialistHourlyRate: v,
                        contentSnapshot: { ...prev.contentSnapshot, feeLineItems },
                      };
                      draftRef.current = next;
                      return next;
                    });
                  }}
                />
                <FieldInput
                  label={`Discount (${currencyLabel})`}
                  type="number"
                  value={draft.discount}
                  onChange={(v) => patchDraft({ discount: v })}
                />
                <FieldInput
                  label="VAT rate (%)"
                  type="number"
                  value={String(
                    Math.round(
                      (Number(draft.vatRate) > 1
                        ? Number(draft.vatRate)
                        : Number(draft.vatRate) * 100) * 100,
                    ) / 100 || 15,
                  )}
                  onChange={(v) => {
                    const pct = Number(v);
                    if (!Number.isFinite(pct)) {
                      patchDraft({ vatRate: '' });
                      return;
                    }
                    patchDraft({ vatRate: String(pct / 100) });
                  }}
                />
              </div>

              <FieldTextarea
                label="Fees introduction"
                value={feesIntroductionForDisplay(
                  draft.contentSnapshot.feesIntroduction,
                  draft.analystHourlyRate,
                  draft.specialistHourlyRate,
                  draft.currency,
                )}
                onChange={(v) =>
                  patchContent({ feesIntroduction: feesIntroductionForSave(v) })
                }
                rows={3}
                placeholder="The costs below are estimated on a time-and-materials basis…"
              />

              <FieldTextarea
                label="Payment terms"
                fieldId="paymentTerms"
                highlight={highlightFieldId === 'paymentTerms'}
                value={draft.paymentTerms}
                onChange={(v) => patchDraft({ paymentTerms: v })}
                rows={3}
                placeholder="Payment schedule and billing terms…"
              />

              <label className="grid max-w-xl gap-1.5">
                <FieldLabel>Purchase Order requirement</FieldLabel>
                <FilterSelect
                  value={draft.poRequirement || 'NOT_REQUIRED'}
                  onChange={(v) => patchDraft({ poRequirement: v })}
                  options={[
                    { value: 'NOT_REQUIRED', label: 'Not required' },
                    { value: 'REQUIRED_WITH_ACCEPTANCE', label: 'Required with acceptance' },
                    { value: 'REQUIRED_BEFORE_WORK', label: 'Required before work starts' },
                  ]}
                  placeholder="PO requirement"
                  includeAll={false}
                  triggerClassName="h-10 w-full bg-white"
                />
                <span className="text-[11px] text-slate-400">
                  Controls whether the client must supply a PO when accepting, or before Level 3 work starts.
                </span>
              </label>

              <FieldTextarea
                label="Fee assumptions"
                value={(draft.contentSnapshot.feeAssumptions || []).join('\n')}
                onChange={(v) =>
                  patchContent({
                    feeAssumptions: v.trim() ? v.split(/\n+/).map((line) => line.trim()).filter(Boolean) : [],
                  })
                }
                rows={3}
              />

              <div
                id={proposalFieldDomId('feeLineItems')}
                className={cn(
                  'space-y-2 rounded-md transition-[box-shadow,background-color]',
                  highlightFieldId === 'feeLineItems' && 'bg-amber-50/80 p-2 ring-2 ring-amber-400 ring-offset-2',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <FieldLabel>Fee line items</FieldLabel>
                    <p className="m-0 text-xs text-slate-500">
                      Phase and description are prefilled from Timeline Gantt rows when available.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addFeeRow}>
                    <Plus className="size-4" />
                    Add row
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="w-14 px-1.5 py-1.5 align-bottom" rowSpan={2}>
                          Phase
                        </th>
                        <th className="min-w-[12rem] px-2 py-1.5 align-bottom" rowSpan={2}>
                          Description
                        </th>
                        <th className="border-b border-slate-200 px-2 py-1.5 text-center" colSpan={2}>
                          Data Analyst
                        </th>
                        <th className="border-b border-slate-200 px-2 py-1.5 text-center" colSpan={2}>
                          Specialist
                        </th>
                        <th className="w-28 px-2 py-1.5 text-right align-bottom" rowSpan={2}>
                          Fee ({currencyLabel})
                        </th>
                        <th className="w-10 px-1 py-1.5 align-bottom" rowSpan={2} />
                      </tr>
                      <tr>
                        <th className="w-[4.5rem] px-1.5 py-1.5 font-medium normal-case">Hours</th>
                        <th className="w-[5.5rem] px-1.5 py-1.5 font-medium normal-case">Rate</th>
                        <th className="w-[4.5rem] px-1.5 py-1.5 font-medium normal-case">Hours</th>
                        <th className="w-[5.5rem] px-1.5 py-1.5 font-medium normal-case">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.contentSnapshot.feeLineItems.map((row, index) => (
                        <tr key={row.id || index} className="border-t border-slate-100">
                          <td className="px-1.5 py-1">
                            <Input
                              className="h-8 w-12 bg-white px-1.5 text-center"
                              value={row.phase}
                              onChange={(e) => updateFeeLine(index, 'phase', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 bg-white"
                              value={row.description}
                              onChange={(e) => updateFeeLine(index, 'description', e.target.value)}
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <Input
                              className="h-8 bg-white px-1.5"
                              type="number"
                              min={0}
                              step="0.25"
                              value={row.dataAnalystHours != null ? String(row.dataAnalystHours) : ''}
                              onChange={(e) =>
                                updateFeeLine(
                                  index,
                                  'dataAnalystHours',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <Input
                              className="h-8 bg-white px-1.5"
                              type="number"
                              min={0}
                              step="1"
                              value={row.dataAnalystRate != null ? String(row.dataAnalystRate) : ''}
                              onChange={(e) =>
                                updateFeeLine(
                                  index,
                                  'dataAnalystRate',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <Input
                              className="h-8 bg-white px-1.5"
                              type="number"
                              min={0}
                              step="0.25"
                              value={row.specialistHours != null ? String(row.specialistHours) : ''}
                              onChange={(e) =>
                                updateFeeLine(
                                  index,
                                  'specialistHours',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <Input
                              className="h-8 bg-white px-1.5"
                              type="number"
                              min={0}
                              step="1"
                              value={row.specialistRate != null ? String(row.specialistRate) : ''}
                              onChange={(e) =>
                                updateFeeLine(
                                  index,
                                  'specialistRate',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1 text-right font-medium tabular-nums">
                            {formatMoney(Number(row.fee) || 0, draft.currency)}
                          </td>
                          <td className="px-1 py-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => removeFeeRow(index)}
                            >
                              <Trash2 className="size-4 text-red-600" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-slate-300 text-[#c41230] focus:ring-[#c41230]"
                        checked={Boolean(draft.contentSnapshot.includeExpenses)}
                        onChange={(e) =>
                          patchContent({ includeExpenses: e.target.checked })
                        }
                      />
                      Include estimated expenses in proposal
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!draft.contentSnapshot.includeExpenses}
                      onClick={addExpenseRow}
                    >
                      <Plus className="size-4" />
                      Add expense
                    </Button>
                  </div>
                  {draft.contentSnapshot.includeExpenses ? (
                    <>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full min-w-[640px] text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-2 py-2">Expense item</th>
                              <th className="w-32 px-2 py-2">Unit</th>
                              <th className="w-28 px-2 py-2">Qty / Persons</th>
                              <th className="w-28 px-2 py-2">Unit charge</th>
                              <th className="w-28 px-2 py-2 text-right">Total</th>
                              <th className="w-10 px-2 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {(draft.contentSnapshot.expenseLineItems || []).map((row, index) => (
                              <tr key={row.id || index} className="border-t border-slate-100">
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    placeholder="e.g. Accommodation"
                                    value={row.description}
                                    onChange={(e) =>
                                      updateExpenseLine(index, 'description', e.target.value)
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    list={`expense-unit-options-${index}`}
                                    placeholder="Flight / Day / Night"
                                    value={row.unit}
                                    onChange={(e) =>
                                      updateExpenseLine(index, 'unit', e.target.value)
                                    }
                                  />
                                  <datalist id={`expense-unit-options-${index}`}>
                                    {PROPOSAL_EXPENSE_UNIT_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value} />
                                    ))}
                                  </datalist>
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    type="number"
                                    min={0}
                                    step="1"
                                    value={row.quantity != null ? String(row.quantity) : ''}
                                    onChange={(e) =>
                                      updateExpenseLine(
                                        index,
                                        'quantity',
                                        e.target.value === '' ? '' : Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    type="number"
                                    min={0}
                                    step="1"
                                    value={row.unitCharge != null ? String(row.unitCharge) : ''}
                                    onChange={(e) =>
                                      updateExpenseLine(
                                        index,
                                        'unitCharge',
                                        e.target.value === '' ? '' : Number(e.target.value),
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1 text-right font-medium tabular-nums">
                                  {formatMoney(Number(row.total) || 0, draft.currency)}
                                </td>
                                <td className="px-2 py-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => removeExpenseRow(index)}
                                  >
                                    <Trash2 className="size-4 text-red-600" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                            {(draft.contentSnapshot.expenseLineItems || []).length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-500">
                                  No expense lines yet. Add Air travel, Car hire, Accommodation, or Meal
                                  allowance as needed.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                      <p className="m-0 text-right text-sm font-medium text-slate-700">
                        Expenses total:{' '}
                        {formatMoney(
                          (draft.contentSnapshot.expenseLineItems || []).reduce(
                            (sum, row) => sum + (Number(row.total) || 0),
                            0,
                          ),
                          draft.currency,
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="m-0 text-xs text-slate-500">
                      Expenses are optional. When enabled, itemised lines appear on the proposal PDF and
                      are added after VAT in the grand total.
                    </p>
                  )}
                </div>

                {feeTotals ? (
                  <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:justify-items-end">
                    <dt className="text-slate-500">Professional fees</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(feeTotals.subtotal, draft.currency)}
                    </dd>
                    {Number(draft.discount) > 0 ? (
                      <>
                        <dt className="text-slate-500">Discount</dt>
                        <dd className="tabular-nums">
                          -{formatMoney(Number(draft.discount) || 0, draft.currency)}
                        </dd>
                        <dt className="text-slate-500">After discount</dt>
                        <dd className="tabular-nums">
                          {formatMoney(feeTotals.discountedSubtotal, draft.currency)}
                        </dd>
                      </>
                    ) : null}
                    <dt className="text-slate-500">VAT</dt>
                    <dd className="tabular-nums">{formatMoney(feeTotals.vatAmount, draft.currency)}</dd>
                    {draft.contentSnapshot.includeExpenses ? (
                      <>
                        <dt className="text-slate-500">Estimated expenses</dt>
                        <dd className="tabular-nums">
                          {formatMoney(
                            (draft.contentSnapshot.expenseLineItems || []).reduce(
                              (sum, row) => sum + (Number(row.total) || 0),
                              0,
                            ),
                            draft.currency,
                          )}
                        </dd>
                      </>
                    ) : null}
                    <dt className="font-semibold text-slate-700">Grand total</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatMoney(feeTotals.grandTotal, draft.currency)}
                    </dd>
                  </dl>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="timeline" className={tabPanelClass()}>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldInput
                  label="Estimated project weeks"
                  type="number"
                  value={draft.estimatedProjectWeeks}
                  onChange={(v) => patchDraft({ estimatedProjectWeeks: v })}
                />
                <FieldInput label="Timeline summary" value={draft.timeline} onChange={(v) => patchDraft({ timeline: v })} />
              </div>
              <FieldTextarea
                label="Timeline narrative"
                value={draft.timelineNarrative}
                onChange={(v) => patchDraft({ timelineNarrative: v })}
                rows={4}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <FieldLabel>Gantt rows</FieldLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addTimelineRow}>
                    <Plus className="size-4" />
                    Add row
                  </Button>
                </div>
                <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[1fr_7rem_7rem_2.5rem]">
                  <span>Phase / Activity</span>
                  <span>Start week</span>
                  <span>End week</span>
                  <span className="sr-only">Remove</span>
                </div>
                {draft.contentSnapshot.timelineRows.map((row, index) => (
                  <div key={`tl-${row.sequence}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem_2.5rem]">
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-slate-500 sm:hidden">Phase / Activity</span>
                      <Input
                        className="bg-white"
                        placeholder="Activity"
                        value={row.name}
                        onChange={(e) => updateTimeline(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-slate-500 sm:hidden">Start week</span>
                      <Input
                        className="bg-white"
                        type="number"
                        min={1}
                        placeholder="Start week"
                        aria-label="Start week"
                        value={String(row.startWeek)}
                        onChange={(e) => updateTimeline(index, 'startWeek', Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-slate-500 sm:hidden">End week</span>
                      <Input
                        className="bg-white"
                        type="number"
                        min={1}
                        placeholder="End week"
                        aria-label="End week"
                        value={String(row.endWeek)}
                        onChange={(e) => updateTimeline(index, 'endWeek', Number(e.target.value) || 0)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 p-0"
                      onClick={() => removeTimelineRow(index)}
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </div>
                ))}
                {!draft.contentSnapshot.timelineRows.length ? (
                  <p className="text-sm text-muted-foreground">
                    No Gantt rows yet. Add rows for the PDF timeline chart. Bars run from Start week through End week (inclusive) and may overlap.
                  </p>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="team" forceMount className={richTabClass(tab === 'team')}>
              <div
                id={proposalFieldDomId('team')}
                className={cn(
                  'space-y-3 rounded-md transition-[box-shadow,background-color]',
                  highlightFieldId === 'team' && 'bg-amber-50/80 p-2 ring-2 ring-amber-400 ring-offset-2',
                )}
              >
              <div className="flex items-center justify-between">
                <FieldLabel>Proposed team</FieldLabel>
                <Button type="button" variant="outline" size="sm" onClick={addTeamMember}>
                  <Plus className="size-4" />
                  Add member
                </Button>
              </div>
              {draft.contentSnapshot.teamMembers.map((member, index) => (
                <div key={`team-${member.displayOrder}-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                  <Input className="bg-white" placeholder="Name" value={member.name} onChange={(e) => updateTeamMember(index, 'name', e.target.value)} />
                  <Input className="bg-white" placeholder="Role" value={member.role} onChange={(e) => updateTeamMember(index, 'role', e.target.value)} />
                  <Input
                    className="bg-white sm:col-span-2"
                    placeholder="Project position"
                    value={member.projectPosition || ''}
                    onChange={(e) => updateTeamMember(index, 'projectPosition', e.target.value)}
                  />
                  <RichTextEditor
                    className="sm:col-span-2"
                    minHeightClassName="min-h-[88px]"
                    placeholder="Summary / biography"
                    value={member.biography || member.summary || ''}
                    onChange={(v) => updateTeamMember(index, 'biography', v)}
                  />
                  <RichTextEditor
                    className="sm:col-span-2"
                    minHeightClassName="min-h-[88px]"
                    placeholder="Relevant areas of knowledge"
                    value={member.relevantAreasOfKnowledge || member.qualifications || ''}
                    onChange={(v) => updateTeamMember(index, 'relevantAreasOfKnowledge', v)}
                  />
                </div>
              ))}

              <div className="flex items-center justify-between pt-2">
                <FieldLabel>Client experience</FieldLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const items = [...draft.contentSnapshot.experienceItems];
                    items.push({ clientName: '', description: '', displayOrder: items.length + 1 });
                    patchDraft({ contentSnapshot: { ...draft.contentSnapshot, experienceItems: items } });
                  }}
                >
                  <Plus className="size-4" />
                  Add experience
                </Button>
              </div>
              {draft.contentSnapshot.experienceItems.map((exp, index) => (
                <div key={`exp-${exp.displayOrder}-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                  <Input
                    className="bg-white"
                    placeholder="Client name"
                    value={exp.clientName}
                    onChange={(e) => {
                      const items = [...draft.contentSnapshot.experienceItems];
                      items[index] = { ...items[index], clientName: e.target.value };
                      patchDraft({ contentSnapshot: { ...draft.contentSnapshot, experienceItems: items } });
                    }}
                  />
                  <Input
                    className="bg-white"
                    placeholder="Engagement title"
                    value={exp.engagementTitle || ''}
                    onChange={(e) => {
                      const items = [...draft.contentSnapshot.experienceItems];
                      items[index] = { ...items[index], engagementTitle: e.target.value };
                      patchDraft({ contentSnapshot: { ...draft.contentSnapshot, experienceItems: items } });
                    }}
                  />
                  <RichTextEditor
                    className="sm:col-span-2"
                    minHeightClassName="min-h-[72px]"
                    placeholder="Experience description"
                    value={exp.description}
                    onChange={(v) => {
                      const items = [...draft.contentSnapshot.experienceItems];
                      items[index] = { ...items[index], description: v };
                      patchDraft({ contentSnapshot: { ...draft.contentSnapshot, experienceItems: items } });
                    }}
                  />
                </div>
              ))}
              </div>
            </TabsContent>

            <TabsContent value="terms" forceMount className={richTabClass(tab === 'terms')}>
              <FieldTextarea label="Assumptions" value={draft.assumptions} onChange={(v) => patchDraft({ assumptions: v })} rows={4} />
              <FieldTextarea label="Statement of responsibility" value={draft.statementOfResponsibility} onChange={(v) => patchDraft({ statementOfResponsibility: v })} rows={4} />
              <FieldTextarea
                label="Terms and conditions"
                fieldId="termsAndConditions"
                highlight={highlightFieldId === 'termsAndConditions'}
                value={draft.termsAndConditions}
                onChange={(v) => patchDraft({ termsAndConditions: v })}
                rows={12}
              />
              <FieldTextarea
                label="Acceptance terms"
                fieldId="acceptanceTerms"
                highlight={highlightFieldId === 'acceptanceTerms'}
                value={draft.acceptanceTerms}
                onChange={(v) => patchDraft({ acceptanceTerms: v })}
                rows={12}
              />
              <FieldTextarea label="Commercial terms (letter)" value={draft.terms} onChange={(v) => patchDraft({ terms: v })} rows={3} />
            </TabsContent>
          </div>
        </Tabs>

        <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
              <AlertDialogDescription>
                Autosave could not finish. Leave and discard unsaved edits, or stay and keep editing
                (changes will retry saving in the background).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  discardAndLeave();
                }}
              >
                Discard and leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PdfPreviewDialog
          open={Boolean(pdfPreview)}
          onOpenChange={(open) => {
            if (!open) setPdfPreview(null);
          }}
          pdfBytes={pdfPreview?.bytes || null}
          title={pdfPreview?.title || 'Proposal preview'}
          onDownload={() => void downloadPdf()}
          downloadDisabled={isBusy}
        />
      </div>
    </Shell>
  );
}
