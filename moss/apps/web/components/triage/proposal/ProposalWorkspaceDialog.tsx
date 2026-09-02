'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Plus,
  Send,
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
import { FilterSelect } from '@/components/ui/filter-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useToast } from '@/components/ui/toast';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { uploadTriageProposal } from '@/lib/triage-proposal-upload';
import { cn } from '@/lib/utils';
import {
  PROPOSAL_CURRENCY_OPTIONS,
  clientFeeTotals,
  currencyUnitLabel,
  draftToPayload,
  normalizeProposalCurrency,
  formatMoney,
  recalcLineItemFee,
  workspaceToDraft,
  type ProposalFeeLineItem,
  type ProposalPhase,
  type ProposalTeamMember,
  type ProposalTimelineRow,
  type ProposalWorkspace,
  type ProposalWorkspaceDraft,
} from './proposal-workspace-types';

const EDITING_TABS = new Set([
  'overview',
  'client',
  'understanding',
  'scope',
  'methodology',
  'fees',
  'timeline',
  'team',
  'terms',
]);

function draftFingerprint(draft: ProposalWorkspaceDraft): string {
  return JSON.stringify(draftToPayload(draft, clientFeeTotals(draft)));
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const minHeight =
    rows <= 2 ? 'min-h-[88px]' : rows <= 3 ? 'min-h-[112px]' : rows <= 6 ? 'min-h-[160px]' : 'min-h-[200px]';
  const maxHeight =
    rows <= 2 ? 'max-h-[200px]' : rows <= 3 ? 'max-h-[260px]' : rows <= 6 ? 'max-h-[360px]' : 'max-h-[480px]';
  return (
    <div className="grid gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <RichTextEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeightClassName={minHeight}
        maxHeightClassName={maxHeight}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn('grid gap-1.5', className)}>
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  onPreview?: () => Promise<void>;
  busy?: boolean;
};

