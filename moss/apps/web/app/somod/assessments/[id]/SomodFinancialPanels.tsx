'use client';

import { useCallback, useEffect, useState } from 'react';
import { Calculator, Landmark, Link2, Scale, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '../../../../lib/api';
import { somodApiErrorMessage, formatSomodCalculationStatus } from '../../../../lib/somod';

type FinancialSubPanel = 'setup' | 'penalties' | 'mappings' | 'outputs' | 'cfo';

function money(n: unknown) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(v);
}

const DEFAULT_SETUP = {
  currency: 'ZAR',
  monthly_contract_value: '',
  monthly_guard_cost: '',
  monthly_supervisor_cost: '',
  days_per_month: '30',
  shift_hours: '12',
  response_delay_cost_rate: '',
  default_incident_severity_multiplier: '',
  patrol_value_per_miss: '',
  technology_capex_total: '',
  technology_monthly_opex: '',
  technology_lifespan_months: '',
};

type Props = {
  assessmentId: string;
  editable: boolean;
  financial?: {
    layerStatus?: string;
    stale?: boolean;
    calculatedAt?: string | null;
    approvedAt?: string | null;
    formulaVersion?: string;
  } | null;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => Promise<void>;
  busy: boolean;
  setBusy: (v: boolean) => void;
};

