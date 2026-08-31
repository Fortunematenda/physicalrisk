'use client';

import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Plus,
  Send,
  Upload,
} from 'lucide-react';
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
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { uploadTriageProposal } from '@/lib/triage-proposal-upload';
import { cn } from '@/lib/utils';

const CONTACT_METHODS = [
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'OTHER', label: 'Other' },
];

const CONTACT_OUTCOMES = [
  { value: 'NO_RESPONSE', label: 'No response' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up required' },
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'WANTS_PROPOSAL', label: 'Wants proposal' },
  { value: 'NEEDS_MORE_INFORMATION', label: 'Needs more information' },
  { value: 'DEFERRED', label: 'Deferred' },
  { value: 'CLOSED', label: 'Closed' },
];

const INTEREST_OPTIONS = [
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'INTERESTED', label: 'Interested in Level 2' },
  { value: 'NEEDS_FOLLOW_UP', label: 'Needs follow-up' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
  { value: 'DEFERRED', label: 'Deferred' },
];

const STATUS_STEPS = [
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready to send' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
] as const;

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

function personName(user?: { firstName?: string; lastName?: string; email?: string } | null) {
  if (!user) return '—';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || '—';
}

function proposalStatusLabel(status?: string) {
  if (!status) return '—';
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeProposalStatus(status?: string | null) {
  const map: Record<string, string> = {
    NOT_REQUESTED: 'Not requested',
    REQUESTED: 'Requested',
    IN_PREPARATION: 'In preparation',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    DRAFT: 'Draft',
  };
  return status ? map[status] || proposalStatusLabel(status) : '—';
}

function displayValue(value?: string | number | null, fallback = 'Not completed') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function FieldValue({
  value,
  empty = 'Not completed',
  className,
}: {
  value?: string | number | null;
  empty?: string;
  className?: string;
}) {
  const text = value == null ? '' : String(value).trim();
  if (!text) {
    return <span className={cn('text-amber-700/90', className)}>{empty}</span>;
  }
  return <span className={className}>{text}</span>;
}

function ExpandableTextarea({
  label,
  hint,
  className,
  ...props
}: ComponentProps<typeof Textarea> & { label: string; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Textarea
        {...props}
        className={cn(
          'min-h-[88px] resize-y bg-white field-sizing-content',
          className,
        )}
      />
      {hint ? <span className="text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

function FieldInput({
  label,
  className,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  return (
    <label className={cn('grid gap-1.5', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <Input {...props} className="bg-white" />
    </label>
  );
}

type Props = {
  submissionId: string;
  item: any;
  commercialOwners: any[];
  busy: boolean;
  onReload: () => Promise<void>;
  focusSection?: 'proposal' | 'contact' | null;
  onFocusHandled?: () => void;
};

export function TriageCommercialPanel({
  submissionId,
  item,
  commercialOwners,
  busy,
  onReload,
  focusSection,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    contactMethod: 'CALL',
    outcome: 'INTERESTED',
    notes: '',
    nextFollowUpAt: '',
  });

  const workspace = item.commercialWorkspace || {};
  const scope = workspace.commercialScope || item.scopeDiscussion || {};
  const template = item.proposalTemplate || {};
  const [scopeDraft, setScopeDraft] = useState({
    clientObjectives: scope.clientObjective || scope.clientObjectives || '',
    sitesOrBusinessUnits: scope.sitesOrBusinessUnits || '',
    indicativeScope: scope.indicativeScope || '',
    expectedTimeline: scope.timeline || scope.expectedTimeline || '',
    fee: scope.fee != null ? String(scope.fee) : '',
    currency: scope.currency || 'ZAR',
    terms: scope.terms || '',
    commercialNotes: scope.commercialNotes || '',
  });
  const [templateDraft, setTemplateDraft] = useState({
    organisationName: template.organisationName || item.organisationName || '',
    addressedTo:
      template.addressedTo
      || [item.firstName, item.lastName].filter(Boolean).join(' ')
      || '',
    jobTitle: template.jobTitle || '',
    email: template.email || item.email || '',
    phone: template.phone || item.phone || '',
    introduction: template.introduction || '',
    deliverables: template.deliverables || '',
    terms: template.terms || '',
  });

  const [followUpDraft, setFollowUpDraft] = useState({
    nextFollowUpAt: item.followUp?.nextFollowUpAt
      ? new Date(item.followUp.nextFollowUpAt).toISOString().slice(0, 16)
      : '',
    followUpOwnerId: item.followUpOwnerId || item.commercialOwnerId || '',
    followUpReason: item.followUp?.followUpReason || '',
  });

  const activeProposal = item.activeProposal;
  const isBusy = busy || localBusy;

  const ownerOptions = useMemo(
    () =>
      commercialOwners.map((o) => ({
        value: o.id,
        label: `${o.firstName} ${o.lastName} — ${o.systemRole}`,
      })),
    [commercialOwners],
  );

  useEffect(() => {
    const next = workspace.commercialScope || item.scopeDiscussion || {};
    setScopeDraft({
      clientObjectives: next.clientObjective || next.clientObjectives || '',
      sitesOrBusinessUnits: next.sitesOrBusinessUnits || '',
      indicativeScope: next.indicativeScope || '',
      expectedTimeline: next.timeline || next.expectedTimeline || '',
      fee: next.fee != null ? String(next.fee) : '',
      currency: next.currency || 'ZAR',
      terms: next.terms || '',
      commercialNotes: next.commercialNotes || '',
    });
  }, [workspace.commercialScope, item.scopeDiscussion]);

  useEffect(() => {
    const next = item.proposalTemplate || {};
    setTemplateDraft({
      organisationName: next.organisationName || item.organisationName || '',
      addressedTo:
        next.addressedTo
        || [item.firstName, item.lastName].filter(Boolean).join(' ')
        || '',
      jobTitle: next.jobTitle || '',
      email: next.email || item.email || '',
      phone: next.phone || item.phone || '',
      introduction: next.introduction || '',
      deliverables: next.deliverables || '',
      terms: next.terms || '',
    });
  }, [item.proposalTemplate, item.organisationName, item.firstName, item.lastName, item.email, item.phone]);

  async function run(fn: () => Promise<void>, success?: { title: string; description?: string }) {
    setLocalBusy(true);
    try {
      await fn();
      await onReload();
      if (success) {
        toast({ title: success.title, description: success.description });
      }
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Action failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setLocalBusy(false);
    }
  }

  useEffect(() => {
    if (focusSection === 'contact') setContactOpen(true);
    if (focusSection === 'proposal') {
      const el = document.getElementById('triage-proposal-section');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusSection]);

  async function assignOwner(ownerId: string) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ commercialOwnerId: ownerId || '' }),
      });
    });
  }

  async function saveInterest(value: string) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ clientInterest: value }),
      });
    });
  }

  async function addContact() {
    await run(async () => {
      await apiFetch(`/triage/submissions/${submissionId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          contactMethod: contactDraft.contactMethod,
          outcome: contactDraft.outcome,
          notes: contactDraft.notes,
          nextFollowUpAt: contactDraft.nextFollowUpAt || null,
        }),
      });
      setContactOpen(false);
      setContactDraft({ contactMethod: 'CALL', outcome: 'INTERESTED', notes: '', nextFollowUpAt: '' });
    });
  }

  function templatePayload() {
    return {
      organisationName: templateDraft.organisationName,
      addressedTo: templateDraft.addressedTo,
      jobTitle: templateDraft.jobTitle,
      email: templateDraft.email,
      phone: templateDraft.phone,
      introduction: templateDraft.introduction,
      deliverables: templateDraft.deliverables,
      terms: templateDraft.terms,
      clientObjective: scopeDraft.clientObjectives,
      sitesOrBusinessUnits: scopeDraft.sitesOrBusinessUnits,
      indicativeScope: scopeDraft.indicativeScope,
      timeline: scopeDraft.expectedTimeline,
      fee: scopeDraft.fee ? Number(scopeDraft.fee) : null,
      currency: scopeDraft.currency,
    };
  }

  async function saveProposalDetails() {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}/scope`, {
          method: 'PATCH',
          body: JSON.stringify({
            clientObjectives: scopeDraft.clientObjectives,
            sitesOrBusinessUnits: scopeDraft.sitesOrBusinessUnits,
            indicativeScope: scopeDraft.indicativeScope,
            expectedTimeline: scopeDraft.expectedTimeline,
            commercialNotes: scopeDraft.commercialNotes,
            fee: scopeDraft.fee ? Number(scopeDraft.fee) : null,
            currency: scopeDraft.currency,
            terms: scopeDraft.terms,
          }),
        });
        await apiFetch(`/triage/submissions/${submissionId}/proposal-template`, {
          method: 'PATCH',
          body: JSON.stringify(templatePayload()),
        });
        setDetailsOpen(false);
      },
      { title: 'Proposal details saved' },
    );
  }

  async function ensureAndPreview() {
    setLocalBusy(true);
    try {
      await apiFetch(`/triage/submissions/${submissionId}/proposal-template`, {
        method: 'PATCH',
        body: JSON.stringify(templatePayload()),
      });
      const blob = await apiFetchBlob(`/triage/submissions/${submissionId}/proposal-preview`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await onReload();
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Preview failed',
        description: e instanceof Error ? e.message : 'Unable to generate proposal preview.',
      });
    } finally {
      setLocalBusy(false);
    }
  }

  async function generateProposal() {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}/proposal-template`, {
          method: 'PATCH',
          body: JSON.stringify(templatePayload()),
        });
        await apiFetch(`/triage/submissions/${submissionId}/proposal-generate`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      },
      {
        title: 'Proposal PDF generated',
        description: 'The professional proposal document is ready to preview, download, or send.',
      },
    );
  }

  async function sendProposalToClient() {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}/proposal-send`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
      },
      { title: 'Proposal sent successfully', description: 'The client has been emailed and status is Sent.' },
    );
  }

  async function proposalAction(action: 'SENT' | 'ACCEPTED' | 'DECLINED') {
    if (!activeProposal?.id) return;
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}/proposals/${activeProposal.id}/actions`, {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
      },
      {
        title:
          action === 'SENT'
            ? 'Marked as sent externally'
            : action === 'ACCEPTED'
              ? 'Proposal accepted'
              : 'Proposal declined',
      },
    );
  }

  async function uploadProposal(file: File) {
    setLocalBusy(true);
    try {
      await uploadTriageProposal(submissionId, file);
      await onReload();
      toast({ title: 'Proposal uploaded' });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setLocalBusy(false);
    }
  }

  async function downloadProposal() {
    if (!activeProposal?.id) return;
    const data = await apiFetch<{ url: string }>(
      `/triage/submissions/${submissionId}/proposals/${activeProposal.id}/download`,
    );
    if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
  }

  async function saveFollowUp() {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nextFollowUpAt: followUpDraft.nextFollowUpAt
              ? new Date(followUpDraft.nextFollowUpAt).toISOString()
              : null,
            followUpOwnerId: followUpDraft.followUpOwnerId || null,
            followUpReason: followUpDraft.followUpReason || null,
          }),
        });
        setFollowUpOpen(false);
      },
      { title: 'Follow-up saved' },
    );
  }

  const triage = workspace.triageIndication;
  const prospect = workspace.prospect;
  const organisation = workspace.organisation;
  const proposalRequest = workspace.proposalRequest;
  const proposalStatus = String(activeProposal?.status || '');
  const leadProposalStatus = String(item.proposalStatus || proposalRequest?.status || '');
  const proposalIsSent = ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(proposalStatus)
    || ['SENT', 'ACCEPTED', 'DECLINED'].includes(leadProposalStatus);
  const hasDocument = Boolean(activeProposal?.documentStorageKey);
  const hasUploadedDocument =
    hasDocument && String(activeProposal?.source || '').toUpperCase() === 'UPLOAD';

  const requiredDetails = useMemo(() => {
    const clientObjective = String(scope.clientObjective || scope.clientObjectives || '').trim();
    const sites = String(scope.sitesOrBusinessUnits || '').trim();
    const indicativeScope = String(scope.indicativeScope || '').trim();
    const timeline = String(scope.timeline || scope.expectedTimeline || '').trim();
    const feeOk = scope.fee != null && String(scope.fee).trim() !== '';
    return {
      clientObjective: Boolean(clientObjective),
      sites: Boolean(sites),
      indicativeScope: Boolean(indicativeScope),
      timeline: Boolean(timeline),
      fee: feeOk,
    };
  }, [scope]);

  const missingRequiredCount = Object.values(requiredDetails).filter((v) => !v).length;

  const stepKey = (() => {
    if (['ACCEPTED'].includes(proposalStatus) || leadProposalStatus === 'ACCEPTED') return 'accepted';
    if (['DECLINED'].includes(proposalStatus) || leadProposalStatus === 'DECLINED') return 'sent';
    if (proposalIsSent) return 'sent';
    if (hasDocument && missingRequiredCount === 0) return 'ready';
    return 'preparing';
  })();

  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === stepKey);

  const prospectName =
    [prospect?.firstName, prospect?.lastName].filter(Boolean).join(' ')
    || [item.firstName, item.lastName].filter(Boolean).join(' ')
    || '—';

  return (
    <div className="space-y-4">
      {/* A. Proposal status bar */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proposal
              </p>
              <p className="m-0 text-lg font-semibold text-slate-900">
                {proposalRequest?.reference || activeProposal?.proposalNumber || 'Not requested'}
              </p>
              <p className="m-0 text-sm text-slate-600">
                {humanizeProposalStatus(leadProposalStatus || proposalStatus)}
                {proposalRequest?.requestedAt
                  ? ` · Requested ${fmtDate(proposalRequest.requestedAt)}`
                  : ''}
              </p>
            </div>
            <Badge
              variant={
                stepKey === 'accepted'
                  ? 'success'
                  : stepKey === 'sent'
                    ? 'warning'
                    : 'secondary'
              }
              className="shrink-0 whitespace-nowrap"
            >
              {STATUS_STEPS.find((s) => s.key === stepKey)?.label || 'Preparing'}
            </Badge>
          </div>

          <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
            {STATUS_STEPS.map((step, idx) => {
              const done = idx < stepIndex || (step.key === 'accepted' && stepKey === 'accepted');
              const current = step.key === stepKey;
              return (
                <li
                  key={step.key}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-center text-xs font-semibold',
                    done || current
                      ? 'border-moss-red/30 bg-moss-red/5 text-moss-red'
                      : 'border-slate-200 bg-slate-50 text-slate-400',
                    current && 'ring-1 ring-moss-red/40',
                  )}
                >
                  {step.label}
                </li>
              );
            })}
          </ol>

          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Commercial owner
              </p>
              <FilterSelect
                value={item.commercialOwnerId || ''}
                onChange={(v) => void assignOwner(v)}
                disabled={isBusy}
                placeholder="Assign commercial owner"
                triggerClassName="mt-1 h-9 w-full"
                options={ownerOptions}
              />
            </div>
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Client interest
              </p>
              <FilterSelect
                value={item.clientInterest || 'UNKNOWN'}
                onChange={(v) => void saveInterest(v)}
                disabled={isBusy}
                includeAll={false}
                placeholder="Client interest"
                triggerClassName="mt-1 h-9 w-full"
                options={INTEREST_OPTIONS}
              />
            </div>
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Commercial stage
              </p>
              <p className="m-0 mt-2 text-sm font-medium text-slate-900">
                {item.commercialStageLabel || displayValue(null)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* B. Engagement context */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Engagement context</CardTitle>
          <CardDescription>Read-only prospect, organisation, and Level 1 indication</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prospect
              </p>
              <p className="m-0 mt-1.5 font-semibold text-slate-900">{prospectName}</p>
              {prospect?.jobTitle || template.jobTitle ? (
                <p className="m-0 text-sm text-slate-700">{prospect?.jobTitle || template.jobTitle}</p>
              ) : null}
              <p className="m-0 break-all text-sm text-slate-700">
                {prospect?.email || item.email || '—'}
              </p>
              <p className="m-0 text-sm text-slate-700">{prospect?.phone || item.phone || '—'}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Organisation
              </p>
              <p className="m-0 mt-1.5 font-semibold text-slate-900">
                {organisation?.name || item.organisationName}
              </p>
              {organisation?.country ? (
                <p className="m-0 text-sm text-slate-700">{organisation.country}</p>
              ) : null}
              {organisation?.industry ? (
                <p className="m-0 text-sm text-slate-700">{organisation.industry}</p>
              ) : null}
              {organisation?.operationalSitesLabel ? (
                <p className="m-0 text-sm text-slate-700">{organisation.operationalSitesLabel}</p>
              ) : null}
              {organisation?.securityExpenditureLabel ? (
                <p className="m-0 text-sm text-slate-700">{organisation.securityExpenditureLabel}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Level 1 indication
              </p>
              {triage ? (
                <>
                  <p className="m-0 mt-1.5 text-base font-semibold text-slate-900">
                    {triage.assuranceScore != null ? `${triage.assuranceScore} / 100` : '—'}
                    {triage.assuranceBandLabel ? ` — ${triage.assuranceBandLabel}` : ''}
                  </p>
                  {triage.strongestIndicators?.length ? (
                    <ol className="m-0 mt-2 list-decimal space-y-0.5 pl-4 text-sm text-slate-800">
                      {triage.strongestIndicators.slice(0, 3).map((row: any, idx: number) => (
                        <li key={`${row.category}-${idx}`}>{row.category}</li>
                      ))}
                    </ol>
                  ) : null}
                  <p className="m-0 mt-2 text-sm font-medium text-slate-900">
                    {triage.recommendedProduct || 'Executive Advisory Diagnostic'}
                  </p>
                </>
              ) : (
                <p className="m-0 mt-1.5 text-sm text-muted-foreground">
                  Appears after a proposal is requested.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* C. Proposal details (merged scope + template) */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Proposal details</CardTitle>
            <CardDescription>
              Commercial and client-facing information used to generate the proposal
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => setDetailsOpen(true)}
          >
            Edit proposal details
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              'inline-flex max-w-full items-start gap-2 rounded-lg border px-3 py-2 text-sm',
              missingRequiredCount > 0
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900',
            )}
          >
            {missingRequiredCount > 0 ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <p className="m-0">
              {missingRequiredCount > 0
                ? `${missingRequiredCount} detail${missingRequiredCount === 1 ? '' : 's'} required before this proposal can be sent`
                : 'Proposal details complete'}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Commercial
              </p>
              <dl className="grid gap-2.5 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Client objective</dt>
                  <dd className="mt-0.5 text-slate-800">
                    <FieldValue value={scope.clientObjective || scope.clientObjectives} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">
                    Sites / business units
                  </dt>
                  <dd className="mt-0.5 text-slate-800">
                    <FieldValue value={scope.sitesOrBusinessUnits} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Indicative scope</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">
                    <FieldValue value={scope.indicativeScope} />
                  </dd>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Timeline</dt>
                    <dd className="mt-0.5 text-slate-800">
                      <FieldValue value={scope.timeline || scope.expectedTimeline} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">
                      Professional fee
                    </dt>
                    <dd className="mt-0.5 text-slate-800">
                      <FieldValue
                        value={
                          scope.fee != null ? `${scope.currency || 'ZAR'} ${scope.fee}` : null
                        }
                      />
                    </dd>
                  </div>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Commercial terms</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">
                    <FieldValue value={scope.terms || scope.commercialNotes} empty="—" />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proposal content
              </p>
              <dl className="grid gap-2.5 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Prepared for</dt>
                  <dd className="mt-0.5 text-slate-800">
                    <p className="m-0 font-medium">
                      {template.organisationName || item.organisationName || '—'}
                    </p>
                    <p className="m-0">
                      {template.addressedTo
                        || [item.firstName, item.lastName].filter(Boolean).join(' ')
                        || '—'}
                      {template.jobTitle ? ` · ${template.jobTitle}` : ''}
                    </p>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Triage reference</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {template.triageReference
                      || proposalRequest?.sourceTriageReference
                      || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Triage score</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {template.assuranceScore != null || triage?.assuranceScore != null
                      ? `${template.assuranceScore ?? triage?.assuranceScore} / 100`
                      : '—'}
                    {template.assuranceBandLabel || triage?.assuranceBandLabel
                      ? ` · ${template.assuranceBandLabel || triage?.assuranceBandLabel}`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">
                    Key assurance concerns
                  </dt>
                  <dd className="mt-0.5 text-slate-800">
                    {template.strongestIndicators?.length
                      ? template.strongestIndicators.slice(0, 3).join(', ')
                      : triage?.strongestIndicators?.length
                        ? triage.strongestIndicators
                            .slice(0, 3)
                            .map((r: any) => r.category)
                            .join(', ')
                        : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-slate-500">Introduction</dt>
                  <dd className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-slate-800">
                    {template.introduction || 'Default introduction used on preview.'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* D. Proposal document — main action area */}
      <Card
        id="triage-proposal-section"
        className="rounded-xl border-slate-200 shadow-sm scroll-mt-24"
      >
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Proposal document</CardTitle>
              <CardDescription>
                Preview or generate the branded PDF, then send it to the client
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void ensureAndPreview()}
              >
                <Eye className="size-4" />
                Preview
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void generateProposal()}
              >
                <FileText className="size-4" />
                {hasDocument && !hasUploadedDocument ? 'Regenerate PDF' : 'Generate PDF'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || proposalIsSent}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                {hasUploadedDocument ? 'Replace upload' : 'Upload'}
              </Button>
              {proposalIsSent ? (
                <Button type="button" size="sm" disabled>
                  Sent
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void sendProposalToClient()}
                >
                  <Send className="size-4" />
                  Send to client
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadProposal(file);
              e.target.value = '';
            }}
          />

          {hasUploadedDocument ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <p className="m-0 truncate text-sm font-semibold text-slate-900">
                    {activeProposal.documentFileName || 'Uploaded proposal document'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      {proposalRequest?.reference || activeProposal.proposalNumber || '—'}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      Uploaded{' '}
                      {fmtDate(
                        workspace.proposalDocument?.uploadedAt
                          || activeProposal.updatedAt
                          || activeProposal.createdAt,
                      )}
                    </span>
                    <Badge variant="info" className="shrink-0 whitespace-nowrap">
                      {proposalStatusLabel(activeProposal.status)}
                    </Badge>
                    {activeProposal.sentAt ? (
                      <span>Sent {fmtDate(activeProposal.sentAt)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void downloadProposal()}
                  >
                    Download
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isBusy || proposalIsSent}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Replace upload
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-4">
              <p className="m-0 text-sm text-slate-600">
                No external proposal uploaded. Use Preview / Generate to work with the platform PDF,
                or upload a file prepared outside MOSS.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || proposalIsSent}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" />
                Upload external
              </Button>
            </div>
          )}

          {['SENT', 'VIEWED'].includes(proposalStatus) || leadProposalStatus === 'SENT' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isBusy || proposalStatus === 'ACCEPTED'}
                onClick={() => void proposalAction('ACCEPTED')}
              >
                Mark accepted
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || proposalStatus === 'DECLINED'}
                onClick={() => void proposalAction('DECLINED')}
              >
                Mark declined
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* E. Activity & follow-up (layout merge; deeper timeline in Stage 5) */}
      <Card id="triage-contact-section" className="rounded-xl border-slate-200 shadow-sm scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Activity & follow-up</CardTitle>
            <CardDescription>Contact history and next follow-up</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            disabled={isBusy}
            onClick={() => setContactOpen((v) => !v)}
          >
            <Plus className="size-4" />
            Add activity
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              {contactOpen ? (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FilterSelect
                      value={contactDraft.contactMethod}
                      onChange={(v) => setContactDraft((d) => ({ ...d, contactMethod: v }))}
                      options={CONTACT_METHODS}
                      includeAll={false}
                      placeholder="Method"
                      disabled={isBusy}
                      triggerClassName="h-10 w-full bg-white"
                    />
                    <FilterSelect
                      value={contactDraft.outcome}
                      onChange={(v) => setContactDraft((d) => ({ ...d, outcome: v }))}
                      options={CONTACT_OUTCOMES}
                      includeAll={false}
                      placeholder="Outcome"
                      disabled={isBusy}
                      triggerClassName="h-10 w-full bg-white"
                    />
                  </div>
                  <Textarea
                    rows={2}
                    className="bg-white"
                    placeholder="Notes…"
                    value={contactDraft.notes}
                    onChange={(e) => setContactDraft((d) => ({ ...d, notes: e.target.value }))}
                    disabled={isBusy}
                  />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setContactOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" size="sm" disabled={isBusy} onClick={() => void addContact()}>
                      Save contact
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {(item.contactActivities || []).slice(0, 8).map((activity: any) => (
                  <div key={activity.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="m-0 text-sm font-semibold text-slate-900">
                        {fmt(activity.contactedAt)} ·{' '}
                        {CONTACT_METHODS.find((m) => m.value === activity.contactMethod)?.label
                          || activity.contactMethod}
                      </p>
                      <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                        {CONTACT_OUTCOMES.find((o) => o.value === activity.outcome)?.label
                          || activity.outcome}
                      </Badge>
                    </div>
                    {activity.notes ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700">{activity.notes}</p>
                    ) : null}
                  </div>
                ))}
                {!item.contactActivities?.length && !contactOpen ? (
                  <p className="text-sm text-muted-foreground">No contact activity yet.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Next follow-up
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setFollowUpOpen((v) => !v)}
                >
                  {followUpOpen ? 'Cancel' : item.followUp?.nextFollowUpAt ? 'Edit' : 'Schedule'}
                </Button>
              </div>
              {followUpOpen ? (
                <div className="space-y-3">
                  <Input
                    type="datetime-local"
                    value={followUpDraft.nextFollowUpAt}
                    onChange={(e) =>
                      setFollowUpDraft((d) => ({ ...d, nextFollowUpAt: e.target.value }))
                    }
                  />
                  <FilterSelect
                    value={followUpDraft.followUpOwnerId}
                    onChange={(v) => setFollowUpDraft((d) => ({ ...d, followUpOwnerId: v }))}
                    options={ownerOptions}
                    placeholder="Follow-up owner"
                    triggerClassName="h-10 w-full bg-white"
                  />
                  <Textarea
                    rows={2}
                    className="bg-white"
                    placeholder="Reason / agenda"
                    value={followUpDraft.followUpReason}
                    onChange={(e) =>
                      setFollowUpDraft((d) => ({ ...d, followUpReason: e.target.value }))
                    }
                  />
                  <div className="flex justify-end">
                    <Button type="button" size="sm" disabled={isBusy} onClick={() => void saveFollowUp()}>
                      Save follow-up
                    </Button>
                  </div>
                </div>
              ) : item.followUp?.nextFollowUpAt ? (
                <div className="text-sm">
                  <p className="m-0 font-medium text-slate-900">{fmt(item.followUp.nextFollowUpAt)}</p>
                  <p className="m-0 mt-1 text-slate-600">{personName(item.followUp.followUpOwner)}</p>
                  {item.followUp.followUpReason ? (
                    <p className="m-0 mt-2 text-slate-700">{item.followUp.followUpReason}</p>
                  ) : null}
                </div>
              ) : (
                <p className="m-0 text-sm text-amber-700/90">Not scheduled</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="z-[12000] flex max-h-[90vh] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-12 text-left sm:px-6">
            <DialogTitle>Edit proposal details</DialogTitle>
            <DialogDescription>
              Commercial scope and client-facing content used to generate the proposal PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div>
                  <h3 className="m-0 text-sm font-semibold text-slate-900">Commercial</h3>
                  <p className="m-0 mt-0.5 text-xs text-slate-500">
                    Engagement details for fee, scope, and timeline
                  </p>
                </div>
                <ExpandableTextarea
                  label="Client objective"
                  rows={3}
                  placeholder="What the client wants to achieve…"
                  value={scopeDraft.clientObjectives}
                  onChange={(e) => setScopeDraft((d) => ({ ...d, clientObjectives: e.target.value }))}
                  hint="Drag the bottom-right corner to expand"
                />
                <ExpandableTextarea
                  label="Sites / business units"
                  rows={2}
                  placeholder="Sites or business units in scope…"
                  value={scopeDraft.sitesOrBusinessUnits}
                  onChange={(e) =>
                    setScopeDraft((d) => ({ ...d, sitesOrBusinessUnits: e.target.value }))
                  }
                />
                <ExpandableTextarea
                  label="Indicative scope"
                  rows={3}
                  placeholder="Indicative diagnostic scope…"
                  value={scopeDraft.indicativeScope}
                  onChange={(e) => setScopeDraft((d) => ({ ...d, indicativeScope: e.target.value }))}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <FieldInput
                    label="Timeline"
                    placeholder="e.g. 2 weeks"
                    value={scopeDraft.expectedTimeline}
                    onChange={(e) =>
                      setScopeDraft((d) => ({ ...d, expectedTimeline: e.target.value }))
                    }
                  />
                  <FieldInput
                    label="Fee"
                    placeholder="Amount"
                    value={scopeDraft.fee}
                    onChange={(e) => setScopeDraft((d) => ({ ...d, fee: e.target.value }))}
                  />
                  <FieldInput
                    label="Currency"
                    placeholder="ZAR"
                    value={scopeDraft.currency}
                    onChange={(e) => setScopeDraft((d) => ({ ...d, currency: e.target.value }))}
                  />
                </div>
                <ExpandableTextarea
                  label="Commercial terms"
                  rows={3}
                  placeholder="Payment terms, validity, exclusions…"
                  value={scopeDraft.terms || scopeDraft.commercialNotes}
                  onChange={(e) =>
                    setScopeDraft((d) => ({
                      ...d,
                      terms: e.target.value,
                      commercialNotes: e.target.value,
                    }))
                  }
                />
              </section>

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="m-0 text-sm font-semibold text-slate-900">Proposal content</h3>
                  <p className="m-0 mt-0.5 text-xs text-slate-500">
                    Addressee and letter content embedded in the PDF
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    label="Organisation"
                    placeholder="Company / organisation name"
                    value={templateDraft.organisationName}
                    onChange={(e) =>
                      setTemplateDraft((d) => ({ ...d, organisationName: e.target.value }))
                    }
                  />
                  <FieldInput
                    label="Addressed to"
                    placeholder="Full name"
                    value={templateDraft.addressedTo}
                    onChange={(e) =>
                      setTemplateDraft((d) => ({ ...d, addressedTo: e.target.value }))
                    }
                  />
                  <FieldInput
                    label="Job title"
                    placeholder="Job title"
                    value={templateDraft.jobTitle}
                    onChange={(e) => setTemplateDraft((d) => ({ ...d, jobTitle: e.target.value }))}
                  />
                  <FieldInput
                    label="Email"
                    placeholder="Email address"
                    value={templateDraft.email}
                    onChange={(e) => setTemplateDraft((d) => ({ ...d, email: e.target.value }))}
                  />
                  <FieldInput
                    label="Phone"
                    placeholder="Phone number"
                    className="sm:col-span-2"
                    value={templateDraft.phone}
                    onChange={(e) => setTemplateDraft((d) => ({ ...d, phone: e.target.value }))}
                  />
                </div>
                <ExpandableTextarea
                  label="Introduction"
                  rows={5}
                  className="min-h-[120px]"
                  placeholder="Opening letter paragraphs…"
                  value={templateDraft.introduction}
                  onChange={(e) =>
                    setTemplateDraft((d) => ({ ...d, introduction: e.target.value }))
                  }
                  hint="Drag the bottom-right corner to expand"
                />
                <ExpandableTextarea
                  label="Deliverables"
                  rows={4}
                  placeholder="One deliverable per line…"
                  value={templateDraft.deliverables}
                  onChange={(e) =>
                    setTemplateDraft((d) => ({ ...d, deliverables: e.target.value }))
                  }
                />
                <ExpandableTextarea
                  label="Letter terms"
                  rows={4}
                  placeholder="Commercial terms shown in the proposal letter…"
                  value={templateDraft.terms}
                  onChange={(e) => setTemplateDraft((d) => ({ ...d, terms: e.target.value }))}
                />
              </section>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setDetailsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={isBusy} onClick={() => void saveProposalDetails()}>
              {isBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save proposal details'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isBusy ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
