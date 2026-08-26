'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  PHYSICAL_RISK_PRODUCTS,
} from '@moss/shared';
import { CheckCircle2, ChevronRight, FileText, Lock, NotebookPen } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PRODUCT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PHYSICAL_RISK_PRODUCTS).map(([code, v]) => [code, v.name]),
);

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function engagementHref(productCode: string, id: string) {
  return productCode === 'SCLI_COST_LEAKAGE' ? `/assessments/${id}` : `/advisory/${id}`;
}

function humanizeStatus(value?: string | null) {
  if (!value) return '—';
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'In progress',
    SUBMITTED: 'Submitted',
    AWAITING_REVIEW: 'Awaiting review',
    REVIEWED: 'Reviewed',
    APPROVED: 'Approved',
    REPORT_GENERATED: 'Report generated',
    REPORT_ISSUED: 'Report issued',
    CLOSED: 'Closed',
    NOT_REQUESTED: 'Not requested',
    REQUESTED: 'Requested',
    IN_PREPARATION: 'In preparation',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
    CANCELLED: 'Cancelled',
  };
  return map[value] || value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Persisted completion: outcome confirmed and/or terminal engagement status. */
function isDiagnosticCompleted(engagement: { status?: string | null }, outcome: { confirmedAt?: string | null }) {
  if (outcome?.confirmedAt) return true;
  const status = String(engagement?.status || '');
  return ['REPORT_ISSUED', 'REPORT_GENERATED', 'CLOSED', 'APPROVED'].includes(status);
}

