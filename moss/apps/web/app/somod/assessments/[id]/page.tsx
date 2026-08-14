'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Link2,
  Landmark,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react';

import { AuthGate } from '../../../../components/AuthGate';
import { Shell } from '../../../../components/Shell';
import { useConfirm } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '../../../../lib/api';
import { formatSomodStatus, somodApiErrorMessage } from '../../../../lib/somod';
import { SomodFinancialPanels } from './SomodFinancialPanels';

type Engine = {
  key: string;
  name: string;
  description: string;
  status: string;
  configured: boolean;
  data?: Record<string, unknown> | null;
};

type Scenario = {
  id?: string;
  scenarioType?: string;
  label: string;
  summary?: string | null;
};

type MossOption = {
  id: string;
  reference: string;
  title: string;
  status: string;
  organisation: { id: string; name: string };
};

type Summary = {
  title: string;
  status: string;
  organisationName: string;
  siteLabel?: string | null;
  mossReference?: string | null;
  notes?: string | null;
  readyToSubmit: boolean;
  financialLayerStatus?: string;
  financialStale?: boolean;
  financialCalculatedAt?: string | null;
};

type Workspace = {
  id: string;
  reference: string;
  title: string;
  status: string;
  notes?: string | null;
  note?: string;
  editable?: boolean;
  organisation: { id: string; name: string };
  site?: { name: string; siteCode: string } | null;
  mossAssessment?: { id: string; reference: string; title: string } | null;
  engines: Engine[];
  scenarios?: Scenario[];
  summary?: Summary;
  financial?: {
    layerStatus?: string;
    stale?: boolean;
    calculatedAt?: string | null;
    approvedAt?: string | null;
    formulaVersion?: string;
  };
};

type Panel = 'engines' | 'financial' | 'summary';

function base64ToPdfBlob(base64: string, mimeType = 'application/pdf') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function engineDefaults(engine: Engine): Record<string, string> {
  const d = engine.data || {};
  if (engine.key === 'RISK_REQUIREMENT') {
    return {
      notes: String(d.notes ?? ''),
      threatSummary: String(d.threatSummary ?? ''),
      assetSummary: String(d.assetSummary ?? ''),
      documentedRequirements: String(d.documentedRequirements ?? ''),
    };
  }
  if (engine.key === 'DEPLOYMENT_CAPABILITY') {
    return {
      headcount: d.headcount != null ? String(d.headcount) : '',
      supervisorCount: d.supervisorCount != null ? String(d.supervisorCount) : '',
      posts: String(d.posts ?? ''),
      shiftPatterns: String(d.shiftPatterns ?? ''),
      notes: String(d.notes ?? ''),
    };
  }
  if (engine.key === 'TECHNOLOGY') {
    return {
      systemsSummary: String(d.systemsSummary ?? ''),
      technologyCapex: d.technologyCapex != null ? String(d.technologyCapex) : '',
      technologyMonthlyOpex: d.technologyMonthlyOpex != null ? String(d.technologyMonthlyOpex) : '',
      notes: String(d.notes ?? ''),
    };
  }
  if (engine.key === 'COST_EFFICIENCY') {
    return {
      missedShifts: d.missedShifts != null ? String(d.missedShifts) : '',
      missedPatrols: d.missedPatrols != null ? String(d.missedPatrols) : '',
      responseDelayMinutes: d.responseDelayMinutes != null ? String(d.responseDelayMinutes) : '',
      notes: String(d.notes ?? ''),
    };
  }
  return {
    notes: String(d.notes ?? ''),
  };
}

function financialReady(data: Workspace | null) {
  if (!data) return false;
  if (data.summary?.readyToSubmit) return true;
  const status =
    data.summary?.financialLayerStatus || data.financial?.layerStatus || '';
  return (
    status === 'CALCULATED' ||
    status === 'IN_REVIEW' ||
    status === 'APPROVED' ||
    status === 'LOCKED'
  );
}

