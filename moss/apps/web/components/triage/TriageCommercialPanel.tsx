'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  Loader2,
  Plus,
  Send,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch, apiFetchBlob } from '@/lib/api';
import { cn } from '@/lib/utils';
import { deriveEgtAssurancePresentation } from '@moss/shared';
import { ProposalWorkspaceDialog } from '@/components/triage/proposal/ProposalWorkspaceDialog';
import type { ProposalValidationIssue, ProposalWorkspace } from '@/components/triage/proposal/proposal-workspace-types';

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

/** Blocking checks aligned with server validateProposalForSend. */
const READINESS_REQUIRED_COUNT = 14;

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

function humanizeProposalStatus(status?: string | null) {
  const map: Record<string, string> = {
    NOT_REQUESTED: 'Not requested',
    REQUESTED: 'Requested',
    IN_PREPARATION: 'In preparation',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    DRAFT: 'Draft',
    INTERNAL_REVIEW: 'Internal review',
    APPROVED: 'Approved',
    VIEWED: 'Viewed',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
    WITHDRAWN: 'Withdrawn',
  };
  if (!status) return '—';
  return map[status] || status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
  const [contactOpen, setContactOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'ACCEPTED' | 'DECLINED' | null>(null);
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    blocking: ProposalValidationIssue[];
  } | null>(null);

  const [contactDraft, setContactDraft] = useState({
    contactMethod: 'CALL',
    outcome: 'INTERESTED',
    notes: '',
    nextFollowUpAt: '',
  });

  const [followUpDraft, setFollowUpDraft] = useState({
    nextFollowUpAt: item.followUp?.nextFollowUpAt
      ? new Date(item.followUp.nextFollowUpAt).toISOString().slice(0, 16)
      : '',
    followUpOwnerId: item.followUpOwnerId || item.commercialOwnerId || '',
    followUpReason: item.followUp?.followUpReason || '',
  });

  const workspace = item.commercialWorkspace || {};
  const template = item.proposalTemplate || {};
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
    setFollowUpDraft({
      nextFollowUpAt: item.followUp?.nextFollowUpAt
        ? new Date(item.followUp.nextFollowUpAt).toISOString().slice(0, 16)
        : '',
      followUpOwnerId: item.followUpOwnerId || item.commercialOwnerId || '',
      followUpReason: item.followUp?.followUpReason || '',
    });
  }, [item.followUp, item.followUpOwnerId, item.commercialOwnerId]);

  useEffect(() => {
    if (focusSection === 'contact') {
      setContactOpen(true);
      document.getElementById('triage-contact-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (focusSection === 'proposal') {
      document.getElementById('triage-proposal-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusSection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await apiFetch<ProposalWorkspace>(
          `/triage/submissions/${submissionId}/proposal-workspace`,
        );
        if (cancelled) return;
        setReadiness({
          ready: Boolean(ws.readyToSend),
          blocking: (ws.validationIssues || []).filter((i) => i.blocking),
        });
      } catch {
        if (!cancelled) setReadiness(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId, activeProposal?.updatedAt, activeProposal?.status, item.proposalStatus]);

  async function run(fn: () => Promise<void>, success?: { title: string; description?: string }) {
    setLocalBusy(true);
    try {
      await fn();
      await onReload();
      if (success) toast({ title: success.title, description: success.description });
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

  async function assignOwner(ownerId: string) {
    const next = ownerId || '';
    if (next === (item.commercialOwnerId || '')) return;
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ commercialOwnerId: next }),
        });
      },
      { title: 'Saved', description: 'Commercial owner updated.' },
    );
  }

  async function saveInterest(value: string) {
    const next = value || 'UNKNOWN';
    if (next === (item.clientInterest || 'UNKNOWN')) return;
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ clientInterest: next }),
        });
      },
      { title: 'Saved', description: 'Client interest updated.' },
    );
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

  async function ensureAndPreview() {
    setLocalBusy(true);
    try {
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

  async function proposalAction(action: 'ACCEPTED' | 'DECLINED') {
    if (!activeProposal?.id) return;
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${submissionId}/proposals/${activeProposal.id}/actions`, {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        setConfirmAction(null);
      },
      {
        title: action === 'ACCEPTED' ? 'Proposal accepted' : 'Proposal declined',
      },
    );
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
  const isDeclined = proposalStatus === 'DECLINED' || leadProposalStatus === 'DECLINED';
  const isAccepted = proposalStatus === 'ACCEPTED' || leadProposalStatus === 'ACCEPTED';
  const proposalIsSent =
    ['SENT', 'VIEWED', 'ACCEPTED', 'DECLINED'].includes(proposalStatus)
    || ['SENT', 'ACCEPTED', 'DECLINED'].includes(leadProposalStatus);
  const hasDocument = Boolean(activeProposal?.documentStorageKey);
  const hasUploadedDocument =
    hasDocument && String(activeProposal?.source || '').toUpperCase() === 'UPLOAD';

  const readinessReady = readiness?.ready ?? false;
  const blockingIssues = readiness?.blocking || [];
  const missingRequiredCount = blockingIssues.length;
  const completeCount = Math.max(0, READINESS_REQUIRED_COUNT - missingRequiredCount);
  const readinessPct = Math.round((completeCount / READINESS_REQUIRED_COUNT) * 100);

  const stepKey = (() => {
    if (isAccepted) return 'accepted';
    if (isDeclined) return 'sent';
    if (proposalIsSent) return 'sent';
    if (hasDocument && readinessReady) return 'ready';
    return 'preparing';
  })();
  const stepIndex = STATUS_STEPS.findIndex((s) => s.key === stepKey);

  const statusBadgeLabel = isDeclined
    ? 'Declined'
    : STATUS_STEPS.find((s) => s.key === stepKey)?.label || humanizeProposalStatus(leadProposalStatus);

  const prospectName =
    [prospect?.firstName, prospect?.lastName].filter(Boolean).join(' ')
    || [item.firstName, item.lastName].filter(Boolean).join(' ')
    || '—';

  const recommendedEngagement =
    triage?.recommendedProduct
    || template.productName
    || 'Executive Advisory Diagnostic';

  const assessmentPresentation = useMemo(() => {
    const assessment = item.assessment;
    if (!assessment) return null;
    return deriveEgtAssurancePresentation({
      overallRiskScore: assessment.overallRiskScore,
      maturityScore: assessment.maturityScore,
      categoryScores: (assessment.categoryScores || []).map((c: any) => ({
        category: String(c.category || c.name || 'Category'),
        score: Number(c.score) || 0,
      })),
    });
  }, [item.assessment]);

  const level1Score =
    triage?.assuranceScore
    ?? assessmentPresentation?.assuranceScore
    ?? null;
  const level1Label =
    triage?.assuranceBandLabel
    || assessmentPresentation?.assuranceBand?.displayLabel
    || null;

  const preparedForName =
    template.addressedTo
    || [item.firstName, item.lastName].filter(Boolean).join(' ')
    || prospectName;
  const preparedForTitle = template.jobTitle || prospect?.jobTitle || '';

  const proposalNumber =
    proposalRequest?.reference || activeProposal?.proposalNumber || 'Not requested';
  const lastUpdated =
    activeProposal?.updatedAt
    || activeProposal?.sentAt
    || proposalRequest?.requestedAt
    || null;

  const showAcceptDecline =
    !isAccepted
    && !isDeclined
    && (['SENT', 'VIEWED'].includes(proposalStatus) || leadProposalStatus === 'SENT');

  return (
    <div className="space-y-4">
      {/* A. Proposal / Commercial summary */}
      <Card id="triage-proposal-section" className="rounded-xl border-slate-200 shadow-sm scroll-mt-24">
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proposal
              </p>
              <p className="m-0 text-xl font-semibold tracking-tight text-slate-900">
                {proposalNumber}
              </p>
              <p className="m-0 text-sm text-slate-500">
                {proposalRequest?.requestedAt
                  ? `Requested ${fmtDate(proposalRequest.requestedAt)}`
                  : 'Not yet requested'}
                {lastUpdated ? ` · Last updated ${fmt(lastUpdated)}` : ''}
              </p>
            </div>
            <Badge
              variant={
                isAccepted
                  ? 'success'
                  : isDeclined
                    ? 'danger'
                    : stepKey === 'sent'
                      ? 'warning'
                      : 'secondary'
              }
              className="shrink-0 whitespace-nowrap"
            >
              {statusBadgeLabel}
            </Badge>
          </div>

          {/* Compact lifecycle stepper — not CTA buttons */}
          <ol className="m-0 flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-0">
            {STATUS_STEPS.map((step, idx) => {
              const done = idx < stepIndex || (step.key === 'accepted' && stepKey === 'accepted');
              const current = !isDeclined && step.key === stepKey;
              const future = idx > stepIndex;
              return (
                <li key={step.key} className="flex items-center gap-2 sm:gap-0">
                  <div
                    className={cn(
                      'inline-flex items-center gap-1.5 text-sm',
                      done && 'font-medium text-slate-800',
                      current && 'font-semibold text-slate-900',
                      future && 'text-slate-400',
                      isDeclined && step.key === 'accepted' && 'text-slate-400',
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
                    ) : current ? (
                      <Circle className="size-3.5 shrink-0 fill-moss-red text-moss-red" aria-hidden />
                    ) : (
                      <Circle className="size-3.5 shrink-0 text-slate-300" aria-hidden />
                    )}
                    <span>{step.label}</span>
                  </div>
                  {idx < STATUS_STEPS.length - 1 ? (
                    <span className="mx-2 hidden text-slate-300 sm:inline" aria-hidden>
                      —
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {isDeclined ? (
            <p className="m-0 text-sm font-medium text-red-700">Declined — outside the acceptance path.</p>
          ) : null}

          {/* Summary grid */}
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="m-0 text-xs font-medium text-slate-500">Commercial owner</p>
              <FilterSelect
                value={item.commercialOwnerId || ''}
                onChange={(v) => void assignOwner(v)}
                disabled={isBusy}
                placeholder="Not assigned"
                includeAll
                emptyValue=""
                aria-label="Commercial owner"
                triggerClassName="mt-1 h-9 w-full max-w-full sm:max-w-[320px]"
                options={ownerOptions}
              />
            </div>

            <div>
              <p className="m-0 text-xs font-medium text-slate-500">Client interest</p>
              <FilterSelect
                value={item.clientInterest || 'UNKNOWN'}
                onChange={(v) => void saveInterest(v)}
                disabled={isBusy}
                includeAll={false}
                placeholder="Unknown"
                aria-label="Client interest"
                triggerClassName="mt-1 h-9 w-full max-w-full sm:max-w-[320px]"
                options={INTEREST_OPTIONS}
              />
            </div>

            <div>
              <p className="m-0 text-xs font-medium text-slate-500">Recommended engagement</p>
              <p className="m-0 mt-1 text-sm font-medium text-slate-900">{recommendedEngagement}</p>
            </div>

            <div>
              <p className="m-0 text-xs font-medium text-slate-500">Proposal status</p>
              <p className="m-0 mt-1 text-sm font-medium text-slate-900">{statusBadgeLabel}</p>
            </div>

            <div>
              <p className="m-0 text-xs font-medium text-slate-500">Prepared for</p>
              <p className="m-0 mt-1 text-sm font-medium text-slate-900">{preparedForName}</p>
              {preparedForTitle ? (
                <p className="m-0 text-sm text-slate-600">{preparedForTitle}</p>
              ) : null}
            </div>

            <div>
              <p className="m-0 text-xs font-medium text-slate-500">Organisation</p>
              <p className="m-0 mt-1 text-sm font-medium text-slate-900">
                {organisation?.name || item.organisationName || '—'}
              </p>
            </div>
          </div>

          {/* Readiness */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <p className="m-0 text-xs font-medium text-slate-500">Proposal readiness</p>
            {readiness == null ? (
              <p className="m-0 mt-2 text-sm text-slate-500">Checking required proposal fields…</p>
            ) : readinessReady ? (
              <div className="mt-2 flex items-start gap-2 text-sm text-emerald-800">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="m-0 font-medium">Ready</p>
                  <p className="m-0 text-slate-600">All required proposal information is complete.</p>
                </div>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="m-0 text-sm font-medium text-slate-800">
                  {completeCount} of {READINESS_REQUIRED_COUNT} required items complete
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${readinessPct}%` }}
                  />
                </div>
                {blockingIssues[0] ? (
                  <p className="m-0 flex items-start gap-1.5 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {blockingIssues[0].message}
                    {blockingIssues.length > 1
                      ? ` (+${blockingIssues.length - 1} more)`
                      : ''}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => setDetailsOpen(true)}
                >
                  Complete missing information
                </Button>
              </div>
            )}
          </div>

          {/* Compact document status */}
          {hasDocument ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="min-w-0">
                <p className="m-0 text-xs font-medium text-slate-500">Document</p>
                <p className="m-0 truncate text-sm font-medium text-slate-900">
                  {hasUploadedDocument
                    ? activeProposal.documentFileName || 'External proposal'
                    : activeProposal.documentFileName || `Proposal v${activeProposal.version || 1}.pdf`}
                </p>
                <p className="m-0 text-xs text-slate-500">
                  {activeProposal.sentAt
                    ? `Sent ${fmt(activeProposal.sentAt)}`
                    : hasUploadedDocument
                      ? `Uploaded ${fmtDate(activeProposal.updatedAt)}`
                      : `Generated ${fmtDate(activeProposal.updatedAt)}`}
                </p>
              </div>
            </div>
          ) : null}

          {/* Contextual actions */}
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {(stepKey === 'ready' || stepKey === 'preparing') && !proposalIsSent ? (
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
              ) : null}
              {proposalIsSent && hasDocument ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void ensureAndPreview()}
                >
                  <Eye className="size-4" />
                  View proposal
                </Button>
              ) : null}
              {stepKey === 'ready' && !proposalIsSent ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy || !readinessReady}
                  onClick={() => void sendProposalToClient()}
                >
                  <Send className="size-4" />
                  Send proposal
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              size="sm"
              className="sm:ml-auto"
              disabled={isBusy}
              onClick={() => setDetailsOpen(true)}
            >
              Open proposal workspace →
            </Button>
          </div>

          {showAcceptDecline ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => setConfirmAction('ACCEPTED')}
              >
                Mark accepted
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => setConfirmAction('DECLINED')}
              >
                Mark declined
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* B. Engagement context */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Engagement context</CardTitle>
          <CardDescription>
            Read-only Level 1 information informing the commercial engagement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Prospect
              </p>
              <p className="m-0 mt-2 font-semibold text-slate-900">{prospectName}</p>
              {prospect?.jobTitle || template.jobTitle ? (
                <p className="m-0 text-sm text-slate-600">{prospect?.jobTitle || template.jobTitle}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Organisation
              </p>
              <p className="m-0 mt-2 font-semibold text-slate-900">
                {organisation?.name || item.organisationName || '—'}
              </p>
              {organisation?.country ? (
                <p className="m-0 text-sm text-slate-600">{organisation.country}</p>
              ) : null}
              {organisation?.industry ? (
                <p className="m-0 text-sm text-slate-600">{organisation.industry}</p>
              ) : null}
              {organisation?.operationalSitesLabel ? (
                <p className="m-0 text-sm text-slate-600">{organisation.operationalSitesLabel}</p>
              ) : null}
              {organisation?.securityExpenditureLabel ? (
                <p className="m-0 text-sm text-slate-600">{organisation.securityExpenditureLabel}</p>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Level 1 indication
              </p>
              {level1Label || level1Score != null || triage ? (
                <>
                  <p className="m-0 mt-2 font-semibold text-slate-900">
                    {level1Label
                      || (level1Score != null ? `Score ${level1Score}` : 'Indication available')}
                  </p>
                  {level1Score != null && level1Label ? (
                    <p className="m-0 text-sm text-slate-600">{level1Score} / 100</p>
                  ) : null}
                  <p className="m-0 mt-3 text-xs font-medium text-slate-500">Recommended next step</p>
                  <p className="m-0 text-sm font-medium text-slate-900">{recommendedEngagement}</p>
                </>
              ) : (
                <p className="m-0 mt-2 text-sm text-muted-foreground">
                  Level 1 indication will appear when scoring is available.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* C. Activity & follow-up */}
      <Card id="triage-contact-section" className="rounded-xl border-slate-200 shadow-sm scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
          <div>
            <CardTitle className="text-base">Activity & follow-up</CardTitle>
            <CardDescription>Commercial contact history and next action.</CardDescription>
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
                  <div key={activity.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <p className="m-0 text-xs text-slate-500">{fmt(activity.contactedAt)}</p>
                    <p className="m-0 text-sm font-medium text-slate-900">
                      {CONTACT_METHODS.find((m) => m.value === activity.contactMethod)?.label
                        || activity.contactMethod}
                      {' · '}
                      {CONTACT_OUTCOMES.find((o) => o.value === activity.outcome)?.label
                        || activity.outcome}
                    </p>
                    {activity.contactedBy ? (
                      <p className="m-0 text-xs text-slate-500">by {personName(activity.contactedBy)}</p>
                    ) : null}
                    {activity.notes ? (
                      <p className="mt-1 line-clamp-2 text-sm text-slate-700">{activity.notes}</p>
                    ) : null}
                  </div>
                ))}
                {!item.contactActivities?.length && !contactOpen ? (
                  <p className="text-sm text-muted-foreground">No commercial activity recorded yet.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
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
                <p className="m-0 text-sm text-slate-500">Not scheduled</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ProposalWorkspaceDialog
        submissionId={submissionId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onSaved={onReload}
        busy={isBusy}
      />

      <AlertDialog open={confirmAction != null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'ACCEPTED' ? 'Mark proposal as accepted?' : 'Mark proposal as declined?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'ACCEPTED'
                ? `This confirms that the client has accepted proposal ${proposalNumber}.`
                : `This records that the client declined proposal ${proposalNumber}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy || !confirmAction}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction) void proposalAction(confirmAction);
              }}
            >
              {confirmAction === 'ACCEPTED' ? 'Confirm acceptance' : 'Confirm decline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isBusy ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" />
          Saving…
        </p>
      ) : null}
    </div>
  );
}
