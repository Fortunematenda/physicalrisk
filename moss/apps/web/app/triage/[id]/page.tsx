'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { isSclActiveTriageQuestionCode, SCL_ACTIVE_TRIAGE_QUESTION_CODES } from '@moss/shared';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { stripUnintendedLeadingDash } from '@/lib/scl-option-label';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'scores' | 'responses' | 'commercial' | 'journey';

const TOTAL_TRIAGE_QUESTIONS = SCL_ACTIVE_TRIAGE_QUESTION_CODES.length;

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Assurance position = 100 − exposure (existing indication display). */
function assuranceFromAssessment(assessment: {
  overallRiskScore?: number | null;
  maturityScore?: number | null;
} | null): number | null {
  if (!assessment) return null;
  if (assessment.maturityScore != null && Number.isFinite(Number(assessment.maturityScore))) {
    return Math.round(Number(assessment.maturityScore) * 10) / 10;
  }
  if (assessment.overallRiskScore != null && Number.isFinite(Number(assessment.overallRiskScore))) {
    return Math.round((100 - Number(assessment.overallRiskScore)) * 10) / 10;
  }
  return null;
}

function humanizeStatus(value?: string | null) {
  if (!value) return '—';
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'In progress',
    SUBMITTED: 'Submitted',
    COMPLETED: 'Completed',
    REVIEWED: 'Reviewed',
    CONTACTED: 'Contacted',
    CONVERTED: 'Converted',
    CLOSED: 'Closed',
    NOT_REQUESTED: 'Not requested',
    REQUESTED: 'Requested',
    IN_PREPARATION: 'In preparation',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
    PROPOSAL_REQUESTED: 'Proposal requested',
    PROPOSAL_IN_PREPARATION: 'In preparation',
    PROPOSAL_SENT: 'Proposal sent',
    PROPOSAL_ACCEPTED: 'Proposal accepted',
    PROPOSAL_DECLINED: 'Proposal declined',
    REPORT_GENERATED: 'Report generated',
    REPORT_ISSUED: 'Report issued',
    AWAITING_REVIEW: 'Awaiting review',
    APPROVED: 'Approved',
  };
  return map[value] || value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function bandBadgeVariant(band?: string | null): 'success' | 'warning' | 'danger' | 'secondary' {
  if (band === 'Critical' || band === 'High') return 'danger';
  if (band === 'Moderate') return 'warning';
  if (band === 'Controlled') return 'success';
  return 'secondary';
}

function proposalBadgeVariant(
  status: string,
): 'success' | 'warning' | 'info' | 'danger' | 'secondary' {
  if (['ACCEPTED', 'CONVERTED'].includes(status)) return 'success';
  if (['DECLINED', 'EXPIRED', 'CANCELLED'].includes(status)) return 'danger';
  if (['IN_PREPARATION', 'REQUESTED', 'SENT'].includes(status)) return 'warning';
  return 'secondary';
}

function CategoryBars({ items }: { items: Array<{ category: string; score: number }> }) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const score = Number(item.score);
        const widthPct = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
        return (
          <div
            className="grid grid-cols-[minmax(0,1fr)_minmax(80px,2fr)_48px] items-center gap-3"
            key={item.category}
          >
            <span className="truncate text-sm text-slate-600">{item.category}</span>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-moss-info" style={{ width: `${widthPct}%` }} />
            </div>
            <strong className="text-right text-sm tabular-nums">
              {Number.isFinite(score) ? score.toFixed(1) : '—'}
            </strong>
          </div>
        );
      })}
      {!items.length && <p className="text-sm text-muted-foreground">No category scores available.</p>}
    </div>
  );
}

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-2 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function WorkflowStep({
  state,
  label,
}: {
  state: 'done' | 'current' | 'pending' | 'warning';
  label: string;
}) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {state === 'done' ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-moss-success" aria-hidden="true" />
      ) : state === 'current' ? (
        <span
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-moss-info bg-moss-info/15"
          aria-hidden="true"
        >
          <span className="size-1.5 rounded-full bg-moss-info" />
        </span>
      ) : state === 'warning' ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden="true" />
      )}
      <span
        className={cn(
          'text-sm',
          state === 'done' && 'text-slate-700',
          state === 'current' && 'font-medium text-slate-900',
          state === 'pending' && 'text-slate-500',
          state === 'warning' && 'text-amber-800',
        )}
      >
        {label}
      </span>
    </li>
  );
}