function MetricTile({
  value,
  label,
  tone = 'default',
}: {
  value: ReactNode;
  label: string;
  tone?: 'default' | 'success' | 'neutral';
}) {
  return (
    <Card
      className={cn(
        'min-w-0 rounded-xl shadow-sm',
        tone === 'success' && 'border-moss-success/30 bg-moss-success/[0.04]',
        tone === 'neutral' && 'border-slate-300 bg-slate-50/80',
        tone === 'default' && 'border-slate-200',
      )}
    >
      <CardContent className="space-y-1 p-4 sm:p-5">
        <p
          className={cn(
            'truncate text-2xl font-bold tracking-tight',
            tone === 'success' && 'text-moss-success',
            tone === 'neutral' && 'text-slate-700',
            tone === 'default' && 'text-slate-900',
          )}
        >
          {value}
        </p>
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function RationaleBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 180 || text.split(/\n/).length > 3;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Diagnostic rationale</p>
      <p
        className={cn(
          'text-sm leading-relaxed text-slate-700',
          !expanded && long && '[display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden',
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          className="text-xs font-semibold text-[#c41230] underline-offset-2 hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

export default function AdvisoryOutcomePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const row = await apiFetch<any>(`/advisory/${id}/outcome`);
    setData(row);
    setNotes(row.outcome?.commercialAdminNotes || '');
    return row;
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  async function commercialAction(action: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/advisory/${id}/commercial-proposal`, {
        method: 'POST',
        body: JSON.stringify({ action, commercialAdminNotes: notes }),
      });
      setNotice(`Commercial status updated (${action.toLowerCase()}).`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createEngagement(routeId: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await apiFetch<any>(`/advisory/${id}/routes/${routeId}/create-engagement`, { method: 'POST' });
      setNotice(
        r.created
          ? `Level 3 engagement ${r.engagement.reference} created.`
          : `Engagement ${r.engagement.reference} already exists.`,
      );
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const routes = useMemo(() => (data?.outcome?.routes || []) as any[], [data]);
  const papersReady = useMemo(
    () => routes.filter((r) => Boolean(r.createdAssessment?.id)).length,
    [routes],
  );
  const awaitingSetup = useMemo(() => routes.length - papersReady, [routes, papersReady]);

  if (!data) {
    return (
      <AuthGate>
        <Shell title="Diagnostic outcome">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load outcome</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          )}
        </Shell>
      </AuthGate>
    );
  }

  const { engagement, outcome } = data;
  const commercialStatus = String(outcome.commercialStatus || 'NOT_REQUESTED');
  const accepted = commercialStatus === 'ACCEPTED';
  const canManageCommercial = Boolean(data.permissions?.canManageCommercial);
  const confirmedByName = [outcome.confirmedBy?.firstName, outcome.confirmedBy?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const diagnosticName = engagement.productLabel || engagement.title || 'Executive Advisory Diagnostic';
  const completed = isDiagnosticCompleted(engagement, outcome);

  return (
    <AuthGate>
      <Shell title={`Diagnostic outcome · ${engagement.reference}`} hideSearch>
        <div className="outcome-workspace space-y-4 pb-8">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {notice ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-950">
              <AlertTitle>Updated</AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}

          {/* 1. Page header — completed treatment from persisted status */}
          <Card
            className={cn(
              'overflow-hidden rounded-xl shadow-sm',
              completed
                ? 'border-moss-success/35 bg-gradient-to-br from-moss-success/[0.06] via-white to-white'
                : 'border-slate-200',
            )}
          >
            {completed ? (
              <div className="h-1 w-full bg-moss-success" aria-hidden="true" />
            ) : null}
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0 flex-1 space-y-3">
                {completed ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-moss-success">
                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                      Completed
                    </span>
                    <Badge
                      variant="success"
                      className="shrink-0 gap-1 whitespace-nowrap px-2.5 py-1 text-xs"
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      <span>Completed</span>
                    </Badge>
                  </div>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Diagnostic outcome
                  </p>
                )}

                <div className="space-y-1">
                  <h1 className="max-w-3xl text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                    {diagnosticName}
                  </h1>
                  <p className="text-sm font-semibold tracking-wide text-slate-500">
                    {engagement.reference}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                  <span>{engagement.organisation?.name || 'Organisation'}</span>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span>{humanizeStatus(engagement.status)}</span>
                </div>

                {completed ? (
                  <div className="space-y-0.5 text-sm text-slate-700">
                    <p>
                      <span className="font-medium">Completed</span>{' '}
                      <time dateTime={outcome.confirmedAt || undefined}>{fmt(outcome.confirmedAt)}</time>
                    </p>
                    <p className="text-slate-600">
                      Confirmed by {confirmedByName || '—'}
                      {outcome.confirmedBy?.email ? (
                        <span className="text-slate-400"> · {outcome.confirmedBy.email}</span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="h-11 shrink-0 whitespace-nowrap px-4"
                >
                  <Link href={`/advisory/${id}`}>
                    <NotebookPen className="size-4" />
                    Open working papers
                  </Link>
                </Button>
                {engagement.reports?.[0]?.id ? (
                  <Button
                    variant="outline"
                    size="lg"
                    asChild
                    className="h-11 shrink-0 whitespace-nowrap px-4"
                  >
                    <Link href={`/reports/${engagement.reports[0].id}?view=advisory`}>
                      <FileText className="size-4" />
                      View diagnostic report
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    asChild
                    className="h-11 shrink-0 whitespace-nowrap px-4"
                  >
                    <Link href={`/advisory/${id}`}>Generate report</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Completion summary */}
          {completed ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <Card className="rounded-xl border-moss-success/30 bg-moss-success/[0.04] shadow-sm">
                <CardContent className="flex gap-3 p-4 sm:p-5">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-moss-success"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 space-y-2">
                    <p className="m-0 text-sm font-semibold text-moss-success">Diagnostic completed</p>
                    <p className="m-0 text-sm text-slate-700">
                      The diagnostic has been confirmed and the Level 3 routing outcome has been locked.
                    </p>
                    <dl className="grid gap-2 pt-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Confirmed
                        </dt>
                        <dd className="m-0 font-medium text-slate-900">
                          <time dateTime={outcome.confirmedAt || undefined}>{fmt(outcome.confirmedAt)}</time>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Confirmed by
                        </dt>
                        <dd className="m-0 font-medium text-slate-900">{confirmedByName || '—'}</dd>
                      </div>
                    </dl>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-300 bg-slate-50/90 shadow-sm">
                <CardContent className="flex gap-3 p-4 sm:p-5">
                  <Lock className="mt-0.5 size-5 shrink-0 text-slate-600" aria-hidden="true" />
                  <div className="min-w-0 space-y-1">
                    <p className="m-0 text-sm font-semibold text-slate-800">Outcome locked</p>
                    <p className="m-0 text-sm text-slate-600">
                      This routing outcome was confirmed when the diagnostic was completed and can no
                      longer be changed.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* 2. Outcome summary metrics */}
          <div
            className={cn(
              'grid grid-cols-2 gap-3',
              completed ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
            )}
          >
            {completed ? (
              <MetricTile
                tone="success"
                value={
                  <span className="inline-flex items-center gap-1.5" aria-label="Diagnostic completed">
                    <CheckCircle2 className="size-7 shrink-0" aria-hidden="true" />
                    <span className="text-base font-bold">Yes</span>
                  </span>
                }
                label="Diagnostic completed"
              />
            ) : null}
            <MetricTile value={routes.length} label="Level 3 recommendations" />
            <MetricTile value={papersReady} label="Working papers created" />
            <MetricTile value={awaitingSetup} label="Awaiting setup" />
            <MetricTile
              tone="neutral"
              value={
                <span className="inline-flex items-center gap-1.5" aria-label="Routing locked">
                  <Lock className="size-6 shrink-0" aria-hidden="true" />
                  <span className="text-base font-bold text-slate-700">Locked</span>
                </span>
              }
              label="Routing locked"
            />
          </div>

          {/* 3–8. Confirmed routing + recommendation cards */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="space-y-3 p-5 pb-3 sm:p-6 sm:pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base sm:text-lg">Confirmed Level 3 routing</CardTitle>
                  <CardDescription>
                    {routes.length} recommended product{routes.length === 1 ? '' : 's'} · {papersReady}{' '}
                    working paper{papersReady === 1 ? '' : 's'} created
                  </CardDescription>
                  <p className="text-sm text-slate-600">
                    Routing was locked when the diagnostic was completed.
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="shrink-0 gap-1.5 border border-slate-300 bg-slate-100 whitespace-nowrap text-slate-700"
                >
                  <Lock className="size-3.5" aria-hidden="true" />
                  Outcome locked
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-5 pt-2 sm:p-6 sm:pt-2">
              {routes.map((route: any) => {
                const productName = PRODUCT_LABELS[route.productCode] || route.productCode;
                const paper = route.createdAssessment;
                const hasPaper = Boolean(paper?.id);

                return (
                  <article
                    key={route.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 max-w-2xl text-base font-semibold leading-snug text-slate-900">
                        {productName}
                      </h3>
                      <div className="flex flex-wrap gap-1.5" aria-label="Recommendation status">
                        <Badge variant="info" className="shrink-0 whitespace-nowrap">
                          Recommended
                        </Badge>
                        <Badge
                          variant={hasPaper ? 'success' : 'warning'}
                          className="shrink-0 whitespace-nowrap"
                        >
                          {hasPaper ? 'Working paper ready' : 'Awaiting creation'}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Triggered by
                        </p>
                        <p className="text-sm text-slate-800">
                          {route.sourceModuleName || route.sourceModuleCode || 'Diagnostic confirmation'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Working paper
                        </p>
                        {hasPaper ? (
                          <p className="text-sm font-medium text-slate-900">{paper.reference}</p>
                        ) : (
                          <p className="text-sm text-slate-500">Not created yet</p>
                        )}
                      </div>
                    </div>

                    {route.rationale ? (
                      <div className="mt-3">
                        <RationaleBlock text={String(route.rationale)} />
                      </div>
                    ) : null}

                    <Separator className="my-3" />

                    <div className="flex flex-wrap items-center gap-2">
                      {hasPaper ? (
                        <Button
                          variant="outline"
                          asChild
                          className="h-10 shrink-0 whitespace-nowrap px-4"
                        >
                          <Link href={engagementHref(paper.productCode, paper.id)}>
                            Open working paper
                            <ChevronRight className="size-4" />
                          </Link>
                        </Button>
                      ) : canManageCommercial && accepted ? (
                        <Button
                          className="h-10 shrink-0 whitespace-nowrap px-4"
                          disabled={busy}
                          onClick={() => void createEngagement(route.id)}
                        >
                          Create Level 3 engagement
                        </Button>
                      ) : (
                        <p className="m-0 text-xs text-slate-500">
                          {accepted
                            ? 'Your consultant will create the Level 3 engagement after commercial acceptance.'
                            : canManageCommercial
                              ? 'Available after commercial acceptance'
                              : 'Level 3 engagement will be created by your consultant after commercial acceptance.'}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}

              {!routes.length ? (
                <p className="text-sm text-muted-foreground">
                  No Level 3 products were confirmed at completion.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Commercial handoff (existing workflow preserved) */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="p-5 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Level 3 commercial proposal</CardTitle>
              <CardDescription>
                {canManageCommercial
                  ? 'Prepare and obtain client acceptance before creating focused assurance engagements.'
                  : 'Commercial proposal status for your Level 3 focused assurance work.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Commercial reference
                  </div>
                  <strong className="text-sm">{outcome.commercialReference || 'Not initiated'}</strong>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
                  <strong className="text-sm">{humanizeStatus(commercialStatus)}</strong>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requested</div>
                  <strong className="text-sm">{fmt(outcome.commercialRequestedAt)}</strong>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Accepted</div>
                  <strong className="text-sm">{fmt(outcome.commercialAcceptedAt)}</strong>
                </div>
              </div>

              {canManageCommercial ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {commercialStatus === 'NOT_REQUESTED' ? (
                      <Button
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void commercialAction('INITIATE')}
                      >
                        Initiate Level 3 proposal
                      </Button>
                    ) : null}
                    {commercialStatus === 'REQUESTED' ? (
                      <Button
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void commercialAction('PREPARE')}
                      >
                        Start preparing proposal
                      </Button>
                    ) : null}
                    {['REQUESTED', 'IN_PREPARATION'].includes(commercialStatus) ? (
                      <Button
                        variant="outline"
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void commercialAction('SENT')}
                      >
                        Mark proposal sent
                      </Button>
                    ) : null}
                    {['SENT', 'IN_PREPARATION'].includes(commercialStatus) ? (
                      <Button
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void commercialAction('ACCEPTED')}
                      >
                        Mark accepted
                      </Button>
                    ) : null}
                    {['REQUESTED', 'IN_PREPARATION', 'SENT'].includes(commercialStatus) ? (
                      <Button
                        variant="outline"
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void commercialAction('DECLINED')}
                      >
                        Mark declined
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Commercial admin notes</p>
                    <Textarea
                      rows={4}
                      className="min-h-[100px] resize-y"
                      value={notes}
                      disabled={busy}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 shrink-0 whitespace-nowrap px-4"
                    disabled={busy || notes === (outcome.commercialAdminNotes || '')}
                    onClick={() => void commercialAction('SAVE_NOTES')}
                  >
                    Save notes
                  </Button>
                </>
              ) : outcome.commercialAdminNotes ? (
                <p className="text-sm text-muted-foreground">{outcome.commercialAdminNotes}</p>
              ) : null}
            </CardContent>
          </Card>

          {engagement.parentAssessment?.reference ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="p-5 sm:p-6">
                <CardTitle className="text-base">Product journey</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <Link
                    href={`/triage/${engagement.parentAssessment.triageSubmissionId || engagement.parentAssessment.id}`}
                    className="font-medium text-slate-800 underline-offset-2 hover:underline"
                  >
                    Level 1 triage {engagement.parentAssessment.reference}
                  </Link>
                  <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                  <span>Level 2 {engagement.reference}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                  <span>Level 3 commercial {outcome.commercialReference || '(pending)'}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                  <span>Focused assurance engagement(s)</span>
                </p>
                {papersReady > 0 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                    {papersReady} working paper{papersReady === 1 ? '' : 's'} linked from this outcome
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </Shell>
    </AuthGate>
  );
}
