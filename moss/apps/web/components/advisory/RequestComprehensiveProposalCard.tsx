'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PHYSICAL_RISK_PRODUCTS, isLegacyShield360ProductCode } from '@moss/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

export type EadRecommendationOption = {
  productCode: string;
  label: string;
  sourceModules?: Array<{ moduleCode?: string; moduleName?: string }>;
  includedInActiveProposal?: boolean;
  coverageStatus?: string;
};

export type ComprehensiveProposalSummary = {
  id: string;
  proposalNumber: string;
  status: string;
  workspaceHref: string;
  publicLeadId?: string | null;
  selectedProductCodes?: string[];
  createdAt?: string | null;
  sentAt?: string | null;
  acceptedAt?: string | null;
  poRequirement?: string | null;
  poNumber?: string | null;
  awaitingPo?: boolean;
  canCreateLevel3?: boolean;
} | null;

type Props = {
  assessmentId: string;
  recommendations: EadRecommendationOption[];
  comprehensiveProposal: ComprehensiveProposalSummary;
  canRequest: boolean;
  canOpenWorkspace: boolean;
  onChanged: () => Promise<void> | void;
  /** Compact commercial panel for the outcome top column. */
  variant?: 'full' | 'commercial' | 'recommendations';
  organisationName?: string | null;
};

function humanizeProposalStatus(status?: string | null) {
  const map: Record<string, string> = {
    DRAFT: 'In preparation',
    INTERNAL_REVIEW: 'Internal review',
    APPROVED: 'Approved',
    READY_TO_SEND: 'Ready to send',
    SENT: 'Awaiting client response',
    VIEWED: 'Client viewed — awaiting response',
    CHANGES_REQUESTED: 'Changes requested',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
    WITHDRAWN: 'Withdrawn',
    SUPERSEDED: 'Superseded',
  };
  return map[String(status || '')] || String(status || '—').replaceAll('_', ' ');
}

function productLabel(code: string, fallback?: string) {
  return fallback || PHYSICAL_RISK_PRODUCTS[code as keyof typeof PHYSICAL_RISK_PRODUCTS]?.name || code;
}

function fmtDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** EAD commercial path — accept without returning to Level 1 triage. */
function canMarkAccepted(status: string) {
  return ['DRAFT', 'INTERNAL_REVIEW', 'APPROVED', 'SENT', 'VIEWED'].includes(status);
}

