'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Calculator,
  CheckCircle2,
  Layers,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { AuthGate } from '../../../../components/AuthGate';
import { Shell } from '../../../../components/Shell';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '../../../../lib/api';
import { mossApiErrorMessage } from '../../../../lib/moss';

type ScoringPayload = {
  readOnly?: boolean;
  note?: string;
  configurationStatus?: 'CONFIGURED' | 'PENDING_METHODOLOGY';
  catalogue?: {
    version?: string;
    title?: string;
    status?: string;
    publishedAt?: string | null;
  } | null;
  active?: {
    version?: string;
    status?: string;
    domainAggregation?: string;
    overallAggregation?: string;
    notes?: string | null;
    publishedAt?: string | null;
    updatedAt?: string;
    domainWeights?: unknown;
    criticalControlPolicy?: unknown;
    severityMapping?: unknown;
    recommendationPolicy?: unknown;
    catalogueVersion?: { version?: string; title?: string; status?: string } | null;
  } | null;
  methodology?: {
    controlScale?: string;
    domainAggregationLabel?: string;
    overallAggregationLabel?: string;
    scoreLabels?: Record<string, string>;
    deferred?: string[];
  };
  history?: Array<{
    id: string;
    version: string;
    status: string;
    domainAggregation: string;
    overallAggregation: string;
    publishedAt?: string | null;
    createdAt: string;
    notes?: string | null;
  }>;
};

function formatAgg(mode?: string) {
  if (!mode) return '—';
  if (mode === 'MEAN') return 'MEAN (unweighted)';
  if (mode === 'WEIGHTED_MEAN') return 'Weighted mean';
  if (mode === 'MIN') return 'Minimum';
  if (mode === 'UNCONFIGURED') return 'Unconfigured';
  return mode;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function MossScoringAdminPage() {
  const [data, setData] = useState<ScoringPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch<ScoringPayload>('/moss/admin/scoring')
      .then(setData)
      .catch((e: unknown) => setError(mossApiErrorMessage(e, 'Unable to load MOSS scoring configuration.')))
      .finally(() => setLoading(false));
  }, []);

  const active = data?.active;
  const configured = data?.configurationStatus === 'CONFIGURED';
  const scoreLabels = data?.methodology?.scoreLabels || {};
  const deferred = data?.methodology?.deferred || [];
  const history = data?.history || [];

  return (
    <AuthGate>
      <Shell title="MOSS Scoring" subtitle="Read-only published methodology" hideSearch>
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              {data?.note
                || 'Published MEAN scoring configuration used for domain and overall maturity.'}
            </p>
            <Badge
              variant="secondary"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
            >
              <Lock className="size-3.5" aria-hidden="true" />
              Read-only · v{active?.version || '1.0.0'}
            </Badge>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Calculator}
              title="Config version"
              value={active?.version ? `v${active.version}` : '—'}
              description={active?.status || 'Published methodology'}
              tone="violet"
              loading={loading}
            />
            <StatCard
              icon={Layers}
              title="Domain aggregation"
              value={active?.domainAggregation === 'MEAN' ? 'MEAN' : (active?.domainAggregation || '—')}
              description={data?.methodology?.domainAggregationLabel || 'Domain score method'}
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={ShieldCheck}
              title="Overall aggregation"
              value={active?.overallAggregation === 'MEAN' ? 'MEAN' : (active?.overallAggregation || '—')}
              description={data?.methodology?.overallAggregationLabel || 'Overall score method'}
              tone="teal"
              loading={loading}
            />
            <StatCard
              icon={configured ? CheckCircle2 : XCircle}
              title="Status"
              value={configured ? 'Configured' : 'Pending'}
              description={
                data?.catalogue?.version
                  ? `Bound to catalogue v${data.catalogue.version}`
                  : 'Catalogue binding'
              }
              tone={configured ? 'green' : 'amber'}
              loading={loading}
            />
          </div>

          <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="space-y-5">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calculator className="size-4 text-[#c41230]" aria-hidden="true" />
                    Active configuration
                  </CardTitle>
                  <CardDescription>
                    Live methodology applied when MOSS assessments are scored.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <Row label="Version" value={active?.version ? `v${active.version}` : '—'} />
                  <Row
                    label="Status"
                    value={
                      <Badge variant={configured ? 'success' : 'secondary'} className="rounded-md">
                        {active?.status || '—'}
                      </Badge>
                    }
                  />
                  <Row label="Domain aggregation" value={formatAgg(active?.domainAggregation)} />
                  <Row label="Overall aggregation" value={formatAgg(active?.overallAggregation)} />
                  <Row
                    label="Published"
                    value={
                      active?.publishedAt
                        ? new Date(active.publishedAt).toLocaleString()
                        : '—'
                    }
                  />
                  <Row
                    label="Catalogue"
                    value={
                      data?.catalogue?.version
                        ? `v${data.catalogue.version}${data.catalogue.title ? ` · ${data.catalogue.title}` : ''}`
                        : '—'
                    }
                  />
                  {active?.notes ? (
                    <p className="mb-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
                      {active.notes}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Control maturity scale</CardTitle>
                  <CardDescription>
                    {data?.methodology?.controlScale || 'Assessor scores each control 0–4'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {['0', '1', '2', '3', '4'].map((score) => (
                      <div
                        key={score}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-center"
                      >
                        <div className="text-lg font-bold text-slate-900">{score}</div>
                        <div className="text-[11px] font-medium text-slate-500">
                          {scoreLabels[score] || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Configuration history</CardTitle>
                  <CardDescription>Recent scoring configuration records</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="muted mb-0">Loading…</p>
                  ) : history.length === 0 ? (
                    <p className="muted mb-0">No configuration history.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Version</th>
                            <th>Status</th>
                            <th>Domain</th>
                            <th>Overall</th>
                            <th>Published</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((row) => (
                            <tr key={row.id}>
                              <td>
                                <strong>v{row.version}</strong>
                              </td>
                              <td>{row.status}</td>
                              <td>{row.domainAggregation}</td>
                              <td>{row.overallAggregation}</td>
                              <td>
                                {row.publishedAt
                                  ? new Date(row.publishedAt).toLocaleString()
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="size-4 text-[#c41230]" aria-hidden="true" />
                    How scores roll up
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <p className="mb-0 leading-relaxed">
                    Each control is scored <strong>0–4</strong> by the assessor. Domain score is the
                    unweighted mean of scored controls in that domain. Overall MOSS score is the
                    unweighted mean of domain scores.
                  </p>
                  <Row label="Domain method" value={data?.methodology?.domainAggregationLabel || '—'} />
                  <Row label="Overall method" value={data?.methodology?.overallAggregationLabel || '—'} />
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Not enabled in v1</CardTitle>
                  <CardDescription>Deferred until client methodology approval</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="m-0 list-none space-y-2 p-0">
                    {deferred.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-600"
                      >
                        <XCircle className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Policy fields</CardTitle>
                  <CardDescription>Stored on config; unused by MEAN v1 engine</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row
                    label="Domain weights"
                    value={active?.domainWeights == null ? 'None' : 'Present'}
                  />
                  <Row
                    label="Critical policy"
                    value={active?.criticalControlPolicy == null ? 'None' : 'Present'}
                  />
                  <Row
                    label="Severity mapping"
                    value={active?.severityMapping == null ? 'None' : 'Present'}
                  />
                  <Row
                    label="Recommendation policy"
                    value={active?.recommendationPolicy == null ? 'None' : 'Present'}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