export function ProposalWorkspaceDialog({
  submissionId,
  open,
  onOpenChange,
  onSaved,
  onPreview,
  busy = false,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('overview');
  const [lastEditingTab, setLastEditingTab] = useState('overview');
  const [workspace, setWorkspace] = useState<ProposalWorkspace | null>(null);
  const [draft, setDraft] = useState<ProposalWorkspaceDraft | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const ws = await apiFetch<ProposalWorkspace>(
        `/triage/submissions/${submissionId}/proposal-workspace`,
      );
      const nextDraft = workspaceToDraft(ws);
      setWorkspace(ws);
      setDraft(nextDraft);
      setSavedFingerprint(draftFingerprint(nextDraft));
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Could not load proposal workspace',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [submissionId, toast, onOpenChange]);

  useEffect(() => {
    if (open) {
      void loadWorkspace();
      setTab('overview');
      setLastEditingTab('overview');
      setDiscardOpen(false);
    }
  }, [open, loadWorkspace]);

  const feeTotals = useMemo(() => {
    if (!draft) return null;
    return clientFeeTotals(draft);
  }, [draft]);

  const currencyLabel = draft ? currencyUnitLabel(draft.currency) : 'ZAR';

  const blockingIssues = workspace?.validationIssues?.filter((i) => i.blocking) || [];
  const isDirty = Boolean(draft && savedFingerprint && draftFingerprint(draft) !== savedFingerprint);
  const isPreviewTab = tab === 'preview';

  function selectTab(next: string) {
    if (EDITING_TABS.has(next)) setLastEditingTab(next);
    setTab(next);
  }

  function patchDraft(partial: Partial<ProposalWorkspaceDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function patchContent(partial: Partial<ProposalWorkspaceDraft['contentSnapshot']>) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            contentSnapshot: { ...prev.contentSnapshot, ...partial },
          }
        : prev,
    );
  }

  function updatePhase(index: number, field: keyof ProposalPhase, value: string | number) {
    if (!draft) return;
    const phases = [...draft.contentSnapshot.phases];
    phases[index] = { ...phases[index], [field]: value };
    patchContent({ phases });
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

  function updateFeeRow(index: number, field: keyof ProposalFeeLineItem, value: string | number) {
    if (!draft) return;
    const items = [...draft.contentSnapshot.feeLineItems];
    const row = { ...items[index], [field]: value };
    items[index] = recalcLineItemFee(row);
    patchContent({ feeLineItems: items });
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
    if (!draft) return;
    const rows = [...draft.contentSnapshot.timelineRows];
    rows[index] = { ...rows[index], [field]: value };
    patchContent({ timelineRows: rows });
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

  function updateTeamMember(index: number, field: keyof ProposalTeamMember, value: string) {
    if (!draft) return;
    const members = [...draft.contentSnapshot.teamMembers];
    members[index] = { ...members[index], [field]: value };
    patchContent({ teamMembers: members });
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

  async function persistDraft(opts: { quiet?: boolean } = {}) {
    if (!draft) return false;
    const totals = clientFeeTotals(draft);
    const saved = await apiFetch<ProposalWorkspace>(
      `/triage/submissions/${submissionId}/proposal-workspace`,
      {
        method: 'PATCH',
        body: JSON.stringify(draftToPayload(draft, totals)),
      },
    );
    const nextDraft = workspaceToDraft(saved);
    setWorkspace(saved);
    setDraft(nextDraft);
    setSavedFingerprint(draftFingerprint(nextDraft));
    await onSaved();
    if (!opts.quiet) {
      toast({ title: 'Saved', description: 'Proposal changes saved.' });
    }
    return true;
  }

  async function save() {
    if (!draft || !isDirty) return;
    setSaving(true);
    try {
      await persistDraft();
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
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (onPreview) await onPreview();
  }

  async function previewProposal() {
    if (!draft) return;
    setSaving(true);
    try {
      if (isDirty) await persistDraft({ quiet: true });
      selectTab('preview');
      await openPreviewPdf();
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Preview failed',
        description: e instanceof Error ? e.message : 'Unable to generate preview.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function generatePdf() {
    if (!draft) return;
    setSaving(true);
    try {
      if (isDirty) await persistDraft({ quiet: true });
      await apiFetch(`/triage/submissions/${submissionId}/proposal-generate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadWorkspace();
      await onSaved();
      toast({
        title: 'Proposal PDF generated',
        description: 'The professional proposal document is ready to preview or send.',
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Generate failed',
        description: e instanceof Error ? e.message : 'Unable to generate PDF.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    setSaving(true);
    try {
      if (workspace?.proposalId && workspace.hasDocument) {
        const data = await apiFetch<{ url: string }>(
          `/triage/submissions/${submissionId}/proposals/${workspace.proposalId}/download`,
        );
        if (data?.url) {
          window.open(data.url, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      await openPreviewPdf();
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

  async function sendProposal() {
    const alreadySent = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(
      String(workspace?.status || ''),
    );
    if (!workspace?.readyToSend || alreadySent) return;
    setSaving(true);
    try {
      if (isDirty) await persistDraft({ quiet: true });
      await apiFetch(`/triage/submissions/${submissionId}/proposal-send`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadWorkspace();
      await onSaved();
      toast({
        title: 'Proposal sent successfully',
        description: 'The client has been emailed and status is Sent.',
      });
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
      await onSaved();
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

  function requestClose() {
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function discardAndClose() {
    setDiscardOpen(false);
    setDraft(null);
    setSavedFingerprint('');
    onOpenChange(false);
  }

  const isBusy = busy || loading || saving;
  const proposalSent = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(
    String(workspace?.status || ''),
  );
  const hasDocument = Boolean(workspace?.hasDocument);
  const sendDisabledReason = proposalSent
    ? 'Proposal already sent'
    : !workspace?.readyToSend
      ? blockingIssues.length
        ? `Complete ${blockingIssues.length} required proposal field${blockingIssues.length === 1 ? '' : 's'} before sending.`
        : 'Complete required proposal fields before sending.'
      : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          requestClose();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent
        overlayClassName="z-[11999]"
        className="!flex z-[12000] h-[min(92vh,920px)] max-h-[92vh] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
      >
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle>Proposal workspace</DialogTitle>
          <DialogDescription>
            Structured sections for the Physical Risk landscape proposal PDF
          </DialogDescription>
        </DialogHeader>

        {loading || !draft ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-5 pt-4 sm:px-6">
              <Tabs value={tab} onValueChange={selectTab} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="h-auto max-w-full shrink-0 flex-wrap justify-start gap-1 bg-slate-100 p-1">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="client">Client</TabsTrigger>
                  <TabsTrigger value="understanding">Understanding</TabsTrigger>
                  <TabsTrigger value="scope">Scope</TabsTrigger>
                  <TabsTrigger value="methodology">Methodology</TabsTrigger>
                  <TabsTrigger value="fees">Fees</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="team">Team</TabsTrigger>
                  <TabsTrigger value="terms">Terms</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 pt-4">
                  <TabsContent value="overview" className="mt-0 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="m-0 text-xs text-slate-500">Status</p>
                        <Badge variant="secondary" className="mt-1">
                          {workspace?.status?.replaceAll('_', ' ') || 'DRAFT'}
                        </Badge>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="m-0 text-xs text-slate-500">Version</p>
                        <p className="m-0 mt-1 font-semibold">v{workspace?.version || 1}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="m-0 text-xs text-slate-500">Total (incl. VAT)</p>
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
                        contentClassName="z-[13000]"
                        triggerClassName="h-10 w-full bg-white"
                      />
                      <span className="text-[11px] text-slate-400">
                        Applies to all fee amounts in this proposal and the generated PDF.
                      </span>
                    </label>
                    <FieldInput
                      label="Subtitle"
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
                      value={draft.organisationName}
                      onChange={(v) => patchDraft({ organisationName: v })}
                    />
                    <FieldInput
                      label="Addressed to"
                      value={draft.addressedTo}
                      onChange={(v) => patchDraft({ addressedTo: v })}
                    />
                    <FieldInput
                      label="Job title"
                      value={draft.jobTitle}
                      onChange={(v) => patchDraft({ jobTitle: v })}
                    />
                    <FieldInput
                      label="Email"
                      type="email"
                      value={draft.email}
                      onChange={(v) => patchDraft({ email: v })}
                    />
                    <FieldInput
                      label="Phone"
                      value={draft.phone}
                      onChange={(v) => patchDraft({ phone: v })}
                      className="sm:col-span-2"
                    />
                    <FieldInput
                      label="Project sponsor"
                      value={draft.projectSponsor}
                      onChange={(v) => patchDraft({ projectSponsor: v })}
                    />
                    <FieldInput
                      label="Project champion"
                      value={draft.projectChampion}
                      onChange={(v) => patchDraft({ projectChampion: v })}
                    />
                  </TabsContent>

                  <TabsContent value="understanding" className="mt-0 space-y-4">
                    <FieldTextarea
                      label="Understanding your needs"
                      value={draft.understandingOfNeeds}
                      onChange={(v) => patchDraft({ understandingOfNeeds: v })}
                      rows={8}
                      placeholder="Narrative derived from triage — editable before send"
                    />
                  </TabsContent>

                  <TabsContent value="scope" className="mt-0 space-y-4">
                    <FieldTextarea
                      label="Client objectives"
                      value={draft.clientObjective}
                      onChange={(v) => patchDraft({ clientObjective: v })}
                    />
                    <FieldInput
                      label="Sites / business units"
                      value={draft.sitesOrBusinessUnits}
                      onChange={(v) => patchDraft({ sitesOrBusinessUnits: v })}
                    />
                    <FieldTextarea
                      label="Indicative scope"
                      value={draft.indicativeScope}
                      onChange={(v) => patchDraft({ indicativeScope: v })}
                    />
                    <FieldTextarea
                      label="Approach"
                      value={draft.approach}
                      onChange={(v) => patchDraft({ approach: v })}
                    />
                    <FieldTextarea
                      label="Deliverables"
                      value={draft.deliverables}
                      onChange={(v) => patchDraft({ deliverables: v })}
                    />
                    <FieldTextarea
                      label="Exclusions"
                      value={draft.exclusions}
                      onChange={(v) => patchDraft({ exclusions: v })}
                      rows={3}
                    />
                  </TabsContent>

                  <TabsContent value="methodology" className="mt-0 space-y-4">
                    <FieldTextarea
                      label="Methodology narrative"
                      value={draft.methodology}
                      onChange={(v) => patchDraft({ methodology: v })}
                      rows={6}
                    />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <FieldLabel>Project phases</FieldLabel>
                        <Button type="button" variant="outline" size="sm" onClick={addPhase}>
                          <Plus className="size-4" />
                          Add phase
                        </Button>
                      </div>
                      {draft.contentSnapshot.phases.map((phase, index) => (
                        <div
                          key={`phase-${phase.sequence}-${index}`}
                          className="space-y-2 rounded-lg border border-slate-200 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Input
                              className="bg-white font-medium"
                              value={phase.name}
                              onChange={(e) => updatePhase(index, 'name', e.target.value)}
                              placeholder="Phase name"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removePhase(index)}
                            >
                              <Trash2 className="size-4 text-red-600" />
                            </Button>
                          </div>
                          <RichTextEditor
                            value={phase.keyActivities}
                            onChange={(v) => updatePhase(index, 'keyActivities', v)}
                            placeholder="Key activities"
                            minHeightClassName="min-h-[88px]"
                            maxHeightClassName="max-h-[220px]"
                          />
                          <RichTextEditor
                            value={phase.deliverables}
                            onChange={(v) => updatePhase(index, 'deliverables', v)}
                            placeholder="Deliverables"
                            minHeightClassName="min-h-[88px]"
                            maxHeightClassName="max-h-[220px]"
                          />
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="fees" className="mt-0 space-y-4">
                    <label className="grid max-w-xs gap-1.5">
                      <FieldLabel>Proposal currency</FieldLabel>
                      <FilterSelect
                        value={normalizeProposalCurrency(draft.currency)}
                        onChange={(v) => patchDraft({ currency: normalizeProposalCurrency(v) })}
                        options={[...PROPOSAL_CURRENCY_OPTIONS]}
                        placeholder="Select currency"
                        includeAll={false}
                        contentClassName="z-[13000]"
                        triggerClassName="h-10 w-full bg-white"
                      />
                      <span className="text-[11px] text-slate-400">
                        All rates, fees, and totals below use this currency.
                      </span>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-4">
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
                        label="VAT rate"
                        type="number"
                        value={draft.vatRate}
                        onChange={(v) => patchDraft({ vatRate: v })}
                      />
                    </div>
                    <FieldInput
                      label={`Expenses estimate (${currencyLabel})`}
                      type="number"
                      value={draft.expensesEstimate}
                      onChange={(v) => patchDraft({ expensesEstimate: v })}
                    />
                    <FieldInput
                      label="Payment terms"
                      value={draft.paymentTerms}
                      onChange={(v) => patchDraft({ paymentTerms: v })}
                    />
                    <FieldTextarea
                      label="Fee assumptions"
                      value={draft.contentSnapshot.feeAssumptions.join('\n')}
                      onChange={(v) =>
                        patchContent({
                          feeAssumptions: v ? [v] : [],
                        })
                      }
                      rows={3}
                    />
                    <div className="space-y-2">
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
                              <th className="px-2 py-2 w-20">Hours</th>
                              <th className="px-2 py-2 w-24">Rate</th>
                              <th className="px-2 py-2 w-28">Fee ({currencyLabel})</th>
                              <th className="px-2 py-2 w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {draft.contentSnapshot.feeLineItems.map((row, index) => (
                              <tr key={row.id} className="border-t border-slate-100">
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    value={row.phase}
                                    onChange={(e) => updateFeeRow(index, 'phase', e.target.value)}
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    value={row.description}
                                    onChange={(e) =>
                                      updateFeeRow(index, 'description', e.target.value)
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    type="number"
                                    value={row.hours ?? ''}
                                    onChange={(e) =>
                                      updateFeeRow(
                                        index,
                                        'hours',
                                        e.target.value ? Number(e.target.value) : 0,
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1">
                                  <Input
                                    className="h-8 bg-white"
                                    type="number"
                                    value={row.rate ?? ''}
                                    onChange={(e) =>
                                      updateFeeRow(
                                        index,
                                        'rate',
                                        e.target.value ? Number(e.target.value) : 0,
                                      )
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1 font-medium">
                                  {formatMoney(row.fee, draft.currency)}
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
                      {feeTotals ? (
                        <dl className="grid gap-1 text-sm sm:grid-cols-2 sm:justify-items-end">
                          <dt className="text-slate-500">Subtotal</dt>
                          <dd className="font-medium">{formatMoney(feeTotals.subtotal, draft.currency)}</dd>
                          <dt className="text-slate-500">After discount</dt>
                          <dd>{formatMoney(feeTotals.discountedSubtotal, draft.currency)}</dd>
                          <dt className="text-slate-500">VAT</dt>
                          <dd>{formatMoney(feeTotals.vatAmount, draft.currency)}</dd>
                          <dt className="font-semibold text-slate-700">Grand total</dt>
                          <dd className="font-semibold">{formatMoney(feeTotals.grandTotal, draft.currency)}</dd>
                        </dl>
                      ) : null}
                    </div>
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-0 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldInput
                        label="Estimated project weeks"
                        type="number"
                        value={draft.estimatedProjectWeeks}
                        onChange={(v) => patchDraft({ estimatedProjectWeeks: v })}
                      />
                      <FieldInput
                        label="Timeline summary"
                        value={draft.timeline}
                        onChange={(v) => patchDraft({ timeline: v })}
                      />
                    </div>
                    <FieldTextarea
                      label="Timeline narrative"
                      value={draft.timelineNarrative}
                      onChange={(v) => patchDraft({ timelineNarrative: v })}
                      rows={3}
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <FieldLabel>Gantt rows</FieldLabel>
                        <Button type="button" variant="outline" size="sm" onClick={addTimelineRow}>
                          <Plus className="size-4" />
                          Add row
                        </Button>
                      </div>
                      {draft.contentSnapshot.timelineRows.map((row, index) => (
                        <div key={`tl-${row.sequence}-${index}`} className="grid gap-2 sm:grid-cols-4">
                          <Input
                            className="bg-white sm:col-span-2"
                            placeholder="Activity"
                            value={row.name}
                            onChange={(e) => updateTimeline(index, 'name', e.target.value)}
                          />
                          <Input
                            className="bg-white"
                            type="number"
                            placeholder="Start wk"
                            value={row.startWeek}
                            onChange={(e) =>
                              updateTimeline(index, 'startWeek', Number(e.target.value) || 0)
                            }
                          />
                          <Input
                            className="bg-white"
                            type="number"
                            placeholder="End wk"
                            value={row.endWeek}
                            onChange={(e) =>
                              updateTimeline(index, 'endWeek', Number(e.target.value) || 0)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="team" className="mt-0 space-y-4">
                    <div className="flex items-center justify-between">
                      <FieldLabel>Proposed team</FieldLabel>
                      <Button type="button" variant="outline" size="sm" onClick={addTeamMember}>
                        <Plus className="size-4" />
                        Add member
                      </Button>
                    </div>
                    {draft.contentSnapshot.teamMembers.map((member, index) => (
                      <div
                        key={`team-${member.displayOrder}-${index}`}
                        className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2"
                      >
                        <Input
                          className="bg-white"
                          placeholder="Name"
                          value={member.name}
                          onChange={(e) => updateTeamMember(index, 'name', e.target.value)}
                        />
                        <Input
                          className="bg-white"
                          placeholder="Role"
                          value={member.role}
                          onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                        />
                        <RichTextEditor
                          className="sm:col-span-2"
                          minHeightClassName="min-h-[88px]"
                          maxHeightClassName="max-h-[220px]"
                          placeholder="Biography / summary"
                          value={member.biography || member.summary || ''}
                          onChange={(v) => updateTeamMember(index, 'biography', v)}
                        />
                      </div>
                    ))}
                    {!draft.contentSnapshot.teamMembers.length ? (
                      <p className="text-sm text-muted-foreground">
                        No team members yet. Add profiles or select from the consultant library when
                        available.
                      </p>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="terms" className="mt-0 space-y-4">
                    <FieldTextarea
                      label="Assumptions"
                      value={draft.assumptions}
                      onChange={(v) => patchDraft({ assumptions: v })}
                      rows={4}
                    />
                    <FieldTextarea
                      label="Statement of responsibility"
                      value={draft.statementOfResponsibility}
                      onChange={(v) => patchDraft({ statementOfResponsibility: v })}
                      rows={4}
                    />
                    <FieldTextarea
                      label="Terms and conditions (Appendix A)"
                      value={draft.termsAndConditions}
                      onChange={(v) => patchDraft({ termsAndConditions: v })}
                      rows={8}
                    />
                    <FieldTextarea
                      label="Acceptance terms (Appendix B)"
                      value={draft.acceptanceTerms}
                      onChange={(v) => patchDraft({ acceptanceTerms: v })}
                      rows={6}
                    />
                    <FieldTextarea
                      label="Commercial terms (letter)"
                      value={draft.terms}
                      onChange={(v) => patchDraft({ terms: v })}
                      rows={3}
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-0 space-y-4">
                    <p className="m-0 text-sm text-slate-600">
                      Review the proposal from the footer. Document tools are under More actions.
                      Send proposal is available when all required fields are complete.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="m-0 text-xs text-slate-500">Status</p>
                        <Badge variant="secondary" className="mt-1">
                          {workspace?.status?.replaceAll('_', ' ') || 'DRAFT'}
                        </Badge>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="m-0 text-xs text-slate-500">Version</p>
                        <p className="m-0 mt-1 font-semibold">v{workspace?.version || 1}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <p className="m-0 text-xs text-slate-500">Document</p>
                        <p className="m-0 mt-1 font-semibold">
                          {hasDocument ? 'Available' : 'Not generated'}
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <DialogFooter className="relative z-20 shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={isBusy}
                onClick={requestClose}
              >
                Close
              </Button>

              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" disabled={isBusy} className="w-full sm:w-auto">
                      More actions
                      <ChevronDown className="size-4 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[13000] min-w-[220px]">
                    {isPreviewTab ? (
                      <>
                        <DropdownMenuItem disabled={isBusy} onSelect={() => void downloadPdf()}>
                          <Eye className="size-4" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={isBusy} onSelect={() => void generatePdf()}>
                          <FileText className="size-4" />
                          {hasDocument ? 'Regenerate PDF' : 'Generate PDF'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={isBusy || proposalSent}
                          onSelect={() => fileRef.current?.click()}
                        >
                          <Upload className="size-4" />
                          Upload external proposal
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          disabled={isBusy || proposalSent}
                          onSelect={() => fileRef.current?.click()}
                        >
                          <Upload className="size-4" />
                          Upload external proposal
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={isBusy} onSelect={() => void generatePdf()}>
                          <FileText className="size-4" />
                          Generate PDF
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {isPreviewTab ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={isBusy}
                      onClick={() => selectTab(lastEditingTab || 'overview')}
                    >
                      Back to editing
                    </Button>
                    {proposalSent ? (
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        disabled={isBusy}
                        onClick={() => void openPreviewPdf()}
                      >
                        <Eye className="size-4" />
                        View proposal
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        disabled={isBusy || !workspace?.readyToSend}
                        title={sendDisabledReason || undefined}
                        onClick={() => void sendProposal()}
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                        Send proposal
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={isBusy || !isDirty}
                      onClick={() => void save()}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Save changes'
                      )}
                    </Button>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      disabled={isBusy}
                      onClick={() => void previewProposal()}
                    >
                      {saving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Preview proposal →
                    </Button>
                  </>
                )}
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent overlayClassName="z-[13999]" className="z-[14000]">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have changes that haven&apos;t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                discardAndClose();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
