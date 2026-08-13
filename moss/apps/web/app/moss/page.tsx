'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  BookOpen,
  ClipboardList,
  FileEdit,
  Layers,
  Shield,
} from 'lucide-react';

import { AuthGate } from '../../components/AuthGate';
import { Shell } from '../../components/Shell';
import { EmptyState } from '../../components/common/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '../../lib/api';
import { formatAssessmentProgress, formatMossAssessmentStatus, mossApiErrorMessage } from '../../lib/moss';

type Dashboard = {
  productName: string;
  catalogue: {
    version: string;
    domainCount?: number;
    controlCount?: number;
    domains?: number;
    controls?: number;
    title: string;
    status?: string;
  };
  counts: { active: number; draft: number; completed: number };
  recent: Array<{
    id: string;
    reference: string;
    title: string;
    status: string;
    progressPercent: number;
    controlsScored?: number;
    controlsTotal?: number;
    updatedAt?: string;
    organisation: { name: string };
    site?: { name: string; siteCode: string } | null;
  }>;
  overallMossScore: string;
  scoringMethodology?: string;
  configurationStatus?: string;
};

export default function MossDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError('');
    apiFetch<Dashboard>('/moss/dashboard')
      .then(setData)
      .catch((e: unknown) => setError(mossApiErrorMessage(e, 'Unable to load MOSS dashboard.')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const domains = data?.catalogue.domainCount ?? data?.catalogue.domains ?? 0;
  const controls = data?.catalogue.controlCount ?? data?.catalogue.controls ?? 0;

  return (
    <AuthGate>
      <Shell title="MOSS" subtitle="Master Catalogue control assessments">
        <div className="mb-5">
          <p className="text-sm text-slate-500">
            {data?.productName || 'Management of Security Systems'}
            {data?.catalogue.version ? ` · Catalogue v${data.catalogue.version}` : ''}
          </p>
            <p className="mt-1 text-sm text-slate-500">
              Overall MOSS Score:{' '}
              {data?.overallMossScore && !String(data.overallMossScore).includes('Pending')
                ? data.overallMossScore
                : data?.scoringMethodology
                  ? `${data.scoringMethodology} (open an assessment for live score)`
                  : 'Unweighted mean of domain scores'}
            </p>
        </div>

        {error ? (
          <p className="error mb-4">{error}</p>
        ) : null}

        <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={BookOpen}
            title="Master Catalogue"
            value={data ? `v${data.catalogue.version}` : '—'}
            description={data?.catalogue.status || 'Published methodology'}
            tone="slate"
            loading={loading}
            error={error || undefined}
            onRetry={load}
          />
          <StatCard
            icon={Layers}
            title="Domains"
            value={domains}
            description="Catalogue domains"
            tone="blue"
            loading={loading}
          />
          <StatCard
            icon={Shield}
            title="Controls"
            value={controls}
            description="Master Catalogue controls"
            tone="teal"
            loading={loading}
          />
          <StatCard
            icon={ClipboardList}
            title="Assessments"
            value={data?.counts.active ?? 0}
            description="Active portfolio"
            tone="red"
            loading={loading}
          />
          <StatCard
            icon={FileEdit}
            title="Draft"
            value={data?.counts.draft ?? 0}
            description="In progress / draft"
            tone="amber"
            loading={loading}
          />
          <StatCard
            icon={BadgeCheck}
            title="Completed"
            value={data?.counts.completed ?? 0}
            description="Submitted or later"
            tone="green"
            loading={loading}
          />
        </div>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent MOSS assessments</CardTitle>
          </CardHeader>
          <CardContent>
            {!loading && (!data || data.recent.length === 0) && !error ? (
              <EmptyState
                title="No MOSS assessments yet."
                description="Open Assessments and use New Assessment to evaluate controls against MOSS Master Catalogue v3.0."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Organisation</th>
                      <th>Site</th>
                      <th>Assessment Progress</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recent || []).map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                        onClick={() => router.push(`/moss/assessments/${row.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            router.push(`/moss/assessments/${row.id}`);
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open assessment ${row.reference}`}
                      >
                        <td>
                          <strong className="text-slate-900">{row.reference}</strong>
                        </td>
                        <td>{row.organisation?.name}</td>
                        <td>{row.site ? `${row.site.siteCode}` : '—'}</td>
                        <td>
                          {formatAssessmentProgress(
                            row.controlsScored ?? 0,
                            row.controlsTotal ?? 100,
                            row.progressPercent,
                          )}
                        </td>
                        <td>{formatMossAssessmentStatus(row.status)}</td>
                        <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Shell>
    </AuthGate>
  );
}
