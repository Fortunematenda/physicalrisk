'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ADVISORY_ROUTE_PRIORITIES,
  ADVISORY_ROUTE_PRIORITY_LABELS,
  PHYSICAL_RISK_PRODUCTS,
  getRiskBand,
} from '@moss/shared';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  Menu,
  Save,
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { useConfirm } from '@/components/confirm-dialog';
import { Shell } from '@/components/Shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PRODUCT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PHYSICAL_RISK_PRODUCTS).map(([code, v]) => [code, v.name]),
);

const ROUTES: [string, string][] = [
  ['', 'No focused product selected'],
  ['SCLI_COST_LEAKAGE', PRODUCT_LABELS.SCLI_COST_LEAKAGE],
  ['CONTRACT_SLA_ASSURANCE', PRODUCT_LABELS.CONTRACT_SLA_ASSURANCE],
  ['VENDOR_PERFORMANCE_ASSURANCE', PRODUCT_LABELS.VENDOR_PERFORMANCE_ASSURANCE],
  ['GOVERNANCE_EXECUTIVE_ASSURANCE', PRODUCT_LABELS.GOVERNANCE_EXECUTIVE_ASSURANCE],
  ['CYBER_PHYSICAL_DEPENDENCY', PRODUCT_LABELS.CYBER_PHYSICAL_DEPENDENCY],
  ['SHIELD360', PRODUCT_LABELS.SHIELD360],
];

type ModuleReview = {
  id: string;
  moduleCode: string;
  moduleName: string;
  principalQuestion: string;
  exposureRating?: number | null;
  finding?: string | null;
  evidenceSummary?: string | null;
  businessConsequence?: string | null;
  accountableExecutive?: string | null;
  requiredDecision?: string | null;
  recommendedProduct?: string | null;
  analystNote?: string | null;
};

type ConfirmedRoute = {
  productCode: string;
  priority: string;
  rationale?: string;
  sourceModuleCode?: string;
  sourceModuleName?: string;
};

type ModuleStatus = 'not_started' | 'in_progress' | 'needs_attention' | 'complete';

const REQUIRED_FIELDS = [
  { key: 'finding' as const, label: 'Finding' },
  { key: 'businessConsequence' as const, label: 'Business consequence' },
  { key: 'requiredDecision' as const, label: 'Required executive decision' },
];

function isModuleComplete(m: ModuleReview) {
  return Boolean(m.finding?.trim() && m.businessConsequence?.trim() && m.requiredDecision?.trim());
}

function incompleteModules(modules: ModuleReview[]) {
  return modules.filter((m) => !isModuleComplete(m));
}

function moduleHasAnyContent(m: ModuleReview) {
  return Boolean(
    m.finding?.trim() ||
      m.evidenceSummary?.trim() ||
      m.businessConsequence?.trim() ||
      m.accountableExecutive?.trim() ||
      m.requiredDecision?.trim() ||
      m.recommendedProduct?.trim() ||
      m.analystNote?.trim() ||
      (m.exposureRating != null && Number.isFinite(Number(m.exposureRating))),
  );
}

function missingRequiredFields(m: ModuleReview) {
  return REQUIRED_FIELDS.filter((f) => !String(m[f.key] || '').trim()).map((f) => f.label);
}

function getModuleStatus(m: ModuleReview): ModuleStatus {
  if (isModuleComplete(m)) return 'complete';
  if (moduleHasAnyContent(m)) return 'needs_attention';
  return 'not_started';
}

function emptyRoute(): ConfirmedRoute {
  return { productCode: '', priority: 'RECOMMENDED', rationale: '' };
}

function exposureBandLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return getRiskBand(Number(value));
}

function humanizeStatus(value?: string | null) {
  if (!value) return '—';
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'In progress',
    SUBMITTED: 'Submitted',
    AWAITING_REVIEW: 'Awaiting review',
    REVIEWED: 'Reviewed',
    APPROVED: 'Approved',
    REPORT_GENERATED: 'Report generated',
    REPORT_ISSUED: 'Report issued',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled',
  };
  return map[value] || value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeProps(status: ModuleStatus): {
  label: string;
  variant: 'secondary' | 'info' | 'warning' | 'success';
} {
  switch (status) {
    case 'complete':
      return { label: 'Complete', variant: 'success' };
    case 'needs_attention':
      return { label: 'Needs attention', variant: 'warning' };
    case 'in_progress':
      return { label: 'In progress', variant: 'info' };
    default:
      return { label: 'Not started', variant: 'secondary' };
  }
}

