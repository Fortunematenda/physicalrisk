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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '../../../../../lib/api';
import { mossApiErrorMessage } from '../../../../../lib/moss';
import { MetricCard } from '../../../../../components/Ui';

function base64ToPdfBlob(base64: string, mimeType = 'application/pdf') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export default function MossResultsPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [latestReportId, setLatestReportId] = useState<string | null>(null);

  async function openReportFile(reportId: string) {
    // JSON/base64 via BFF — binary /file proxy was returning empty bodies locally.
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
    try {
      await apiFetch(`/moss/assessments/${id}/evaluate`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(mossApiErrorMessage(e));
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
      }
    } catch (e) {
      setError(mossApiErrorMessage(e, 'Unable to generate MOSS report.'));
    } finally {
      setReportBusy(false);
    }
  }

  const findingsCount = data?.findings?.length ?? 0;
  const recommendationsCount = data?.recommendations?.length ?? 0;
  const evidenceGaps = data?.evidenceGaps?.length ?? 0;
  const completion = data?.completenessPercent?.toFixed?.(1) ?? data?.completenessPercent ?? '—';

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Results</h2>
          <p className="mt-1 text-sm text-slate-500">
            {data
              ? `${data.reference} · Catalogue v${data.catalogueVersion || '3.0'} · ${data.organisation?.name || ''}${
                  data.site ? ` · ${data.site.siteCode}` : ''
                }`
              : 'Completion and pending methodology scores'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {latestReportId ? (
            <Button
              type="button"
              variant="outline"
              disabled={reportBusy || loading}
              onClick={() => void openReportFile(latestReportId).catch((e) => setError(mossApiErrorMessage(e)))}
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

      <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={Percent}
          title="Completion"
          value={typeof completion === 'number' ? `${completion}%` : `${completion}%`}
          description="Controls scored"
          tone="blue"
          loading={loading}
        />
        <StatCard
          icon={BadgeCheck}
          title="Overall MOSS Score"
          value={data?.overallScoreDisplay ?? data?.overallScore ?? '—'}
          description={data?.scoringMethodology || 'Unweighted mean of domain scores'}
          tone="amber"
          loading={loading}
        />
        <StatCard
          icon={Layers}
          title="Domain Maturity"
          value={data?.domainMaturityDisplay ?? '—'}
          description="Unweighted mean of scored controls"
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
          description="Manual recommendations"
          tone="violet"
          loading={loading}
        />
        <StatCard
          icon={ClipboardList}
          title="Evidence gaps"
          value={evidenceGaps}
          description="Standards without upload"
          tone="teal"
          loading={loading}
        />
      </div>

      {data ? (
        <>
          <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Control score distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid metrics">
                {[0, 1, 2, 3, 4].map((s) => (
                  <MetricCard
                    key={s}
                    label={`Score ${s}`}
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
              <CardTitle className="text-lg">Domain completion</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                {(data.domainScores || []).length} domains
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
                          {d.domainName || d.domainCode}
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
                              : `Score ${typeof d.score === 'number' && !Number.isInteger(d.score) ? d.score.toFixed(2) : d.score}`}
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
                    Assessor-authored recommendations
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
                  <p className="text-sm text-slate-500">No manual recommendations yet.</p>
                ) : (
                  <ul className="m-0 list-none space-y-0 p-0">
                    {data.recommendations.map((r: any) => (
                      <li
                        key={r.id}
                        className="border-b border-slate-100 py-2.5 last:border-0"
                      >
                        <strong>{r.title}</strong>
                        <div className="mt-1 text-sm text-slate-700">{r.summary}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Evidence coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-sm text-slate-700">
                {(data.evidenceGaps || []).length} control(s) with catalogue evidence standards and
                no upload yet.
              </p>
              <p className="mt-2 mb-0 text-xs font-medium text-slate-500">
                Absence is labelled “Evidence not yet uploaded”, not a compliance failure.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}
