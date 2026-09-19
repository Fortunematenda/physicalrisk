'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PHYSICAL_RISK_PRODUCTS, isLegacyShield360ProductCode } from '@moss/shared';
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
  selectedProductCodes?: string[];
} | null;

type Props = {
  assessmentId: string;
  recommendations: EadRecommendationOption[];
  comprehensiveProposal: ComprehensiveProposalSummary;
  canRequest: boolean;
  canOpenWorkspace: boolean;
  onChanged: () => Promise<void> | void;
};

function humanizeProposalStatus(status?: string | null) {
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
  return map[String(status || '')] || String(status || '—').replaceAll('_', ' ');
}

function productLabel(code: string, fallback?: string) {
  return fallback || PHYSICAL_RISK_PRODUCTS[code as keyof typeof PHYSICAL_RISK_PRODUCTS]?.name || code;
}

export function RequestComprehensiveProposalCard({
  assessmentId,
  recommendations,
  comprehensiveProposal,
  canRequest,
  canOpenWorkspace,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [forceNew, setForceNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const selectable = useMemo(
    () =>
      recommendations.filter(
        (r) => r.productCode && !isLegacyShield360ProductCode(r.productCode),
      ),
    [recommendations],
  );
  const [selected, setSelected] = useState<string[]>([]);

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

  return (
    <>
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="space-y-1 p-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Recommended next engagements</CardTitle>
          <CardDescription>
            These recommendations arise from the Executive Advisory Diagnostic findings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
          <ul className="space-y-3">
            {selectable.map((r) => {
              const modules = (r.sourceModules || [])
                .map((m) => m.moduleName || m.moduleCode)
                .filter(Boolean)
                .join(', ');
              const included = Boolean(r.includedInActiveProposal);
              return (
                <li
                  key={r.productCode}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-slate-900">
                        {productLabel(r.productCode, r.label)}
                      </p>
                      {modules ? (
                        <p className="m-0 mt-1 text-xs text-slate-500">
                          Recommended from: {modules}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="info">Recommended</Badge>
                      {comprehensiveProposal ? (
                        included ? (
                          <Badge variant="success">In proposal</Badge>
                        ) : (
                          <Badge variant="secondary">Not included in this proposal</Badge>
                        )
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {comprehensiveProposal ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Proposal
                </p>
                <p className="m-0 text-sm font-semibold text-slate-900">
                  {comprehensiveProposal.proposalNumber}
                  <span className="ml-2 font-normal text-slate-600">
                    · {humanizeProposalStatus(comprehensiveProposal.status)}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canOpenWorkspace ? (
                  <Button asChild className="h-10 px-4">
                    <Link href={comprehensiveProposal.workspaceHref}>Open proposal workspace</Link>
                  </Button>
                ) : (
                  <p className="m-0 self-center text-sm text-slate-600">
                    Physical Risk is preparing your proposal.
                  </p>
                )}
                {canRequest ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4"
                    disabled={busy}
                    onClick={() => openRequestDialog(true)}
                  >
                    Request another
                  </Button>
                ) : null}
              </div>
            </div>
          ) : canRequest ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Proposal
                </p>
                <p className="m-0 text-sm text-slate-700">Not requested</p>
              </div>
              <Button
                type="button"
                className="h-10 px-4"
                disabled={busy}
                onClick={() => openRequestDialog(false)}
              >
                Request comprehensive proposal
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
              <p className="text-xs text-slate-500">
                For proposal preparation only — not automatically included in the client-facing proposal.
              </p>
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
    </>
  );
}
