'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PHYSICAL_RISK_PRODUCTS } from '@moss/shared';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';

export type DeliveryEngagementItem = {
  productCode: string;
  label?: string;
  engagement: {
    id: string;
    reference: string;
    status: string;
    workspaceHref: string;
  } | null;
};

type Props = {
  proposalId: string;
  proposalNumber?: string | null;
  proposalStatus?: string | null;
  organisationName?: string | null;
  items: DeliveryEngagementItem[];
  canCreate: boolean;
  onChanged?: () => Promise<void> | void;
};

function productLabel(code: string, fallback?: string) {
  return (
    fallback ||
    PHYSICAL_RISK_PRODUCTS[code as keyof typeof PHYSICAL_RISK_PRODUCTS]?.name ||
    code.replaceAll('_', ' ')
  );
}

function statusLabel(status?: string | null) {
  if (!status) return '—';
  if (status === 'DRAFT') return 'Not started';
  if (status === 'IN_PROGRESS') return 'In progress';
  return status.replaceAll('_', ' ');
}

export function CreateLevel3EngagementsCard({
  proposalId,
  proposalNumber,
  proposalStatus,
  organisationName,
  items,
  canCreate,
  onChanged,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const pending = useMemo(() => items.filter((i) => !i.engagement), [items]);
  const created = useMemo(() => items.filter((i) => i.engagement), [items]);
  const isAccepted = String(proposalStatus || '').toUpperCase() === 'ACCEPTED';

  useEffect(() => {
    setSelected(pending.map((p) => p.productCode));
  }, [pending]);

  if (!items.length && !isAccepted) return null;

  async function create() {
    if (!selected.length) {
      toast({
        title: 'Select at least one engagement',
        description: 'Choose the Level 3 products to create.',
        variant: 'error',
      });
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{
        createdCount: number;
        existingCount: number;
        failedCount: number;
        results: Array<{ label: string; created: boolean; error: string | null; engagement?: { reference: string } | null }>;
      }>(`/advisory/proposals/${proposalId}/level3-engagements`, {
        method: 'POST',
        body: JSON.stringify({ productCodes: selected }),
      });
      setOpen(false);
      const failed = (result.results || []).filter((r) => r.error);
      toast({
        title:
          result.createdCount > 0
            ? 'Level 3 engagements created'
            : result.existingCount > 0
              ? 'Engagements already exist'
              : 'No engagements created',
        description:
          failed.length > 0
            ? failed.map((f) => `${f.label}: ${f.error}`).join(' · ')
            : `${result.createdCount} created · ${result.existingCount} already existed`,
        ...(failed.length && !result.createdCount ? { variant: 'error' as const } : {}),
      });
      await onChanged?.();
    } catch (e: unknown) {
      toast({
        title: 'Unable to create engagements',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="space-y-1 p-5 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Delivery engagements</CardTitle>
          <CardDescription>
            {isAccepted
              ? 'Focused assurance engagements authorised by this accepted proposal.'
              : 'Level 3 delivery engagements become available after proposal acceptance.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
          {isAccepted ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <p className="m-0 text-sm font-semibold text-emerald-900">Proposal accepted</p>
              <p className="m-0 mt-1 text-sm text-emerald-800">
                {proposalNumber ? `${proposalNumber} · ` : ''}
                Next step: create Level 3 delivery engagements for the accepted scope.
              </p>
            </div>
          ) : null}

          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.productCode}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-slate-900">
                    {productLabel(item.productCode, item.label)}
                  </p>
                  {item.engagement ? (
                    <p className="m-0 mt-0.5 text-xs text-slate-500">
                      {item.engagement.reference} · {statusLabel(item.engagement.status)}
                    </p>
                  ) : (
                    <p className="m-0 mt-0.5 text-xs text-slate-500">
                      {isAccepted ? 'Not created yet' : 'Awaiting proposal acceptance'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.engagement ? (
                    <>
                      <Badge variant="success">Created</Badge>
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href={item.engagement.workspaceHref}>Open</Link>
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {canCreate && isAccepted && pending.length > 0 ? (
            <Button type="button" className="h-10 px-4" disabled={busy} onClick={() => setOpen(true)}>
              Create Level 3 engagements
            </Button>
          ) : null}

          {canCreate && isAccepted && pending.length === 0 && created.length > 0 ? (
            <p className="m-0 text-sm text-slate-600">
              All accepted proposal services already have delivery engagements.
            </p>
          ) : null}

          {isAccepted && !canCreate ? (
            <p className="m-0 text-sm text-slate-600">
              Delivery engagements are created by Physical Risk consultants after acceptance.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Level 3 engagements</DialogTitle>
            <DialogDescription>
              The accepted proposal includes the following focused assurance services.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <dl className="grid gap-1 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Organisation
                </dt>
                <dd className="m-0 font-medium text-slate-900">{organisationName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Source proposal
                </dt>
                <dd className="m-0 font-medium text-slate-900">{proposalNumber || proposalId}</dd>
              </div>
            </dl>
            <ul className="space-y-2">
              {pending.map((item) => {
                const checked = selected.includes(item.productCode);
                return (
                  <li key={item.productCode}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setSelected((prev) =>
                            prev.includes(item.productCode)
                              ? prev.filter((c) => c !== item.productCode)
                              : [...prev, item.productCode],
                          )
                        }
                        className="mt-0.5"
                      />
                      <span className="text-sm font-medium text-slate-900">
                        {productLabel(item.productCode, item.label)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || selected.length === 0} onClick={() => void create()}>
              {busy ? 'Creating…' : 'Create engagements'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