export function RequestComprehensiveProposalCard({
  assessmentId,
  recommendations,
  comprehensiveProposal,
  canRequest,
  canOpenWorkspace,
  onChanged,
  variant = 'full',
  organisationName,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [forceNew, setForceNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [expandedRationale, setExpandedRationale] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [acceptDraft, setAcceptDraft] = useState({
    acceptanceDate: new Date().toISOString().slice(0, 10),
    acceptedByName: '',
    acceptanceMethod: 'SIGNED_PROPOSAL_RECEIVED',
    acceptanceNotes: '',
  });
  const selectable = useMemo(
    () =>
      recommendations.filter(
        (r) => r.productCode && !isLegacyShield360ProductCode(r.productCode),
      ),
    [recommendations],
  );
  const [selected, setSelected] = useState<string[]>([]);

  async function submitAcceptance() {
    const proposal = comprehensiveProposal;
    if (!proposal?.id || !proposal.publicLeadId) {
      toast({
        variant: 'error',
        title: 'Unable to accept',
        description: 'Proposal commercial record is missing.',
      });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('acceptanceDate', acceptDraft.acceptanceDate);
      form.append('acceptedByName', acceptDraft.acceptedByName);
      form.append('acceptanceMethod', acceptDraft.acceptanceMethod);
      form.append('acceptanceNotes', acceptDraft.acceptanceNotes);
      if (signedFile) form.append('signedFile', signedFile);
      await apiFetch(
        `/triage/submissions/${proposal.publicLeadId}/proposals/${proposal.id}/accept`,
        { method: 'POST', body: form },
      );
      setAcceptOpen(false);
      setSignedFile(null);
      toast({ variant: 'success', title: 'Proposal accepted' });
      await onChanged();
    } catch (e: unknown) {
      toast({
        variant: 'error',
        title: 'Acceptance failed',
        description: e instanceof Error ? e.message : 'Could not mark the proposal accepted.',
      });
    } finally {
      setBusy(false);
    }
  }

  function openAcceptDialog() {
    setAcceptDraft((d) => ({
      ...d,
      acceptedByName: d.acceptedByName || organisationName || '',
      acceptanceDate: new Date().toISOString().slice(0, 10),
    }));
    setAcceptOpen(true);
  }

  const acceptDialog = (
    <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark proposal as accepted</DialogTitle>
          <DialogDescription>
            Record client acceptance on this Executive Advisory proposal. After acceptance you can
            create Level 3 focused assurance engagements — without returning to triage.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Acceptance date</span>
            <Input
              type="date"
              value={acceptDraft.acceptanceDate}
              onChange={(e) => setAcceptDraft((d) => ({ ...d, acceptanceDate: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Accepted by</span>
            <Input
              value={acceptDraft.acceptedByName}
              onChange={(e) => setAcceptDraft((d) => ({ ...d, acceptedByName: e.target.value }))}
              placeholder="Client signatory name"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Acceptance method</span>
            <FilterSelect
              value={acceptDraft.acceptanceMethod}
              onChange={(v) => setAcceptDraft((d) => ({ ...d, acceptanceMethod: v }))}
              placeholder="Select method"
              includeAll={false}
              options={[
                { value: 'SIGNED_PROPOSAL_RECEIVED', label: 'Signed proposal received' },
                { value: 'EMAIL_CONFIRMATION', label: 'Email confirmation' },
                { value: 'MANUAL_CONFIRMATION', label: 'Manual confirmation' },
                { value: 'OTHER', label: 'Other' },
              ]}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <Textarea
              value={acceptDraft.acceptanceNotes}
              onChange={(e) => setAcceptDraft((d) => ({ ...d, acceptanceNotes: e.target.value }))}
              rows={3}
              placeholder="Optional notes"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Signed proposal PDF</span>
            <Input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setSignedFile(e.target.files?.[0] || null)}
            />
            <span className="text-xs text-slate-500">
              Required when the proposal has not been generated yet — this file is stored as the
              proposal document and marks acceptance.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setAcceptOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submitAcceptance()}>
            {busy ? 'Saving…' : 'Mark accepted'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function openRequestDialog(nextForceNew = false) {
    if (comprehensiveProposal && !nextForceNew) {
      setDuplicateOpen(true);
      return;
    }
    setForceNew(nextForceNew);
    setSelected(selectable.map((r) => r.productCode));
    setRequestNote('');
    setOpen(true);
  }

  function toggleCode(code: string) {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function submit() {
    if (!selected.length) {
      toast({
        title: 'Select at least one engagement',
        description: 'Choose one or more recommended engagements for the proposal.',
        variant: 'error',
      });
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{
        alreadyExists?: boolean;
        proposalNumber?: string;
        status?: string;
        workspaceHref?: string;
        message?: string;
      }>(`/advisory/${assessmentId}/comprehensive-proposal`, {
        method: 'POST',
        body: JSON.stringify({
          productCodes: selected,
          requestNote: requestNote.trim() || undefined,
          forceNew: forceNew || undefined,
        }),
      });
      if (result.alreadyExists && !forceNew) {
        setOpen(false);
        setDuplicateOpen(true);
        await onChanged();
        return;
      }
      setOpen(false);
      setDuplicateOpen(false);
      setForceNew(false);
      toast({
        title: 'Proposal request created',
        description: result.proposalNumber
          ? `${result.proposalNumber} · ${humanizeProposalStatus(result.status)}`
          : 'Physical Risk can now prepare the comprehensive proposal.',
      });
      await onChanged();
    } catch (e: unknown) {
      toast({
        title: 'Unable to request proposal',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!selectable.length && !comprehensiveProposal) {
    return null;
  }

  const dialogs = (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {forceNew ? 'Create another comprehensive proposal' : 'Request comprehensive proposal'}
            </DialogTitle>
            <DialogDescription>
              Select the recommended engagements to include. Physical Risk will prepare one
              consolidated proposal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-slate-800">Recommended engagements</p>
            <ul className="space-y-2">
              {selectable.map((r) => {
                const checked = selected.includes(r.productCode);
                return (
                  <li key={r.productCode}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleCode(r.productCode)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 text-sm font-medium text-slate-900">
                        {productLabel(r.productCode, r.label)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="space-y-1.5 pt-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="ead-proposal-note">
                Additional context / proposal request note
                <span className="ml-1 font-normal text-slate-500">(optional)</span>
              </label>
              <Textarea
                id="ead-proposal-note"
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="e.g. Please include an option for an onsite workshop and implementation support."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => void submit()}
            >
              {busy ? 'Requesting…' : 'Request proposal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>A proposal already exists for this report</DialogTitle>
            <DialogDescription>
              {comprehensiveProposal ? (
                <>
                  <strong>{comprehensiveProposal.proposalNumber}</strong>
                  {' · '}
                  {humanizeProposalStatus(comprehensiveProposal.status)}
                </>
              ) : (
                'Open the existing proposal, or create another deliberately.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {comprehensiveProposal && canOpenWorkspace ? (
              <Button asChild className="h-10 px-4">
                <Link href={comprehensiveProposal.workspaceHref}>Open proposal</Link>
              </Button>
            ) : null}
            {canRequest ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 px-4"
                disabled={busy}
                onClick={() => {
                  setDuplicateOpen(false);
                  openRequestDialog(true);
                }}
              >
                Create another proposal
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {acceptDialog}
    </>
  );

  if (variant === 'commercial') {
    return (
      <>
        <CommercialNextStepPanel
          recommendationCount={selectable.length}
          comprehensiveProposal={comprehensiveProposal}
          canRequest={canRequest}
          canOpenWorkspace={canOpenWorkspace}
          busy={busy}
          onRequest={() => openRequestDialog(false)}
          onAccept={canOpenWorkspace ? openAcceptDialog : undefined}
        />
        {dialogs}
      </>
    );
  }

  if (variant === 'recommendations') {
    return (
      <>
        <RecommendationsGrid
          selectable={selectable}
          comprehensiveProposal={comprehensiveProposal}
          expandedRationale={expandedRationale}
          setExpandedRationale={setExpandedRationale}
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <RecommendationsGrid
          selectable={selectable}
          comprehensiveProposal={comprehensiveProposal}
          expandedRationale={expandedRationale}
          setExpandedRationale={setExpandedRationale}
        />
        <CommercialNextStepPanel
          recommendationCount={selectable.length}
          comprehensiveProposal={comprehensiveProposal}
          canRequest={canRequest}
          canOpenWorkspace={canOpenWorkspace}
          busy={busy}
          onRequest={() => openRequestDialog(false)}
          onAccept={canOpenWorkspace ? openAcceptDialog : undefined}
        />
      </div>
      {dialogs}
    </>
  );
}

function RecommendationsGrid({
  selectable,
  comprehensiveProposal,
  expandedRationale,
  setExpandedRationale,
}: {
  selectable: EadRecommendationOption[];
  comprehensiveProposal: ComprehensiveProposalSummary;
  expandedRationale: string | null;
  setExpandedRationale: (code: string | null) => void;
}) {
  if (!selectable.length) return null;
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="space-y-1 p-5 sm:p-6">
        <CardTitle className="text-base sm:text-lg">Recommended next engagements</CardTitle>
        <CardDescription>
          Focused assurance products arising from the diagnostic findings.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
        <ul className="grid gap-3 sm:grid-cols-2">
          {selectable.map((r) => {
            const modules = (r.sourceModules || [])
              .map((m) => m.moduleName || m.moduleCode)
              .filter(Boolean) as string[];
            const open = expandedRationale === r.productCode;
            const included = Boolean(r.includedInActiveProposal);
            return (
              <li
                key={r.productCode}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <p className="m-0 text-sm font-semibold leading-snug text-slate-900">
                  {productLabel(r.productCode, r.label)}
                </p>
                <p className="m-0 mt-2 text-xs text-slate-600">
                  Triggered by {modules.length || 1} diagnostic area
                  {modules.length === 1 ? '' : 's'}
                </p>
                {comprehensiveProposal ? (
                  included ? (
                    <Badge variant="success" className="mt-2">
                      In proposal
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="mt-2">
                      Not in this proposal
                    </Badge>
                  )
                ) : null}
                {modules.length ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#c41230] underline-offset-2 hover:underline"
                      onClick={() => setExpandedRationale(open ? null : r.productCode)}
                    >
                      View rationale
                      {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                    {open ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                        {modules.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function CommercialNextStepPanel({
  recommendationCount,
  comprehensiveProposal,
  canRequest,
  canOpenWorkspace,
  busy,
  onRequest,
  onAccept,
}: {
  recommendationCount: number;
  comprehensiveProposal: ComprehensiveProposalSummary;
  canRequest: boolean;
  canOpenWorkspace: boolean;
  busy: boolean;
  onRequest: () => void;
  onAccept?: () => void;
}) {
  const status = String(comprehensiveProposal?.status || '');
  const selectedCount = comprehensiveProposal?.selectedProductCodes?.length || recommendationCount;
  const showAccept =
    Boolean(onAccept) &&
    Boolean(comprehensiveProposal?.id) &&
    Boolean(comprehensiveProposal?.publicLeadId) &&
    canMarkAccepted(status);
  const isSent = status === 'SENT' || status === 'VIEWED';
  const isAccepted = status === 'ACCEPTED';
  const isPreparing =
    Boolean(comprehensiveProposal) && !isSent && !isAccepted && status !== 'DECLINED';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Commercial next step
      </p>

      {!comprehensiveProposal ? (
        <div className="mt-3 space-y-3">
          <p className="m-0 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{recommendationCount}</span>
            {' '}
            recommendation{recommendationCount === 1 ? '' : 's'} ready for a Level 3 proposal.
          </p>
          {canRequest ? (
            <Button type="button" className="h-10 w-full sm:w-auto" disabled={busy} onClick={onRequest}>
              Request proposal
            </Button>
          ) : (
            <p className="m-0 text-sm text-slate-600">Physical Risk will prepare the next commercial step.</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <p className="m-0 text-base font-semibold text-slate-900">
              {comprehensiveProposal.proposalNumber}
            </p>
            <p className="m-0 text-sm text-slate-600">
              {humanizeProposalStatus(status)}
              {selectedCount ? ` · ${selectedCount} engagement${selectedCount === 1 ? '' : 's'}` : ''}
              {fmtDate(comprehensiveProposal.sentAt) ? ` · Sent ${fmtDate(comprehensiveProposal.sentAt)}` : ''}
              {fmtDate(comprehensiveProposal.acceptedAt)
                ? ` · Accepted ${fmtDate(comprehensiveProposal.acceptedAt)}`
                : ''}
              {comprehensiveProposal.awaitingPo
                ? ' · Awaiting PO'
                : comprehensiveProposal.poNumber
                  ? ` · PO ${comprehensiveProposal.poNumber}`
                  : ''}
            </p>
          </div>

          {/* One primary action per stage — avoid competing View/Open/Send buttons */}
          <div className="flex flex-wrap gap-2">
            {!canOpenWorkspace ? (
              <p className="m-0 text-sm text-slate-600">Physical Risk is preparing your proposal.</p>
            ) : isAccepted ? (
              <Button asChild variant="outline" className="h-10 px-4">
                <Link href={comprehensiveProposal.workspaceHref}>Open proposal</Link>
              </Button>
            ) : isSent || status === 'CHANGES_REQUESTED' ? (
              <>
                {showAccept ? (
                  <Button type="button" className="h-10 px-4" disabled={busy} onClick={onAccept}>
                    Mark accepted
                  </Button>
                ) : null}
                <Button asChild variant="outline" className="h-10 px-4">
                  <Link href={comprehensiveProposal.workspaceHref}>
                    {status === 'CHANGES_REQUESTED' ? 'Revise proposal' : 'View / resend proposal'}
                  </Link>
                </Button>
              </>
            ) : isPreparing ? (
              <Button asChild className="h-10 px-4">
                <Link href={comprehensiveProposal.workspaceHref}>Continue proposal</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="h-10 px-4">
                <Link href={comprehensiveProposal.workspaceHref}>Open proposal</Link>
              </Button>
            )}
          </div>
          {isAccepted && comprehensiveProposal.awaitingPo ? (
            <p className="m-0 text-sm text-amber-900">
              Proposal accepted — Purchase Order required before Level 3 work can commence.
            </p>
          ) : isAccepted ? (
            <p className="m-0 text-sm text-emerald-800">
              Next: create Level 3 engagements below.
            </p>
          ) : isSent ? (
            <p className="m-0 text-sm text-slate-600">
              Awaiting client response via the secure proposal link. You can also mark accepted
              manually if acceptance arrived offline.
            </p>
          ) : status === 'CHANGES_REQUESTED' ? (
            <p className="m-0 text-sm text-amber-900">
              Client requested changes. Revise the proposal version and resend when ready.
            </p>
          ) : showAccept ? (
            <p className="m-0 text-xs text-slate-500">
              After the client accepts, mark it here to unlock Level 3.
            </p>
          ) : isPreparing ? (
            <p className="m-0 text-xs text-slate-500">
              Edit and submit the proposal from the workspace. PDF preview is there too.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
