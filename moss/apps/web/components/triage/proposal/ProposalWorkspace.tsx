'use client';

/**
 * Full-page proposal workspace (no modal).
 * Rich-text editors; changes persist only when the admin clicks Save.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { flushSync } from 'react-dom';
import {
  ChevronDown,
  ChevronLeft,
  Download,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Upload,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { flushAllRichTextEditors, RichTextEditor } from '@/components/ui/rich-text-editor';
import { useToast } from '@/components/ui/toast';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { uploadTriageProposal } from '@/lib/triage-proposal-upload';
import { cn } from '@/lib/utils';
import {
  PROPOSAL_CURRENCY_OPTIONS,
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
  recalcLineItemFee,
  workspaceToDraft,
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
  'fees',
  'timeline',
  'team',
  'terms',
]);

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
    !active && 'hidden proposal-tab-inactive',
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
};

export function ProposalWorkspace({ submissionId, onSaved, busy = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('overview');
  const [focusFieldId, setFocusFieldId] = useState<string | null>(null);
  const [highlightFieldId, setHighlightFieldId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ProposalWorkspace | null>(null);
  const [draft, setDraft] = useState<ProposalWorkspaceDraft | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ bytes: ArrayBuffer; title: string } | null>(null);

  const hasDraftRef = useRef(false);
  const isDirtyRef = useRef(false);
  const draftRef = useRef<ProposalWorkspaceDraft | null>(null);
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    hasDraftRef.current = Boolean(draft);
    draftRef.current = draft;
  }, [draft]);

  function syncEditorsIntoDraft(): ProposalWorkspaceDraft | null {
    if (typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') active.blur();
    }
    flushSync(() => {
      flushAllRichTextEditors();
    });
    return draftRef.current;
  }

  const draftStorageKey = `moss-proposal-ws-draft:v6:${submissionId}`;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const ws = await apiFetch<ProposalWorkspace>(
        `/triage/submissions/${submissionId}/proposal-workspace`,
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
  }, [submissionId, toast, draftStorageKey]);

  useEffect(() => {
    void loadWorkspace();
  }, [submissionId, loadWorkspace]);

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
          hours: null,
          rate: Number(draft.analystHourlyRate) || 985,
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
    patchContent({
      timelineRows: draft.contentSnapshot.timelineRows
        .filter((_, i) => i !== index)
        .map((row, i) => ({ ...row, sequence: i + 1 })),
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
    const saved = await apiFetch<ProposalWorkspace>(
      `/triage/submissions/${submissionId}/proposal-workspace`,
      {
        method: 'PATCH',
        body: JSON.stringify(draftToPayload(source, totals)),
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
    if (!opts.skipParentReload && onSaved) await onSaved();
    if (!opts.quiet) {
      toast({ title: 'Saved', description: 'Proposal changes saved.' });
    }
    return true;
  }

  async function generatePdfSilent() {
    await apiFetch(`/triage/submissions/${submissionId}/proposal-generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    try {
      const ws = await apiFetch<ProposalWorkspace>(
        `/triage/submissions/${submissionId}/proposal-workspace`,
      );
      setWorkspace(ws);
    } catch {
      // non-fatal
    }
    if (onSaved) await onSaved();
  }

  async function save() {
    setSaving(true);
    try {
      const latest = syncEditorsIntoDraft();
      if (!latest) return;
      await persistDraft({ quiet: true, draftOverride: latest });
      await generatePdfSilent();
      toast({
        title: 'Saved',
        description: 'Proposal changes saved and PDF generated.',
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function openPreviewPdf() {
    const blob = await apiFetchBlob(`/triage/submissions/${submissionId}/proposal-preview`);
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
      const latest = syncEditorsIntoDraft();
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
      const blob = await apiFetchBlob(`/triage/submissions/${submissionId}/proposal-preview`);
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

  async function previewProposal() {
    setSaving(true);
    try {
      const latest = syncEditorsIntoDraft();
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
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    clearDraftBackup();
    router.push(`/triage/${submissionId}?tab=commercial`);
  }

  function discardAndLeave() {
    setDiscardOpen(false);
    setDraft(null);
    setSavedFingerprint('');
    clearDraftBackup();
    router.push(`/triage/${submissionId}?tab=commercial`);
  }

  const isBusy = busy || loading || saving;
  const proposalSent = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(
    String(workspace?.status || ''),
  );
  const backHref = `/triage/${submissionId}?tab=commercial`;

  if (loading || !draft) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-50">
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

      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <Link
              href={backHref}
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
              onClick={(e) => {
                if (isDirty) {
                  e.preventDefault();
                  void goBack();
                }
              }}
            >
              <ChevronLeft className="size-3.5" />
              Back to triage
            </Link>
            <h1 className="m-0 truncate text-lg font-semibold text-slate-900">Proposal workspace</h1>
            <p className="m-0 truncate text-sm text-slate-500">
              {workspace?.organisationName || 'Client'} · Physical Risk landscape proposal
              {isDirty ? ' · Unsaved changes' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" disabled={isBusy}>
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
                  disabled={isBusy || proposalSent}
                  onSelect={() => fileRef.current?.click()}
                >
                  <Upload className="size-4" />
                  Upload external proposal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy || !isDirty}
              onClick={() => void save()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
            {proposalSent ? (
              <Button type="button" disabled={isBusy} onClick={() => void downloadPdf()}>
                <Eye className="size-4" />
                View proposal
              </Button>
            ) : (
              <Button type="button" disabled={isBusy} onClick={() => void previewProposal()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                Preview
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
        <Tabs
          value={tab}
          onValueChange={(next) => {
            syncEditorsIntoDraft();
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
            <TabsTrigger value="fees">Fees</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="terms">Terms</TabsTrigger>
          </TabsList>

          <div className="pb-24 pt-4">
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
                    {workspace?.status?.replaceAll('_', ' ') || 'DRAFT'}
                  </Badge>
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
              <FieldInput label="Email" type="email" value={draft.email} onChange={(v) => patchDraft({ email: v })} />
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
                  onChange={(v) => patchDraft({ analystHourlyRate: v })}
                />
                <FieldInput
                  label={`Specialist rate (${currencyLabel}/hr)`}
                  type="number"
                  value={draft.specialistHourlyRate}
                  onChange={(v) => patchDraft({ specialistHourlyRate: v })}
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
                <div className="flex items-center justify-between">
                  <FieldLabel>Fee line items</FieldLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addFeeRow}>
                    <Plus className="size-4" />
                    Add row
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Phase</th>
                        <th className="px-2 py-2">Description</th>
                        <th className="w-20 px-2 py-2">Hours</th>
                        <th className="w-24 px-2 py-2">Rate</th>
                        <th className="w-28 px-2 py-2">Fee ({currencyLabel})</th>
                        <th className="w-10 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.contentSnapshot.feeLineItems.map((row, index) => (
                        <tr key={row.id || index} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 bg-white"
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
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 bg-white"
                              type="number"
                              value={row.hours != null ? String(row.hours) : ''}
                              onChange={(e) =>
                                updateFeeLine(
                                  index,
                                  'hours',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              className="h-8 bg-white"
                              type="number"
                              value={row.rate != null ? String(row.rate) : ''}
                              onChange={(e) =>
                                updateFeeLine(
                                  index,
                                  'rate',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1 font-medium">
                            {formatMoney(Number(row.fee) || 0, draft.currency)}
                          </td>
                          <td className="px-2 py-1">
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
                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <FieldInput
                    label={`Expenses estimate (${currencyLabel})`}
                    type="number"
                    value={draft.expensesEstimate}
                    onChange={(v) => patchDraft({ expensesEstimate: v })}
                  />
                  <p className="text-xs text-slate-500 sm:pb-2">
                    Shown after VAT on the PDF and included in the grand total.
                  </p>
                </div>
                {feeTotals ? (
                  <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:justify-items-end">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="font-medium">{formatMoney(feeTotals.subtotal, draft.currency)}</dd>
                    {Number(draft.discount) > 0 ? (
                      <>
                        <dt className="text-slate-500">Discount</dt>
                        <dd>-{formatMoney(Number(draft.discount) || 0, draft.currency)}</dd>
                        <dt className="text-slate-500">After discount</dt>
                        <dd>{formatMoney(feeTotals.discountedSubtotal, draft.currency)}</dd>
                      </>
                    ) : null}
                    <dt className="text-slate-500">VAT</dt>
                    <dd>{formatMoney(feeTotals.vatAmount, draft.currency)}</dd>
                    {Number(draft.expensesEstimate) > 0 ? (
                      <>
                        <dt className="text-slate-500">Expenses (estimated)</dt>
                        <dd>{formatMoney(Number(draft.expensesEstimate) || 0, draft.currency)}</dd>
                      </>
                    ) : null}
                    <dt className="font-semibold text-slate-700">Grand total</dt>
                    <dd className="font-semibold">{formatMoney(feeTotals.grandTotal, draft.currency)}</dd>
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
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved proposal edits. Leave and discard them, or stay and click Save.
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
  );
}