function StatusIcon({ status }: { status: ModuleStatus }) {
  if (status === 'complete') return <CheckCircle2 className="size-4 shrink-0 text-moss-success" aria-hidden="true" />;
  if (status === 'needs_attention') return <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />;
  if (status === 'in_progress') return <Loader2 className="size-4 shrink-0 text-moss-info" aria-hidden="true" />;
  return <Circle className="size-4 shrink-0 text-slate-400" aria-hidden="true" />;
}

function fmtTime(d: Date | null) {
  if (!d) return null;
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

export default function AdvisoryDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const completionRef = useRef<HTMLDivElement | null>(null);
  const [x, setX] = useState<any>(null);
  const [modules, setModules] = useState<ModuleReview[]>([]);
  const [confirmedRoutes, setConfirmedRoutes] = useState<ConfirmedRoute[]>([]);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [activeCode, setActiveCode] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const dirtyRef = useRef(false);
  const modulesRef = useRef(modules);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  modulesRef.current = modules;

  const load = useCallback(async () => {
    const data = await apiFetch<any>(`/advisory/${id}`);
    setX(data);
    const rows = (data.advisoryModuleReviews || []) as ModuleReview[];
    setModules(rows);
    setActiveCode((prev) => prev || rows[0]?.moduleCode || '');
    if (data.suggestedRoutes?.length) {
      setConfirmedRoutes(data.suggestedRoutes);
    } else if (data.diagnosticOutcome?.routes?.length) {
      setConfirmedRoutes(
        data.diagnosticOutcome.routes.map((r: any) => ({
          productCode: r.productCode,
          priority: r.priority,
          rationale: r.rationale || '',
          sourceModuleCode: r.sourceModuleCode || '',
          sourceModuleName: r.sourceModuleName || '',
        })),
      );
    }
    dirtyRef.current = false;
    return data;
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
    apiFetch<any[]>('/admin/users/analysts').then(setAnalysts).catch(() => []);
  }, [load]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  const primary = useMemo(
    () => x?.assignments?.find((a: any) => a.role === 'PRIMARY_ANALYST' && a.status !== 'CANCELLED'),
    [x],
  );

  const missing = useMemo(() => incompleteModules(modules), [modules]);
  const locked = Boolean(x?.diagnosticOutcome);
  const hasDiagnosticReport = Boolean(x?.reports?.length);
  const isDiagnostic = x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
  const canCompleteDiagnostic = useMemo(() => {
    if (x?.productCode !== 'EXECUTIVE_ADVISORY_DIAGNOSTIC') return true;
    return (
      missing.length === 0 &&
      confirmedRoutes.some((r) => r.productCode) &&
      hasDiagnosticReport
    );
  }, [x?.productCode, missing.length, confirmedRoutes, hasDiagnosticReport]);

  const canOfferComplete =
    !locked &&
    missing.length === 0 &&
    (x?.productCode !== 'EXECUTIVE_ADVISORY_DIAGNOSTIC' || canCompleteDiagnostic);

  const completeCount = modules.filter((m) => isModuleComplete(m)).length;
  const progressPct = modules.length ? Math.round((completeCount / modules.length) * 100) : 0;
  const activeModule = modules.find((m) => m.moduleCode === activeCode) || modules[0] || null;
  const activeIndex = modules.findIndex((m) => m.moduleCode === (activeModule?.moduleCode || ''));
  const isLastModule = activeIndex >= 0 && activeIndex === modules.length - 1;

  function rebuildSuggestedRoutes(nextModules: ModuleReview[] = modules) {
    const byProduct = new Map<string, ConfirmedRoute & { maxExposure: number }>();
    for (const m of nextModules) {
      const code = String(m.recommendedProduct || '').trim();
      if (!code) continue;
      const exposure = Number(m.exposureRating);
      const priority = Number.isFinite(exposure) && exposure >= 70 ? 'HIGH' : 'RECOMMENDED';
      const rationale = String(m.analystNote || '').trim() || String(m.finding || '').trim().slice(0, 280);
      const existing = byProduct.get(code);
      if (!existing) {
        byProduct.set(code, {
          productCode: code,
          priority,
          rationale,
          sourceModuleCode: m.moduleCode,
          sourceModuleName: m.moduleName,
          maxExposure: Number.isFinite(exposure) ? exposure : 0,
        });
      } else if (Number.isFinite(exposure) && exposure > existing.maxExposure) {
        existing.maxExposure = exposure;
        if (exposure >= 70) existing.priority = 'HIGH';
        existing.sourceModuleCode = m.moduleCode;
        existing.sourceModuleName = m.moduleName;
        if (rationale) existing.rationale = rationale;
      }
    }
    setConfirmedRoutes([...byProduct.values()].map(({ maxExposure: _m, ...row }) => row));
  }

  function scheduleAutosave(moduleCode: string) {
    if (locked) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void persistSingleModule(moduleCode, { quiet: true });
    }, 2500);
  }

  function patchModule(moduleCode: string, patch: Partial<ModuleReview>) {
    dirtyRef.current = true;
    setSaveError('');
    setModules((prev) => {
      const next = prev.map((m) => (m.moduleCode === moduleCode ? { ...m, ...patch } : m));
      if (!x?.diagnosticOutcome) rebuildSuggestedRoutes(next);
      return next;
    });
    scheduleAutosave(moduleCode);
  }

  function patchRoute(index: number, patch: Partial<ConfirmedRoute>) {
    setConfirmedRoutes((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRoute() {
    setConfirmedRoutes((prev) => [...prev, emptyRoute()]);
  }

  function removeRoute(index: number) {
    setConfirmedRoutes((prev) => prev.filter((_, i) => i !== index));
  }

  async function persistModules(list: ModuleReview[] = modulesRef.current) {
    for (const m of list) {
      await apiFetch(`/advisory/${id}/modules/${m.moduleCode}`, {
        method: 'PATCH',
        body: JSON.stringify({
          exposureRating: m.exposureRating ?? '',
          finding: m.finding ?? '',
          evidenceSummary: m.evidenceSummary ?? '',
          businessConsequence: m.businessConsequence ?? '',
          accountableExecutive: m.accountableExecutive ?? '',
          requiredDecision: m.requiredDecision ?? '',
          recommendedProduct: m.recommendedProduct || '',
          analystNote: m.analystNote ?? '',
        }),
      });
    }
  }

  async function persistSingleModule(moduleCode: string, opts?: { quiet?: boolean }) {
    const m = modulesRef.current.find((row) => row.moduleCode === moduleCode);
    if (!m || locked) return;
    setSavingModule(true);
    if (!opts?.quiet) setSaveError('');
    try {
      await persistModules([m]);
      dirtyRef.current = false;
      setLastSavedAt(new Date());
      setSaveError('');
    } catch (e: any) {
      const message = e.message || 'Unable to save module.';
      setSaveError(message);
      if (!opts?.quiet) {
        toast({
          id: 'save-error',
          variant: 'error',
          title: "Couldn't save changes",
          description: 'Your latest changes have not been saved.',
          action: {
            label: 'Retry',
            onClick: () => void saveModule(moduleCode),
          },
        });
      } else {
        toast({
          id: 'save-error',
          variant: 'error',
          title: "Couldn't save changes",
          description: 'Autosave failed. Your latest changes have not been saved.',
          action: {
            label: 'Retry',
            onClick: () => void saveModule(moduleCode),
          },
        });
      }
      throw e;
    } finally {
      setSavingModule(false);
    }
  }

  async function saveModule(moduleCode: string) {
    setError('');
    try {
      await persistSingleModule(moduleCode);
      toast({
        id: 'save-success',
        variant: 'success',
        title: 'Assessment saved',
        description: 'All changes are up to date.',
      });
      await load();
    } catch {
      /* toast + footer */
    }
  }

  async function saveAndNext() {
    if (!activeModule) return;
    try {
      await persistSingleModule(activeModule.moduleCode);
      const next = modules[activeIndex + 1];
      toast({
        id: 'save-success',
        variant: 'success',
        title: 'Assessment saved',
        description: next
          ? `${activeModule.moduleName} saved. Moved to ${next.moduleName}.`
          : 'All changes are up to date.',
      });
      if (next) setActiveCode(next.moduleCode);
      await load();
    } catch {
      /* toast + footer */
    }
  }

  async function saveAllModules() {
    setError('');
    setBusy(true);
    setSavingModule(true);
    try {
      await persistModules(modulesRef.current);
      dirtyRef.current = false;
      setLastSavedAt(new Date());
      setSaveError('');
      toast({
        id: 'save-success',
        variant: 'success',
        title: 'Assessment saved',
        description: 'All changes are up to date.',
      });
      await load();
    } catch (e: any) {
      setSaveError(e.message || 'Unable to save assessment.');
      toast({
        id: 'save-error',
        variant: 'error',
        title: "Couldn't save changes",
        description: 'Your latest changes have not been saved.',
        action: {
          label: 'Retry',
          onClick: () => void saveAllModules(),
        },
      });
    } finally {
      setBusy(false);
      setSavingModule(false);
    }
  }

  async function selectModule(code: string) {
    if (code === activeCode) {
      setNavOpen(false);
      return;
    }
    if (dirtyRef.current && activeModule && !locked) {
      try {
        await persistSingleModule(activeModule.moduleCode, { quiet: true });
      } catch {
        return;
      }
    }
    setActiveCode(code);
    setNavOpen(false);
  }

  async function assign(userId: string) {
    if (!userId) return;
    setError('');
    try {
      await apiFetch(`/advisory/${id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ userId, role: 'PRIMARY_ANALYST' }),
      });
      const analyst = analysts.find((a) => a.id === userId);
      const name = analyst ? `${analyst.firstName} ${analyst.lastName}` : 'Consultant';
      toast({
        id: 'assign-success',
        variant: 'info',
        title: 'Consultant updated',
        description: `${name} is now the primary analyst.`,
      });
      await load();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Assignment failed',
        description: e.message || 'Unable to update the primary consultant.',
      });
    }
  }

  async function runComplete() {
    setError('');
    setBusy(true);
    try {
      if (locked) {
        router.push(`/advisory/${id}/outcome`);
        return;
      }
      await persistModules(modulesRef.current);
      const stillMissing = incompleteModules(modulesRef.current);
      if (stillMissing.length) {
        throw new Error(
          `Complete finding, business consequence and required decision for all modules. Missing: ${stillMissing
            .map((m) => m.moduleName)
            .join(', ')}`,
        );
      }
      const body =
        x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC'
          ? { routes: confirmedRoutes.filter((r) => r.productCode) }
          : {};
      if (x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC' && !body.routes?.length) {
        throw new Error('Confirm at least one Level 3 focused assurance product before completing.');
      }
      if (x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC' && !x?.reports?.length) {
        throw new Error('Generate the Executive Advisory Brief PDF before completing the diagnostic.');
      }
      const r = await apiFetch<any>(`/advisory/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC') {
        router.push(`/advisory/${id}/outcome`);
        return;
      }
      toast({
        variant: 'success',
        title: 'Assessment completed',
        description: `Review completed (${humanizeStatus(r.status)}).`,
      });
      await load();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Unable to complete',
        description: e.message || 'Completion failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function requestComplete() {
    if (locked && isDiagnostic) {
      router.push(`/advisory/${id}/outcome`);
      return;
    }
    const ok = await confirm({
      title: 'Complete this assessment?',
      description:
        'Once completed, the final assessment state will be recorded. Confirmed diagnostic routing cannot be changed afterwards.',
      confirmLabel: 'Complete assessment',
      cancelLabel: 'Cancel',
      variant: 'default',
    });
    if (!ok) return;
    await runComplete();
  }

  async function generateReport() {
    setError('');
    setBusy(true);
    try {
      if (!locked) {
        await persistModules(modulesRef.current);
        const stillMissing = incompleteModules(modulesRef.current);
        if (stillMissing.length) {
          throw new Error(
            `Complete finding, business consequence and required decision for all product modules before generating the report. Missing: ${stillMissing
              .map((m) => m.moduleName)
              .join(', ')}`,
          );
        }
      }
      const r = await apiFetch<any>(`/advisory/${id}/generate-report`, { method: 'POST' });
      toast({
        variant: 'success',
        title: locked ? 'Report regenerated' : 'Report generated',
        description: 'The PDF is ready to open.',
      });
      if (r.downloadUrl) window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
      await load();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Report generation failed',
        description: e.message || 'Unable to generate the report.',
      });
    } finally {
      setBusy(false);
    }
  }

  function scrollToCompletion() {
    completionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!x) {
    return (
      <AuthGate>
        <Shell title="Advisory engagement">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3 p-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          )}
        </Shell>
      </AuthGate>
    );
  }

  const productTitle = x.productLabel || PRODUCT_LABELS[x.productCode] || x.title;
  const activeStatus = activeModule ? getModuleStatus(activeModule) : 'not_started';
  const exposureLabel = exposureBandLabel(activeModule?.exposureRating);
  const exposureValue =
    activeModule?.exposureRating != null && Number.isFinite(Number(activeModule.exposureRating))
      ? Number(activeModule.exposureRating)
      : null;

  const moduleNav = (
    <nav className="space-y-1" aria-label="Assessment modules">
      <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Assessment modules
      </p>
      {modules.map((m) => {
        const status = getModuleStatus(m);
        const badge = statusBadgeProps(status);
        const selected = m.moduleCode === activeModule?.moduleCode;
        const missingLabels = missingRequiredFields(m);
        return (
          <button
            key={m.moduleCode}
            type="button"
            onClick={() => void selectModule(m.moduleCode)}
            className={cn(
              'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
              selected
                ? 'border-moss-info/40 bg-moss-info/[0.08] text-slate-900 shadow-sm'
                : 'border-transparent text-slate-700 hover:bg-slate-50',
            )}
            aria-current={selected ? 'page' : undefined}
          >
            <StatusIcon status={status} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-snug">{m.moduleName}</span>
              <span
                className={cn(
                  'mt-0.5 block text-xs',
                  status === 'complete' && 'text-moss-success',
                  status === 'needs_attention' && 'text-amber-700',
                  status === 'not_started' && 'text-slate-500',
                  status === 'in_progress' && 'text-moss-info',
                )}
              >
                {badge.label}
                {status === 'needs_attention' && missingLabels.length
                  ? ` · ${missingLabels[0]}${missingLabels.length > 1 ? '…' : ''}`
                  : ''}
              </span>
            </span>
          </button>
        );
      })}
      <p className="px-2 pt-3 text-xs font-medium text-slate-500">
        {completeCount} of {modules.length} modules complete
      </p>
    </nav>
  );

  return (
    <AuthGate>
      <Shell title={productTitle} hideSearch>
        <div className="advisory-workspace pb-4">
          {/* Sticky assessment header */}
          <div className="sticky top-0 z-30 -mx-1 mb-4 border-b border-slate-200 bg-white/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {x.reference}
                </div>
                <h1 className="mt-1 max-w-3xl text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                  {productTitle}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span>{x.organisation?.name || 'Organisation'}</span>
                  <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                    {humanizeStatus(x.status)}
                  </Badge>
                  <Badge
                    variant={progressPct === 100 ? 'success' : 'info'}
                    className="shrink-0 gap-1 whitespace-nowrap"
                  >
                    {progressPct === 100 ? (
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    ) : null}
                    {progressPct}% complete
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] space-y-1.5">
                  <Label className="text-xs text-slate-500">Primary consultant / analyst</Label>
                  <FilterSelect
                    value={primary?.userId || ''}
                    onChange={(next) => void assign(next)}
                    disabled={locked}
                    placeholder="Unassigned — select consultant"
                    triggerClassName="h-10 min-w-[220px] shrink-0"
                    options={analysts.map((a) => ({
                      value: a.id,
                      label: `${a.firstName} ${a.lastName} — ${a.systemRole}`,
                    }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-11 shrink-0 whitespace-nowrap px-4"
                  disabled={busy || locked}
                  onClick={() => void saveAllModules()}
                >
                  <Save className="size-4" />
                  Save assessment
                </Button>
              </div>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Unable to continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!modules.length ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Advisory engagement</CardTitle>
                <CardDescription>
                  No product modules are configured for this engagement. Do not invent a methodology; configure
                  approved client methodology before issuing conclusions.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              {/* Ready / validation */}
              {missing.length === 0 ? (
                <Card className="mb-4 rounded-xl border-moss-success/30 bg-moss-success/[0.04] shadow-sm">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                    <div className="flex min-w-0 gap-3">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-moss-success" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="m-0 text-sm font-semibold text-moss-success">Ready for completion</p>
                        <p className="m-0 mt-0.5 text-sm text-slate-700">
                          All required findings, business consequences and executive decisions are complete.
                        </p>
                      </div>
                    </div>
                    {canOfferComplete ? (
                      <Button
                        type="button"
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void requestComplete()}
                      >
                        Complete assessment
                      </Button>
                    ) : isDiagnostic && !locked ? (
                      <p className="m-0 text-xs text-slate-500">
                        Confirm Level 3 routing and generate the advisory brief before completing.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-950">
                  <AlertCircle className="size-4 text-amber-600" />
                  <AlertTitle>
                    {missing.length} module{missing.length === 1 ? '' : 's'} need attention
                  </AlertTitle>
                  <AlertDescription>
                    <ul className="mt-2 space-y-1">
                      {missing.map((m) => (
                        <li key={m.moduleCode}>
                          <button
                            type="button"
                            className="text-left font-medium text-amber-900 underline-offset-2 hover:underline"
                            onClick={() => void selectModule(m.moduleCode)}
                          >
                            ! {m.moduleName}
                          </button>
                          <span className="text-amber-800/80">
                            {' '}
                            — {missingRequiredFields(m)[0] || 'Required information'} missing
                            {missingRequiredFields(m).length > 1 ? ' (and more)' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="hidden lg:block">
                  <Card className="sticky top-[7.5rem] rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="p-3">
                      <ScrollArea className="max-h-[calc(100vh-14rem)] pr-2">{moduleNav}</ScrollArea>
                    </CardContent>
                  </Card>
                </aside>

                <div className="lg:hidden">
                  <Sheet open={navOpen} onOpenChange={setNavOpen}>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full justify-between whitespace-nowrap px-3"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Menu className="size-4 shrink-0" />
                          <span className="truncate">{activeModule?.moduleName || 'Select module'}</span>
                        </span>
                        <Badge variant={statusBadgeProps(activeStatus).variant} className="shrink-0">
                          {statusBadgeProps(activeStatus).label}
                        </Badge>
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[min(100%,320px)] p-4">
                      <SheetHeader className="mb-3 text-left">
                        <SheetTitle>Assessment modules</SheetTitle>
                      </SheetHeader>
                      {moduleNav}
                    </SheetContent>
                  </Sheet>
                </div>

                <div className="min-w-0 space-y-4">
                  {activeModule ? (
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader className="space-y-3 border-b border-slate-100 pb-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {activeModule.moduleCode}
                            </div>
                            <CardTitle className="mt-1 flex flex-wrap items-center gap-2 text-xl leading-snug">
                              <StatusIcon status={activeStatus} />
                              <span>{activeModule.moduleName}</span>
                            </CardTitle>
                            <CardDescription className="mt-2 text-sm leading-relaxed text-slate-600">
                              {activeModule.principalQuestion}
                            </CardDescription>
                          </div>
                          <Badge variant={statusBadgeProps(activeStatus).variant} className="shrink-0">
                            {statusBadgeProps(activeStatus).label}
                          </Badge>
                        </div>

                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="exposure-input">Exposure score</Label>
                              <div className="flex items-baseline gap-2">
                                <Input
                                  id="exposure-input"
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={locked || busy || savingModule}
                                  value={activeModule.exposureRating ?? ''}
                                  onChange={(e) =>
                                    patchModule(activeModule.moduleCode, {
                                      exposureRating:
                                        e.target.value === ''
                                          ? null
                                          : Math.min(100, Math.max(0, Number(e.target.value))),
                                    })
                                  }
                                  className="h-10 w-[96px] shrink-0 text-base font-semibold"
                                />
                                <span className="text-sm font-medium text-slate-500">/ 100</span>
                              </div>
                            </div>
                            {exposureLabel ? (
                              <Badge
                                variant={
                                  exposureLabel === 'Critical' || exposureLabel === 'High'
                                    ? 'danger'
                                    : exposureLabel === 'Moderate'
                                      ? 'warning'
                                      : 'success'
                                }
                                className="shrink-0 px-2.5 py-1 text-sm"
                              >
                                {exposureLabel}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400">Optional 0–100 internal indicator</span>
                            )}
                          </div>

                          <div className="space-y-2">
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              aria-label="Exposure scale"
                              disabled={locked || busy || savingModule}
                              value={exposureValue ?? 0}
                              onChange={(e) =>
                                patchModule(activeModule.moduleCode, {
                                  exposureRating: Number(e.target.value),
                                })
                              }
                              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-[#c41230] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-slate-200 [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-slate-200"
                            />
                            <div className="relative flex h-2.5 w-full overflow-hidden rounded-full">
                              <div className="h-full bg-emerald-500" style={{ width: '40%' }} title="Controlled 0–39" />
                              <div className="h-full bg-amber-400" style={{ width: '20%' }} title="Moderate 40–59" />
                              <div className="h-full bg-orange-500" style={{ width: '15%' }} title="High 60–74" />
                              <div className="h-full bg-red-600" style={{ width: '25%' }} title="Critical 75–100" />
                              {exposureValue != null ? (
                                <span
                                  className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow"
                                  style={{ left: `${exposureValue}%` }}
                                  aria-hidden="true"
                                />
                              ) : null}
                            </div>
                            <div className="flex justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              <span>0 Controlled</span>
                              <span>40 Moderate</span>
                              <span>60 High</span>
                              <span>75 Critical</span>
                              <span>100</span>
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 pt-5">
                        <div className="grid gap-4 md:grid-cols-2">
                          <FieldText
                            label="Finding"
                            value={activeModule.finding || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) => patchModule(activeModule.moduleCode, { finding: v })}
                            required
                          />
                          <FieldText
                            label="Supporting evidence / limitation"
                            value={activeModule.evidenceSummary || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) =>
                              patchModule(activeModule.moduleCode, { evidenceSummary: v })
                            }
                          />
                          <FieldText
                            label="Business consequence"
                            value={activeModule.businessConsequence || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) =>
                              patchModule(activeModule.moduleCode, { businessConsequence: v })
                            }
                            required
                          />
                          <FieldText
                            label="Required executive decision"
                            value={activeModule.requiredDecision || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) =>
                              patchModule(activeModule.moduleCode, { requiredDecision: v })
                            }
                            required
                          />
                          <div className="space-y-1.5">
                            <Label>Accountable executive</Label>
                            <Input
                              disabled={locked || busy || savingModule}
                              value={activeModule.accountableExecutive || ''}
                              onChange={(e) =>
                                patchModule(activeModule.moduleCode, {
                                  accountableExecutive: e.target.value,
                                })
                              }
                              className="h-10"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Recommended next product</Label>
                            <FilterSelect
                              value={activeModule.recommendedProduct || ''}
                              disabled={locked || busy || savingModule}
                              onChange={(next) =>
                                patchModule(activeModule.moduleCode, {
                                  recommendedProduct: next || null,
                                })
                              }
                              placeholder="No focused product selected"
                              triggerClassName="h-10 w-full min-w-0"
                              options={ROUTES.filter(([k]) => k).map(([k, v]) => ({
                                value: k,
                                label: v,
                              }))}
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label>Consultant note</Label>
                            <Textarea
                              rows={4}
                              className="min-h-[100px] resize-y"
                              disabled={locked || busy || savingModule}
                              value={activeModule.analystNote || ''}
                              onChange={(e) =>
                                patchModule(activeModule.moduleCode, { analystNote: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {isDiagnostic ? (
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Confirm Level 3 routing</CardTitle>
                        <CardDescription>
                          Review suggested routes from module working papers. Adjust product, priority and rationale
                          before completing.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {locked ? (
                          <Button variant="outline" asChild className="h-10 shrink-0 whitespace-nowrap">
                            <Link href={`/advisory/${id}/outcome`}>Open diagnostic outcome</Link>
                          </Button>
                        ) : null}
                        {!confirmedRoutes.length ? (
                          <p className="text-sm text-muted-foreground">
                            {locked
                              ? 'No Level 3 products were confirmed for this diagnostic.'
                              : 'Select a recommended next product on at least one module, or add a route row below.'}
                          </p>
                        ) : (
                          confirmedRoutes.map((route, index) => (
                            <div
                              key={`${route.productCode || 'new'}-${index}`}
                              className="space-y-3 rounded-xl border border-slate-200 p-4"
                            >
                              {route.sourceModuleName ? (
                                <p className="text-xs text-muted-foreground">
                                  Suggested from {route.sourceModuleName}
                                </p>
                              ) : null}
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>Level 3 product</Label>
                                  <FilterSelect
                                    value={route.productCode || ''}
                                    disabled={locked || busy}
                                    onChange={(next) => patchRoute(index, { productCode: next })}
                                    placeholder="No focused product selected"
                                    options={ROUTES.filter(([k]) => k).map(([k, v]) => ({
                                      value: k,
                                      label: v,
                                    }))}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Priority</Label>
                                  <FilterSelect
                                    value={route.priority}
                                    disabled={locked || busy}
                                    includeAll={false}
                                    onChange={(next) => patchRoute(index, { priority: next })}
                                    placeholder="Priority"
                                    options={ADVISORY_ROUTE_PRIORITIES.map((p) => ({
                                      value: p,
                                      label: ADVISORY_ROUTE_PRIORITY_LABELS[p],
                                    }))}
                                  />
                                </div>
                                <div className="space-y-1.5 md:col-span-2">
                                  <Label>Rationale</Label>
                                  <Textarea
                                    rows={3}
                                    className="min-h-[100px] resize-y"
                                    disabled={locked || busy}
                                    value={route.rationale || ''}
                                    onChange={(e) => patchRoute(index, { rationale: e.target.value })}
                                  />
                                </div>
                              </div>
                              {!locked ? (
                                <Button
                                  variant="outline"
                                  type="button"
                                  className="h-10 shrink-0 whitespace-nowrap"
                                  disabled={busy}
                                  onClick={() => removeRoute(index)}
                                >
                                  Remove route
                                </Button>
                              ) : null}
                            </div>
                          ))
                        )}
                        {!locked ? (
                          <Button
                            variant="outline"
                            type="button"
                            className="h-10 shrink-0 whitespace-nowrap"
                            disabled={busy}
                            onClick={addRoute}
                          >
                            Add route
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}

                  <div ref={completionRef}>
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {isDiagnostic ? 'Executive Advisory Brief readiness' : 'Focused assurance completion'}
                        </CardTitle>
                        <CardDescription>
                          {isDiagnostic
                            ? locked
                              ? 'Diagnostic routing is confirmed. Open the outcome page for commercial handoff and Level 3 engagement creation.'
                              : 'Complete all modules, generate the Executive Advisory Brief, confirm Level 3 routing, then submit.'
                            : 'Complete every product module with evidence-led findings and required decisions before marking the engagement complete.'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="lg"
                          className="h-11 shrink-0 whitespace-nowrap px-5"
                          disabled={busy || (isDiagnostic && !canCompleteDiagnostic && !locked)}
                          onClick={() => void requestComplete()}
                        >
                          {locked && isDiagnostic
                            ? 'Open diagnostic outcome'
                            : isDiagnostic
                              ? 'Complete diagnostic & confirm routing'
                              : 'Complete assessment'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          className="h-11 shrink-0 whitespace-nowrap px-5"
                          disabled={busy}
                          onClick={() => void generateReport()}
                        >
                          {locked ? 'Regenerate PDF report' : 'Generate PDF report'}
                        </Button>
                        {x.reports?.[0]?.id ? (
                          <Button
                            variant="outline"
                            size="lg"
                            asChild
                            className="h-11 shrink-0 whitespace-nowrap px-5"
                          >
                            <a href={`/reports/${x.reports[0].id}?view=advisory`}>Open latest report</a>
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              {/* Sticky module footer — inside content column so Previous is never clipped by sidebar */}
              {activeModule && !locked ? (
                <div className="sticky bottom-0 z-40 mt-6 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                  <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 shrink-0 whitespace-nowrap px-4"
                      disabled={activeIndex <= 0 || savingModule || busy}
                      onClick={() => {
                        const prev = modules[activeIndex - 1];
                        if (prev) void selectModule(prev.moduleCode);
                      }}
                    >
                      <ChevronLeft className="size-4" />
                      Previous module
                    </Button>

                    <div
                      className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm"
                      aria-live="polite"
                    >
                      {savingModule ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                          Saving…
                        </span>
                      ) : saveError ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-moss-danger">
                          <AlertCircle className="size-4" aria-hidden="true" />
                          Save failed
                        </span>
                      ) : lastSavedAt ? (
                        <span className="inline-flex items-center gap-1.5 text-moss-success">
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                          Saved {fmtTime(lastSavedAt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Unsaved changes auto-save after a short pause</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 shrink-0 whitespace-nowrap px-4"
                        disabled={savingModule || busy}
                        onClick={() => void saveModule(activeModule.moduleCode)}
                      >
                        <Save className="size-4" />
                        Save module
                      </Button>
                      {isLastModule ? (
                        canOfferComplete ? (
                          <Button
                            type="button"
                            className="h-11 shrink-0 whitespace-nowrap px-4"
                            disabled={savingModule || busy}
                            onClick={() => void requestComplete()}
                          >
                            Complete assessment
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="h-11 shrink-0 whitespace-nowrap px-4"
                            disabled={savingModule || busy}
                            onClick={scrollToCompletion}
                          >
                            Review assessment
                            <ChevronRight className="size-4" />
                          </Button>
                        )
                      ) : (
                        <Button
                          type="button"
                          className="h-11 shrink-0 whitespace-nowrap px-4"
                          disabled={savingModule || busy}
                          onClick={() => void saveAndNext()}
                        >
                          Save & next
                          <ChevronRight className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Shell>
    </AuthGate>
  );
}

function FieldText({
  label,
  value,
  disabled,
  onChange,
  required,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const empty = required && !value.trim();
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-[#c41230]"> *</span> : null}
      </Label>
      <Textarea
        rows={4}
        className={cn(
          'min-h-[110px] resize-y',
          empty && 'border-amber-300 focus-visible:ring-amber-400',
        )}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={empty || undefined}
      />
      {empty ? (
        <p className="m-0 text-xs font-medium text-amber-700">Required — add this before completion.</p>
      ) : null}
    </div>
  );
}
