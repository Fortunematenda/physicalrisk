'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ClipboardList,
  FileEdit,
  Inbox,
  Layers,
  Plus,
  Shield,
} from 'lucide-react';

import { AuthGate } from '../../components/AuthGate';
import { Shell } from '../../components/Shell';
import { EmptyState } from '../../components/common/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '../../lib/api';
import { formatSomodStatus, somodApiErrorMessage } from '../../lib/somod';

type RecentRow = {
  id: string;
  reference: string;
  title: string;
  status: string;
  updatedAt?: string;
  organisation: { name: string };
  site?: { name: string; siteCode: string } | null;
  preferredScenario?: { label: string; overallScore?: number | null } | null;
};

type Dashboard = {
  productName: string;
  note?: string;
  counts: {
    active: number;
    draft: number;
    completed: number;
    awaitingReview: number;
    approved: number;
    withPreferred: number;
  };
  recent: RecentRow[];
  awaitingReview: RecentRow[];
  pipeline: Array<{ key: string; label: string; count: number }>;
  engines: Array<{ key: string; name: string; description: string; status: string }>;
  scenarios: Array<{ scenarioType: string; label: string; summary: string }>;
};

export default function SomodDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<Dashboard>('/somod/dashboard')
      .then(setData)
      .catch((e: unknown) => setError(somodApiErrorMessage(e, 'Unable to load SOMOD dashboard.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthGate>
      <Shell title="SOMOD" subtitle="Security Operating Model Optimisation Diagnostic">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-sm text-slate-500">
            {data?.productName || 'SOMOD'}
            {data?.note ? ` · ${data.note}` : ''}
          </p>
          <Button type="button" onClick={() => router.push('/somod/assessments/new')}>
            <Plus className="size-4" aria-hidden="true" />
            New assessment
          </Button>
        </div>

        {error ? <p className="error mb-4">{error}</p> : null}

        <div className="dash2-kpi-row mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={ClipboardList}
            title="Assessments"
            value={data?.counts.active ?? 0}
            description="All SOMOD diagnostics"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={FileEdit}
            title="Working"
            value={data?.counts.draft ?? 0}
            description="Draft / in progress"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={Inbox}
            title="In review"
            value={data?.counts.awaitingReview ?? 0}
            description="Submitted or reviewed"
            tone="violet"
            loading={loading}
          />
          <StatCard
            icon={Shield}
            title="Approved"
            value={data?.counts.approved ?? 0}
            description={`${data?.counts.withPreferred ?? 0} with preferred path`}
            tone="teal"
            loading={loading}
          />
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {(data?.pipeline || [
            { key: 'DRAFT', label: 'Working', count: 0 },
            { key: 'REVIEW', label: 'In review', count: 0 },
            { key: 'APPROVED', label: 'Approved', count: 0 },
          ]).map((step) => (
            <div
              key={step.key}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {step.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {loading ? '—' : step.count}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-lg">Awaiting review</CardTitle>
                  <CardDescription>Submitted and reviewed diagnostics</CardDescription>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-[#c41230] hover:underline"
                  onClick={() => router.push('/somod/assessments')}
                >
                  View all
                </button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : !data?.awaitingReview?.length ? (
                  <EmptyState
                    icon={Inbox}
                    title="Nothing in review"
                    description="Submit a preferred scenario path to start the review workflow."
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.awaitingReview.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-slate-50"
                          onClick={() => router.push(`/somod/assessments/${row.id}`)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {row.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {row.reference} · {row.organisation.name}
                              {row.preferredScenario
                                ? ` · Preferred: ${row.preferredScenario.label}`
                                : ''}
                            </p>
                          </div>
                          <Badge variant="secondary">{formatSomodStatus(row.status)}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-lg">Recent assessments</CardTitle>
                <button
                  type="button"
                  className="text-sm font-semibold text-[#c41230] hover:underline"
                  onClick={() => router.push('/somod/assessments')}
                >
                  View all
                </button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : !data?.recent?.length ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No SOMOD assessments yet"
                    description="Create an assessment to start the optimisation workspace."
                    action={
                      <Button type="button" onClick={() => router.push('/somod/assessments/new')}>
                        New assessment
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {data.recent.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-slate-50"
                          onClick={() => router.push(`/somod/assessments/${row.id}`)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {row.title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {row.reference} · {row.organisation.name}
                              {row.site ? ` · ${row.site.name}` : ''}
                              {row.preferredScenario
                                ? ` · ${row.preferredScenario.label}`
                                : ''}
                            </p>
                          </div>
                          <Badge variant="secondary">{formatSomodStatus(row.status)}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers className="size-4 text-[#c41230]" aria-hidden="true" />
                  Engines
                </CardTitle>
                <CardDescription>
                  Editable inputs that feed the governed financial layer (Screens A–E)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data?.engines || []).map((engine) => (
                  <div
                    key={engine.key}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{engine.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        Ready
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{engine.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="size-4 text-[#c41230]" aria-hidden="true" />
                  Scenarios
                </CardTitle>
                <CardDescription>
                  Current · Risk-Aligned · Cost-Efficient · Recommended Optimal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data?.scenarios || []).map((scenario) => (
                  <div
                    key={scenario.scenarioType}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-slate-900">{scenario.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{scenario.summary}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
