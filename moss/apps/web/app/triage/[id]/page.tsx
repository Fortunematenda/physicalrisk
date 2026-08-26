'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { isSclActiveTriageQuestionCode, SCL_ACTIVE_TRIAGE_QUESTION_CODES } from '@moss/shared';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/Ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { stripUnintendedLeadingDash } from '@/lib/scl-option-label';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type TabId = 'overview' | 'scores' | 'responses' | 'commercial' | 'journey';

const TOTAL_TRIAGE_QUESTIONS = SCL_ACTIVE_TRIAGE_QUESTION_CODES.length;

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function riskAccent(band?: string | null) {
  if (band === 'Critical') return 'critical';
  if (band === 'High') return 'high';
  if (band === 'Moderate') return 'moderate';
  return 'controlled';
}

/** Assurance position = 100 − exposure. */
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

function statusLabel(value?: string) {
  if (!value) return '—';
  return value.replaceAll('_', ' ');
}

function CategoryBars({ items }: { items: Array<{ category: string; score: number }> }) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const score = Number(item.score);
        const widthPct = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
        return (
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(80px,2fr)_48px] items-center gap-3" key={item.category}>
            <span className="truncate text-sm text-slate-600">{item.category}</span>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#c41230]" style={{ width: `${widthPct}%` }} />
            </div>
            <strong className="text-right text-sm tabular-nums">{Number.isFinite(score) ? score.toFixed(1) : '—'}</strong>
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

