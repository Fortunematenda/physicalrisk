'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  PHYSICAL_RISK_PRODUCTS,
  SHIELD360_DRAFT_CORRECTION_MESSAGE,
  hasValidBusinessConsequences,
  isEadDiagnosticModuleCode,
  isLegacyShield360ProductCode,
  isRichTextFilled,
  parseBusinessConsequenceCodes,
  parseDiagnosticResponses,
  richTextToPlainText,
  scoreEadDiagnosticCriteria,
  type EadBusinessConsequenceCode,
  type EadDiagnosticAnswers,
  type EadDiagnosticCriterion,
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
  UserRound,
} from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { BusinessConsequenceSelector } from '@/components/advisory/BusinessConsequenceSelector';
import { EadDiagnosticPanel } from '@/components/advisory/EadDiagnosticPanel';
import type { AssessmentDiagnosticQuestion } from '@/components/advisory/ManageDiagnosticQuestionsDialog';
import { RichTextField } from '@/components/advisory/RichTextField';
import { flushAllRichTextEditors } from '@/components/ui/rich-text-editor';
import { useConfirm } from '@/components/confirm-dialog';
import { Shell } from '@/components/Shell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { getStoredUser, resolveMvpNavRole } from '@/lib/auth-user';
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
];

type ModuleReview = {
  id: string;
  moduleCode: string;
  moduleName: string;
  principalQuestion: string;
  exposureRating?: number | null;
  diagnosticResponses?: unknown;
  /** Local working copy of structured diagnostic answers. */
  diagnosticAnswers?: EadDiagnosticAnswers;
  finding?: string | null;
  evidenceSummary?: string | null;
  /** Legacy free-text / report-compat string. */
  businessConsequence?: string | null;
  businessConsequences?: EadBusinessConsequenceCode[];
  businessConsequenceDetail?: string | null;
  otherBusinessConsequence?: string | null;
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

type RequiredFieldKey = 'finding' | 'businessConsequence' | 'requiredDecision';

const REQUIRED_FIELDS: Array<{ key: RequiredFieldKey; label: string }> = [
  { key: 'finding', label: 'Finding' },
  { key: 'businessConsequence', label: 'Business consequences' },
  { key: 'requiredDecision', label: 'Required executive decision' },
];

function moduleConsequenceCodes(m: ModuleReview): EadBusinessConsequenceCode[] {
  return parseBusinessConsequenceCodes(m.businessConsequences);
}

function isBusinessConsequenceComplete(m: ModuleReview) {
  return hasValidBusinessConsequences(
    moduleConsequenceCodes(m),
    m.otherBusinessConsequence,
  );
}

function moduleQuestions(
  all: AssessmentDiagnosticQuestion[] | undefined,
  moduleCode: string,
): AssessmentDiagnosticQuestion[] {
  return (all || []).filter((q) => q.moduleCode === moduleCode);
}

function activeCriteriaFromQuestions(questions: AssessmentDiagnosticQuestion[]): EadDiagnosticCriterion[] {
  return questions
    .filter((q) => q.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => ({
      code: q.questionCode,
      title: q.title,
      question: q.questionText,
      helpText: q.helpText,
      allowNa: q.allowNa,
      isRequired: q.isRequired,
    }));
}

function isModuleComplete(m: ModuleReview, allQuestions?: AssessmentDiagnosticQuestion[]) {
  const narrative = Boolean(
    isRichTextFilled(m.finding) && isRichTextFilled(m.requiredDecision),
  );
  if (!narrative || !isBusinessConsequenceComplete(m)) return false;
  if (!isEadDiagnosticModuleCode(m.moduleCode)) return true;
  const answers =
    m.diagnosticAnswers ||
    parseDiagnosticResponses(m.diagnosticResponses)?.answers ||
    {};
  const criteria = activeCriteriaFromQuestions(moduleQuestions(allQuestions, m.moduleCode));
  if (!criteria.length) {
    // Fallback while snapshot loads
    return Object.keys(answers).length > 0;
  }
  return scoreEadDiagnosticCriteria(criteria, answers).allRequiredAnswered;
}

function incompleteModules(
  modules: ModuleReview[],
  allQuestions?: AssessmentDiagnosticQuestion[],
) {
  return modules.filter((m) => !isModuleComplete(m, allQuestions));
}

function moduleHasAnyContent(m: ModuleReview) {
  const answers =
    m.diagnosticAnswers ||
    parseDiagnosticResponses(m.diagnosticResponses)?.answers ||
    {};
  const hasDiagnostic = Object.values(answers).some((v) => Boolean(v));
  return Boolean(
    m.finding?.trim() ||
      m.evidenceSummary?.trim() ||
      m.businessConsequence?.trim() ||
      moduleConsequenceCodes(m).length ||
      m.businessConsequenceDetail?.trim() ||
      m.otherBusinessConsequence?.trim() ||
      m.accountableExecutive?.trim() ||
      m.requiredDecision?.trim() ||
      m.recommendedProduct?.trim() ||
      m.analystNote?.trim() ||
      hasDiagnostic ||
      (m.exposureRating != null && Number.isFinite(Number(m.exposureRating))),
  );
}

function missingRequiredFields(m: ModuleReview) {
  return REQUIRED_FIELDS.filter((f) => {
    if (f.key === 'businessConsequence') return !isBusinessConsequenceComplete(m);
    if (f.key === 'finding' || f.key === 'requiredDecision') {
      return !isRichTextFilled(m[f.key]);
    }
    return !String(m[f.key] || '').trim();
  });
}

/**
 * Display status only — does not change save/complete rules.
 * Untouched modules stay Not started until validation is requested.
 * Partial work is In progress; after Save & next / Review / Complete
 * attempts, incomplete modules become Needs attention.
 */
function getModuleStatus(
  m: ModuleReview,
  opts?: {
    forceAttention?: boolean;
    reviewAttempted?: boolean;
    allQuestions?: AssessmentDiagnosticQuestion[];
  },
): ModuleStatus {
  if (isModuleComplete(m, opts?.allQuestions)) return 'complete';
  if (opts?.forceAttention || opts?.reviewAttempted) return 'needs_attention';
  if (!moduleHasAnyContent(m)) return 'not_started';
  return 'in_progress';
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
  if (status === 'complete') {
    return <CheckCircle2 className="size-4 shrink-0 text-moss-success" aria-hidden="true" />;
  }
  if (status === 'needs_attention') {
    return <AlertCircle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />;
  }
  if (status === 'in_progress') {
    return <Circle className="size-4 shrink-0 fill-moss-info/30 text-moss-info" aria-hidden="true" />;
  }
  return <Circle className="size-4 shrink-0 text-slate-400" aria-hidden="true" />;
}

function fmtTime(d: Date | null) {
  if (!d) return null;
  return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function fieldDomId(moduleCode: string, key: string) {
  return `mod-${moduleCode}-${key}`;
}

export default function AdvisoryDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [x, setX] = useState<any>(null);
  const [modules, setModules] = useState<ModuleReview[]>([]);
  const [confirmedRoutes, setConfirmedRoutes] = useState<ConfirmedRoute[]>([]);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [activeCode, setActiveCode] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignDraftUserId, setAssignDraftUserId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  /** Modules that failed validation after Save & next / explicit check. */
  const [attentionCodes, setAttentionCodes] = useState<Set<string>>(() => new Set());
  /** After Review / Complete attempt — show needs-attention for incomplete modules. */
  const [reviewAttempted, setReviewAttempted] = useState(false);
  /** Touched fields: `${moduleCode}:${fieldKey}` */
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set());
  const dirtyRef = useRef(false);
  const modulesRef = useRef(modules);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  modulesRef.current = modules;

  const load = useCallback(async () => {
    const data = await apiFetch<any>(`/advisory/${id}`);
    setX(data);
    const rows = ((data.advisoryModuleReviews || []) as ModuleReview[]).map((row) => {
      const snap = parseDiagnosticResponses(row.diagnosticResponses);
      const codes = parseBusinessConsequenceCodes(row.businessConsequences);
      // Quietly preserve pre-Stage-2 free text in the detail field (no separate legacy banner).
      const detail =
        String(row.businessConsequenceDetail || '').trim() ||
        (!codes.length && String(row.businessConsequence || '').trim()) ||
        '';
      return {
        ...row,
        diagnosticAnswers: snap?.answers || row.diagnosticAnswers,
        businessConsequences: codes,
        businessConsequenceDetail: detail,
        otherBusinessConsequence: row.otherBusinessConsequence || '',
      };
    });
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
    void load()
      .then(() => setLoadFailed(false))
      .catch((e: Error) => {
        setLoadFailed(true);
        toast({
          title: 'Unable to load engagement',
          description: e.message,
          variant: 'error',
        });
      });
    apiFetch<any[]>('/admin/users/analysts').then(setAnalysts).catch(() => []);
  }, [load, toast]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!assignOpen || !x) return;
    const currentPrimary = x.assignments?.find(
      (a: any) => a.role === 'PRIMARY_ANALYST' && a.status !== 'CANCELLED',
    );
    setAssignDraftUserId(currentPrimary?.userId || x.lockedTriageAnalystId || '');
  }, [assignOpen, x]);

  const primary = useMemo(
    () => x?.assignments?.find((a: any) => a.role === 'PRIMARY_ANALYST' && a.status !== 'CANCELLED'),
    [x],
  );

  const diagnosticQuestions = (x?.eadDiagnosticQuestions || []) as AssessmentDiagnosticQuestion[];
  const missing = useMemo(
    () => incompleteModules(modules, diagnosticQuestions),
    [modules, diagnosticQuestions],
  );
  const locked = Boolean(x?.diagnosticOutcome);
  const primaryAnalystLocked = Boolean(x?.primaryAnalystLocked);
  const isDiagnostic = x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
  const canCompleteDiagnostic = useMemo(() => {
    if (x?.productCode !== 'EXECUTIVE_ADVISORY_DIAGNOSTIC') return true;
    return missing.length === 0 && confirmedRoutes.some((r) => r.productCode);
  }, [x?.productCode, missing.length, confirmedRoutes]);

  const completeCount = modules.filter((m) => isModuleComplete(m, diagnosticQuestions)).length;
  const progressPct = modules.length ? Math.round((completeCount / modules.length) * 100) : 0;
  const anyStarted = modules.some(
    (m) => moduleHasAnyContent(m) || isModuleComplete(m, diagnosticQuestions),
  );
  const activeModule = modules.find((m) => m.moduleCode === activeCode) || modules[0] || null;
  const activeIndex = modules.findIndex((m) => m.moduleCode === (activeModule?.moduleCode || ''));
  const isLastModule = activeIndex >= 0 && activeIndex === modules.length - 1;
  const showCompletionActions = locked || (missing.length === 0 && isLastModule);

  const attentionModules = useMemo(
    () =>
      modules.filter((m) => {
        if (isModuleComplete(m, diagnosticQuestions)) return false;
        if (missingRequiredFields(m).length === 0) return false;
        return reviewAttempted || attentionCodes.has(m.moduleCode);
      }),
    [modules, reviewAttempted, attentionCodes, diagnosticQuestions],
  );

  const attentionFieldCount = useMemo(
    () => attentionModules.reduce((n, m) => n + missingRequiredFields(m).length, 0),
    [attentionModules],
  );

  function moduleStatusFor(m: ModuleReview): ModuleStatus {
    return getModuleStatus(m, {
      forceAttention: attentionCodes.has(m.moduleCode),
      reviewAttempted,
      allQuestions: diagnosticQuestions,
    });
  }

  function markFieldTouched(moduleCode: string, key: string) {
    setTouchedFields((prev) => {
      const next = new Set(prev);
      next.add(`${moduleCode}:${key}`);
      return next;
    });
  }

  function shouldShowFieldError(moduleCode: string, key: RequiredFieldKey, value: string) {
    if (value.trim()) return false;
    if (touchedFields.has(`${moduleCode}:${key}`)) return true;
    if (attentionCodes.has(moduleCode)) return true;
    if (reviewAttempted) return true;
    return false;
  }

  function rebuildSuggestedRoutes(nextModules: ModuleReview[] = modules) {
    const byProduct = new Map<string, ConfirmedRoute & { maxExposure: number }>();
    for (const m of nextModules) {
      const code = String(m.recommendedProduct || '').trim();
      if (!code) continue;
      const exposure = Number(m.exposureRating);
      const priority = Number.isFinite(exposure) && exposure >= 70 ? 'HIGH' : 'RECOMMENDED';
      const rationale =
        richTextToPlainText(String(m.analystNote || '')).trim() ||
        richTextToPlainText(String(m.finding || '')).trim().slice(0, 280);
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
      // Route suggestions only depend on product / exposure / notes — skip thrashing the form
      // when only consequence chips or narrative fields change.
      const routeRelevant =
        patch.recommendedProduct !== undefined ||
        patch.exposureRating !== undefined ||
        patch.analystNote !== undefined ||
        patch.finding !== undefined;
      if (!x?.diagnosticOutcome && routeRelevant) rebuildSuggestedRoutes(next);
      return next;
    });
    scheduleAutosave(moduleCode);
  }

  async function persistModules(list: ModuleReview[] = modulesRef.current) {
    flushAllRichTextEditors();
    for (const m of list) {
      const body: Record<string, unknown> = {
        finding: m.finding ?? '',
        evidenceSummary: m.evidenceSummary ?? '',
        businessConsequences: moduleConsequenceCodes(m),
        businessConsequenceDetail: m.businessConsequenceDetail ?? '',
        otherBusinessConsequence: m.otherBusinessConsequence ?? '',
        accountableExecutive: m.accountableExecutive ?? '',
        requiredDecision: m.requiredDecision ?? '',
        recommendedProduct: m.recommendedProduct || '',
        analystNote: m.analystNote ?? '',
      };
      if (isEadDiagnosticModuleCode(m.moduleCode)) {
        body.diagnosticAnswers =
          m.diagnosticAnswers ||
          parseDiagnosticResponses(m.diagnosticResponses)?.answers ||
          {};
      } else {
        body.exposureRating = m.exposureRating ?? '';
      }
      await apiFetch(`/advisory/${id}/modules/${m.moduleCode}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    }
  }

  async function persistSingleModule(moduleCode: string, opts?: { quiet?: boolean }) {
    const m = modulesRef.current.find((row) => row.moduleCode === moduleCode);
    if (!m || locked) return;
    const quiet = Boolean(opts?.quiet);
    if (!quiet) setSavingModule(true);
    if (!quiet) setSaveError('');
    try {
      await persistModules([m]);
      dirtyRef.current = false;
      setLastSavedAt(new Date());
      setSaveError('');
      if (isModuleComplete(m, diagnosticQuestions)) {
        setAttentionCodes((prev) => {
          if (!prev.has(moduleCode)) return prev;
          const next = new Set(prev);
          next.delete(moduleCode);
          return next;
        });
      }
    } catch (e: any) {
      const message = e.message || 'Unable to save module.';
      setSaveError(message);
      toast({
        id: 'save-error',
        variant: 'error',
        title: 'Save failed',
        description: quiet
          ? 'Autosave failed. Your latest changes have not been saved.'
          : 'Your latest changes have not been saved.',
        action: {
          label: 'Retry',
          onClick: () => void saveModule(moduleCode),
        },
      });
      throw e;
    } finally {
      if (!quiet) setSavingModule(false);
    }
  }

  function maybeOpenCompletionDialog(rows: ModuleReview[], targetModuleCode: string, hasOutcome: boolean) {
    if (hasOutcome || !rows.length) return;
    const lastCode = rows[rows.length - 1]?.moduleCode;
    if (!lastCode || targetModuleCode !== lastCode) return;
    if (incompleteModules(rows, diagnosticQuestions).length > 0) return;
    setCompletionOpen(true);
  }

  async function saveModule(moduleCode: string) {
    try {
      await persistSingleModule(moduleCode);
      toast({
        id: 'save-success',
        variant: 'success',
        title: 'Module saved',
        description: 'Your changes are up to date.',
      });
      const data = await load();
      const rows = (data.advisoryModuleReviews || []) as ModuleReview[];
      maybeOpenCompletionDialog(rows, moduleCode, Boolean(data.diagnosticOutcome));
    } catch {
      /* toast + footer */
    }
  }

  function markModulesAttention(codes: string[]) {
    setAttentionCodes((prev) => {
      const next = new Set(prev);
      for (const code of codes) next.add(code);
      return next;
    });
    setTouchedFields((prev) => {
      const next = new Set(prev);
      for (const code of codes) {
        for (const f of REQUIRED_FIELDS) next.add(`${code}:${f.key}`);
      }
      return next;
    });
  }

  function markModuleAttention(moduleCode: string) {
    markModulesAttention([moduleCode]);
  }

  async function saveAndNext() {
    if (!activeModule) return;
    const gaps = missingRequiredFields(activeModule);
    if (gaps.length) {
      markModuleAttention(activeModule.moduleCode);
      toast({
        id: 'module-validation',
        variant: 'warning',
        title: 'Needs attention',
        description: `${gaps.length} required field${gaps.length === 1 ? '' : 's'} still need information.`,
      });
      const first = gaps[0];
      requestAnimationFrame(() => {
        document.getElementById(fieldDomId(activeModule.moduleCode, first.key))?.focus();
      });
      return;
    }
    try {
      await persistSingleModule(activeModule.moduleCode);
      const next = modules[activeIndex + 1];
      toast({
        id: 'save-success',
        variant: 'success',
        title: 'Module saved',
        description: next
          ? `${activeModule.moduleName} saved. Moved to ${next.moduleName}.`
          : 'Your changes are up to date.',
      });
      if (next) setActiveCode(next.moduleCode);
      const data = await load();
      if (next) {
        const rows = (data.advisoryModuleReviews || []) as ModuleReview[];
        maybeOpenCompletionDialog(rows, next.moduleCode, Boolean(data.diagnosticOutcome));
      }
    } catch {
      /* toast + footer */
    }
  }

  async function saveAllModules() {
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
        description: 'Your changes are up to date.',
      });
      await load();
    } catch (e: any) {
      setSaveError(e.message || 'Unable to save assessment.');
      toast({
        id: 'save-error',
        variant: 'error',
        title: 'Save failed',
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

  async function focusIssue(moduleCode: string, fieldKey?: RequiredFieldKey) {
    setIssuesOpen(false);
    setNavOpen(false);
    await selectModule(moduleCode);
    requestAnimationFrame(() => {
      if (fieldKey) {
        document.getElementById(fieldDomId(moduleCode, fieldKey))?.focus();
        document.getElementById(fieldDomId(moduleCode, fieldKey))?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    });
  }

  async function assign(userId: string) {
    if (!userId) return;
    setAssigning(true);
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
      setAssignOpen(false);
      await load();
    } catch (e: any) {
      toast({
        variant: 'error',
        title: 'Assignment failed',
        description: e.message || 'Unable to update the primary consultant.',
      });
    } finally {
      setAssigning(false);
    }
  }

  async function runComplete() {
    setBusy(true);
    try {
      if (locked) {
        router.push(`/advisory/${id}/outcome`);
        return;
      }
      await persistModules(modulesRef.current);
      const legacyShield = modulesRef.current.filter((m) =>
        isLegacyShield360ProductCode(m.recommendedProduct),
      );
      if (legacyShield.length) {
        throw new Error(SHIELD360_DRAFT_CORRECTION_MESSAGE);
      }
      const stillMissing = incompleteModules(modulesRef.current, diagnosticQuestions);
      if (stillMissing.length) {
        setReviewAttempted(true);
        markModulesAttention(stillMissing.map((m) => m.moduleCode));
        throw new Error(
          `Complete finding, business consequence and required decision for all modules. Missing: ${stillMissing
            .map((m) => m.moduleName)
            .join(', ')}`,
        );
      }
      const body =
        x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC'
          ? { routes: confirmedRoutes.filter((r) => r.productCode && !isLegacyShield360ProductCode(r.productCode)) }
          : {};
      if (x?.productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC' && !body.routes?.length) {
        throw new Error(
          'Select a recommended next product on at least one module before completing.',
        );
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
    const stillMissing = incompleteModules(modulesRef.current, diagnosticQuestions);
    if (stillMissing.length) {
      setReviewAttempted(true);
      markModulesAttention(stillMissing.map((m) => m.moduleCode));
      setIssuesOpen(true);
      toast({
        id: 'review-validation',
        variant: 'warning',
        title: `${stillMissing.length} module${stillMissing.length === 1 ? '' : 's'} need attention`,
        description: 'Resolve required fields before completing the assessment.',
      });
      return;
    }
    const ok = await confirm({
      title: 'Complete this assessment?',
      description:
        'Once completed, the final assessment state will be recorded and cannot be changed afterwards.',
      confirmLabel: 'Complete assessment',
      cancelLabel: 'Cancel',
      variant: 'default',
    });
    if (!ok) return;
    await runComplete();
  }

  async function generateReport() {
    setBusy(true);
    try {
      if (!locked) {
        await persistModules(modulesRef.current);
        const stillMissing = incompleteModules(modulesRef.current, diagnosticQuestions);
        if (stillMissing.length) {
          setReviewAttempted(true);
          markModulesAttention(stillMissing.map((m) => m.moduleCode));
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
    setReviewAttempted(true);
    if (missing.length) {
      markModulesAttention(missing.map((m) => m.moduleCode));
      setIssuesOpen(true);
      return;
    }
    setCompletionOpen(true);
  }

  if (!x) {
    return (
      <AuthGate>
        <Shell title="Advisory engagement">
          {loadFailed ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Unable to load engagement</CardTitle>
                <CardDescription>Check the toast notification for details, then retry.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
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
  const activeStatus = activeModule ? moduleStatusFor(activeModule) : 'not_started';
  const activeBadge = statusBadgeProps(activeStatus);
  const primaryName = primary
    ? [primary.user?.firstName, primary.user?.lastName].filter(Boolean).join(' ').trim() ||
      primary.user?.email ||
      'Assigned'
    : null;
  const isAdmin = resolveMvpNavRole(getStoredUser()?.role || '') === 'ADMIN';
  const canChangePrimary = Boolean(primaryName) && (isAdmin || (!locked && !primaryAnalystLocked));
  const canAssignPrimary = !primaryName && (isAdmin || (!locked && !primaryAnalystLocked));
  const canManagePrimary = canAssignPrimary || canChangePrimary;

  const completionActions = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        className="h-10 shrink-0 whitespace-nowrap px-4"
        disabled={busy || (isDiagnostic && !canCompleteDiagnostic && !locked)}
        onClick={() => void requestComplete()}
      >
        {locked && isDiagnostic
          ? 'Open diagnostic outcome'
          : isDiagnostic
            ? 'Complete diagnostic'
            : 'Complete assessment'}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-10 shrink-0 whitespace-nowrap px-4"
        disabled={busy}
        onClick={() => void generateReport()}
      >
        {locked ? 'Regenerate PDF report' : 'Generate PDF report'}
      </Button>
    </div>
  );

  const moduleNav = (
    <nav className="space-y-1" aria-label="Assessment modules">
      <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Assessment modules
      </p>
      {modules.map((m) => {
        const status = moduleStatusFor(m);
        const badge = statusBadgeProps(status);
        const selected = m.moduleCode === activeModule?.moduleCode;
        const missingCount = missingRequiredFields(m).length;
        return (
          <button
            key={m.moduleCode}
            type="button"
            onClick={() => void selectModule(m.moduleCode)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
              selected
                ? 'border-moss-info/35 bg-moss-info/[0.07] text-slate-900 shadow-sm ring-1 ring-inset ring-moss-info/20'
                : 'border-transparent text-slate-700 hover:bg-slate-50',
            )}
            aria-current={selected ? 'page' : undefined}
          >
            <StatusIcon status={status} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-snug text-slate-900">{m.moduleName}</span>
              <span
                className={cn(
                  'mt-0.5 block text-xs leading-snug',
                  status === 'complete' && 'text-moss-success',
                  status === 'needs_attention' && 'text-amber-700',
                  status === 'not_started' && 'text-slate-500',
                  status === 'in_progress' && 'text-moss-info',
                )}
              >
                {badge.label}
                {status === 'needs_attention' && missingCount
                  ? ` · ${missingCount} required field${missingCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <AuthGate>
      <Shell title={productTitle} hideSearch>
        <div className="advisory-workspace pb-4">
          {/* Workspace identity — product name lives in Shell; avoid repeating at the same size */}
          <div className="sticky top-0 z-30 -mx-1 mb-4 border-b border-slate-200 bg-white/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/90">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="m-0 text-base font-semibold text-slate-900 sm:text-lg">
                  <span className="font-semibold tracking-tight">{x.reference}</span>
                  <span className="mx-2 text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-medium text-slate-700">{x.organisation?.name || 'Organisation'}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info" className="shrink-0 whitespace-nowrap">
                    {humanizeStatus(x.status) === 'Draft' || progressPct < 100
                      ? 'In progress'
                      : humanizeStatus(x.status)}
                  </Badge>
                  <span className="text-sm text-slate-600">
                    {completeCount} of {modules.length} complete
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Primary consultant
                  </p>
                  {primaryName ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-medium text-slate-900">{primaryName}</p>
                        <p className="m-0 text-xs text-slate-500">
                          Primary analyst
                          {primaryAnalystLocked && !isAdmin ? ' · Locked from Level 1 triage' : ''}
                          {isAdmin && locked ? ' · Admin can reassign' : ''}
                        </p>
                      </div>
                      {canChangePrimary ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 whitespace-nowrap px-2 text-xs"
                          onClick={() => setAssignOpen(true)}
                        >
                          Change
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="m-0 text-sm text-slate-700">
                        Not assigned
                        <span className="text-amber-700"> · Required</span>
                      </p>
                      {canAssignPrimary ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 whitespace-nowrap px-2.5"
                          onClick={() => setAssignOpen(true)}
                        >
                          <UserRound className="size-3.5" />
                          Assign consultant
                        </Button>
                      ) : null}
                    </div>
                  )}
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
              {/* Calm progress — never treat 0% as an error */}
              <Card className="mb-4 rounded-xl border-slate-200 shadow-sm">
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="m-0 text-sm font-semibold text-slate-900">Assessment progress</p>
                      <p className="m-0 mt-0.5 text-sm text-slate-600">
                        {completeCount} of {modules.length} modules complete
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-slate-700">{progressPct}%</span>
                  </div>
                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Assessment progress"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        progressPct === 100 ? 'bg-moss-success' : 'bg-moss-info',
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="m-0 text-xs text-slate-500">
                    Primary consultant: {primaryName || 'Not assigned'}
                  </p>
                </CardContent>
              </Card>

              {/* Compact validation summary — only after genuine attention signals */}
              {missing.length === 0 && anyStarted ? (
                <Card className="mb-4 rounded-xl border-moss-success/30 bg-moss-success/[0.04] shadow-sm">
                  <CardContent className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-moss-success" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-moss-success">Ready for completion</p>
                      <p className="m-0 mt-0.5 text-sm text-slate-700">
                        All required findings, business consequences and executive decisions are complete.
                        {isDiagnostic && !locked && !isLastModule
                          ? ' Open the last module to generate the brief and complete the diagnostic.'
                          : null}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : attentionModules.length > 0 ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="m-0 text-sm font-semibold text-amber-950">
                        {attentionModules.length} module{attentionModules.length === 1 ? '' : 's'} need attention
                      </p>
                      <p className="m-0 mt-0.5 text-sm text-amber-900/80">
                        {attentionFieldCount} required field{attentionFieldCount === 1 ? '' : 's'} still need
                        information.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 whitespace-nowrap border-amber-300 bg-white px-3 text-amber-950"
                    onClick={() => setIssuesOpen(true)}
                  >
                    View issues
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
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
                        <Badge variant={activeBadge.variant} className="shrink-0">
                          {activeBadge.label}
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
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              {activeModule.moduleCode.replaceAll('_', ' ')}
                            </div>
                            <CardTitle className="mt-1 text-xl leading-snug text-slate-900">
                              {activeModule.moduleName}
                            </CardTitle>
                            <CardDescription className="mt-2 text-sm leading-relaxed text-slate-600">
                              {activeModule.principalQuestion}
                            </CardDescription>
                          </div>
                          <Badge variant={activeBadge.variant} className="shrink-0 gap-1 whitespace-nowrap">
                            {activeStatus === 'complete' ? (
                              <CheckCircle2 className="size-3.5" aria-hidden="true" />
                            ) : null}
                            {activeBadge.label}
                          </Badge>
                        </div>

                        {activeModule && isEadDiagnosticModuleCode(activeModule.moduleCode) ? (
                          <EadDiagnosticPanel
                            assessmentId={String(id)}
                            moduleCode={activeModule.moduleCode}
                            moduleName={activeModule.moduleName}
                            diagnosticResponses={activeModule.diagnosticResponses}
                            legacyExposureRating={activeModule.exposureRating}
                            locked={locked}
                            busy={busy || savingModule}
                            questions={moduleQuestions(diagnosticQuestions, activeModule.moduleCode)}
                            criteria={activeCriteriaFromQuestions(
                              moduleQuestions(diagnosticQuestions, activeModule.moduleCode),
                            )}
                            onQuestionsChanged={async () => {
                              dirtyRef.current = true;
                              await load();
                            }}
                            onAnswersChange={(answers) => {
                              const criteria = activeCriteriaFromQuestions(
                                moduleQuestions(diagnosticQuestions, activeModule.moduleCode),
                              );
                              const scored = scoreEadDiagnosticCriteria(criteria, answers);
                              patchModule(activeModule.moduleCode, {
                                diagnosticAnswers: answers,
                                exposureRating:
                                  scored.exposureIndicator == null
                                    ? null
                                    : Math.round(scored.exposureIndicator),
                              });
                            }}
                          />
                        ) : null}
                      </CardHeader>

                      <CardContent className="space-y-4 pt-5">
                        <div className="grid gap-5 md:grid-cols-2">
                          <RichTextField
                            id={fieldDomId(activeModule.moduleCode, 'finding')}
                            label="Finding"
                            value={activeModule.finding || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) => patchModule(activeModule.moduleCode, { finding: v })}
                            onBlur={() => markFieldTouched(activeModule.moduleCode, 'finding')}
                            required
                            showError={shouldShowFieldError(
                              activeModule.moduleCode,
                              'finding',
                              isRichTextFilled(activeModule.finding) ? 'ok' : '',
                            )}
                            placeholder="Describe the key finding..."
                          />
                          <RichTextField
                            id={fieldDomId(activeModule.moduleCode, 'evidenceSummary')}
                            label="Supporting evidence / limitation"
                            value={activeModule.evidenceSummary || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) =>
                              patchModule(activeModule.moduleCode, { evidenceSummary: v })
                            }
                            placeholder="Evidence reviewed or limitation noted..."
                          />
                          <BusinessConsequenceSelector
                            id={fieldDomId(activeModule.moduleCode, 'businessConsequence')}
                            disabled={locked || busy || savingModule}
                            value={{
                              codes: moduleConsequenceCodes(activeModule),
                              otherText: activeModule.otherBusinessConsequence || '',
                              detail: activeModule.businessConsequenceDetail || '',
                            }}
                            onChange={(next) =>
                              patchModule(activeModule.moduleCode, {
                                businessConsequences: next.codes,
                                otherBusinessConsequence: next.otherText,
                                businessConsequenceDetail: next.detail,
                              })
                            }
                            onBlur={() =>
                              markFieldTouched(activeModule.moduleCode, 'businessConsequence')
                            }
                            showError={shouldShowFieldError(
                              activeModule.moduleCode,
                              'businessConsequence',
                              isBusinessConsequenceComplete(activeModule) ? 'ok' : '',
                            )}
                          />
                          <RichTextField
                            id={fieldDomId(activeModule.moduleCode, 'requiredDecision')}
                            label="Required executive decision"
                            value={activeModule.requiredDecision || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) =>
                              patchModule(activeModule.moduleCode, { requiredDecision: v })
                            }
                            onBlur={() =>
                              markFieldTouched(activeModule.moduleCode, 'requiredDecision')
                            }
                            required
                            showError={shouldShowFieldError(
                              activeModule.moduleCode,
                              'requiredDecision',
                              isRichTextFilled(activeModule.requiredDecision) ? 'ok' : '',
                            )}
                            placeholder="What decision is required from executives?"
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
                            {isLegacyShield360ProductCode(activeModule.recommendedProduct) ? (
                              <Alert variant="destructive" className="mb-2">
                                <AlertTitle>Legacy recommendation — Shield 360</AlertTitle>
                                <AlertDescription>
                                  {SHIELD360_DRAFT_CORRECTION_MESSAGE}
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <FilterSelect
                              value={
                                isLegacyShield360ProductCode(activeModule.recommendedProduct)
                                  ? ''
                                  : activeModule.recommendedProduct || ''
                              }
                              disabled={locked || busy || savingModule}
                              onChange={(next) =>
                                patchModule(activeModule.moduleCode, {
                                  recommendedProduct: next || null,
                                })
                              }
                              placeholder={
                                isLegacyShield360ProductCode(activeModule.recommendedProduct)
                                  ? 'Select a replacement or no recommendation'
                                  : 'No focused product selected'
                              }
                              triggerClassName="h-10 w-full min-w-0"
                              options={ROUTES.filter(([k]) => k).map(([k, v]) => ({
                                value: k,
                                label: v,
                              }))}
                            />
                          </div>
                          <RichTextField
                            id={fieldDomId(activeModule.moduleCode, 'analystNote')}
                            className="md:col-span-2"
                            label="Consultant note"
                            value={activeModule.analystNote || ''}
                            disabled={locked || busy || savingModule}
                            onChange={(v) =>
                              patchModule(activeModule.moduleCode, { analystNote: v })
                            }
                            placeholder="Internal consultant notes..."
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>

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
                        <span className="inline-flex flex-wrap items-center justify-center gap-2 font-medium text-moss-danger">
                          <span className="inline-flex items-center gap-1.5">
                            <AlertCircle className="size-4" aria-hidden="true" />
                            Save failed
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 shrink-0 whitespace-nowrap px-2 text-moss-danger"
                            onClick={() => void saveModule(activeModule.moduleCode)}
                          >
                            Retry
                          </Button>
                        </span>
                      ) : lastSavedAt ? (
                        <span className="inline-flex items-center gap-1.5 text-moss-success">
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                          Saved {fmtTime(lastSavedAt)}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not saved</span>
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
                        missing.length > 0 && !showCompletionActions ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 shrink-0 whitespace-nowrap px-4"
                            disabled={savingModule || busy}
                            onClick={scrollToCompletion}
                          >
                            Review issues
                          </Button>
                        ) : showCompletionActions ? (
                          <Button
                            type="button"
                            className="h-11 shrink-0 whitespace-nowrap px-4"
                            disabled={savingModule || busy}
                            onClick={() => setCompletionOpen(true)}
                          >
                            {isDiagnostic ? 'Finish diagnostic' : 'Finish assessment'}
                          </Button>
                        ) : null
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

        <Dialog open={completionOpen} onOpenChange={setCompletionOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {isDiagnostic ? 'Executive Advisory Brief readiness' : 'Focused assurance completion'}
              </DialogTitle>
              <DialogDescription>
                {isDiagnostic
                  ? locked
                    ? 'Diagnostic is complete. Open the outcome page for commercial handoff and Level 3 engagement creation.'
                    : 'Complete the diagnostic when modules and routing are ready. Generating the Executive Advisory Brief PDF is optional.'
                  : 'Mark the engagement complete once every module is finished.'}
              </DialogDescription>
            </DialogHeader>
            {completionActions}
          </DialogContent>
        </Dialog>

        <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign primary consultant</DialogTitle>
              <DialogDescription>
                Select the analyst responsible for this Executive Advisory Diagnostic, then confirm
                the assignment.
              </DialogDescription>
            </DialogHeader>
            <FilterSelect
              value={assignDraftUserId}
              onChange={setAssignDraftUserId}
              disabled={!canManagePrimary || assigning}
              includeAll
              placeholder="Select consultant"
              triggerClassName="h-11 w-full"
              options={analysts.map((a) => ({
                value: a.id,
                label: `${a.firstName} ${a.lastName} — ${a.systemRole}`,
              }))}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={assigning}
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!assignDraftUserId || assigning || !canManagePrimary}
                onClick={() => void assign(assignDraftUserId)}
              >
                {assigning ? 'Assigning…' : 'Assign consultant'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={issuesOpen} onOpenChange={setIssuesOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Issues to resolve</DialogTitle>
              <DialogDescription>
                Select a field to jump to it in the assessment workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(60vh,420px)] space-y-4 overflow-y-auto pr-1">
              {attentionModules.map((m) => (
                <div key={m.moduleCode} className="space-y-1.5">
                  <button
                    type="button"
                    className="text-left text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                    onClick={() => void focusIssue(m.moduleCode)}
                  >
                    {m.moduleName}
                  </button>
                  <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    {missingRequiredFields(m).map((f) => (
                      <li key={f.key}>
                        <button
                          type="button"
                          className="text-left underline-offset-2 hover:underline"
                          onClick={() => void focusIssue(m.moduleCode, f.key)}
                        >
                          {f.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!attentionModules.length ? (
                <p className="text-sm text-slate-500">No open issues.</p>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}
