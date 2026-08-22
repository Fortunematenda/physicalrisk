'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Building2,
  ClipboardList,
  Calculator,
  SlidersHorizontal,
} from 'lucide-react';

import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrganisationSelect, type OrgOption } from '@/components/organisations/OrganisationSelect';
import { filterSclActiveTriageQuestions } from '@moss/shared';
import { apiFetch } from '../../../lib/api';

type QuestionnairePayload = {
  code: string;
  name: string;
  versions: Array<{
    version: string;
    status: string;
    publishedAt?: string | null;
    questions?: unknown[];
    inputDefinitions?: unknown[];
  }>;
};

function NewAssessmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [questionnaire, setQuestionnaire] = useState<QuestionnairePayload | null>(null);
  const [organisationId, setOrganisationId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prefOrg = searchParams.get('org') || '';
    setLoading(true);
    Promise.all([
      apiFetch<OrgOption[]>('/organisations'),
      apiFetch<QuestionnairePayload>('/questionnaires/SCLI'),
    ])
      .then(([orgList, q]) => {
        setOrgs(orgList.map((o) => ({ id: o.id, name: o.name })));
        setQuestionnaire(q);
        if (prefOrg && orgList.some((o) => o.id === prefOrg)) setOrganisationId(prefOrg);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Unable to load form data.');
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/assessments', {
        method: 'POST',
        body: JSON.stringify({
          organisationId,
          questionnaireCode: 'SCLI',
          title: title || undefined,
        }),
      });
      router.push(`/assessments/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create assessment.');
      setSaving(false);
    }
  }

  const version = questionnaire?.versions?.[0];
  const questionCount = filterSclActiveTriageQuestions(
    ((version?.questions || []) as Array<{ code: string }>),
  ).length;
  const inputCount = version?.inputDefinitions?.length ?? 0;
  const selectedOrg = orgs.find((o) => o.id === organisationId);

  return (
    <div className="w-full min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-500">
          Create a Security Cost Leakage assessment pinned to the currently published SCLI
          questionnaire version. Methodology version is fixed on create.
        </p>
        <Badge variant="secondary" className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold">
          SCLI v{version?.version || '—'}
        </Badge>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={BookOpen}
          title="Methodology"
          value={version?.version ? `v${version.version}` : '—'}
          description={questionnaire?.name || 'SCLI questionnaire'}
          tone="violet"
          loading={loading}
        />
        <StatCard
          icon={ClipboardList}
          title="Questions"
          value={questionCount || '—'}
          description="Active triage (matches website)"
          tone="blue"
          loading={loading}
        />
        <StatCard
          icon={Calculator}
          title="Inputs"
          value={inputCount || '—'}
          description="Calibration inputs"
          tone="teal"
          loading={loading}
        />
        <StatCard
          icon={Building2}
          title="Organisations"
          value={orgs.length}
          description="Available to assess"
          tone="slate"
          loading={loading}
        />
      </div>

      <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Assessment details</CardTitle>
            <CardDescription>
              Organisation is required. The assessment will use the published SCLI methodology.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-5">
              <div className="space-y-2">
                <Label htmlFor="scl-new-org">Organisation *</Label>
                <OrganisationSelect
                  id="scl-new-org"
                  required
                  value={organisationId}
                  organisations={orgs}
                  onOrganisationsChange={setOrgs}
                  onChange={(id) => setOrganisationId(id)}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scl-new-title">Assessment title</Label>
                <Input
                  id="scl-new-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Optional — defaults to organisation name"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="submit"
                  disabled={!organisationId || saving}
                  className="bg-[#c41230] hover:bg-[#a10f28]"
                >
                  {saving ? 'Creating…' : 'Create Cost Leakage assessment'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <SlidersHorizontal className="size-4 text-[#c41230]" aria-hidden="true" />
                Methodology binding
              </CardTitle>
              <CardDescription>
                Fixed to the published SCLI questionnaire for this assessment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-slate-500">Code</span>
                <span className="font-semibold text-slate-900">
                  {questionnaire?.code || 'SCLI'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-slate-500">Version</span>
                <span className="font-semibold text-slate-900">
                  v{version?.version || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-slate-500">Status</span>
                <Badge variant="success" className="rounded-md">
                  {version?.status || 'PUBLISHED'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-slate-500">Scope</span>
                <span className="font-semibold text-slate-900">
                  {questionCount} questions · {inputCount} inputs
                </span>
              </div>
              <p className="mb-0 text-xs leading-relaxed text-slate-500">
                The assessment is bound to this published methodology on create. Scoring,
                leakage, and recommendations use the pinned questionnaire version.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="size-4 text-[#c41230]" aria-hidden="true" />
                Selection summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Organisation
                </p>
                <p className="mt-1 mb-0 font-medium text-slate-900">
                  {selectedOrg?.name || 'Not selected'}
                </p>
              </div>
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Product
                </p>
                <p className="mt-1 mb-0 font-medium text-slate-900">
                  Cost Leakage · SCLI
                </p>
              </div>
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Title
                </p>
                <p className="mt-1 mb-0 font-medium text-slate-900">
                  {title.trim()
                    || (selectedOrg ? `${selectedOrg.name} SCL Assessment` : 'Will default to organisation name')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function NewAssessmentPage() {
  return (
    <AuthGate>
      <Shell title="New Cost Leakage Assessment" subtitle="Bind organisation to published SCLI methodology">
        <Suspense fallback={<p className="muted">Loading form…</p>}>
          <NewAssessmentForm />
        </Suspense>
      </Shell>
    </AuthGate>
  );
}
