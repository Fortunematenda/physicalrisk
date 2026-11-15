'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  BadgeCheck,
  ClipboardList,
  FileWarning,
  Layers,
  Lightbulb,
  Percent,
} from 'lucide-react';

import { StatCard } from '@/components/dashboard/stat-card';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '../../../../../lib/api';
import {
  MOSS_SCORE_LABELS,
  formatMossAssessmentLifecycle,
  mossApiErrorMessage,
} from '../../../../../lib/moss';
import { MetricCard } from '../../../../../components/Ui';

function base64ToPdfBlob(base64: string, mimeType = 'application/pdf') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function scoreOutOfFour(display: string | null | undefined, numeric?: number | null) {
  if (!display || display === '—') return '—';
  if (/pending/i.test(display)) return display;
  if (String(display).includes('/ 4')) return display;
  const band =
    numeric != null && Number.isFinite(numeric)
      ? MOSS_SCORE_LABELS[Math.max(0, Math.min(4, Math.round(numeric)))]
      : null;
  return band ? `${display} / 4 · ${band}` : `${display} / 4`;
}

export default function MossResultsPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const confirm = useConfirm();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [latestReportId, setLatestReportId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState('');

  async function openReportFile(reportId: string) {
    const content = await apiFetch<{
      base64?: string;
      mimeType?: string;
      size?: number;
      fileName?: string;
    }>(`/moss/reports/${reportId}/content`);
    if (!content.base64 || !content.size) {
      throw new Error('Report file is empty.');
    }
    const pdfBlob = base64ToPdfBlob(content.base64, content.mimeType || 'application/pdf');
    const header = new Uint8Array(await pdfBlob.slice(0, 5).arrayBuffer());
    const magic = String.fromCharCode(...header);
    if (magic !== '%PDF-') {
      throw new Error('Downloaded file is not a PDF. Try Generate PDF report again.');
    }
    const url = URL.createObjectURL(pdfBlob);
    const opened = window.open(url, '_blank');
    if (!opened) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = content.fileName || `moss-report-${reportId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  async function load() {
    try {
      setError('');
      setLoading(true);
      const res = await apiFetch(`/moss/assessments/${id}/results`);
      setData(res);
      try {
        const reports = await apiFetch<Array<{ id: string }>>(`/moss/assessments/${id}/reports`);
        setLatestReportId(reports?.[0]?.id || null);
      } catch {
        setLatestReportId(null);
      }
    } catch (e) {
      setError(mossApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  async function evaluate() {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/moss/assessments/${id}/evaluate`, { method: 'POST', body: '{}' });
      await load();
      toast({
        variant: 'success',
        title: 'Evaluation refreshed',
        description: 'Scores, findings count and evidence coverage were recalculated.',
      });
    } catch (e) {
      const message = mossApiErrorMessage(e);
      setError(message);
      toast({ variant: 'error', title: 'Evaluation failed', description: message });
    } finally {
      setBusy(false);
    }
  }

  async function generateReport() {
    setReportBusy(true);
    setError('');
    try {
      const report = await apiFetch<{ id: string }>(`/moss/assessments/${id}/reports/generate`, {
        method: 'POST',
        body: '{}',
      });
      if (report.id) {
        setLatestReportId(report.id);
        await openReportFile(report.id);
        toast({
          variant: 'success',
          title: data?.workflow?.isLocked || data?.status === 'APPROVED'
            ? 'Approved executive report generated'
            : 'Preliminary executive report generated',
          description:
            data?.status === 'APPROVED'
              ? 'This PDF is the locked approved report.'
              : 'Marked preliminary until the assessment is approved.',
        });
      }
    } catch (e) {
      const message = mossApiErrorMessage(e, 'Unable to generate MOSS report.');
      setError(message);
      toast({ variant: 'error', title: 'Report failed', description: message });
    } finally {
      setReportBusy(false);
    }
  }

  async function runWorkflow(action: 'mark-reviewed' | 'approve' | 'return') {
    setWorkflowBusy(true);
    setError('');
    try {
      if (action === 'return') {
        const comment = returnComment.trim();
        if (comment.length < 2) {
          toast({
            variant: 'error',
            title: 'Return comment required',
            description: 'Explain what the assessor must fix.',
          });
          return;
        }
        const ok = await confirm({
          title: 'Return assessment for correction?',
          description: 'The assessor will be able to edit controls again.',
          confirmLabel: 'Return',
        });
        if (!ok) return;
        await apiFetch(`/moss/assessments/${id}/return`, {
          method: 'POST',
          body: JSON.stringify({ comment }),
        });
        setReturnComment('');
        toast({ variant: 'success', title: 'Assessment returned for correction' });
      } else if (action === 'mark-reviewed') {
        await apiFetch(`/moss/assessments/${id}/mark-reviewed`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        toast({
          variant: 'success',
          title: 'Marked as reviewed',
          description: 'You can now Approve & lock when ready.',
        });
      } else {
        const ok = await confirm({
          title: 'Approve and lock this assessment?',
          description:
            'Scores and evidence become locked. Generate the Approved Executive Report afterwards.',
          confirmLabel: 'Approve & lock',
        });
        if (!ok) return;
        await apiFetch(`/moss/assessments/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        toast({
          variant: 'success',
          title: 'Assessment approved and locked',
          description: 'Generate the Approved Executive Report from this page.',
        });
      }
      await load();
    } catch (e) {
      const message = mossApiErrorMessage(e);
      setError(message);
      toast({ variant: 'error', title: 'Workflow action failed', description: message });
    } finally {
      setWorkflowBusy(false);
    }
  }

  const findingsCount = data?.findings?.length ?? 0;
  const recommendationsCount = data?.recommendations?.length ?? 0;
  const evidenceGaps = data?.evidenceGaps?.length ?? 0;
  const evidenceUploaded = data?.evidenceUploaded?.length ?? 0;
  const completion = data?.completenessPercent?.toFixed?.(1) ?? data?.completenessPercent ?? '—';
  const workflow = data?.workflow;
  const lastEvaluated = data?.calculatedAt
    ? new Date(data.calculatedAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })
    : null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Results & review</h2>
          <p className="mt-1 text-sm text-slate-500">
            {data
              ? `${data.reference} · Catalogue v${data.catalogueVersion || '3.0'} · ${data.organisation?.name || ''}${
                  data.site ? ` · ${data.site.siteCode}` : ''
                }`
              : 'Completion, evaluation, evidence and approval'}
          </p>
          {data ? (
            <p className="mt-1 text-xs font-medium text-slate-500">
              Lifecycle:{' '}
              {formatMossAssessmentLifecycle({
                status: data.status,
                submittedAt: data.submittedAt,
                lockedAt: data.lockedAt,
              })}
              {lastEvaluated ? ` · Last evaluated ${lastEvaluated}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {latestReportId ? (
            <Button
              type="button"
              variant="outline"
              disabled={reportBusy || loading}
              onClick={() =>
                void openReportFile(latestReportId).catch((e) => {
                  const message = mossApiErrorMessage(e);
                  setError(message);
                  toast({ variant: 'error', title: message });
                })
              }
            >
              Open latest PDF
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={reportBusy || loading}
            onClick={() => void generateReport()}
          >
            {reportBusy ? 'Generating…' : 'Generate PDF report'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => void evaluate()}
          >
            {busy ? 'Evaluating…' : 'Evaluate / Refresh'}
          </Button>
        </div>
      </div>

      {error ? <p className="error mb-4">{error}</p> : null}

      {workflow?.reviewGuide ? (
        <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Review Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="m-0 text-sm text-slate-700">{workflow.reviewGuide}</p>
            <p className="m-0 text-xs text-slate-500">
              Scoring completion ({typeof completion === 'number' ? `${completion}%` : `${completion}%`}{' '}
              controls scored) is not the same as approval. Preliminary PDFs stay preliminary until you
              Approve &amp; lock.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/moss/assessments/${id}`} scroll={false}>
                  Open Controls
                </Link>
              </Button>
              {workflow.canMarkReviewed ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={workflowBusy}
                  onClick={() => void runWorkflow('mark-reviewed')}
                >
                  {workflowBusy ? 'Working…' : 'Mark reviewed'}
                </Button>
              ) : null}
              {workflow.canApprove ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#c41230] hover:bg-[#a10f28]"
                  disabled={workflowBusy}
                  onClick={() => void runWorkflow('approve')}
                >
                  {workflowBusy ? 'Working…' : 'Approve & lock'}
                </Button>
              ) : null}
            </div>
            {workflow.canReturn ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="moss-return-comment">Return for correction</Label>
                  <Input
                    id="moss-return-comment"
                    value={returnComment}
                    placeholder="What must the assessor fix?"
                    onChange={(e) => setReturnComment(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={workflowBusy}
                  onClick={() => void runWorkflow('return')}
                >
                  Return for correction
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={Percent}
          title="Completion"
          value={typeof completion === 'number' ? `${completion}%` : `${completion}%`}
          description="Controls scored — not approval"
          tone="blue"
          loading={loading}
        />
        <StatCard
          icon={BadgeCheck}
          title="Overall MOSS Score"
          value={scoreOutOfFour(data?.overallScoreDisplay, data?.overallScore)}
          description={data?.scoringMethodology || 'Unweighted mean of domain scores'}
          tone="amber"
          loading={loading}
        />
        <StatCard
          icon={Layers}
          title="Domain Maturity"
          value={scoreOutOfFour(data?.domainMaturityDisplay)}
          description="Unweighted mean of scored domains · /4"
          tone="slate"
          loading={loading}
        />
        <StatCard
          icon={FileWarning}
          title="Findings"
          value={findingsCount}
          description="Structured findings"
          tone="red"
          loading={loading}
        />
        <StatCard
          icon={Lightbulb}
          title="Recommendations"
          value={recommendationsCount}
          description="Assessor-authored"
          tone="violet"
          loading={loading}
        />
        <StatCard
          icon={ClipboardList}
          title="Evidence"
          value={`${evidenceUploaded} up · ${evidenceGaps} gaps`}
          description="Uploads vs standards without upload"
          tone="teal"
          loading={loading}
        />
      </div>

      {data ? (
        <>
          <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Control score distribution (0–4)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid metrics">
                {[0, 1, 2, 3, 4].map((s) => (
                  <MetricCard
                    key={s}
                    label={`${s} · ${MOSS_SCORE_LABELS[s]}`}
                    value={data.scoreDistribution?.[s] ?? 0}
                    detail="Controls"
                  />
                ))}
                <MetricCard
                  label="Unscored"
                  value={data.scoreDistribution?.unscored ?? 0}
                  detail="Controls"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Domain maturity</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                {(data.domainScores || []).length} domains in catalogue order
                {data.scoringMethodology ? ` · ${data.scoringMethodology}` : ''}
              </p>
            </CardHeader>
            <CardContent>
              {(data.domainScores || []).length === 0 ? (
                <p className="text-sm text-slate-500">No domain scores available yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(data.domainScores || []).map((d: any) => {
                    const scored = Number(d.controlsScored ?? 0);
                    const total = Math.max(Number(d.controlsTotal ?? 0), 1);
                    const pct = Math.round((scored / total) * 100);
                    const band =
                      d.score == null
                        ? null
                        : MOSS_SCORE_LABELS[Math.max(0, Math.min(4, Math.round(Number(d.score))))];
                    return (
                      <div
                        key={d.domainCode}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-colors hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                            {d.domainCode}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">{pct}%</span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900">
                          {d.domainName || d.name || d.domainCode}
                        </h3>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[#c41230] transition-[width]"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                          <span>
                            {scored}/{d.controlsTotal ?? 0} scored
                          </span>
                          <span>
                            {d.score == null
                              ? 'No scored controls'
                              : `${Number(d.score).toFixed(2)} / 4${band ? ` · ${band}` : ''}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Findings</CardTitle>
                <Link
                  href={`/moss/assessments/${id}/findings`}
                  className="text-sm font-medium text-[#c41230]"
                  scroll={false}
                >
                  Manage
                </Link>
              </CardHeader>
              <CardContent>
                {(data.findings || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No structured findings yet.</p>
                ) : (
                  <ul className="m-0 list-none space-y-0 p-0">
                    {data.findings.map((f: any) => (
                      <li
                        key={f.id}
                        className="border-b border-slate-100 py-2.5 last:border-0"
                      >
                        <strong>
                          {f.controlCode || '—'} · {f.title}
                        </strong>
                        <div className="mt-1 text-xs font-medium text-slate-500">
                          Severity: {f.severityDisplay || 'Not classified'}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">Recommendations</CardTitle>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Only rows marked “Include in report” appear in the PDF
                  </p>
                </div>
                <Link
                  href={`/moss/assessments/${id}/recommendations`}
                  className="text-sm font-medium text-[#c41230]"
                  scroll={false}
                >
                  Manage
                </Link>
              </CardHeader>
              <CardContent>
                {(data.recommendations || []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No recommendations saved yet. Add them on the Recommendations tab — free-text notes
                    on a control are not the same as a report recommendation.
                  </p>
                ) : (
                  <ul className="m-0 list-none space-y-0 p-0">
                    {data.recommendations.map((r: any) => (
                      <li
                        key={r.id}
                        className="border-b border-slate-100 py-2.5 last:border-0"
                      >
                        <strong>{r.title}</strong>
                        <div className="mt-1 text-xs text-slate-500">
                          {r.includeInReport === false ? 'Excluded from PDF' : 'Included in PDF'}
                          {r.controlCode ? ` · ${r.controlCode}` : ''}
                        </div>
                        <div className="mt-1 text-sm text-slate-700">{r.summary}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Uploaded evidence</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {evidenceUploaded} document(s) linked to controls
                </p>
              </CardHeader>
              <CardContent>
                {(data.evidenceUploaded || []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No evidence uploaded yet. Upload per control on the Controls tab.
                  </p>
                ) : (
                  <ul className="m-0 max-h-80 list-none space-y-0 overflow-y-auto p-0">
                    {(data.evidenceUploaded || []).map((e: any) => (
                      <li
                        key={e.id}
                        className="border-b border-slate-100 py-2.5 last:border-0"
                      >
                        <strong className="text-sm text-slate-900">{e.fileName}</strong>
                        <div className="mt-1 text-xs text-slate-500">
                          {[e.domainCode, e.controlCode, e.controlName].filter(Boolean).join(' · ')}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[
                            e.uploadedByName ? `By ${e.uploadedByName}` : null,
                            e.uploadedAt
                              ? new Date(e.uploadedAt).toLocaleDateString('en-ZA')
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Evidence gaps (informational)</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Catalogue standards without an upload — not automatic failures
                </p>
              </CardHeader>
              <CardContent>
                {(data.evidenceGaps || []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No gaps — every control with standards has at least one upload.
                  </p>
                ) : (
                  <ul className="m-0 max-h-80 list-none space-y-0 overflow-y-auto p-0">
                    {(data.evidenceGaps || []).map((g: any) => (
                      <li
                        key={g.controlCode}
                        className="border-b border-slate-100 py-2.5 last:border-0"
                      >
                        <strong className="text-sm text-slate-900">
                          {[g.domainCode, g.controlCode].filter(Boolean).join(' · ')} ·{' '}
                          {g.controlName || g.label}
                        </strong>
                        {Array.isArray(g.requiredStandards) && g.requiredStandards.length ? (
                          <div className="mt-1 text-xs text-slate-500">
                            Expected: {g.requiredStandards.slice(0, 3).join('; ')}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
