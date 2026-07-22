'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FilePlus2, Lightbulb, Plus } from 'lucide-react';

import { AuthGate } from '../../../../components/AuthGate';
import { EmptyState } from '../../../../components/common/empty-state';
import { Shell } from '../../../../components/Shell';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { Switch } from '../../../../components/ui/switch';
import { Textarea } from '../../../../components/ui/textarea';
import { StatusBadge as LegacyStatusBadge } from '../../../../components/Ui';
import { apiFetch, money } from '../../../../lib/api';
import { cn } from '../../../../lib/utils';

function PriorityBadge({ priority }: { priority?: string }) {
  const value = (priority || 'MEDIUM').toUpperCase();
  const variant =
    value === 'CRITICAL' || value === 'HIGH'
      ? 'danger'
      : value === 'MEDIUM'
        ? 'warning'
        : 'secondary';
  return (
    <Badge variant={variant} className="shrink-0 uppercase tracking-wide">
      {value}
    </Badge>
  );
}

type TabId = 'overview' | 'scores' | 'responses' | 'recommendations' | 'evidence';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'scores', label: 'Scores & leakage' },
  { id: 'responses', label: 'Responses' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'evidence', label: 'Evidence' },
];

function riskAccent(band?: string) {
  if (band === 'Critical') return 'critical';
  if (band === 'High') return 'high';
  if (band === 'Moderate') return 'moderate';
  return 'controlled';
}

function CategoryBars({ items }: { items: Array<{ category: string; score: number }> }) {
  const max = Math.max(...items.map((i) => Number(i.score)), 1);
  return (
    <div className="dash-bars">
      {items.map((item) => (
        <div className="dash-bar-row" key={item.category}>
          <span>{item.category}</span>
          <div className="dash-bar-track">
            <div className="dash-bar-fill" style={{ width: `${(Number(item.score) / max) * 100}%` }} />
          </div>
          <strong>{Number(item.score).toFixed(1)}</strong>
        </div>
      ))}
      {!items.length && <p className="muted small">No category scores available.</p>}
    </div>
  );
}