export default function SomodAssessmentWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('financial');
  const [activeEngine, setActiveEngine] = useState('RISK_REQUIREMENT');
  const [engineForm, setEngineForm] = useState<Record<string, string>>({});
  const [mossOptions, setMossOptions] = useState<MossOption[]>([]);
  const [mossDraftId, setMossDraftId] = useState('');
  const [linkingMoss, setLinkingMoss] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [returnComment, setReturnComment] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  const load = useCallback(async () => {
    if (!params?.id) return;
    setLoading(true);
    setError('');
    try {
      const [workspace, moss] = await Promise.all([
        apiFetch<Workspace>(`/somod/assessments/${params.id}`),
        apiFetch<MossOption[]>('/moss/assessments').catch(() => [] as MossOption[]),
      ]);
      setData(workspace);
      setMossOptions(moss.filter((m) => m.organisation.id === workspace.organisation.id));
      setMossDraftId(workspace.mossAssessment?.id || '');
      setTitleDraft(workspace.title || '');
      setNotesDraft(workspace.notes || '');
      const engine =
        workspace.engines.find((e) => e.key === activeEngine) || workspace.engines[0];
      if (engine) {
        setActiveEngine(engine.key);
        setEngineForm(engineDefaults(engine));
      }
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to load SOMOD assessment.'));
    } finally {
      setLoading(false);
    }
  }, [params?.id, activeEngine]);

  useEffect(() => {
    void load();
    // intentionally only on id change for initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  const selectedEngine = useMemo(
    () => data?.engines.find((e) => e.key === activeEngine) || null,
    [data, activeEngine],
  );

  const editable = Boolean(
    data &&
      (data.editable ?? true) &&
      (data.status === 'DRAFT' || data.status === 'IN_PROGRESS'),
  );

  const canSubmit = Boolean(data?.summary?.readyToSubmit && financialReady(data));

  async function saveMeta() {
    if (!data || !editable) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const workspace = await apiFetch<Workspace>(`/somod/assessments/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: titleDraft.trim(),
          notes: notesDraft.trim() || null,
        }),
      });
      setData(workspace);
      setTitleDraft(workspace.title || '');
      setNotesDraft(workspace.notes || '');
      setNotice('Assessment details saved.');
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to save assessment details.'));
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow(
    path: string,
    body?: Record<string, unknown>,
    successMessage?: string,
  ) {
    if (!data) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const workspace = await apiFetch<Workspace>(`/somod/assessments/${data.id}/${path}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : '{}',
      });
      setData(workspace);
      setTitleDraft(workspace.title || '');
      setNotesDraft(workspace.notes || '');
      setPanel('summary');
      setReturnComment('');
      setNotice(successMessage || workspace.note || 'Workflow updated.');
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to update workflow status.'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!data) return;
    setReportBusy(true);
    setError('');
    setNotice('');
    try {
      const report = await apiFetch<{
        base64?: string;
        mimeType?: string;
        fileName?: string;
        size?: number;
        label?: string;
      }>(`/somod/assessments/${data.id}/reports/generate`, {
        method: 'POST',
        body: '{}',
      });
      if (!report.base64 || !report.size) {
        throw new Error('Report file is empty.');
      }
      const pdfBlob = base64ToPdfBlob(report.base64, report.mimeType || 'application/pdf');
      const url = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = report.fileName || `${data.reference}-SOMOD-Summary.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(`${report.label || 'SOMOD'} PDF downloaded.`);
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to generate SOMOD PDF.'));
    } finally {
      setReportBusy(false);
    }
  }

  async function deleteAssessment() {
    if (!data) return;
    const ok = await confirm({
      title: 'Delete assessment',
      description: `Delete SOMOD assessment “${data.reference}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/somod/assessments/${data.id}`, { method: 'DELETE' });
      router.push('/somod/assessments');
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to delete assessment.'));
      setBusy(false);
    }
  }

  async function saveMossLink() {
    if (!data) return;
    setLinkingMoss(true);
    setError('');
    setNotice('');
    try {
      const workspace = await apiFetch<Workspace>(`/somod/assessments/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ mossAssessmentId: mossDraftId || null }),
      });
      setData(workspace);
      setMossDraftId(workspace.mossAssessment?.id || '');
      setNotice(
        workspace.mossAssessment
          ? `Linked to ${workspace.mossAssessment.reference}.`
          : 'MOSS link cleared.',
      );
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to update MOSS link.'));
    } finally {
      setLinkingMoss(false);
    }
  }

  function switchEngine(key: string) {
    const engine = data?.engines.find((e) => e.key === key);
    if (!engine) return;
    setActiveEngine(key);
    setEngineForm(engineDefaults(engine));
  }

  async function saveEngine() {
    if (!data || !selectedEngine) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload: Record<string, unknown> = { ...engineForm };
      for (const [k, v] of Object.entries(payload)) {
        if (k === 'notes' || k === 'preferredBalance') continue;
        payload[k] = Number(v);
      }
      const workspace = await apiFetch<Workspace>(
        `/somod/assessments/${data.id}/engines/${selectedEngine.key}`,
        { method: 'PATCH', body: JSON.stringify({ data: payload }) },
      );
      setData(workspace);
      const engine = workspace.engines.find((e) => e.key === selectedEngine.key);
      if (engine) setEngineForm(engineDefaults(engine));
      setNotice(`${selectedEngine.name} saved.`);
    } catch (e: unknown) {
      setError(somodApiErrorMessage(e, 'Unable to save engine.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate>
      <Shell
        title={data?.title || 'SOMOD Assessment'}
        subtitle={data?.reference || 'Optimisation workspace'}
        hideSearch
      >
        <div className="w-full min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/somod/assessments')}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
              {data ? <Badge variant="secondary">{formatSomodStatus(data.status)}</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={panel === 'engines' ? 'default' : 'outline'}
                onClick={() => setPanel('engines')}
              >
                <Layers className="size-4" aria-hidden="true" />
                Engines
              </Button>
              <Button
                type="button"
                variant={panel === 'financial' ? 'default' : 'outline'}
                onClick={() => setPanel('financial')}
              >
                <Landmark className="size-4" aria-hidden="true" />
                Financial
              </Button>
              <Button
                type="button"
                variant={panel === 'summary' ? 'default' : 'outline'}
                onClick={() => setPanel('summary')}
              >
                <FileText className="size-4" aria-hidden="true" />
                Summary
              </Button>
            </div>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {notice ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {notice}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">Loading workspace…</p>
          ) : data ? (
            <>
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Assessment context</CardTitle>
                  <CardDescription>{data.note}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Organisation
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {data.organisation.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Site
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {data.site ? `${data.site.name} (${data.site.siteCode})` : '—'}
                    </p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Linked MOSS
                    </p>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1 space-y-1">
                        <Label htmlFor="somod-moss-link" className="sr-only">
                          MOSS assessment
                        </Label>
                        <select
                          id="somod-moss-link"
                          value={mossDraftId}
                          onChange={(e) => setMossDraftId(e.target.value)}
                          disabled={busy || linkingMoss || !editable}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">No MOSS link</option>
                          {mossOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.reference} — {m.title} ({m.status})
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={
                          busy ||
                          linkingMoss ||
                          !editable ||
                          mossDraftId === (data.mossAssessment?.id || '')
                        }
                        onClick={() => void saveMossLink()}
                      >
                        <Link2 className="size-4" aria-hidden="true" />
                        {linkingMoss ? 'Saving…' : 'Save link'}
                      </Button>
                      {data.mossAssessment ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            router.push(`/moss/assessments/${data.mossAssessment!.id}`)
                          }
                        >
                          <ExternalLink className="size-4" aria-hidden="true" />
                          Open MOSS
                        </Button>
                      ) : null}
                    </div>
                    {mossOptions.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        No MOSS assessments for this organisation.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        Optional context only — does not merge scoring models.
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Notes
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{data.notes || '—'}</p>
                  </div>
                </CardContent>
              </Card>

              {panel === 'financial' ? (
                <SomodFinancialPanels
                  assessmentId={data.id}
                  editable={Boolean(editable)}
                  financial={data.financial}
                  onNotice={setNotice}
                  onError={setError}
                  onRefresh={async () => {
                    const workspace = await apiFetch<Workspace>(
                      `/somod/assessments/${data.id}`,
                    );
                    setData(workspace);
                  }}
                  busy={busy}
                  setBusy={setBusy}
                />
              ) : null}

              {panel === 'engines' ? (
                <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Five engines</CardTitle>
                      <CardDescription>
                        Configure inputs that feed the financial layer (Screens A–E).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.engines.map((engine) => (
                        <button
                          key={engine.key}
                          type="button"
                          onClick={() => switchEngine(engine.key)}
                          className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                            activeEngine === engine.key
                              ? 'border-slate-400 bg-white shadow-sm'
                              : 'border-slate-200 bg-slate-50/60 hover:bg-white'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{engine.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{engine.description}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {engine.configured ? 'Set' : 'Empty'}
                          </Badge>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">
                        {selectedEngine?.name || 'Engine'}
                      </CardTitle>
                      <CardDescription>
                        {selectedEngine?.description || 'Configure engine inputs.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        Enter structured inputs for this engine. Derived results are produced when
                        configuration for this engine is approved.
                      </p>
                      {selectedEngine?.key === 'RISK_REQUIREMENT' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="threatSummary">Threats (structured notes)</Label>
                            <Input
                              id="threatSummary"
                              value={engineForm.threatSummary || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, threatSummary: e.target.value }))
                              }
                              placeholder="Documented threats / threat landscape"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="assetSummary">Assets / operations</Label>
                            <Input
                              id="assetSummary"
                              value={engineForm.assetSummary || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, assetSummary: e.target.value }))
                              }
                              placeholder="Assets, operations, site layout references"
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="documentedRequirements">Documented requirements</Label>
                            <Input
                              id="documentedRequirements"
                              value={engineForm.documentedRequirements || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({
                                  ...f,
                                  documentedRequirements: e.target.value,
                                }))
                              }
                              placeholder="Policies, SOPs, MOSS, SLAs (links/refs)"
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedEngine?.key === 'DEPLOYMENT_CAPABILITY' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="headcount">Current headcount</Label>
                            <Input
                              id="headcount"
                              type="number"
                              min={0}
                              value={engineForm.headcount || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, headcount: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="supervisorCount">Supervisor count</Label>
                            <Input
                              id="supervisorCount"
                              type="number"
                              min={0}
                              value={engineForm.supervisorCount || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, supervisorCount: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="posts">Posts / locations</Label>
                            <Input
                              id="posts"
                              value={engineForm.posts || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, posts: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="shiftPatterns">Shift patterns</Label>
                            <Input
                              id="shiftPatterns"
                              value={engineForm.shiftPatterns || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, shiftPatterns: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedEngine?.key === 'TECHNOLOGY' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="systemsSummary">Systems / control purpose</Label>
                            <Input
                              id="systemsSummary"
                              value={engineForm.systemsSummary || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, systemsSummary: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="technologyCapex">Technology CAPEX</Label>
                            <Input
                              id="technologyCapex"
                              type="number"
                              min={0}
                              value={engineForm.technologyCapex || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, technologyCapex: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="technologyMonthlyOpex">Monthly OPEX</Label>
                            <Input
                              id="technologyMonthlyOpex"
                              type="number"
                              min={0}
                              value={engineForm.technologyMonthlyOpex || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({
                                  ...f,
                                  technologyMonthlyOpex: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedEngine?.key === 'COST_EFFICIENCY' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="missedShifts">Missed shifts</Label>
                            <Input
                              id="missedShifts"
                              type="number"
                              min={0}
                              value={engineForm.missedShifts || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, missedShifts: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="missedPatrols">Missed patrols</Label>
                            <Input
                              id="missedPatrols"
                              type="number"
                              min={0}
                              value={engineForm.missedPatrols || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({ ...f, missedPatrols: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="responseDelayMinutes">Response delay (minutes)</Label>
                            <Input
                              id="responseDelayMinutes"
                              type="number"
                              min={0}
                              value={engineForm.responseDelayMinutes || ''}
                              onChange={(e) =>
                                setEngineForm((f) => ({
                                  ...f,
                                  responseDelayMinutes: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <p className="sm:col-span-2 text-xs text-slate-500">
                            Cost variables are owned by the financial model (Screens A–E). Operational
                            event counts feed governed penalty formulas only.
                          </p>
                        </div>
                      ) : null}

                      {selectedEngine?.key === 'OPTIMISATION_TRADEOFF' ? (
                        <p className="text-sm text-slate-600">
                          Optimisation objective and constraints are not configured for this release.
                          Recommended Optimal results will appear once configuration is approved.
                        </p>
                      ) : null}

                      <div className="space-y-2">
                        <Label htmlFor="engine-notes">Notes</Label>
                        <Textarea
                          id="engine-notes"
                          rows={3}
                          value={engineForm.notes || ''}
                          onChange={(e) =>
                            setEngineForm((f) => ({ ...f, notes: e.target.value }))
                          }
                        />
                      </div>

                      <Button type="button" disabled={busy || !editable} onClick={() => void saveEngine()}>
                        <Save className="size-4" aria-hidden="true" />
                        Save engine
                      </Button>
                      {!editable ? (
                        <p className="text-xs text-amber-700">
                          Assessment is {formatSomodStatus(data.status)} — engines are locked.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {panel === 'summary' ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Diagnostic summary</CardTitle>
                      <CardDescription>
                        Title, notes, and financial readiness for this SOMOD assessment.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="somod-title">Title</Label>
                          <Input
                            id="somod-title"
                            value={titleDraft}
                            disabled={!editable || busy}
                            onChange={(e) => setTitleDraft(e.target.value)}
                          />
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Status
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {formatSomodStatus(data.status)}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="somod-notes">Notes</Label>
                        <Textarea
                          id="somod-notes"
                          rows={4}
                          value={notesDraft}
                          disabled={!editable || busy}
                          onChange={(e) => setNotesDraft(e.target.value)}
                        />
                      </div>
                      {editable ? (
                        <Button type="button" disabled={busy} onClick={() => void saveMeta()}>
                          <Save className="size-4" aria-hidden="true" />
                          Save details
                        </Button>
                      ) : null}

                      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Financial layer
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {formatSomodStatus(
                              data.summary?.financialLayerStatus ||
                                data.financial?.layerStatus ||
                                'DRAFT',
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Formula version
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {data.financial?.formulaVersion || 'SOMOD_FINANCIAL_V1'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Calculated
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {data.summary?.financialCalculatedAt ||
                            data.financial?.calculatedAt
                              ? new Date(
                                  data.summary?.financialCalculatedAt ||
                                    data.financial?.calculatedAt ||
                                    '',
                                ).toLocaleString()
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Ready to submit
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {canSubmit ? 'Yes' : 'No'}
                          </p>
                        </div>
                      </div>

                      {data.scenarios && data.scenarios.length > 0 ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Scenarios
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {data.scenarios.map((s) => s.label).join(' · ')}
                          </p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Workflow</CardTitle>
                      <CardDescription>
                        Submit → Review → Approve. Return unlocks editing again.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        type="button"
                        className="w-full bg-[#c41230] hover:bg-[#a10f28]"
                        disabled={busy || !canSubmit}
                        onClick={() =>
                          void runWorkflow('submit', undefined, 'Assessment submitted for review.')
                        }
                      >
                        <Send className="size-4" aria-hidden="true" />
                        Submit for review
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={busy || data.status !== 'SUBMITTED'}
                        onClick={() =>
                          void runWorkflow(
                            'mark-reviewed',
                            {},
                            'Assessment marked as reviewed.',
                          )
                        }
                      >
                        <ClipboardCheck className="size-4" aria-hidden="true" />
                        Mark reviewed
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={busy || data.status !== 'REVIEWED'}
                        onClick={() =>
                          void runWorkflow('approve', undefined, 'Assessment approved.')
                        }
                      >
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={
                          busy ||
                          (data.status !== 'APPROVED' && data.status !== 'REVIEWED')
                        }
                        onClick={() =>
                          void runWorkflow('archive', undefined, 'Assessment archived.')
                        }
                      >
                        <Archive className="size-4" aria-hidden="true" />
                        Archive
                      </Button>
                      {data.status === 'ARCHIVED' ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={busy}
                          onClick={() =>
                            void runWorkflow(
                              'unarchive',
                              undefined,
                              'Assessment restored to In Progress.',
                            )
                          }
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                          Unarchive
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        disabled={busy || reportBusy || !financialReady(data)}
                        onClick={() => void downloadPdf()}
                      >
                        <Download className="size-4" aria-hidden="true" />
                        {reportBusy ? 'Generating…' : 'Download PDF summary'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full text-red-700 hover:bg-red-50 hover:text-red-800"
                        disabled={busy}
                        onClick={() => void deleteAssessment()}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Delete assessment
                      </Button>

                      {(data.status === 'SUBMITTED' || data.status === 'REVIEWED') && (
                        <div className="space-y-2 border-t border-slate-200 pt-3">
                          <Label htmlFor="somod-return">Return comment</Label>
                          <Textarea
                            id="somod-return"
                            rows={3}
                            value={returnComment}
                            onChange={(e) => setReturnComment(e.target.value)}
                            placeholder="Required when returning to In Progress"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            disabled={busy || returnComment.trim().length < 2}
                            onClick={() =>
                              void runWorkflow(
                                'return',
                                { comment: returnComment.trim() },
                                'Assessment returned to In Progress.',
                              )
                            }
                          >
                            <RotateCcw className="size-4" aria-hidden="true" />
                            Return to In Progress
                          </Button>
                        </div>
                      )}

                      {!canSubmit && editable ? (
                        <p className="text-xs text-slate-500">
                          Calculate financials first before submitting.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Shell>
    </AuthGate>
  );
}