function JourneyStage({
  level,
  title,
  status,
  tone,
}: {
  level: string;
  title: string;
  status: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{level}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{title}</p>
      <Badge
        variant={
          tone === 'success' ? 'success' : tone === 'info' ? 'info' : tone === 'warning' ? 'warning' : 'secondary'
        }
        className="mt-1.5 shrink-0 whitespace-nowrap"
      >
        {status}
      </Badge>
    </div>
  );
}

export default function TriageSubmissionDetailPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const [item, setItem] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  const [responseQuery, setResponseQuery] = useState('');
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<any>(`/triage/submissions/${id}`);
      setItem(data);
      setNotes(data?.adminNotes || '');
      setProposalNotes(data?.proposalAdminNotes || '');
      // Reports link with assessment id; canonical URL uses the lead/submission id.
      if (data?.id && data.id !== id) {
        router.replace(`/triage/${data.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load submission.');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  useEffect(() => {
    apiFetch<any[]>('/admin/users/analysts').then(setAnalysts).catch(() => []);
  }, []);

  async function run(fn: () => Promise<void>, success?: { title: string; description: string }) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      if (success) {
        toast({
          id: `triage-${success.title}`,
          variant: 'success',
          title: success.title,
          description: success.description,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to update submission.';
      setError(message);
      toast({
        id: 'triage-error',
        variant: 'error',
        title: 'Update failed',
        description: message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function patch(payload: Record<string, unknown>, success?: { title: string; description: string }) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    }, success);
  }

  async function proposalAction(action: string) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${id}/proposal`, {
        method: 'POST',
        body: JSON.stringify({ action, proposalAdminNotes: proposalNotes }),
      });
    }, { title: 'Proposal updated', description: 'Commercial proposal status has been updated.' });
  }

  async function assignAnalyst(analystId: string) {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ assignedAnalystId: analystId || '' }),
        });
        setAssignOpen(false);
      },
      analystId
        ? {
            title: 'Consultant updated',
            description: `${
              analysts.find((a) => a.id === analystId)
                ? `${analysts.find((a) => a.id === analystId).firstName} ${analysts.find((a) => a.id === analystId).lastName}`.trim()
                : 'Analyst'
            } is now assigned.`,
          }
        : { title: 'Analyst unassigned', description: 'No primary analyst is assigned to this triage.' },
    );
  }

  async function convert() {
    if (!item) return;
    const ok = await confirm({
      title: 'Convert to Level 2',
      description: `Create the paid Executive Advisory Diagnostic for “${item.organisationName}”?`,
      confirmLabel: 'Convert',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch<{ engagement: { id: string } }>(`/triage/submissions/${id}/convert`, {
        method: 'POST',
      });
      if (data?.engagement?.id) window.location.href = `/advisory/${data.engagement.id}`;
      else await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to create the Executive Advisory Diagnostic.';
      setError(message);
      toast({ variant: 'error', title: 'Conversion failed', description: message });
    } finally {
      setBusy(false);
    }
  }

  const assessment = item?.assessment;
  const score = assuranceFromAssessment(assessment);
  const band = assessment?.riskBand || null;
  const categories = Array.isArray(assessment?.categoryScores)
    ? assessment.categoryScores.map((c: any) => ({
        category: String(c.category || c.name || 'Category'),
        score: Number(c.score) || 0,
      }))
    : [];
  const proposalStatus = String(item?.proposalStatus || 'NOT_REQUESTED');
  const hasCommercial =
    Boolean(item) && (proposalStatus !== 'NOT_REQUESTED' || Boolean(item?.diagnosticRequestedAt));

  const responseRows = useMemo(() => {
    return (item?.responses || []).filter((row: any) => isSclActiveTriageQuestionCode(row.question?.code));
  }, [item]);

  const filteredResponses = useMemo(() => {
    const q = responseQuery.trim().toLowerCase();
    if (!q) return responseRows;
    return responseRows.filter((row: any) =>
      [row.question?.code, row.question?.text, row.responseOption?.label]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [responseRows, responseQuery]);

  const answeredQuestions = item?.completedAt
    ? TOTAL_TRIAGE_QUESTIONS
    : responseRows.filter((row: any) => row.responseOption?.label).length;
  const progress = TOTAL_TRIAGE_QUESTIONS
    ? Math.round((answeredQuestions / TOTAL_TRIAGE_QUESTIONS) * 100)
    : 0;

  const analystName = item?.assignedAnalyst
    ? `${item.assignedAnalyst.firstName || ''} ${item.assignedAnalyst.lastName || ''}`.trim() ||
      item.assignedAnalyst.email
    : null;

  const level1Complete = Boolean(item?.completedAt);
  const isConverted = Boolean(item?.convertedAt || item?.convertedEngagement?.id);

  const l2Status = (() => {
    if (isConverted && item?.convertedEngagement) {
      const st = String(item.convertedEngagement.status || '');
      if (['REPORT_ISSUED', 'REPORT_GENERATED', 'CLOSED', 'APPROVED', 'SUBMITTED'].includes(st)) {
        return { label: humanizeStatus(st), tone: 'success' as const };
      }
      return { label: humanizeStatus(st) || 'In progress', tone: 'info' as const };
    }
    if (['IN_PREPARATION', 'REQUESTED', 'SENT', 'ACCEPTED'].includes(proposalStatus)) {
      return { label: 'In preparation', tone: 'warning' as const };
    }
    if (item?.diagnosticRequestedAt) return { label: 'In preparation', tone: 'warning' as const };
    return { label: 'Not started', tone: 'neutral' as const };
  })();

  const l3Status = (() => {
    if (!isConverted) return { label: 'Not started', tone: 'neutral' as const };
    const st = String(item?.convertedEngagement?.status || '');
    if (['REPORT_ISSUED', 'SUBMITTED'].includes(st)) {
      return { label: 'Recommended', tone: 'info' as const };
    }
    return { label: 'Not started', tone: 'neutral' as const };
  })();

  const nextAction = (() => {
    if (!item) return null;
    if (item.closedAt && !isConverted) {
      return {
        title: 'Lead closed',
        body: 'This triage lead is closed. Reopen is not available from this screen.',
        action: null as ReactNode,
      };
    }
    if (isConverted && item.convertedEngagement?.id) {
      if (!analystName) {
        return {
          title: 'Assign a Level 2 analyst',
          body: 'An analyst must be assigned before continuing the diagnostic.',
          action: (
            <Button
              className="h-10 shrink-0 whitespace-nowrap px-4"
              disabled={busy}
              onClick={() => setAssignOpen(true)}
            >
              Assign analyst
            </Button>
          ),
        };
      }
      return {
        title: 'Continue Level 2 diagnostic',
        body: `${analystName} is assigned.`,
        action: (
          <Button asChild className="h-10 shrink-0 whitespace-nowrap px-4">
            <Link href={`/advisory/${item.convertedEngagement.id}`}>
              Open Level 2
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        ),
      };
    }
    if (level1Complete && !item.contactedAt) {
      return {
        title: 'Mark as contacted',
        body: 'Confirm outreach so commercial follow-up can continue.',
        action: (
          <Button
            className="h-10 shrink-0 whitespace-nowrap px-4"
            disabled={busy}
            onClick={() =>
              void patch(
                { status: 'CONTACTED' },
                { title: 'Contact status updated', description: 'Marked as contacted.' },
              )
            }
          >
            Mark contacted
          </Button>
        ),
      };
    }
    if (level1Complete && !item.reviewedAt) {
      return {
        title: 'Mark as reviewed',
        body: 'Confirm the Level 1 indication has been reviewed.',
        action: (
          <Button
            className="h-10 shrink-0 whitespace-nowrap px-4"
            disabled={busy}
            onClick={() =>
              void patch(
                { status: 'REVIEWED' },
                { title: 'Status updated', description: 'Marked as reviewed.' },
              )
            }
          >
            Mark reviewed
          </Button>
        ),
      };
    }
    if (level1Complete && !isConverted) {
      return {
        title: 'Convert to Level 2',
        body: 'Create the Executive Advisory Diagnostic for this organisation.',
        action: (
          <Button className="h-10 shrink-0 whitespace-nowrap px-4" disabled={busy} onClick={() => void convert()}>
            Convert to Level 2
          </Button>
        ),
      };
    }
    if (!level1Complete) {
      return {
        title: 'Awaiting questionnaire completion',
        body: 'Level 1 triage is still in progress.',
        action: null,
      };
    }
    return null;
  })();

  const workflowSteps: Array<{ state: 'done' | 'current' | 'pending' | 'warning'; label: string }> = useMemo(() => {
    if (!item) return [];
    const steps: Array<{ done: boolean; label: string; current?: boolean }> = [
      { done: Boolean(item.completedAt), label: 'Questionnaire completed' },
      { done: score != null, label: 'Indication scored' },
      { done: Boolean(item.reviewedAt), label: 'Reviewed' },
      { done: Boolean(item.contactedAt), label: 'Contacted' },
      {
        done: Boolean(item.convertedAt || item.closedAt),
        label: item.closedAt && !item.convertedAt ? 'Closed' : 'Level 2 preparation',
        current: Boolean(item.completedAt && !item.convertedAt && !item.closedAt),
      },
    ];
    return steps.map((s) => ({
      label: s.label,
      state: s.done ? 'done' : s.current ? 'current' : 'pending',
    }));
  }, [item, score]);

  if (loading || !item) {
    return (
      <AuthGate>
        <Shell title="Triage submission">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          )}
        </Shell>
      </AuthGate>
    );
  }

  const commercialNeedsAction =
    ['REQUESTED', 'IN_PREPARATION', 'SENT'].includes(proposalStatus) && !item.convertedAt && !item.closedAt;

  return (
    <AuthGate>
      <Shell title={`Triage · ${assessment?.reference || item.organisationName}`} hideSearch>
        <div className="triage-detail-workspace space-y-4 pb-8">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Information card */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Executive Governance Triage
                </p>
                <p className="text-sm font-semibold tracking-wide text-slate-500">
                  {assessment?.reference || '—'}
                </p>
                <h1 className="text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                  {item.organisationName}
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  {level1Complete ? (
                    <Badge variant="success" className="shrink-0 gap-1 whitespace-nowrap">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Level 1 complete
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="shrink-0 whitespace-nowrap">
                      Level 1 in progress
                    </Badge>
                  )}
                  {isConverted ? (
                    <Badge variant="info" className="shrink-0 whitespace-nowrap">
                      Converted
                    </Badge>
                  ) : null}
                  {band ? (
                    <Badge variant={bandBadgeVariant(band)} className="shrink-0 whitespace-nowrap">
                      {band}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-slate-600">
                  {[item.firstName, item.lastName].filter(Boolean).join(' ')}
                  {item.email ? ` · ${item.email}` : ''}
                  {item.phone ? ` · ${item.phone}` : ''}
                </p>
              </div>

              <div className="flex w-full min-w-[220px] max-w-sm flex-col items-stretch gap-3 sm:w-auto">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button variant="outline" asChild className="h-11 shrink-0 whitespace-nowrap px-4">
                    <Link href="/triage">Back to triage</Link>
                  </Button>
                  {item.convertedEngagement?.id ? (
                    <Button asChild className="h-11 shrink-0 whitespace-nowrap px-4">
                      <Link href={`/advisory/${item.convertedEngagement.id}`}>
                        Open Level 2
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  ) : level1Complete && !item.convertedAt && !item.closedAt ? (
                    <Button
                      className="h-11 shrink-0 whitespace-nowrap px-4"
                      disabled={busy}
                      onClick={() => void convert()}
                    >
                      Convert to Level 2
                    </Button>
                  ) : null}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Primary analyst
                  </p>
                  {assignOpen ? (
                    <div className="mt-2 space-y-2">
                      <FilterSelect
                        value={item.assignedAnalystId || ''}
                        onChange={(next) => void assignAnalyst(next)}
                        disabled={busy}
                        placeholder="Select analyst"
                        triggerClassName="h-10 w-full"
                        options={analysts.map((a) => ({
                          value: a.id,
                          label: `${a.firstName} ${a.lastName} — ${a.systemRole}`,
                        }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        {item.assignedAnalystId ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 whitespace-nowrap px-3"
                            disabled={busy}
                            onClick={() => void assignAnalyst('')}
                          >
                            Unassign
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 whitespace-nowrap px-3"
                          onClick={() => setAssignOpen(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : analystName ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-semibold text-slate-900">{analystName}</p>
                        <p className="m-0 truncate text-xs text-slate-500">
                          {item.assignedAnalyst?.email || 'Assigned'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 whitespace-nowrap px-2 text-xs"
                        disabled={busy}
                        onClick={() => setAssignOpen(true)}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <p className="m-0 text-sm text-slate-700">Not assigned</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0 whitespace-nowrap px-2.5"
                        disabled={busy}
                        onClick={() => setAssignOpen(true)}
                      >
                        Assign analyst
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs directly below information card */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
                <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto bg-slate-100 p-1">
                  <TabsTrigger value="overview" className="shrink-0 whitespace-nowrap">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="scores" className="shrink-0 whitespace-nowrap">
                    Scores & indication
                  </TabsTrigger>
                  <TabsTrigger value="responses" className="shrink-0 gap-2 whitespace-nowrap">
                    Responses
                    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5">
                      {responseRows.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="commercial" className="shrink-0 gap-2 whitespace-nowrap">
                    Commercial
                    {commercialNeedsAction ? (
                      <Badge variant="warning" className="h-5 whitespace-nowrap px-1.5" title="Action required">
                        Action required
                      </Badge>
                    ) : proposalStatus !== 'NOT_REQUESTED' ? (
                      <Badge variant="info" className="h-5 whitespace-nowrap px-1.5">
                        Active
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="journey" className="shrink-0 whitespace-nowrap">
                    Journey & audit
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Product journey */}
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-stretch sm:gap-3 sm:p-5">
                      <JourneyStage
                        level="Level 1"
                        title="Triage"
                        status={level1Complete ? 'Completed' : 'In progress'}
                        tone={level1Complete ? 'success' : 'warning'}
                      />
                      <div className="hidden items-center sm:flex" aria-hidden="true">
                        <ArrowRight className="size-4 text-slate-300" />
                      </div>
                      <JourneyStage
                        level="Level 2"
                        title="Executive Advisory Diagnostic"
                        status={l2Status.label}
                        tone={l2Status.tone}
                      />
                      <div className="hidden items-center sm:flex" aria-hidden="true">
                        <ArrowRight className="size-4 text-slate-300" />
                      </div>
                      <JourneyStage level="Level 3" title="Assurance" status={l3Status.label} tone={l3Status.tone} />
                    </CardContent>
                  </Card>

                  {nextAction ? (
                    <Card className="rounded-xl border-moss-info/30 bg-moss-info/[0.04] shadow-sm">
                      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                        <div className="min-w-0 space-y-1">
                          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-moss-info">
                            Next action
                          </p>
                          <p className="m-0 text-sm font-semibold text-slate-900">{nextAction.title}</p>
                          <p className="m-0 text-sm text-slate-600">{nextAction.body}</p>
                        </div>
                        {nextAction.action}
                      </CardContent>
                    </Card>
                  ) : null}

                  {hasCommercial ? (
                    <Card
                      className={cn(
                        'rounded-xl shadow-sm',
                        commercialNeedsAction
                          ? 'border-amber-200 bg-amber-50/50'
                          : isConverted
                            ? 'border-moss-success/30 bg-moss-success/[0.03]'
                            : 'border-slate-200',
                      )}
                    >
                      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="m-0 text-sm font-semibold text-slate-900">Commercial handoff</p>
                            <Badge
                              variant={proposalBadgeVariant(isConverted ? 'CONVERTED' : proposalStatus)}
                              className="shrink-0 whitespace-nowrap"
                            >
                              {isConverted ? 'Converted' : humanizeStatus(proposalStatus)}
                            </Badge>
                          </div>
                          <p className="m-0 text-sm font-medium text-slate-800">
                            {item.proposalReference || 'No proposal reference'}
                          </p>
                          <p className="m-0 text-sm text-slate-600">Executive Advisory Diagnostic</p>
                          <p className="m-0 text-xs text-slate-500">
                            Requested {fmt(item.proposalRequestedAt || item.diagnosticRequestedAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="h-10 shrink-0 whitespace-nowrap px-4"
                          onClick={() => setTab('commercial')}
                        >
                          Open commercial record
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Organisation & contact</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl>
                          <Kv label="Organisation">{item.organisationName}</Kv>
                          <Kv label="Industry">{item.industry || '—'}</Kv>
                          <Kv label="Contact">
                            {item.firstName} {item.lastName}
                          </Kv>
                          <Kv label="Email">{item.email}</Kv>
                          <Kv label="Phone">{item.phone || '—'}</Kv>
                          <Kv label="Source">{item.source || 'Public website'}</Kv>
                        </dl>
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Triage submission</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl>
                          <Kv label="Reference">{assessment?.reference || '—'}</Kv>
                          <Kv label="Stage">{humanizeStatus(item.displayStatus)}</Kv>
                          <Kv label="EGT indication">
                            {score != null ? `${score} / 100` : '—'}
                            {band ? ` · ${band}` : ''}
                          </Kv>
                          <Kv label="Progress">{item.completedAt ? 'Complete' : `${progress}%`}</Kv>
                          <Kv label="Created">{fmt(item.createdAt)}</Kv>
                          <Kv label="Completed">{fmt(item.completedAt)}</Kv>
                          <Kv label="Contacted">{fmt(item.contactedAt)}</Kv>
                          <Kv label="Level 2 route">
                            {item.convertedEngagement
                              ? `${item.convertedEngagement.reference} · ${humanizeStatus(item.convertedEngagement.status)}`
                              : 'Not yet converted'}
                          </Kv>
                        </dl>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                      <div>
                        <CardTitle className="text-base">Analyst</CardTitle>
                        <CardDescription>Primary Level 2 consultant for this lead</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        className="h-9 shrink-0 whitespace-nowrap px-3"
                        disabled={busy}
                        onClick={() => setAssignOpen(true)}
                      >
                        {analystName ? 'Change' : 'Assign analyst'}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {analystName ? (
                        <div>
                          <p className="m-0 text-base font-semibold text-slate-900">{analystName}</p>
                          <p className="m-0 text-sm text-slate-500">
                            {item.assignedAnalyst?.email || 'Primary analyst'}
                          </p>
                        </div>
                      ) : (
                        <p className="m-0 text-sm text-amber-800">Not assigned</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="scores" className="mt-0 space-y-4">
                  {score == null && !categories.length ? (
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Indication not available</CardTitle>
                        <CardDescription>
                          Scores appear after the complimentary questionnaire is completed and evaluated.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ) : (
                    <>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              EGT indication
                            </p>
                            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                              {score != null ? `${score} / 100` : '—'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Based on {responseRows.length} questionnaire response
                              {responseRows.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          {band ? (
                            <Badge variant={bandBadgeVariant(band)} className="px-2.5 py-1 text-sm">
                              {band}
                            </Badge>
                          ) : null}
                        </CardContent>
                      </Card>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <MetricCard
                          label="Governance"
                          value={
                            assessment?.maturityScore != null
                              ? Number(assessment.maturityScore).toFixed(1)
                              : '—'
                          }
                          hint="Maturity index"
                        />
                        <MetricCard
                          label="Confidence"
                          value={
                            assessment?.methodologyConfidence != null
                              ? `${(Number(assessment.methodologyConfidence) * 100).toFixed(0)}%`
                              : '—'
                          }
                          hint="Methodology confidence"
                        />
                        <MetricCard
                          label="Opportunity"
                          value={
                            assessment?.opportunityScore != null
                              ? Number(assessment.opportunityScore).toFixed(1)
                              : '—'
                          }
                          hint="Follow-up potential"
                        />
                      </div>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-base">Warning-indicator dimensions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <CategoryBars items={categories} />
                        </CardContent>
                      </Card>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-base">Basis of interpretation</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            This is Level 1 Executive Governance Triage — questionnaire-based decision support
                            only. It is not an assessment, audit, assurance opinion, or Security Cost Leakage
                            Assessment™.
                          </p>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="responses" className="mt-0">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-base">Questionnaire responses</CardTitle>
                        <CardDescription>
                          Active triage answers ({TOTAL_TRIAGE_QUESTIONS} questions — same set as the public
                          website)
                        </CardDescription>
                      </div>
                      <Input
                        className="h-10 max-w-xs shrink-0"
                        placeholder="Search code, question or answer…"
                        value={responseQuery}
                        onChange={(e) => setResponseQuery(e.target.value)}
                      />
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[560px] text-sm">
                          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="whitespace-nowrap px-3 py-2.5">Code</th>
                              <th className="min-w-[220px] px-3 py-2.5">Question</th>
                              <th className="min-w-[140px] px-3 py-2.5">Answer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredResponses.map((row: any) => (
                              <tr key={row.id} className="border-t border-slate-100">
                                <td className="whitespace-nowrap px-3 py-2.5 align-top">
                                  <code className="text-xs">{row.question?.code}</code>
                                </td>
                                <td className="px-3 py-2.5 align-top text-slate-700">{row.question?.text}</td>
                                <td className="px-3 py-2.5 align-top font-medium text-slate-900">
                                  {stripUnintendedLeadingDash(row.responseOption?.label || '') || '—'}
                                </td>
                              </tr>
                            ))}
                            {!filteredResponses.length && (
                              <tr>
                                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                                  {item.completedAt
                                    ? 'No responses match your search.'
                                    : 'Responses appear when the questionnaire is completed.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="commercial" className="mt-0">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Commercial Intent</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <dl>
                          <Kv label="Status">{humanizeStatus(proposalStatus)}</Kv>
                          <Kv label="Proposal reference">{item.proposalReference || '—'}</Kv>
                          <Kv label="Requested">{fmt(item.proposalRequestedAt)}</Kv>
                          <Kv label="Sent">{fmt(item.proposalSentAt)}</Kv>
                          <Kv label="Accepted / Declined">
                            {item.proposalAcceptedAt
                              ? `Accepted ${fmt(item.proposalAcceptedAt)}`
                              : item.proposalDeclinedAt
                                ? `Declined ${fmt(item.proposalDeclinedAt)}`
                                : '—'}
                          </Kv>
                          <Kv label="Recommended product">Executive Advisory Diagnostic</Kv>
                        </dl>
                        {proposalStatus !== 'NOT_REQUESTED' && !item.convertedAt && !item.closedAt ? (
                          <div className="flex flex-wrap gap-2">
                            {proposalStatus === 'REQUESTED' ? (
                              <Button
                                className="h-10 shrink-0 whitespace-nowrap px-4"
                                disabled={busy}
                                onClick={() => void proposalAction('PREPARE')}
                              >
                                Start Preparing Proposal
                              </Button>
                            ) : null}
                            {['REQUESTED', 'IN_PREPARATION'].includes(proposalStatus) ? (
                              <Button
                                variant="outline"
                                className="h-10 shrink-0 whitespace-nowrap px-4"
                                disabled={busy}
                                onClick={() => void proposalAction('SENT')}
                              >
                                Mark Proposal Sent
                              </Button>
                            ) : null}
                            {['SENT', 'IN_PREPARATION'].includes(proposalStatus) ? (
                              <Button
                                className="h-10 shrink-0 whitespace-nowrap px-4"
                                disabled={busy}
                                onClick={() => void proposalAction('ACCEPTED')}
                              >
                                Mark Accepted
                              </Button>
                            ) : null}
                            {['REQUESTED', 'IN_PREPARATION', 'SENT'].includes(proposalStatus) ? (
                              <Button
                                variant="outline"
                                className="h-10 shrink-0 whitespace-nowrap px-4"
                                disabled={busy}
                                onClick={() => void proposalAction('DECLINED')}
                              >
                                Mark Declined
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Proposal admin notes</CardTitle>
                        <CardDescription>
                          Internal proposal preparation notes. Pricing must follow commercial rules.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Textarea
                          rows={8}
                          className="min-h-[160px] resize-y"
                          value={proposalNotes}
                          onChange={(e) => setProposalNotes(e.target.value)}
                          placeholder="Proposal preparation notes…"
                        />
                        <Button
                          variant="outline"
                          className="h-10 shrink-0 whitespace-nowrap px-4"
                          disabled={busy || proposalNotes === (item.proposalAdminNotes || '')}
                          onClick={() =>
                            void patch(
                              { proposalAdminNotes: proposalNotes },
                              { title: 'Notes saved', description: 'Proposal notes have been updated.' },
                            )
                          }
                        >
                          Save proposal notes
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="journey" className="mt-0 space-y-4">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Commercial Journey</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-0">
                        {(item.commercialJourney || []).map((step: any) => {
                          const done = Boolean(step.at);
                          const current = Boolean(step.active) && !done;
                          return (
                            <WorkflowStep
                              key={step.key}
                              state={done ? 'done' : current ? 'current' : 'pending'}
                              label={`${step.label}${step.at ? ` · ${fmt(step.at)}` : current ? ' · In progress' : ''}`}
                            />
                          );
                        })}
                      </ol>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Lifecycle & audit trail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(item.audit || []).length ? (
                        <ol className="space-y-0">
                          {item.audit.map((event: any) => (
                            <WorkflowStep
                              key={event.id}
                              state="done"
                              label={`${humanizeStatus(event.action)} · ${fmt(event.createdAt)}`}
                            />
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-muted-foreground">No audit events recorded.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Triage workflow</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="m-0 list-none space-y-0 p-0">
                    {workflowSteps.map((step) => (
                      <WorkflowStep key={step.label} state={step.state} label={step.label} />
                    ))}
                  </ol>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Follow-up actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {item.completedAt && !item.reviewedAt && !item.closedAt ? (
                    <Button
                      className="h-10 w-full shrink-0 justify-center whitespace-nowrap px-4"
                      disabled={busy}
                      onClick={() =>
                        void patch(
                          { status: 'REVIEWED' },
                          { title: 'Status updated', description: 'Marked as reviewed.' },
                        )
                      }
                    >
                      Mark reviewed
                    </Button>
                  ) : null}
                  {item.completedAt && !item.contactedAt && !item.closedAt ? (
                    <Button
                      variant="outline"
                      className="h-10 w-full shrink-0 justify-center whitespace-nowrap px-4"
                      disabled={busy}
                      onClick={() =>
                        void patch(
                          { status: 'CONTACTED' },
                          { title: 'Contact status updated', description: 'Marked as contacted.' },
                        )
                      }
                    >
                      Mark contacted
                    </Button>
                  ) : null}
                  {item.completedAt && !item.convertedAt && !item.closedAt ? (
                    <Button
                      className="h-10 w-full shrink-0 justify-center whitespace-nowrap px-4"
                      disabled={busy}
                      onClick={() => void convert()}
                    >
                      Convert to Level 2
                    </Button>
                  ) : null}
                  {item.convertedEngagement?.id ? (
                    <Button variant="outline" asChild className="h-10 w-full shrink-0 justify-center whitespace-nowrap px-4">
                      <Link href={`/advisory/${item.convertedEngagement.id}`}>Open Level 2 Diagnostic</Link>
                    </Button>
                  ) : null}
                  {!item.closedAt && !item.convertedAt ? (
                    <Button
                      variant="outline"
                      className="h-10 w-full shrink-0 justify-center whitespace-nowrap px-4"
                      disabled={busy}
                      onClick={() =>
                        void patch({ status: 'CLOSED' }, { title: 'Lead closed', description: 'This triage lead was closed.' })
                      }
                    >
                      Close lead
                    </Button>
                  ) : null}
                  {busy ? (
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Updating…
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Internal notes</CardTitle>
                  <CardDescription>Call outcomes and general follow-up. Not shown to the client.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    rows={5}
                    className="min-h-[120px] resize-y"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Capture follow-up observations…"
                  />
                  <Button
                    variant="outline"
                    className="h-10 w-full shrink-0 justify-center whitespace-nowrap px-4"
                    disabled={busy || notes === (item.adminNotes || '')}
                    onClick={() =>
                      void patch(
                        { adminNotes: notes },
                        { title: 'Notes saved', description: 'Internal notes have been updated.' },
                      )
                    }
                  >
                    Save notes
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