export default function AssessmentReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [assessment, setAssessment] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const [reviewNote, setReviewNote] = useState('');
  const [returnComment, setReturnComment] = useState('');
  const [responseQuery, setResponseQuery] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});
  const [newRec, setNewRec] = useState({
    title: '',
    summary: '',
    priority: 'MEDIUM',
    serviceOffering: '',
    suggestedNextStep: '',
  });

  const load = useCallback(async () => {
    const [a, ev] = await Promise.all([
      apiFetch(`/assessments/${id}`),
      apiFetch(`/evidence/assessment/${id}`),
    ]);
    setAssessment(a);
    setEvidence(ev);
    setReviewNote(a.reviewNote || '');
    setEvidenceNotes(Object.fromEntries(ev.map((item: any) => [item.id, item.reviewerNote || ''])));
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const snapshot = assessment?.scoreSnapshots?.[0];
  const leakage = snapshot?.leakageResult || {};
  const categories = snapshot?.categoryScores || [];

  const evidenceSummary = useMemo(() => {
    const accepted = evidence.filter((e) => e.status === 'ACCEPTED' || e.status === 'VERIFIED').length;
    const rejected = evidence.filter((e) => e.status === 'REJECTED').length;
    const pending = evidence.length - accepted - rejected;
    return { accepted, rejected, pending, total: evidence.length };
  }, [evidence]);

  const filteredResponses = useMemo(() => {
    const rows = assessment?.responses || [];
    const q = responseQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row: any) =>
      [row.question?.code, row.question?.text, row.responseOption?.label]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [assessment, responseQuery]);

  const canApprove = assessment?.status === 'REVIEWED';
  const canMarkReviewed = ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'EVIDENCE_REVIEW', 'ANALYST_REVIEW'].includes(
    assessment?.status,
  );

  if (!assessment) {
    return (
      <AuthGate>
        <Shell title="Assessment review">
          {error ? <p className="error">{error}</p> : <div className="loading-screen">Loading review…</div>}
        </Shell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <Shell
        title={`Review · ${assessment.reference}`}
        actions={
          <>
            <Link className="btn secondary" href="/assessments/assigned">Review queue</Link>
            <Link className="btn secondary" href={`/assessments/${id}`}>Assessment details</Link>
          </>
        }
      >
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {assessment.returnReason && (
          <div className="rev-alert">
            <strong>Returned to client</strong>
            <p>{assessment.returnReason}</p>
          </div>
        )}

        <section className={`rev-hero rev-hero-${riskAccent(snapshot?.riskBand)}`}>
          <div className="rev-hero-main">
            <p className="rev-hero-kicker">{assessment.reference}</p>
            <h2>{assessment.organisation?.name}</h2>
            <p>
              {assessment.organisation?.industry || 'Industry not set'}
              {' · '}
              {assessment.organisation?.primaryEmail || 'No email'}
            </p>
            <div className="rev-hero-badges">
              <LegacyStatusBadge value={assessment.status} />
              {snapshot && <span className="rev-risk-pill">{snapshot.riskBand} risk</span>}
              <span className="rev-meta-pill">{assessment.questionnaireVersion?.version || snapshot?.modelVersion || 'SCLI'}</span>
            </div>
          </div>
          <div className="rev-hero-stats">
            <div>
              <span>SCLI score</span>
              <strong>{snapshot ? Number(snapshot.overallRiskScore).toFixed(1) : '—'}</strong>
            </div>
            <div>
              <span>Likely leakage</span>
              <strong>{snapshot ? money(leakage.likelyLeakageValue) : '—'}</strong>
            </div>
            <div>
              <span>Recoverable</span>
              <strong>{snapshot ? money(leakage.recoverableHigh) : '—'}</strong>
            </div>
            <div>
              <span>Evidence</span>
              <strong>{evidenceSummary.accepted}/{evidenceSummary.total}</strong>
              <small>{evidenceSummary.pending} pending</small>
            </div>
          </div>
        </section>

        <div className="rev-layout">
          <div className="rev-main">
            <nav className="tabs rev-tabs">
              {TABS.map((t) => (
                <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                  {t.id === 'evidence' && evidenceSummary.pending > 0 && (
                    <span className="tab-missing">{evidenceSummary.pending}</span>
                  )}
                  {t.id === 'recommendations' && (assessment.recommendations?.length || 0) > 0 && (
                    <span className="rev-tab-count">{assessment.recommendations.length}</span>
                  )}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <div className="rev-panel">
                <div className="rev-panel-grid">
                  <section className="rev-card">
                    <h3>Organisation</h3>
                    <dl className="rev-kv">
                      <div><dt>Name</dt><dd>{assessment.organisation?.name}</dd></div>
                      <div><dt>Industry</dt><dd>{assessment.organisation?.industry || '—'}</dd></div>
                      <div><dt>Email</dt><dd>{assessment.organisation?.primaryEmail || '—'}</dd></div>
                      <div><dt>Source</dt><dd>{assessment.source || 'INTERNAL'}</dd></div>
                    </dl>
                  </section>
                  <section className="rev-card">
                    <h3>Assessment</h3>
                    <dl className="rev-kv">
                      <div><dt>Reference</dt><dd>{assessment.reference}</dd></div>
                      <div><dt>Status</dt><dd><LegacyStatusBadge value={assessment.status} /></dd></div>
                      <div><dt>Updated</dt><dd>{new Date(assessment.updatedAt).toLocaleString('en-ZA')}</dd></div>
                      <div><dt>Methodology</dt><dd>{assessment.questionnaireVersion?.version || snapshot?.modelVersion || '—'}</dd></div>
                    </dl>
                  </section>
                </div>
                <section className="rev-card">
                  <div className="rev-card-head">
                    <div>
                      <h3>Calibration inputs</h3>
                      <p className="muted small">Commercial and operational assumptions captured at intake</p>
                    </div>
                    <span className="rev-count">{(assessment.inputValues || []).length} fields</span>
                  </div>
                  <div className="rev-input-grid">
                    {(assessment.inputValues || []).map((row: any) => (
                      <div className="rev-input-item" key={row.id}>
                        <span>{row.inputDefinition?.code}</span>
                        <strong>{row.inputDefinition?.label}</strong>
                        <p>{typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value ?? '—')}</p>
                      </div>
                    ))}
                    {!assessment.inputValues?.length && <p className="muted">No calibration inputs recorded.</p>}
                  </div>
                </section>
              </div>
            )}

            {tab === 'scores' && (
              <div className="rev-panel">
                {!snapshot ? (
                  <section className="rev-card rev-empty">
                    <h3>Scoring not available</h3>
                    <p className="muted">Run evaluation from the assessment detail page before marking this review complete.</p>
                    <Link className="btn secondary" href={`/assessments/${id}`}>Open assessment</Link>
                  </section>
                ) : (
                  <>
                    <div className="rev-score-grid">
                      <article className="rev-score-card accent">
                        <span>SCLI risk</span>
                        <strong>{Number(snapshot.overallRiskScore).toFixed(1)}</strong>
                        <small>{snapshot.riskBand} band</small>
                      </article>
                      <article className="rev-score-card">
                        <span>Governance</span>
                        <strong>{Number(snapshot.maturityScore).toFixed(1)}</strong>
                        <small>Maturity index</small>
                      </article>
                      <article className="rev-score-card">
                        <span>Confidence</span>
                        <strong>{(Number(snapshot.methodologyConfidence) * 100).toFixed(0)}%</strong>
                        <small>Methodology confidence</small>
                      </article>
                      <article className="rev-score-card">
                        <span>Opportunity</span>
                        <strong>{Number(snapshot.opportunityScore).toFixed(1)}</strong>
                        <small>Recovery potential</small>
                      </article>
                    </div>
                    <section className="rev-card">
                      <h3>Leakage exposure</h3>
                      <div className="rev-leakage-grid">
                        <div><span>Minimum</span><strong>{money(leakage.minimumLeakageValue)}</strong></div>
                        <div className="accent"><span>Likely</span><strong>{money(leakage.likelyLeakageValue)}</strong></div>
                        <div><span>Maximum</span><strong>{money(leakage.maximumExposureValue)}</strong></div>
                        <div><span>Recoverable range</span><strong>{money(leakage.recoverableLow)} – {money(leakage.recoverableHigh)}</strong></div>
                      </div>
                    </section>
                    <section className="rev-card">
                      <h3>Category scores</h3>
                      <CategoryBars items={categories} />
                    </section>
                  </>
                )}
              </div>
            )}

            {tab === 'responses' && (
              <div className="rev-panel">
                <section className="rev-card">
                  <div className="rev-card-head">
                    <div>
                      <h3>Questionnaire responses</h3>
                      <p className="muted small">All captured answers for analyst verification</p>
                    </div>
                    <input
                      className="rev-search"
                      placeholder="Search code, question or answer…"
                      value={responseQuery}
                      onChange={(e) => setResponseQuery(e.target.value)}
                    />
                  </div>
                  <div className="table-wrap">
                    <table className="rev-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Question</th>
                          <th>Answer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResponses.map((row: any) => (
                          <tr key={row.id}>
                            <td><code>{row.question?.code}</code></td>
                            <td>{row.question?.text}</td>
                            <td><strong>{row.responseOption?.label || '—'}</strong></td>
                          </tr>
                        ))}
                        {!filteredResponses.length && (
                          <tr><td colSpan={3} className="muted">No responses match your search.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {tab === 'recommendations' && (
              <div className="space-y-4">
                <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-moss-text">Recommendations</h3>
                    <p className="text-sm text-moss-muted">
                      Edit client-facing wording, priority and report inclusion for this assessment.
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {(assessment.recommendations || []).length} item{(assessment.recommendations || []).length === 1 ? '' : 's'}
                  </Badge>
                </div>

                {!(assessment.recommendations || []).length && (
                  <EmptyState
                    icon={Lightbulb}
                    title="No recommendations yet"
                    description="Add a recommendation below, or re-run evaluation if rules should have triggered."
                  />
                )}

                {(assessment.recommendations || []).map((rec: any, index: number) => (
                  <Card
                    key={rec.id}
                    className={cn(
                      'min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
                      !rec.includeInReport && 'opacity-90',
                    )}
                  >
                    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-slate-100 bg-slate-50/60 pb-4">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex size-6 items-center justify-center rounded-md bg-moss-red/10 text-xs font-bold text-moss-red">
                            {index + 1}
                          </span>
                          <CardTitle className="min-w-0 break-words text-base font-semibold leading-snug text-moss-text">
                            {rec.title}
                          </CardTitle>
                        </div>
                        {rec.originalSummary && rec.originalSummary !== rec.summary && (
                          <CardDescription className="break-words text-xs">
                            Original: {rec.originalSummary}
                          </CardDescription>
                        )}
                      </div>
                      <PriorityBadge priority={rec.priority} />
                    </CardHeader>

                    <CardContent className="min-w-0 space-y-4 p-4 sm:p-5">
                      <div className="space-y-2">
                        <Label htmlFor={`rec-summary-${rec.id}`} className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                          Client-facing wording
                        </Label>
                        <Textarea
                          id={`rec-summary-${rec.id}`}
                          defaultValue={rec.summary}
                          rows={3}
                          className="min-h-[88px] resize-y"
                          onBlur={(e) => {
                            if (e.target.value !== rec.summary) {
                              void run(async () => {
                                await apiFetch(`/recommendations/${rec.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ summary: e.target.value }),
                                });
                                setNotice('Recommendation wording updated.');
                              });
                            }
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                            Priority
                          </Label>
                          <Select
                            defaultValue={rec.priority || 'MEDIUM'}
                            onValueChange={(value) => void run(async () => {
                              await apiFetch(`/recommendations/${rec.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ priority: value }),
                              });
                              setNotice('Priority updated.');
                            })}
                          >
                            <SelectTrigger aria-label={`Priority for ${rec.title}`}>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                            <SelectContent>
                              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex min-h-[68px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-moss-text">Include in report</p>
                            <p className="text-xs text-moss-muted">
                              {rec.includeInReport ? 'Shown in the executive PDF' : 'Hidden from the executive PDF'}
                            </p>
                          </div>
                          <Switch
                            checked={Boolean(rec.includeInReport)}
                            disabled={busy}
                            aria-label={`Include ${rec.title} in report`}
                            onCheckedChange={(checked) => void run(async () => {
                              await apiFetch(`/recommendations/${rec.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ includeInReport: checked }),
                              });
                              setNotice(checked ? 'Included in report.' : 'Excluded from report.');
                            })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`rec-next-${rec.id}`} className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                            Suggested next step
                          </Label>
                          <Input
                            id={`rec-next-${rec.id}`}
                            defaultValue={rec.suggestedNextStep || ''}
                            placeholder="e.g. Schedule recovery workshop"
                            onBlur={(e) => {
                              if (e.target.value !== (rec.suggestedNextStep || '')) {
                                void run(async () => {
                                  await apiFetch(`/recommendations/${rec.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ suggestedNextStep: e.target.value }),
                                  });
                                });
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`rec-service-${rec.id}`} className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                            Service offering
                          </Label>
                          <Input
                            id={`rec-service-${rec.id}`}
                            defaultValue={rec.serviceOffering || ''}
                            placeholder="e.g. Security Cost Recovery Review"
                            onBlur={(e) => {
                              if (e.target.value !== (rec.serviceOffering || '')) {
                                void run(async () => {
                                  await apiFetch(`/recommendations/${rec.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ serviceOffering: e.target.value }),
                                  });
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Card className="min-w-0 rounded-xl border border-dashed border-slate-300 bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-moss-red/10 text-moss-red">
                        <FilePlus2 className="size-4" />
                      </span>
                      <div>
                        <CardTitle className="text-base">Add recommendation</CardTitle>
                        <CardDescription>Create an additional analyst recommendation for this review.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="new-rec-title" className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                          Title
                        </Label>
                        <Input
                          id="new-rec-title"
                          value={newRec.title}
                          onChange={(e) => setNewRec({ ...newRec, title: e.target.value })}
                          placeholder="Recommendation title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                          Priority
                        </Label>
                        <Select
                          value={newRec.priority}
                          onValueChange={(value) => setNewRec({ ...newRec, priority: value })}
                        >
                          <SelectTrigger aria-label="New recommendation priority">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-rec-summary" className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                        Client-facing wording
                      </Label>
                      <Textarea
                        id="new-rec-summary"
                        rows={3}
                        value={newRec.summary}
                        onChange={(e) => setNewRec({ ...newRec, summary: e.target.value })}
                        placeholder="Wording that will appear in the executive report"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="new-rec-service" className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                          Service offering
                        </Label>
                        <Input
                          id="new-rec-service"
                          value={newRec.serviceOffering}
                          onChange={(e) => setNewRec({ ...newRec, serviceOffering: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-rec-next" className="text-xs font-semibold uppercase tracking-wide text-moss-muted">
                          Suggested next step
                        </Label>
                        <Input
                          id="new-rec-next"
                          value={newRec.suggestedNextStep}
                          onChange={(e) => setNewRec({ ...newRec, suggestedNextStep: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t border-slate-100 bg-slate-50/50 pt-4">
                    <Button
                      type="button"
                      disabled={busy || !newRec.title || !newRec.summary}
                      onClick={() => void run(async () => {
                        await apiFetch(`/assessments/${id}/recommendations`, {
                          method: 'POST',
                          body: JSON.stringify(newRec),
                        });
                        setNewRec({
                          title: '',
                          summary: '',
                          priority: 'MEDIUM',
                          serviceOffering: '',
                          suggestedNextStep: '',
                        });
                        setNotice('Recommendation added.');
                      })}
                    >
                      <Plus className="size-4" />
                      Add recommendation
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}

            {tab === 'evidence' && (
              <div className="rev-panel">
                <div className="rev-evidence-summary">
                  <span className="rev-ev-chip ok">{evidenceSummary.accepted} accepted</span>
                  <span className="rev-ev-chip warn">{evidenceSummary.pending} pending</span>
                  <span className="rev-ev-chip bad">{evidenceSummary.rejected} rejected</span>
                </div>
                {evidence.map((item: any) => (
                  <section className="rev-evidence-card" key={item.id}>
                    <div className="rev-evidence-head">
                      <div>
                        <h3>{item.fileName}</h3>
                        <p className="muted small">
                          {item.mimeType} · {(item.sizeBytes / 1024).toFixed(1)} KB · {new Date(item.uploadedAt).toLocaleString('en-ZA')}
                        </p>
                      </div>
                      <LegacyStatusBadge value={item.status} />
                    </div>
                    <label className="rev-field">
                      <span>Analyst note</span>
                      <input
                        value={evidenceNotes[item.id] ?? ''}
                        placeholder="Optional note for acceptance or rejection"
                        onChange={(e) => setEvidenceNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </label>
                    <div className="rev-evidence-actions">
                      <button className="btn secondary" disabled={busy} onClick={() => void run(async () => {
                        const dl = await apiFetch(`/evidence/${item.id}/download`);
                        window.open(dl.url, '_blank');
                      })}>
                        Preview / download
                      </button>
                      <button className="btn" disabled={busy} onClick={() => void run(async () => {
                        await apiFetch(`/evidence/${item.id}/status`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: 'ACCEPTED', reviewerNote: evidenceNotes[item.id] || undefined }),
                        });
                        setNotice('Evidence accepted.');
                      })}>
                        Accept
                      </button>
                      <button className="btn secondary" disabled={busy} onClick={() => void run(async () => {
                        await apiFetch(`/evidence/${item.id}/status`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            status: 'REJECTED',
                            reviewerNote: evidenceNotes[item.id] || 'Insufficient evidence',
                          }),
                        });
                        setNotice('Evidence rejected.');
                      })}>
                        Reject
                      </button>
                    </div>
                  </section>
                ))}
                {!evidence.length && (
                  <section className="rev-card rev-empty">
                    <h3>No evidence uploaded</h3>
                    <p className="muted">The client has not attached supporting files for this assessment.</p>
                  </section>
                )}
              </div>
            )}
          </div>

          <aside className="rev-sidebar">
            <section className="rev-sidebar-card">
              <h3>Review workflow</h3>
              <ol className="rev-workflow">
                <li className={snapshot ? 'done' : ''}>Scores evaluated</li>
                <li className={evidenceSummary.total === 0 || evidenceSummary.pending === 0 ? 'done' : ''}>Evidence reviewed</li>
                <li className={['REVIEWED', 'APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED'].includes(assessment.status) ? 'done' : ''}>Marked reviewed</li>
                <li className={['APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED'].includes(assessment.status) ? 'done' : ''}>Approved</li>
              </ol>
            </section>

            <section className="rev-sidebar-card">
              <h3>Analyst note</h3>
              <p className="muted small">Internal note — not shown to the client.</p>
              <textarea
                rows={5}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Capture review observations, gaps, or approval rationale…"
              />
              <div className="rev-sidebar-actions">
                <button className="btn secondary" disabled={busy} onClick={() => void run(async () => {
                  await apiFetch(`/assessments/${id}/review-note`, { method: 'PATCH', body: JSON.stringify({ note: reviewNote }) });
                  setNotice('Review note saved.');
                })}>
                  Save note
                </button>
                <button className="btn" disabled={busy || !canMarkReviewed} onClick={() => void run(async () => {
                  await apiFetch(`/assessments/${id}/mark-reviewed`, { method: 'POST', body: JSON.stringify({ note: reviewNote }) });
                  setNotice('Marked as reviewed.');
                })}>
                  Mark as reviewed
                </button>
                <button className="btn" disabled={busy || !canApprove} onClick={() => void run(async () => {
                  await apiFetch(`/assessments/${id}/approve`, { method: 'POST', body: '{}' });
                  setNotice('Assessment approved and executive report generation started.');
                })}>
                  Approve assessment
                </button>
                <button className="btn secondary" disabled={busy} onClick={() => void run(async () => {
                  await apiFetch(`/reports/assessment/${id}/generate`, {
                    method: 'POST',
                    body: JSON.stringify({ reportType: 'PRELIMINARY_EXECUTIVE' }),
                  });
                  setNotice('Preliminary report generated.');
                })}>
                  Generate preliminary PDF
                </button>
              </div>
            </section>

            <section className="rev-sidebar-card">
              <h3>Return to client</h3>
              <p className="muted small">Use when information is incomplete or evidence is insufficient.</p>
              <textarea
                rows={3}
                value={returnComment}
                onChange={(e) => setReturnComment(e.target.value)}
                placeholder="Explain what the client needs to fix or resubmit…"
              />
              <button
                className="btn secondary rev-return-btn"
                disabled={busy || !returnComment.trim()}
                onClick={() => void run(async () => {
                  await apiFetch(`/assessments/${id}/return-to-client`, {
                    method: 'POST',
                    body: JSON.stringify({ comment: returnComment }),
                  });
                  setReturnComment('');
                  setNotice('Assessment returned to client.');
                })}
              >
                Return to client
              </button>
            </section>
          </aside>
        </div>
      </Shell>
    </AuthGate>
  );
}