export function SomodFinancialPanels({
  assessmentId,
  editable,
  financial,
  onNotice,
  onError,
  onRefresh,
  busy,
  setBusy,
}: Props) {
  const [sub, setSub] = useState<FinancialSubPanel>('setup');
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const [derived, setDerived] = useState<Record<string, number> | null>(null);
  const [penalties, setPenalties] = useState<Array<Record<string, unknown>>>([]);
  const [mappings, setMappings] = useState<Array<Record<string, unknown>>>([]);
  const [outputs, setOutputs] = useState<Array<Record<string, unknown>>>([]);
  const [cfo, setCfo] = useState<Record<string, unknown> | null>(null);
  const [cfoMeta, setCfoMeta] = useState<{ ready?: boolean; stale?: boolean; message?: string }>({});
  const [methodology, setMethodology] = useState<{
    status: string;
    ready: boolean;
    missing: string[];
    message: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
      const [modelRes, penRes, mapRes, outRes, methodRes] = await Promise.all([
      apiFetch<{
        exists: boolean;
        financialModel?: {
          costVariables: Record<string, number | null>;
          derivedVariables: Record<string, number>;
        } | null;
      }>(`/somod/${assessmentId}/financial-model`),
      apiFetch<{ penalties: Array<Record<string, unknown>> }>(
        `/somod/${assessmentId}/penalties`,
      ),
      apiFetch<{ mappings: Array<Record<string, unknown>> }>(
        `/somod/${assessmentId}/control-financial-mappings`,
      ),
      apiFetch<{ scenarios: Array<Record<string, unknown>> }>(
        `/somod/${assessmentId}/scenario-financials`,
      ),
      apiFetch<{
        status: string;
        ready: boolean;
        missing: string[];
        message: string;
      }>(`/somod/${assessmentId}/methodology`).catch(() => ({
        status: 'METHODOLOGY_REQUIRED',
        ready: false,
        missing: [],
        message: 'Methodology status unavailable.',
      })),
    ]);
    setMethodology(methodRes);

    if (modelRes.exists && modelRes.financialModel) {
      const cv = modelRes.financialModel.costVariables;
      setSetup({
        currency: 'ZAR',
        monthly_contract_value: String(cv.monthly_contract_value ?? ''),
        monthly_guard_cost: String(cv.monthly_guard_cost ?? ''),
        monthly_supervisor_cost: String(cv.monthly_supervisor_cost ?? ''),
        days_per_month: String(cv.days_per_month ?? ''),
        shift_hours: String(cv.shift_hours ?? ''),
        response_delay_cost_rate: String(cv.response_delay_cost_rate ?? ''),
        default_incident_severity_multiplier: String(
          cv.default_incident_severity_multiplier ?? '',
        ),
        patrol_value_per_miss: String(cv.patrol_value_per_miss ?? ''),
        technology_capex_total: String(cv.technology_capex_total ?? ''),
        technology_monthly_opex: String(cv.technology_monthly_opex ?? ''),
        technology_lifespan_months: String(cv.technology_lifespan_months ?? ''),
      });
      setDerived(modelRes.financialModel.derivedVariables);
    }
    setPenalties(penRes.penalties || []);
    setMappings(mapRes.mappings || []);
    setOutputs(outRes.scenarios || []);

    try {
      const dash = await apiFetch<{
        ready: boolean;
        stale?: boolean;
        message?: string;
        latest?: Record<string, unknown> | null;
      }>(`/somod/${assessmentId}/cfo-dashboard`);
      setCfoMeta({ ready: dash.ready, stale: dash.stale, message: dash.message });
      setCfo(dash.latest || null);
    } catch {
      setCfoMeta({ ready: false, message: 'Calculate financials to unlock the CFO dashboard.' });
      setCfo(null);
    }
  }, [assessmentId]);

  useEffect(() => {
    void loadAll().catch((e) => onError(somodApiErrorMessage(e, 'Unable to load financial layer.')));
  }, [loadAll, onError]);

  async function saveSetup() {
    setBusy(true);
    onError('');
    try {
      const payload: Record<string, unknown> = { currency: setup.currency };
      for (const [key, value] of Object.entries(setup)) {
        if (key === 'currency') continue;
        payload[key] = value === '' ? null : Number(value);
      }
      await apiFetch(`/somod/${assessmentId}/financial-model`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onNotice('Financial setup saved. Governed penalties and mappings seeded if new.');
      await loadAll();
      await onRefresh();
    } catch (e) {
      onError(somodApiErrorMessage(e, 'Unable to save financial setup.'));
    } finally {
      setBusy(false);
    }
  }

  async function calculate() {
    setBusy(true);
    onError('');
    try {
      await apiFetch(`/somod/${assessmentId}/calculate-financials`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onNotice('Financial calculation complete — scenario outputs and CFO snapshot stored.');
      await loadAll();
      await onRefresh();
      setSub('cfo');
    } catch (e) {
      onError(somodApiErrorMessage(e, 'Unable to calculate financials.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitFinancial() {
    setBusy(true);
    try {
      await apiFetch(`/somod/${assessmentId}/financial-submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onNotice('Financial layer submitted for review.');
      await onRefresh();
    } catch (e) {
      onError(somodApiErrorMessage(e, 'Unable to submit financial layer.'));
    } finally {
      setBusy(false);
    }
  }

  async function approveFinancial() {
    setBusy(true);
    try {
      await apiFetch(`/somod/${assessmentId}/financial-approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onNotice('Financial layer approved and CFO snapshot locked.');
      await onRefresh();
      await loadAll();
    } catch (e) {
      onError(somodApiErrorMessage(e, 'Unable to approve financial layer.'));
    } finally {
      setBusy(false);
    }
  }

  const fields: Array<{ key: keyof typeof DEFAULT_SETUP; label: string; required?: boolean }> = [
    { key: 'monthly_contract_value', label: 'Monthly contract value', required: true },
    { key: 'monthly_guard_cost', label: 'Monthly guard cost', required: true },
    { key: 'monthly_supervisor_cost', label: 'Monthly supervisor cost', required: true },
    { key: 'days_per_month', label: 'Days per month (28–31)', required: true },
    { key: 'shift_hours', label: 'Shift hours', required: true },
    { key: 'response_delay_cost_rate', label: 'Response delay cost rate', required: true },
    {
      key: 'default_incident_severity_multiplier',
      label: 'Default incident severity multiplier (1–5)',
      required: true,
    },
    { key: 'patrol_value_per_miss', label: 'Patrol value per miss', required: true },
    { key: 'technology_capex_total', label: 'Technology CAPEX total' },
    { key: 'technology_monthly_opex', label: 'Technology monthly OPEX' },
    { key: 'technology_lifespan_months', label: 'Technology lifespan months' },
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg">Financial layer</CardTitle>
              <CardDescription>
                Governed formulas · {financial?.formulaVersion || 'SOMOD_FINANCIAL_V2'} · status{' '}
                {financial?.layerStatus || 'DRAFT'}
                {financial?.stale ? ' · stale — recalculate' : ''}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || !editable}
                className="bg-[#c41230] hover:bg-[#a10f28]"
                onClick={() => void calculate()}
              >
                <Calculator className="size-4" aria-hidden="true" />
                Calculate financials
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !editable || financial?.stale}
                onClick={() => void submitFinancial()}
              >
                Submit financial
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void approveFinancial()}
              >
                Approve financial
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(
            [
              ['setup', 'A · Setup', Landmark],
              ['penalties', 'B · Penalties', ShieldAlert],
              ['mappings', 'C · Mappings', Link2],
              ['outputs', 'D · Scenario $', Scale],
              ['cfo', 'E · CFO', Calculator],
            ] as const
          ).map(([key, label, Icon]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={sub === key ? 'default' : 'outline'}
              onClick={() => setSub(key)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {methodology && !methodology.ready ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Optimisation scenarios beyond Current require approved configuration before results can be
          produced.
          {methodology.missing?.length ? (
            <span className="mt-1 block text-xs text-slate-500">
              Pending configuration items: {methodology.missing.slice(0, 8).join(', ')}
              {methodology.missing.length > 8 ? '…' : ''}
            </span>
          ) : null}
        </p>
      ) : null}

      {sub === 'setup' ? (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Screen A — Financial setup</CardTitle>
            <CardDescription>
              Editable cost and contract variables; derived values are read-only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Label>
                  <Input
                    id={field.key}
                    type="number"
                    disabled={!editable || busy}
                    value={setup[field.key]}
                    onChange={(e) =>
                      setSetup((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            {derived ? (
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Daily guard cost
                  </p>
                  <p className="mt-1 font-semibold">{money(derived.daily_guard_cost)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Hourly guard cost
                  </p>
                  <p className="mt-1 font-semibold">{money(derived.hourly_guard_cost)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Monthly technology equivalent
                  </p>
                  <p className="mt-1 font-semibold">
                    {money(derived.monthly_technology_equivalent_cost)}
                  </p>
                </div>
              </div>
            ) : null}
            <Button type="button" disabled={!editable || busy} onClick={() => void saveSetup()}>
              Save financial setup
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {sub === 'penalties' ? (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Screen B — Penalty library</CardTitle>
            <CardDescription>
              Governed rules are view-only for consultants. Formulas cannot be edited in assessment
              screens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {penalties.length === 0 ? (
              <p className="text-sm text-slate-500">
                Save financial setup to seed the governed penalty library.
              </p>
            ) : (
              penalties.map((p) => (
                <div
                  key={String(p.id)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{String(p.penaltyName)}</p>
                    <div className="flex gap-1">
                      {p.isGoverned ? (
                        <Badge variant="outline" className="text-[10px]">
                          Governed
                        </Badge>
                      ) : null}
                      <Badge variant="secondary" className="text-[10px]">
                        {String(p.penaltyKey)}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {String(p.metricName)} · threshold {String(p.thresholdType)}{' '}
                    {String(p.thresholdValue ?? '—')}
                  </p>
                  <p className="mt-2 font-mono text-xs text-slate-700">
                    {String(p.formulaExpression)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {sub === 'mappings' ? (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Screen C — Control financial mapping</CardTitle>
            <CardDescription>Bridge between controls and money.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mappings.length === 0 ? (
              <p className="text-sm text-slate-500">
                Save financial setup to seed default control mappings.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Control</th>
                      <th className="px-2 py-2">Relevant</th>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2">Event unit</th>
                      <th className="px-2 py-2">CFO category</th>
                      <th className="px-2 py-2">Penalty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m) => (
                      <tr key={String(m.id)} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-medium">{String(m.controlId)}</td>
                        <td className="px-2 py-2">{m.financialRelevance ? 'Yes' : 'No'}</td>
                        <td className="px-2 py-2">{String(m.costCategory || '—')}</td>
                        <td className="px-2 py-2">{String(m.eventUnit || '—')}</td>
                        <td className="px-2 py-2">{String(m.cfoOutputCategory || '—')}</td>
                        <td className="px-2 py-2">
                          {String(
                            (m.penalty as { penaltyKey?: string } | null)?.penaltyKey || '—',
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {sub === 'outputs' ? (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Screen D — Scenario financial outputs</CardTitle>
            <CardDescription>
              Current · Risk Aligned · Cost Efficient · Recommended Optimal
            </CardDescription>
          </CardHeader>
          <CardContent>
            {outputs.length === 0 ? (
              <p className="text-sm text-slate-500">Run Calculate financials to populate outputs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Scenario</th>
                      <th className="px-2 py-2">Manpower</th>
                      <th className="px-2 py-2">Technology</th>
                      <th className="px-2 py-2">Leakage</th>
                      <th className="px-2 py-2">Recoverable</th>
                      <th className="px-2 py-2">Monthly total</th>
                      <th className="px-2 py-2">Effectiveness</th>
                      <th className="px-2 py-2">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.map((row) => {
                      const status = String(row.calculationStatus || 'CALCULATED');
                      const blocked = status !== 'CALCULATED';
                      return (
                      <tr key={String(row.scenarioType)} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-medium">
                          {String(row.scenarioType)}
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            {formatSomodCalculationStatus(status)}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {blocked ? 'Not available' : money(row.monthlyManpowerCost)}
                        </td>
                        <td className="px-2 py-2">
                          {blocked ? '—' : money(row.monthlyTechnologyCost)}
                        </td>
                        <td className="px-2 py-2">
                          {blocked ? '—' : money(row.monthlyOperationalLeakage)}
                        </td>
                        <td className="px-2 py-2">
                          {blocked ? '—' : money(row.monthlyRecoverableValue)}
                        </td>
                        <td className="px-2 py-2 font-semibold">
                          {blocked ? '—' : money(row.monthlyTotalSecurityCost)}
                        </td>
                        <td className="px-2 py-2">—</td>
                        <td className="px-2 py-2">—</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {sub === 'cfo' ? (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Screen E — CFO dashboard</CardTitle>
            <CardDescription>
              Current financials when calculated. Other scenarios appear when configuration is
              complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!cfoMeta.ready || !cfo ? (
              <p className="text-sm text-amber-800">
                {cfoMeta.message ||
                  'Dashboard cannot render until Current financials are calculated.'}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current monthly spend
                  </p>
                  <p className="mt-2 text-xl font-semibold">{money(cfo.currentMonthlySpend)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Optimal monthly spend
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {cfo.optimalMonthlySpend == null
                      ? 'Not available'
                      : money(cfo.optimalMonthlySpend)}
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                    Monthly / annual savings
                  </p>
                  <p className="mt-2 text-xl font-semibold text-emerald-900">
                    {cfo.monthlySavings == null && cfo.annualSavings == null
                      ? 'Not available'
                      : `${money(cfo.monthlySavings)} / ${money(cfo.annualSavings)}`}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Leakage (current → optimal)
                  </p>
                  <p className="mt-2 font-semibold">
                    {money(cfo.currentMonthlyLeakage)}
                    {' → '}
                    {cfo.optimalMonthlyLeakage == null
                      ? 'Not available'
                      : money(cfo.optimalMonthlyLeakage)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recoverable value / CAPEX
                  </p>
                  <p className="mt-2 font-semibold">
                    {money(cfo.monthlyRecoverableValue)} /{' '}
                    {cfo.requiredCapitalInvestment == null
                      ? '—'
                      : money(cfo.requiredCapitalInvestment)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Payback months
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {cfo.paybackMonths == null ? 'Not available' : String(cfo.paybackMonths)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Effectiveness / risk scoring
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Not available until optimisation scoring configuration is approved.
                  </p>
                </div>
                {cfo.isLocked ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-950">Snapshot locked (approved)</p>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