export default function TriageSubmissionDetailPage() {
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const [item, setItem] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<TabId>('overview');
  const [responseQuery, setResponseQuery] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<any>(`/triage/submissions/${id}`);
      setItem(data);
      setNotes(data?.adminNotes || '');
      setProposalNotes(data?.proposalAdminNotes || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load submission.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  async function run(fn: () => Promise<void>, success?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update submission.');
    } finally {
      setBusy(false);
    }
  }

  async function patch(payload: Record<string, unknown>, success?: string) {
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
    }, 'Proposal status updated.');
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
      setError(e instanceof Error ? e.message : 'Unable to create the Executive Advisory Diagnostic.');
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

  const filteredResponses = useMemo(() => {
    const rows = (item?.responses || []).filter((row: any) =>
      isSclActiveTriageQuestionCode(row.question?.code),
    );
    const q = responseQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row: any) =>
      [row.question?.code, row.question?.text, row.responseOption?.label]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [item, responseQuery]);

  const answeredQuestions = item?.completedAt
    ? TOTAL_TRIAGE_QUESTIONS
    : (item?.responses || []).filter(
        (row: any) => isSclActiveTriageQuestionCode(row.question?.code) && row.responseOption?.label,
      ).length;
  const progress = TOTAL_TRIAGE_QUESTIONS
    ? Math.round((answeredQuestions / TOTAL_TRIAGE_QUESTIONS) * 100)
    : 0;

  if (loading || !item) {
    return (
      <AuthGate>
        <Shell title="Triage submission">
          {error ? <p className="error">{error}</p> : <div className="loading-screen">Loading submission…</div>}
        </Shell>
      </AuthGate>
    );
  }

  const analystLabel = item.assignedAnalyst
    ? `${item.assignedAnalyst.firstName || ''} ${item.assignedAnalyst.lastName || ''}`.trim() ||
      item.assignedAnalyst.email
    : 'Unassigned';

  return (
    <AuthGate>
      <Shell
        title={`Triage · ${item.assessment?.reference || item.organisationName}`}
        hideSearch
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/triage">Back to triage</Link>
            </Button>
            {item.convertedEngagement?.id ? (
              <Button variant="outline" asChild>
                <Link href={`/advisory/${item.convertedEngagement.id}`}>Open Level 2</Link>
              </Button>
            ) : null}
          </>
        }
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        {(proposalStatus !== 'NOT_REQUESTED' || item.diagnosticRequestedAt) && (
          <Alert className="mb-4 border-[#fecaca] bg-[#fef2f2]">
            <AlertTitle>
              {proposalStatus !== 'NOT_REQUESTED'
                ? `Commercial Intent — ${statusLabel(proposalStatus)}`
                : 'Executive Discussion requested'}
            </AlertTitle>
            <AlertDescription>
              {proposalStatus !== 'NOT_REQUESTED'
                ? `${item.proposalReference ? `Reference ${item.proposalReference}. ` : ''}Recommended product: Executive Advisory Diagnostic.${
                    item.proposalRequestedAt ? ` Requested ${fmt(item.proposalRequestedAt)}.` : ''
                  }`
                : `Requested ${fmt(item.diagnosticRequestedAt)}. Lower-friction intent than a formal proposal.`}
            </AlertDescription>
          </Alert>
        )}

        <section
          className={cn(
            'rev-hero mb-4 overflow-hidden rounded-xl',
            `rev-hero-${riskAccent(band)}`,
          )}
        >
          <div className="rev-hero-main min-w-0 flex-1">
            <p className="rev-hero-kicker">
              {assessment?.reference || 'Executive Governance Triage'}
            </p>
            <h2>{item.organisationName}</h2>
            <p>
              {item.industry || 'Industry not set'}
              {' · '}
              {item.firstName} {item.lastName}
              {' · '}
              <a href={`mailto:${item.email}`} className="text-white underline-offset-2 hover:underline">
                {item.email}
              </a>
              {item.phone ? ` · ${item.phone}` : ''}
            </p>
            <div className="rev-hero-badges">
              <StatusBadge value={item.displayStatus || item.status} />
              {band ? <span className="rev-risk-pill">{band} risk</span> : null}
              <span className="rev-meta-pill">Level 1 · EGT</span>
            </div>
          </div>
          <div className="grid min-w-[280px] flex-1 grid-cols-2 gap-3 lg:max-w-xl">
            <MetricCard
              onDark
              label="EGT score"
              value={score != null ? score : '—'}
              hint={band || 'Pending indication'}
            />
            <MetricCard
              onDark
              label="Progress"
              value={`${progress}%`}
              hint={item.completedAt ? 'Complete' : item.progressLabel || 'In progress'}
            />
            <MetricCard
              onDark
              label="Commercial"
              value={statusLabel(item.intent === 'NONE' ? proposalStatus : item.intent)}
              hint={item.proposalReference || 'No PRP yet'}
            />
            <MetricCard
              onDark
              label="Analyst"
              value={analystLabel}
              hint={item.assignedAnalyst?.email || 'Not assigned'}
            />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
              <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="scores">Scores & indication</TabsTrigger>
                <TabsTrigger value="responses" className="gap-2">
                  Responses
                  {filteredResponses.length > 0 ? (
                    <Badge variant="danger" className="h-5 min-w-5 justify-center px-1.5">
                      {filteredResponses.length}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="commercial" className="gap-2">
                  Commercial
                  {proposalStatus !== 'NOT_REQUESTED' ? (
                    <Badge variant="danger" className="h-5 min-w-5 justify-center px-1.5">
                      !
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="journey">Journey & audit</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-4">
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
                        <Kv label="Stage">{statusLabel(item.displayStatus)}</Kv>
                        <Kv label="Created">{fmt(item.createdAt)}</Kv>
                        <Kv label="Completed">{fmt(item.completedAt)}</Kv>
                        <Kv label="Contacted">{fmt(item.contactedAt)}</Kv>
                        <Kv label="Level 2 route">
                          {item.convertedEngagement
                            ? `${item.convertedEngagement.reference} · ${item.convertedEngagement.status}`
                            : 'Not yet converted'}
                        </Kv>
                      </dl>
                    </CardContent>
                  </Card>
                </div>
                <Card className="rounded-xl border-slate-200 shadow-sm">
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">Qualification snapshot</CardTitle>
                      <CardDescription>Progress and commercial routing for this Level 1 lead</CardDescription>
                    </div>
                    <Badge variant="secondary">{progress}% complete</Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricCard
                        label="Progress"
                        value={item.completedAt ? 'Completed' : item.progressLabel || 'In progress'}
                        hint={`${progress}% of active triage questions`}
                      />
                      <MetricCard
                        label="Indication"
                        value={band || (item.completedAt ? 'Recorded' : 'Pending')}
                        hint={score != null ? `Assurance ${score}/100` : 'No score yet'}
                      />
                      <MetricCard
                        label="Commercial"
                        value={statusLabel(item.intent)}
                        hint={item.proposalReference || 'No proposal reference'}
                      />
                      <MetricCard
                        label="Analyst"
                        value={analystLabel}
                        hint={item.assignedAnalyst?.email || 'Assign from the triage list'}
                      />
                    </div>
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
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricCard
                        accent
                        label="EGT indication"
                        value={score != null ? score : '—'}
                        hint={`${band || 'No band'} · /100`}
                      />
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
                          This is Level 1 Executive Governance Triage — questionnaire-based decision support only.
                          It is not an assessment, audit, assurance opinion, or Security Cost Leakage Assessment™.
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
                        Active triage answers (15 questions — same set as the public website)
                      </CardDescription>
                    </div>
                    <Input
                      className="max-w-xs"
                      placeholder="Search code, question or answer…"
                      value={responseQuery}
                      onChange={(e) => setResponseQuery(e.target.value)}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Code</th>
                            <th className="px-3 py-2">Question</th>
                            <th className="px-3 py-2">Answer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResponses.map((row: any) => (
                            <tr key={row.id} className="border-t border-slate-100">
                              <td className="px-3 py-2">
                                <code className="text-xs">{row.question?.code}</code>
                              </td>
                              <td className="px-3 py-2">{row.question?.text}</td>
                              <td className="px-3 py-2 font-medium">
                                {stripUnintendedLeadingDash(row.responseOption?.label || '') || '—'}
                              </td>
                            </tr>
                          ))}
                          {!filteredResponses.length && (
                            <tr>
                              <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
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
                        <Kv label="Status">{statusLabel(proposalStatus)}</Kv>
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
                            <Button disabled={busy} onClick={() => void proposalAction('PREPARE')}>
                              Start Preparing Proposal
                            </Button>
                          ) : null}
                          {['REQUESTED', 'IN_PREPARATION'].includes(proposalStatus) ? (
                            <Button variant="outline" disabled={busy} onClick={() => void proposalAction('SENT')}>
                              Mark Proposal Sent
                            </Button>
                          ) : null}
                          {['SENT', 'IN_PREPARATION'].includes(proposalStatus) ? (
                            <Button disabled={busy} onClick={() => void proposalAction('ACCEPTED')}>
                              Mark Accepted
                            </Button>
                          ) : null}
                          {['REQUESTED', 'IN_PREPARATION', 'SENT'].includes(proposalStatus) ? (
                            <Button variant="outline" disabled={busy} onClick={() => void proposalAction('DECLINED')}>
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
                        value={proposalNotes}
                        onChange={(e) => setProposalNotes(e.target.value)}
                        placeholder="Proposal preparation notes…"
                      />
                      <Button
                        variant="outline"
                        disabled={busy || proposalNotes === (item.proposalAdminNotes || '')}
                        onClick={() => void patch({ proposalAdminNotes: proposalNotes }, 'Proposal notes saved.')}
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
                    <div className="triage-detail-timeline">
                      {(item.commercialJourney || []).map((step: any) => (
                        <div key={step.key}>
                          <span className="triage-detail-dot" />
                          <div>
                            <strong>{step.label}</strong>
                            <small>{step.at ? fmt(step.at) : step.active ? 'In progress' : '—'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-xl border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Lifecycle & audit trail</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="triage-detail-timeline">
                      {(item.audit || []).length ? (
                        item.audit.map((event: any) => (
                          <div key={event.id}>
                            <span className="triage-detail-dot" />
                            <div>
                              <strong>{String(event.action || '').replaceAll('_', ' ')}</strong>
                              <small>{fmt(event.createdAt)}</small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No audit events recorded.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Triage workflow</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm">
                  {[
                    { done: item.completedAt, label: 'Questionnaire completed' },
                    { done: score != null, label: 'Indication scored' },
                    { done: item.reviewedAt, label: 'Marked reviewed' },
                    { done: item.contactedAt, label: 'Contacted' },
                    {
                      done: item.convertedAt || item.closedAt,
                      label: item.closedAt && !item.convertedAt ? 'Closed' : 'Converted / closed',
                    },
                  ].map((step) => (
                    <li
                      key={step.label}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2',
                        step.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600',
                      )}
                    >
                      <span className={cn('size-2 rounded-full', step.done ? 'bg-emerald-500' : 'bg-slate-300')} />
                      {step.label}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Follow-up actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {item.completedAt && !item.reviewedAt && !item.closedAt ? (
                  <Button disabled={busy} onClick={() => void patch({ status: 'REVIEWED' }, 'Marked as reviewed.')}>
                    Mark reviewed
                  </Button>
                ) : null}
                {item.completedAt && !item.contactedAt && !item.closedAt ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void patch({ status: 'CONTACTED' }, 'Marked as contacted.')}
                  >
                    Mark contacted
                  </Button>
                ) : null}
                {item.completedAt && !item.convertedAt && !item.closedAt ? (
                  <Button disabled={busy} onClick={() => void convert()}>
                    Convert to Level 2
                  </Button>
                ) : null}
                {item.convertedEngagement?.id ? (
                  <Button variant="outline" asChild>
                    <Link href={`/advisory/${item.convertedEngagement.id}`}>Open Level 2 Diagnostic</Link>
                  </Button>
                ) : null}
                {!item.closedAt && !item.convertedAt ? (
                  <Button variant="outline" disabled={busy} onClick={() => void patch({ status: 'CLOSED' }, 'Lead closed.')}>
                    Close lead
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Internal notes</CardTitle>
                <CardDescription>Call outcomes and general follow-up. Not shown to the client.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Capture follow-up observations…"
                />
                <Button
                  variant="outline"
                  disabled={busy || notes === (item.adminNotes || '')}
                  onClick={() => void patch({ adminNotes: notes }, 'Notes saved.')}
                >
                  Save notes
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </Shell>
    </AuthGate>
  );
}
