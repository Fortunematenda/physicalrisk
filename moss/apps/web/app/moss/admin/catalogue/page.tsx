'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  Layers,
  Lock,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { AuthGate } from '../../../../components/AuthGate';
import { Shell } from '../../../../components/Shell';
import { EmptyState } from '../../../../components/common/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '../../../../lib/api';
import { mossApiErrorMessage } from '../../../../lib/moss';

type DomainRow = {
  id: string;
  domainCode: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  controlCount?: number;
};

type CataloguePayload = {
  version?: string;
  status?: string;
  title?: string;
  domainCount?: number;
  controlCount?: number;
  domains?: DomainRow[] | number;
  controls?: number;
  publishedAt?: string | null;
  note?: string;
  readOnly?: boolean;
};

export default function MossCatalogueAdminPage() {
  const [data, setData] = useState<CataloguePayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    apiFetch<CataloguePayload>('/moss/admin/catalogue')
      .then(setData)
      .catch((e: unknown) => setError(mossApiErrorMessage(e, 'Unable to load MOSS catalogue.')))
      .finally(() => setLoading(false));
  }, []);

  const domainRows = useMemo(
    () => (Array.isArray(data?.domains) ? data.domains : []),
    [data],
  );

  const domainCount = data?.domainCount ?? domainRows.length;
  const controlCount =
    data?.controlCount ??
    (typeof data?.controls === 'number' ? data.controls : domainRows.reduce((n, d) => n + (d.controlCount ?? 0), 0));

  const filteredDomains = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return domainRows;
    return domainRows.filter((d) =>
      [d.domainCode, d.name, d.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [domainRows, search]);

  const publishedLabel = data?.publishedAt
    ? new Date(data.publishedAt).toLocaleString()
    : '—';

  return (
    <AuthGate>
      <Shell title="MOSS Catalogue" subtitle="Read-only governance" hideSearch>
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-sm text-slate-500">
              {(data?.title || 'Master Operating Security System').replace(/\s+catalogue$/i, '')}{' '}
              — published reference. Content is immutable in this release.
            </p>
            <Badge
              variant="secondary"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold"
            >
              <Lock className="size-3.5" aria-hidden="true" />
              Read-only · v{data?.version || '3.0'}
            </Badge>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={BookOpen}
              title="Catalogue version"
              value={data?.version ? `v${data.version}` : '—'}
              description={data?.title || 'Master Catalogue'}
              tone="violet"
              loading={loading}
            />
            <StatCard
              icon={Layers}
              title="Domains"
              value={domainCount}
              description="Published domain groups"
              tone="blue"
              loading={loading}
            />
            <StatCard
              icon={ShieldCheck}
              title="Controls"
              value={controlCount}
              description="Scored control catalogue"
              tone="teal"
              loading={loading}
            />
            <StatCard
              icon={CalendarClock}
              title="Published"
              value={data?.status || '—'}
              description={publishedLabel}
              tone="slate"
              loading={loading}
            />
          </div>

          <Card className="rounded-xl border-amber-200 bg-amber-50/70 shadow-sm">
            <CardContent className="flex gap-3 p-4 sm:items-start">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Lock className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-950">
                  Published catalogue is read-only
                </p>
                <p className="mt-1 text-sm text-amber-900/80">
                  {data?.note ||
                    'Direct editing of v3.0 is not allowed. Draft clone, edit, and publish are not enabled in this release.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="gap-4 space-y-0 pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-lg">Domains</CardTitle>
                <CardDescription>
                  {loading
                    ? 'Loading catalogue domains…'
                    : `${filteredDomains.length} of ${domainRows.length} domains`}
                </CardDescription>
              </div>
              <div className="relative w-full max-w-sm">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search domains…"
                  className="pl-9"
                  aria-label="Search domains"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : filteredDomains.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title={domainRows.length === 0 ? 'No domains published.' : 'No matching domains.'}
                  description={
                    domainRows.length === 0
                      ? 'Catalogue domains will appear here once the published version is available.'
                      : 'Try a different search term.'
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredDomains.map((domain) => (
                    <div
                      key={domain.id || domain.domainCode}
                      className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/40 p-4 transition-colors hover:border-slate-300 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {domain.domainCode}
                        </Badge>
                        <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                          {domain.controlCount ?? 0}
                        </span>
                      </div>
                      <h3 className="mt-3 text-sm font-semibold leading-snug text-slate-900">
                        {domain.name}
                      </h3>
                      {domain.description ? (
                        <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-500">
                          {domain.description}
                        </p>
                      ) : (
                        <p className="mt-1 flex-1 text-sm text-slate-400">No description</p>
                      )}
                      <p className="mt-3 mb-0 text-xs font-medium text-slate-400">
                        {(domain.controlCount ?? 0) === 1
                          ? '1 control'
                          : `${domain.controlCount ?? 0} controls`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Shell>
    </AuthGate>
  );
}
