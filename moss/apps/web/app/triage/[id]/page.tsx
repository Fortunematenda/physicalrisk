'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { isSclActiveTriageQuestionCode, SCL_ACTIVE_TRIAGE_QUESTION_CODES, deriveEgtAssurancePresentation } from '@moss/shared';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Crosshair,
  Factory,
  FileText,
  Mail,
  MapPin,
  Phone,
  User,
  type LucideIcon,
} from 'lucide-react';
import { RowActionsMenu } from '@/components/RowActionsMenu';
import { IconMoreVertical } from '@/components/NavIcons';
import { AuthGate } from '@/components/AuthGate';
import { Shell } from '@/components/Shell';
import { TriageNotesPanel, type TriageNoteItem } from '@/components/triage/TriageNotesPanel';
import { TriageCommercialPanel } from '@/components/triage/TriageCommercialPanel';
import { TriageCommunicationsPanel } from '@/components/triage/TriageCommunicationsPanel';
import { EgtAssuranceBandBadge } from '@/components/triage/EgtAssuranceBandBadge';
import { useConfirm } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/ui/metric-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { stripUnintendedLeadingDash } from '@/lib/scl-option-label';
import { apiFetch } from '@/lib/api';
import { uploadTriageProposal } from '@/lib/triage-proposal-upload';
import { cn } from '@/lib/utils';

const TAB_IDS = ['overview', 'scores', 'responses', 'commercial', 'communications', 'journey', 'notes'] as const;
type TabId = (typeof TAB_IDS)[number];
type CommunicationsAction = 'compose' | 'call' | 'log-call';

function parseTabId(value: string | null): TabId {
  if (value && TAB_IDS.includes(value as TabId)) return value as TabId;
  return 'overview';
}

const TOTAL_TRIAGE_QUESTIONS = SCL_ACTIVE_TRIAGE_QUESTION_CODES.length;

/**
 * Canonical questionnaire order. The active set skips Q7, Q14, Q16, Q18 and Q19 —
 * those codes are retired by design (see SCL_RETIRED_TRIAGE_QUESTION_CODES) and are
 * kept in the database for history only. A missing Q7 row here is not a data bug.
 */
const TRIAGE_QUESTION_ORDER = new Map<string, number>(
  SCL_ACTIVE_TRIAGE_QUESTION_CODES.map((code, index) => [code, index]),
);

function triageQuestionRank(code?: string | null) {
  const rank = TRIAGE_QUESTION_ORDER.get(String(code || ''));
  return rank == null ? Number.MAX_SAFE_INTEGER : rank;
}

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Date-only variant for the compact journey stepper captions. */
function fmtDate(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

/** Prospect-facing assurance presentation from stored exposure snapshot. */
function assurancePresentationFromAssessment(assessment: {
  overallRiskScore?: number | null;
  maturityScore?: number | null;
  categoryScores?: Array<{ category?: string; name?: string; score?: number }> | null;
} | null) {
  if (!assessment) return null;
  return deriveEgtAssurancePresentation({
    overallRiskScore: assessment.overallRiskScore,
    maturityScore: assessment.maturityScore,
    categoryScores: (assessment.categoryScores || []).map((c) => ({
      category: String(c.category || c.name || 'Category'),
      score: Number(c.score) || 0,
    })),
  });
}

function humanizeStatus(value?: string | null) {
  if (!value) return '—';
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'In progress',
    SUBMITTED: 'Submitted',
    COMPLETED: 'Completed',
    REVIEWED: 'Reviewed',
    CONTACTED: 'Contacted',
    CONVERTED: 'Converted',
    CLOSED: 'Closed',
    NOT_REQUESTED: 'Not requested',
    REQUESTED: 'Requested',
    IN_PREPARATION: 'Prepare proposal',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
    PROPOSAL_REQUESTED: 'Proposal requested',
    PROPOSAL_IN_PREPARATION: 'Prepare proposal',
    PROPOSAL_SENT: 'Proposal sent',
    PROPOSAL_ACCEPTED: 'Proposal accepted',
    PROPOSAL_DECLINED: 'Proposal declined',
    REPORT_GENERATED: 'Report generated',
    REPORT_ISSUED: 'Report issued',
    AWAITING_REVIEW: 'Awaiting review',
    APPROVED: 'Approved',
  };
  return map[value] || value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function proposalBadgeVariant(
  status: string,
): 'success' | 'warning' | 'info' | 'danger' | 'secondary' {
  if (['ACCEPTED', 'CONVERTED'].includes(status)) return 'success';
  if (['DECLINED', 'EXPIRED', 'CANCELLED'].includes(status)) return 'danger';
  if (['IN_PREPARATION', 'REQUESTED', 'SENT'].includes(status)) return 'warning';
  return 'secondary';
}

function normalizePrimaryCta(
  cta: { kind: string; label: string; engagementId?: string; disabled?: boolean } | null | undefined,
  activeProposal?: { documentStorageKey?: string | null } | null,
) {
  if (!cta || cta.kind === 'none') return null;
  // Header CTA wording is fixed for the Level 2 hand-off regardless of the API label.
  if (cta.kind === 'open_level2') return { ...cta, label: 'Open Level 2 Diagnostic' };
  if (cta.kind === 'open_proposal' || cta.kind === 'prepare_proposal' || cta.kind === 'upload_proposal') {
    if (activeProposal?.documentStorageKey) {
      return { kind: 'send_proposal', label: 'Send proposal' };
    }
    return { kind: 'complete_proposal', label: 'Continue preparation' };
  }
  // Legacy API: Mark sent becomes a real send action.
  if (cta.kind === 'mark_sent') {
    return { kind: 'send_proposal', label: 'Send proposal' };
  }
  // Legacy: complete_proposal with Send label → actual send when a PDF exists.
  if (
    cta.kind === 'complete_proposal'
    && /send proposal/i.test(cta.label)
    && activeProposal?.documentStorageKey
  ) {
    return { kind: 'send_proposal', label: 'Send proposal' };
  }
  return cta;
}

function CategoryBars({ items }: { items: Array<{ category: string; score: number }> }) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const score = Number(item.score);
        const widthPct = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
        return (
          <div
            className="grid grid-cols-[minmax(0,1fr)_minmax(80px,2fr)_48px] items-center gap-3"
            key={item.category}
          >
            <span className="truncate text-sm text-slate-600">{item.category}</span>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-moss-info" style={{ width: `${widthPct}%` }} />
            </div>
            <strong className="text-right text-sm tabular-nums">
              {Number.isFinite(score) ? score.toFixed(1) : '—'}
            </strong>
          </div>
        );
      })}
      {!items.length && <p className="text-sm text-muted-foreground">No category scores available.</p>}
    </div>
  );
}

/** Compact icon + label + value row used by the Overview "Key information" rail card. */
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium text-slate-800">{children}</div>
      </div>
    </div>
  );
}

function WorkflowStep({
  state,
  label,
}: {
  state: 'done' | 'current' | 'pending' | 'warning';
  label: string;
}) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {state === 'done' ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-moss-success" aria-hidden="true" />
      ) : state === 'current' ? (
        <span
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-moss-red bg-moss-red/15"
          aria-hidden="true"
        >
          <span className="size-1.5 rounded-full bg-moss-red" />
        </span>
      ) : state === 'warning' ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden="true" />
      )}
      <span
        className={cn(
          'text-sm',
          state === 'done' && 'text-slate-700',
          state === 'current' && 'font-medium text-slate-900',
          state === 'pending' && 'text-slate-500',
          state === 'warning' && 'text-amber-800',
        )}
      >
        {label}
      </span>
    </li>
  );
}

function JourneyStage({
  level,
  title,
  status,
  detail,
  tone,
}: {
  level: string;
  title: string;
  status: string;
  detail?: string | null;
  tone: 'success' | 'info' | 'warning' | 'neutral';
}) {
  const done = tone === 'success';
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        {done ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : tone === 'info' || tone === 'warning' ? (
          <span
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-moss-red bg-moss-red/10"
            aria-hidden="true"
          >
            <span className="size-1.5 rounded-full bg-moss-red" />
          </span>
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{level}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{title}</p>
          <span
            className={cn(
              'mt-1.5 inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold',
              done && 'bg-emerald-50 text-emerald-800',
              tone === 'info' && 'bg-violet-50 text-violet-800',
              tone === 'warning' && 'bg-amber-50 text-amber-900',
              tone === 'neutral' && 'bg-slate-100 text-slate-600',
            )}
          >
            {status}
          </span>
          {detail ? <p className="mt-1 text-[11px] text-slate-400">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function OrgAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'OR';
  return (
    <span
      className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-sky-100 text-base font-bold tracking-wide text-sky-700"
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function relativeActivity(value?: string | null) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmt(value);
}

function primaryEmailOnly(raw?: string | null) {
  if (!raw) return '';
  return raw.split(/[,;]+/).map((p) => p.trim()).filter(Boolean)[0] || raw.trim();
}

/** Single state-aware "next recommended action" shown on the Overview tab. */
type NextAction = {
  title: string;
  body: string;
  badge?: { label: string; variant: 'success' | 'warning' | 'info' | 'secondary' };
  href?: string;
  actionLabel?: string;
  onClickKind?: 'create_level2' | 'commercial' | 'communications' | 'assign';
};

function assuranceInterpretation(bandCode?: string | null, bandLabel?: string | null) {
  const map: Record<string, string> = {
    STRONG_ASSURANCE:
      'Strong assurance — governance foundations appear sound across the Level 1 dimensions, with limited material gaps indicated.',
    MODERATE_ASSURANCE:
      'Moderate assurance — governance foundations exist, but material verification gaps remain.',
    SIGNIFICANT_IMPROVEMENT_REQUIRED:
      'Improvement required — several governance dimensions indicate material gaps that warrant follow-up.',
    REQUIRES_PRIORITY_INTERVENTION:
      'Priority intervention — Level 1 indication suggests urgent follow-up on critical governance gaps.',
  };
  if (bandCode && map[bandCode]) return map[bandCode];
  if (bandLabel) return `${bandLabel} — review the dimension breakdown for follow-up priorities.`;
  return 'Complete the questionnaire to generate a Level 1 assurance indication.';
}

export default function TriageSubmissionDetailPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const urlTab = parseTabId(searchParams.get('tab'));
  const [tab, setTabState] = useState<TabId>(urlTab);
  const [item, setItem] = useState<any>(null);
  const itemRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);
  const [responseQuery, setResponseQuery] = useState('');
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [commercialOwners, setCommercialOwners] = useState<any[]>([]);
  const [leadMenuOpen, setLeadMenuOpen] = useState(false);
  const proposalFileRef = useRef<HTMLInputElement>(null);
  const analystFieldRef = useRef<HTMLDivElement>(null);

  const focusAnalystField = useCallback(() => {
    const el = analystFieldRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('rounded-lg', 'ring-2', 'ring-moss-red', 'ring-offset-2');
    window.setTimeout(() => {
      el.classList.remove('rounded-lg', 'ring-2', 'ring-moss-red', 'ring-offset-2');
    }, 2200);
  }, []);

  // Keep local tab in sync when URL changes externally (back/forward, deep links).
  useEffect(() => {
    setTabState(urlTab);
  }, [urlTab]);

  const commercialFocus = (() => {
    const focus = searchParams.get('focus');
    return focus === 'proposal' || focus === 'contact' ? focus : null;
  })();

  const commAction = (() => {
    const action = searchParams.get('action');
    if (action === 'compose' || action === 'call' || action === 'log-call') return action as CommunicationsAction;
    return null;
  })();

  const [unreadCommCount, setUnreadCommCount] = useState(0);

  const setTab = useCallback(
    (next: TabId, opts?: { focus?: 'proposal' | 'contact'; action?: CommunicationsAction | null }) => {
      // Update UI immediately — do not wait for the router round-trip.
      setTabState(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      if (opts?.focus) {
        params.set('focus', opts.focus);
      } else {
        params.delete('focus');
      }
      if (opts?.action) {
        params.set('action', opts.action);
      } else if (opts?.action === null) {
        params.delete('action');
      } else if (next !== 'communications') {
        params.delete('action');
      }
      const qs = params.toString();
      router.replace(qs ? `/triage/${id}?${qs}` : `/triage/${id}`, { scroll: false });
    },
    [id, router, searchParams],
  );

  const clearCommercialFocus = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('focus')) return;
    params.delete('focus');
    const qs = params.toString();
    router.replace(qs ? `/triage/${id}?${qs}` : `/triage/${id}`, { scroll: false });
  }, [id, router, searchParams]);

  const clearCommAction = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('action')) return;
    params.delete('action');
    const qs = params.toString();
    router.replace(qs ? `/triage/${id}?${qs}` : `/triage/${id}`, { scroll: false });
  }, [id, router, searchParams]);

  useEffect(() => {
    if (tab !== 'commercial' || !commercialFocus) return;
    const targetId =
      commercialFocus === 'proposal' ? 'triage-proposal-section' : 'triage-contact-section';
    const scrollToTarget = () => {
      const el = document.getElementById(targetId);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-xl');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'rounded-xl');
      }, 2500);
      return true;
    };
    const timer = window.setTimeout(() => {
      if (scrollToTarget()) {
        clearCommercialFocus();
        return;
      }
      window.setTimeout(() => {
        scrollToTarget();
        clearCommercialFocus();
      }, 350);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [tab, commercialFocus, clearCommercialFocus]);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    // Soft refresh keeps the current page mounted (preserves open modals / tab state).
    const soft = Boolean(opts?.soft) || Boolean(itemRef.current);
    const hadItem = soft;
    try {
      const data = await apiFetch<any>(`/triage/submissions/${id}`);
      setItem(data);
      itemRef.current = data;
      // Reports link with assessment id; canonical URL uses the lead/submission id.
      if (data?.id && data.id !== id) {
        const qs =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).toString()
            : '';
        router.replace(qs ? `/triage/${data.id}?${qs}` : `/triage/${data.id}`, { scroll: false });
      }
    } catch (e) {
      toast({
        id: 'triage-load-error',
        variant: 'error',
        title: 'Unable to load',
        description: e instanceof Error ? e.message : 'Unable to load submission.',
      });
      if (!hadItem) {
        setItem(null);
        itemRef.current = null;
      }
    }
  }, [id, router, toast]);

  // Only refetch when the submission id changes. Do not depend on `router`/`load`
  // identity — Next.js router identity can change on searchParams updates and was
  // remounting this page (closing the Prepare Proposal modal).
  useEffect(() => {
    if (!id) return;
    const keepMounted = Boolean(itemRef.current) && String(itemRef.current.id) === id;
    // Never blank the page (and close open modals) when we already have this submission.
    if (!keepMounted) {
      itemRef.current = null;
      setItem(null);
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<any>(`/triage/submissions/${id}`);
        if (cancelled) return;
        setItem(data);
        itemRef.current = data;
        if (data?.id && data.id !== id) {
          const qs =
            typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).toString()
              : '';
          router.replace(qs ? `/triage/${data.id}?${qs}` : `/triage/${data.id}`, { scroll: false });
        }
      } catch (e) {
        if (cancelled) return;
        toast({
          id: 'triage-load-error',
          variant: 'error',
          title: 'Unable to load',
          description: e instanceof Error ? e.message : 'Unable to load submission.',
        });
        if (!keepMounted) {
          setItem(null);
          itemRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id only; router used for redirect
  }, [id]);

  useEffect(() => {
    apiFetch<any[]>('/admin/users/analysts').then(setAnalysts).catch(() => []);
    apiFetch<any[]>('/triage/commercial-owners').then(setCommercialOwners).catch(() => []);
  }, []);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ unreadCount: number }>(`/triage/submissions/${id}/communications/summary`, {
      skipAuthRedirect: true,
    })
      .then((summary) => setUnreadCommCount(summary.unreadCount || 0))
      .catch(() => setUnreadCommCount(0));
  }, [id, tab]);

  async function run(fn: () => Promise<void>, success?: { title: string; description: string }) {
    setBusy(true);
    try {
      await fn();
      await load({ soft: true });
      if (success) {
        toast({
          id: `triage-${success.title}`,
          variant: 'success',
          title: success.title,
          description: success.description,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to update submission.';
      toast({
        id: 'triage-error',
        variant: 'error',
        title: 'Update failed',
        description: message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function patch(payload: Record<string, unknown>, success?: { title: string; description: string }) {
    await run(async () => {
      await apiFetch(`/triage/submissions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    }, success);
  }

  async function assignAnalyst(analystId: string) {
    await run(
      async () => {
        await apiFetch(`/triage/submissions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ assignedAnalystId: analystId || '' }),
        });
        setLeadMenuOpen(false);
      },
      analystId
        ? {
            title: 'Consultant updated',
            description: `${
              analysts.find((a) => a.id === analystId)
                ? `${analysts.find((a) => a.id === analystId).firstName} ${analysts.find((a) => a.id === analystId).lastName}`.trim()
                : 'Analyst'
            } is now assigned.`,
          }
        : { title: 'Analyst unassigned', description: 'No primary analyst is assigned to this triage.' },
    );
  }

  async function handleProposalUpload(file: File) {
    if (!item) return;
    setBusy(true);
    try {
      await uploadTriageProposal(
        id,
        file,
        `${item.organisationName} — Executive Advisory Diagnostic`,
      );
      await load({ soft: true });
      toast({
        title: 'Proposal uploaded',
        description: `${file.name} was uploaded successfully.`,
      });
    } catch (e) {
      toast({
        variant: 'error',
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function convert(force = false) {
    if (!item) return;
    if (item.convertedEngagement?.id || item.convertedAt) {
      window.location.href = `/advisory/${item.convertedEngagement?.id || item.convertedAssessmentId}`;
      return;
    }
    const ok = await confirm({
      title: 'Create Level 2 Diagnostic',
      description: force
        ? `Override commercial gate and create the paid Executive Advisory Diagnostic for “${item.organisationName}”?`
        : `Create the paid Executive Advisory Diagnostic for “${item.organisationName}”?`,
      confirmLabel: 'Create diagnostic',
      variant: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ engagement: { id: string } }>(`/triage/submissions/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify(force ? { force: true } : {}),
      });
      if (data?.engagement?.id) window.location.href = `/advisory/${data.engagement.id}`;
      else await load({ soft: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to create the Executive Advisory Diagnostic.';
      toast({ variant: 'error', title: 'Conversion failed', description: message });
    } finally {
      setBusy(false);
    }
  }

  function goToProposalSection(opts?: { offerUpload?: boolean }) {
    setTab('commercial', { focus: 'proposal' });
    if (opts?.offerUpload) {
      window.setTimeout(() => proposalFileRef.current?.click(), 450);
    }
  }

  async function handlePrimaryCta() {
    const cta = normalizePrimaryCta(item?.primaryCta, item?.activeProposal);
    if (!cta) return;
    switch (cta.kind) {
      case 'mark_reviewed':
        await patch({ status: 'REVIEWED' }, { title: 'Reviewed', description: 'Lead marked as reviewed.' });
        break;
      case 'contact_client':
        setTab('commercial', { focus: 'contact' });
        break;
      case 'upload_proposal':
      case 'complete_proposal':
        setTab('commercial', { focus: 'proposal' });
        break;
      case 'send_proposal':
      case 'mark_sent':
        await run(
          async () => {
            await apiFetch(`/triage/submissions/${id}/proposal-send`, {
              method: 'POST',
              body: JSON.stringify({}),
            });
          },
          {
            title: 'Proposal sent successfully',
            description: 'The client has been emailed and the proposal status is Sent.',
          },
        );
        break;
      case 'create_level2':
        await convert(false);
        break;
      case 'open_level2':
        if (cta.engagementId) window.location.href = `/advisory/${cta.engagementId}`;
        break;
      default:
        break;
    }
  }

  const assessment = item?.assessment;
  const assurancePresentation = assurancePresentationFromAssessment(assessment);
  const score = assurancePresentation?.assuranceScore ?? null;
  const band = assurancePresentation?.assuranceBand.displayLabel || null;
  const categories = assurancePresentation?.categoryScores.map((c) => ({
    category: c.category,
    score: c.assuranceScore,
  })) || [];
  const proposalStatus = String(item?.proposalStatus || 'NOT_REQUESTED');
  const hasCommercial =
    Boolean(item) && (proposalStatus !== 'NOT_REQUESTED' || Boolean(item?.diagnosticRequestedAt));

  const responseRows = useMemo(() => {
    return (item?.responses || [])
      .filter((row: any) => isSclActiveTriageQuestionCode(row.question?.code))
      .sort((a: any, b: any) => triageQuestionRank(a.question?.code) - triageQuestionRank(b.question?.code));
  }, [item]);

  const filteredResponses = useMemo(() => {
    const q = responseQuery.trim().toLowerCase();
    if (!q) return responseRows;
    return responseRows.filter((row: any) =>
      [row.question?.code, row.question?.text, row.responseOption?.label]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [responseRows, responseQuery]);

  const answeredQuestions = item?.completedAt
    ? TOTAL_TRIAGE_QUESTIONS
    : responseRows.filter((row: any) => row.responseOption?.label).length;
  const progress = TOTAL_TRIAGE_QUESTIONS
    ? Math.round((answeredQuestions / TOTAL_TRIAGE_QUESTIONS) * 100)
    : 0;

  const analystName = item?.assignedAnalyst
    ? `${item.assignedAnalyst.firstName || ''} ${item.assignedAnalyst.lastName || ''}`.trim() ||
      item.assignedAnalyst.email
    : null;

  const level1Complete = Boolean(item?.completedAt);
  const isConverted = Boolean(item?.convertedAt || item?.convertedEngagement?.id);

  const l2Status = (() => {
    if (isConverted && item?.convertedEngagement) {
      return { label: 'Converted to Level 2', tone: 'success' as const };
    }
    if (proposalStatus === 'SENT') return { label: 'Proposal sent', tone: 'info' as const };
    if (proposalStatus === 'ACCEPTED') return { label: 'Proposal accepted', tone: 'success' as const };
    if (proposalStatus === 'DECLINED') return { label: 'Proposal declined', tone: 'neutral' as const };
    if (proposalStatus === 'IN_PREPARATION' || proposalStatus === 'REQUESTED') {
      return { label: 'Prepare proposal', tone: 'warning' as const };
    }
    if (item?.diagnosticRequestedAt) return { label: 'Prepare proposal', tone: 'warning' as const };
    return { label: 'Not started', tone: 'neutral' as const };
  })();

  const l3Status = (() => {
    if (!isConverted) return { label: 'Not started', tone: 'neutral' as const };
    const st = String(item?.convertedEngagement?.status || '');
    if (['REPORT_ISSUED', 'SUBMITTED'].includes(st)) {
      return { label: 'Recommended', tone: 'info' as const };
    }
    return { label: 'Not started', tone: 'neutral' as const };
  })();

  const recommendedAction: NextAction | null = (() => {
    if (!item) return null;

    if (item.closedAt && !isConverted) {
      return {
        title: 'Lead closed',
        body: 'This triage lead is closed. Use Reopen lead in the ⋮ menu if you want to continue.',
        badge: { label: 'Closed', variant: 'secondary' as const },
      } satisfies NextAction;
    }

    const engagementId = item.convertedEngagement?.id as string | undefined;
    const engagementStatus = String(item.convertedEngagement?.status || '').toUpperCase();

    if (isConverted && engagementId) {
      if (!analystName) {
        return {
          title: 'Assign a consultant',
          body: 'Level 2 has been created. Assign an analyst before continuing the diagnostic.',
          badge: { label: 'Assign consultant', variant: 'warning' as const },
          onClickKind: 'assign',
          actionLabel: 'Assign analyst',
        } satisfies NextAction;
      }
      if (['SUBMITTED', 'AWAITING_REVIEW'].includes(engagementStatus)) {
        return {
          title: 'Review Executive Advisory Diagnostic',
          body: 'Level 2 diagnostic submitted and ready for analyst review.',
          badge: { label: 'Submitted', variant: 'success' as const },
          href: `/advisory/${engagementId}`,
          actionLabel: 'View Level 2 Diagnostic',
        } satisfies NextAction;
      }
      if (['UNDER_REVIEW', 'IN_REVIEW', 'REVIEW'].includes(engagementStatus)) {
        return {
          title: 'Complete analyst review',
          body: 'Finish the analyst review of the Level 2 diagnostic.',
          badge: { label: humanizeStatus(engagementStatus), variant: 'warning' as const },
          href: `/advisory/${engagementId}`,
          actionLabel: 'Review Level 2 Diagnostic',
        } satisfies NextAction;
      }
      if (['COMPLETED', 'APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED', 'CLOSED'].includes(engagementStatus)) {
        return {
          title: 'Determine Level 3 assurance pathway',
          body: 'Level 2 is complete. Review outcomes and decide the Level 3 assurance route.',
          badge: { label: humanizeStatus(engagementStatus), variant: 'success' as const },
          href: `/advisory/${engagementId}`,
          actionLabel: 'View Level 2 Diagnostic',
        } satisfies NextAction;
      }
      return {
        title: 'Continue Executive Advisory Diagnostic',
        body: `${analystName} is assigned. Continue the Level 2 diagnostic.`,
        badge: { label: l2Status.label, variant: l2Status.tone === 'neutral' ? 'secondary' : l2Status.tone },
        href: `/advisory/${engagementId}`,
        actionLabel: 'View Level 2 Diagnostic',
      } satisfies NextAction;
    }

    if (proposalStatus === 'ACCEPTED' && !isConverted && !item.closedAt) {
      return {
        title: 'Create Executive Advisory Diagnostic',
        body: 'Proposal accepted. Create the Level 2 diagnostic to continue the client journey.',
        badge: { label: 'Ready for Level 2', variant: 'success' as const },
        onClickKind: 'create_level2',
        actionLabel: 'Create Level 2 Diagnostic',
      } satisfies NextAction;
    }

    if (['SENT', 'IN_PREPARATION', 'REQUESTED'].includes(proposalStatus) && !isConverted) {
      return {
        title:
          proposalStatus === 'SENT'
            ? 'Await client decision'
            : proposalStatus === 'IN_PREPARATION'
              ? 'Prepare commercial proposal'
              : 'Respond to proposal request',
        body:
          proposalStatus === 'SENT'
            ? 'Proposal has been sent. Follow up if the client has not responded.'
            : 'Continue commercial preparation from the Commercial tab.',
        badge: { label: humanizeStatus(proposalStatus), variant: 'warning' as const },
        onClickKind: 'commercial',
        actionLabel: 'View commercial record',
      } satisfies NextAction;
    }

    if (level1Complete && !item.contactedAt && !item.closedAt) {
      return {
        title: 'Initial outreach',
        body: 'Confirm contact with the organisation before Level 2 preparation.',
        badge: { label: 'Contact pending', variant: 'warning' as const },
        onClickKind: 'communications',
        actionLabel: 'Open communications',
      } satisfies NextAction;
    }

    if (level1Complete && !item.reviewedAt && !item.closedAt) {
      return {
        title: 'Review triage indication',
        body: 'Confirm the Level 1 indication has been reviewed before Level 2 preparation.',
        badge: { label: 'Review pending', variant: 'warning' as const },
      } satisfies NextAction;
    }

    if (level1Complete && !isConverted && !item.closedAt) {
      return {
        title: 'Start commercial progression',
        body: 'Level 1 is complete. Open the Commercial tab to prepare or request a proposal.',
        badge: { label: 'Ready for Level 2', variant: 'success' as const },
        onClickKind: 'commercial',
        actionLabel: 'View commercial record',
      } satisfies NextAction;
    }

    if (!level1Complete) {
      return {
        title: 'Awaiting questionnaire completion',
        body: 'Level 1 triage is still in progress.',
        badge: { label: 'In progress', variant: 'warning' as const },
      } satisfies NextAction;
    }

    return null;
  })();

  const workflowSteps: Array<{ state: 'done' | 'current' | 'pending' | 'warning'; label: string }> =
    useMemo(() => {
      if (item?.commercialWorkflow?.length) return item.commercialWorkflow;
      if (!item) return [];
      const proposalRequested = proposalStatus !== 'NOT_REQUESTED';
      const hasDoc = Boolean(item.activeProposal?.documentStorageKey);
      const sent = ['SENT', 'ACCEPTED', 'DECLINED'].includes(proposalStatus);
      const accepted = proposalStatus === 'ACCEPTED' || Boolean(item.convertedAt);
      return [
        { state: item.completedAt ? 'done' : 'pending', label: 'Questionnaire completed' },
        { state: score != null ? 'done' : 'pending', label: 'Indication scored' },
        {
          state: item.contactedAt || proposalRequested ? 'done' : 'pending',
          label: 'Client contacted',
        },
        { state: proposalRequested ? 'done' : 'pending', label: 'Proposal requested' },
        {
          state: hasDoc || sent ? 'done' : proposalRequested ? 'current' : 'pending',
          label: 'Proposal preparation',
        },
        { state: sent || accepted ? 'done' : 'pending', label: 'Proposal sent' },
        { state: accepted ? 'done' : 'pending', label: 'Proposal accepted' },
        { state: item.convertedAt ? 'done' : 'pending', label: 'Level 2 created' },
      ] as Array<{ state: 'done' | 'current' | 'pending' | 'warning'; label: string }>;
    }, [item, score, proposalStatus]);

  // Keep the workspace mounted whenever we already have data — a loading flag alone
  // must not remount Commercial / open proposal dialogs.
  if (!item) {
    return (
      <AuthGate>
        <Shell
          title="Triage submission"
          hideSearch
          hideTitle
          headerLeading={(
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
              <Link
                href="/triage"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Back to triage submissions"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/triage" className="font-medium text-slate-500 transition-colors hover:text-slate-800">
                Executive Triage
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
              <Link href="/triage" className="font-medium text-slate-500 transition-colors hover:text-slate-800">
                Triage submissions
              </Link>
              <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
              <span className="truncate font-semibold text-slate-900">…</span>
            </nav>
          )}
        >
          <div className="triage-detail-workspace space-y-4 pb-8">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <Skeleton className="h-8 w-72 max-w-full" />
                <Skeleton className="h-4 w-56" />
                <div className="flex justify-between gap-3 pt-2">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-9 w-56" />
                </div>
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Skeleton className="mb-4 h-5 w-40" />
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>
            </div>
        </Shell>
      </AuthGate>
    );
  }

  const commercialNeedsAction =
    ['REQUESTED', 'IN_PREPARATION', 'SENT'].includes(proposalStatus) && !item.convertedAt && !item.closedAt;

  const displayCta = normalizePrimaryCta(item.primaryCta, item.activeProposal);
  const contactName = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
  const jobTitle = item.qualification?.jobTitle || '';
  const country = item.qualification?.country || '';
  const primaryEmail = primaryEmailOnly(item.email);
  const phone = String(item.phone || '').trim();
  const headerMeta = [assessment?.reference, item.industry].filter(Boolean).join(' | ');
  const lastActivityAt = item.updatedAt || item.lastProgressAt || item.createdAt;

  const l1Detail = item.completedAt ? fmtDate(item.completedAt) : null;
  // Keep proposal reference alone — do not append status under PRP-… numbers.
  const l2Detail = item.convertedEngagement
    ? [item.convertedEngagement.reference, item.convertedAt ? fmtDate(item.convertedAt) : null]
        .filter(Boolean)
        .join(' · ')
    : item.proposalReference
      || (item.diagnosticRequestedAt ? `Requested ${fmtDate(item.diagnosticRequestedAt)}` : null);
  // Level 3 is recommended off the back of Level 2, but is not yet an active workstream.
  const l3StatusLabel = l3Status.label === 'Recommended' ? 'Recommended · Not started' : l3Status.label;

  /** One-line commercial progression summary for the Overview card. */
  const commercialProgressLine = (() => {
    if (isConverted) return 'Proposal accepted → Level 2 created';
    if (proposalStatus === 'ACCEPTED') return 'Proposal accepted → Level 2 pending';
    if (proposalStatus === 'SENT') return 'Proposal sent → awaiting client decision';
    if (proposalStatus === 'IN_PREPARATION') return 'Proposal requested → in preparation';
    if (proposalStatus === 'REQUESTED') return 'Proposal requested';
    return item.diagnosticRequestedAt ? 'Diagnostic requested' : null;
  })();

  /** Wire the Next-action card's secondary link to the right destination. */
  function runNextAction(kind: 'create_level2' | 'commercial' | 'communications' | 'assign') {
    switch (kind) {
      case 'create_level2':
        void convert(false);
        break;
      case 'commercial':
        setTab('commercial');
        break;
      case 'communications':
        setTab('communications');
        break;
      case 'assign':
        focusAnalystField();
        break;
      default:
        break;
    }
  }

  /** The rail is contextual — each tab gets the summary that matters for that tab. */
  const sidebarContent = (() => {
    if (tab === 'overview') {
      return (
        <>
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Key information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              <InfoRow icon={Building2} label="Organisation">
                {item.organisationName}
              </InfoRow>
              <InfoRow icon={User} label="Contact">
                {contactName || '—'}
                {jobTitle ? (
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{jobTitle}</span>
                ) : null}
              </InfoRow>
              <InfoRow icon={Mail} label="Email">
                {primaryEmail ? (
                  <a
                    href={`mailto:${primaryEmail}`}
                    className="break-all text-moss-info transition-colors hover:underline"
                  >
                    {primaryEmail}
                  </a>
                ) : (
                  '—'
                )}
              </InfoRow>
              <InfoRow icon={Phone} label="Phone">
                {phone ? (
                  <a href={`tel:${phone}`} className="text-moss-info transition-colors hover:underline">
                    {phone}
                  </a>
                ) : (
                  '—'
                )}
              </InfoRow>
              <InfoRow icon={Factory} label="Industry">
                {item.industry || '—'}
              </InfoRow>
              <InfoRow icon={MapPin} label="Region">
                {country || '—'}
              </InfoRow>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Journey progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ol className="m-0 list-none space-y-0 p-0">
                {workflowSteps.map((step) => (
                  <WorkflowStep key={step.label} state={step.state} label={step.label} />
                ))}
              </ol>
              <button
                type="button"
                className="text-sm font-semibold text-moss-info transition-colors hover:underline"
                onClick={() => setTab('journey')}
              >
                View full audit trail →
              </button>
            </CardContent>
          </Card>
        </>
      );
    }

    if (tab === 'scores') {
      return (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Indication summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="m-0 text-2xl font-bold tracking-tight text-slate-900">
              {score != null ? `${score} / 100` : '—'}
            </p>
            {band ? (
              <EgtAssuranceBandBadge label={band} visual={assurancePresentation?.visual} />
            ) : null}
            <p className="m-0 text-xs leading-relaxed text-slate-600">
              {assuranceInterpretation(assurancePresentation?.assuranceBand.code, band)}
            </p>
          </CardContent>
        </Card>
      );
    }

    if (tab === 'responses') {
      return (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Questionnaire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="m-0 text-2xl font-bold tracking-tight text-slate-900">
              {answeredQuestions} / {TOTAL_TRIAGE_QUESTIONS}
            </p>
            <p className="m-0 text-xs text-slate-500">
              Questions answered{item.completedAt ? ` · completed ${fmtDate(item.completedAt)}` : ''}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-moss-success"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          </CardContent>
        </Card>
      );
    }

    if (tab === 'commercial') {
      return (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Proposal status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge
              variant={proposalBadgeVariant(isConverted ? 'CONVERTED' : proposalStatus)}
              className="whitespace-nowrap"
            >
              {isConverted ? 'Converted' : humanizeStatus(proposalStatus)}
            </Badge>
            <p className="m-0 text-sm font-medium text-slate-900">
              {item.proposalReference || 'No proposal reference yet'}
            </p>
            <p className="m-0 text-xs text-slate-500">
              Requested {fmt(item.proposalRequestedAt || item.diagnosticRequestedAt)}
            </p>
          </CardContent>
        </Card>
      );
    }

    if (tab === 'communications') {
      return (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="m-0 text-2xl font-bold tracking-tight text-slate-900">{unreadCommCount}</p>
            <p className="m-0 text-xs text-slate-500">
              {unreadCommCount === 1 ? 'Unread client reply' : 'Unread client replies'}
            </p>
            <p className="m-0 text-xs text-slate-500">Last activity {relativeActivity(lastActivityAt)}</p>
          </CardContent>
        </Card>
      );
    }

    if (tab === 'notes') {
      return (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Internal only</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-xs leading-relaxed text-slate-600">
              Notes are private to Physical Risk staff and are never shown to the client. Every add, edit and
              delete is recorded in the audit trail.
            </p>
          </CardContent>
        </Card>
      );
    }

    return null;
  })();

  return (
    <AuthGate>
      <Shell
        title={`Triage · ${assessment?.reference || item.organisationName}`}
        hideSearch
        hideTitle
        headerLeading={(
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
            <Link
              href="/triage"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Back to triage submissions"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/triage" className="font-medium text-slate-500 transition-colors hover:text-slate-800">
              Executive Triage
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
            <Link href="/triage" className="font-medium text-slate-500 transition-colors hover:text-slate-800">
              Triage submissions
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
            <span className="truncate font-semibold text-slate-900">{assessment?.reference || '—'}</span>
          </nav>
        )}
      >
        <input
          ref={proposalFileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleProposalUpload(file);
            e.target.value = '';
          }}
        />
        <div className="triage-detail-workspace space-y-4 pb-8">
          {/* Information card */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <OrgAvatar name={item.organisationName} />
                  <div className="min-w-0 space-y-2">
                    <h1 className="m-0 text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                      {item.organisationName}
                    </h1>
                    {headerMeta ? <p className="m-0 text-sm text-slate-500">{headerMeta}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      {contactName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <User className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          {contactName}
                        </span>
                      ) : null}
                      {jobTitle ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Briefcase className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          {jobTitle}
                        </span>
                      ) : null}
                      {country ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          {country}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {level1Complete ? (
                        <Badge variant="success" className="shrink-0 gap-1 whitespace-nowrap">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          Level 1 complete
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="shrink-0 whitespace-nowrap">
                          Level 1 in progress
                        </Badge>
                      )}
                      {score != null ? (
                        <EgtAssuranceBandBadge
                          label={band ? `${score} / 100 · ${band}` : `${score} / 100`}
                          visual={assurancePresentation?.visual}
                          className="shrink-0"
                        />
                      ) : null}
                      {isConverted ? (
                        <Badge variant="success" className="shrink-0 gap-1 whitespace-nowrap">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          Converted to Level 2
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex w-full shrink-0 flex-wrap items-end justify-start gap-2 sm:w-auto sm:justify-end">
                  <div ref={analystFieldRef} className="min-w-[200px] flex-1 sm:flex-none">
                    <p className="mb-1 text-xs font-medium text-slate-500">Assigned analyst</p>
                    <FilterSelect
                      value={item.assignedAnalystId || ''}
                      onChange={(v) => void assignAnalyst(v)}
                      disabled={busy || !analysts.length}
                      placeholder="Not assigned"
                      includeAll
                      emptyValue=""
                      aria-label="Assigned analyst"
                      triggerClassName="h-10 w-full min-w-[200px]"
                      options={analysts.map((a) => ({
                        value: a.id,
                        label: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || a.id,
                      }))}
                    />
                  </div>

                  {displayCta?.kind === 'awaiting_decision' || displayCta?.kind === 'closed' ? (
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap px-3 py-1.5 text-sm">
                      {displayCta.label}
                    </Badge>
                  ) : displayCta && displayCta.kind !== 'upload_proposal' ? (
                    displayCta.kind === 'open_level2' && displayCta.engagementId ? (
                      <Button asChild className="h-10 shrink-0 whitespace-nowrap px-4">
                        <Link href={`/advisory/${displayCta.engagementId}`}>{displayCta.label}</Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="h-10 shrink-0 whitespace-nowrap px-4"
                        disabled={busy}
                        onClick={() => void handlePrimaryCta()}
                      >
                        {displayCta.label}
                      </Button>
                    )
                  ) : null}

                  <RowActionsMenu
                    open={leadMenuOpen}
                    onClose={() => setLeadMenuOpen(false)}
                    align="end"
                    trigger={
                      <button
                        type="button"
                        className="org2-menu-btn shrink-0"
                        aria-label="Lead actions"
                        disabled={busy}
                        onClick={() => setLeadMenuOpen((open) => !open)}
                      >
                        <IconMoreVertical />
                      </button>
                    }
                  >
                    <button
                      type="button"
                      disabled={busy || !primaryEmail}
                      title={primaryEmail ? 'Email client' : 'No email address on this submission'}
                      onClick={() => {
                        setLeadMenuOpen(false);
                        setTab('communications', { action: 'compose' });
                      }}
                    >
                      Send email
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setLeadMenuOpen(false);
                        setTab('communications');
                      }}
                    >
                      View communications
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setLeadMenuOpen(false);
                        setTab('notes');
                      }}
                    >
                      Add note
                    </button>
                    <button
                      type="button"
                      disabled={busy || !item.organisationId}
                      title={item.organisationId ? 'Open organisation record' : 'No organisation record linked yet'}
                      onClick={() => {
                        setLeadMenuOpen(false);
                        if (item.organisationId) router.push(`/organisations/${item.organisationId}`);
                      }}
                    >
                      View organisation
                    </button>
                    {!item.closedAt && !item.convertedAt ? (
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          setLeadMenuOpen(false);
                          void patch(
                            { status: 'CLOSED' },
                            { title: 'Lead closed', description: 'This triage lead was closed.' },
                          );
                        }}
                      >
                        Close lead
                      </button>
                    ) : null}
                    {item.closedAt && !item.convertedAt ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setLeadMenuOpen(false);
                          void patch(
                            { status: 'REVIEWED' },
                            {
                              title: 'Lead reopened',
                              description: 'This triage lead is open again.',
                            },
                          );
                        }}
                      >
                        Reopen lead
                      </button>
                    ) : null}
                  </RowActionsMenu>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs directly below information card */}
          <div className={cn('grid gap-4', sidebarContent && 'lg:grid-cols-[minmax(0,1fr)_280px]')}>
            <div className="min-w-0">
              <Tabs value={tab} onValueChange={(v) => setTab(parseTabId(v))}>
                <TabsList className="triage-detail-tabs">
                  <TabsTrigger value="overview" className="triage-detail-tab">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="scores" className="triage-detail-tab">
                    Scores &amp; indication
                  </TabsTrigger>
                  <TabsTrigger value="responses" className="triage-detail-tab">
                    Responses
                    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5">
                      {responseRows.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="commercial" className="triage-detail-tab">
                    Commercial
                    {commercialNeedsAction ? (
                      <span
                        className="triage-detail-tab-dot triage-detail-tab-dot--attention"
                        title="Needs attention"
                        role="img"
                        aria-label="Needs attention"
                      />
                    ) : proposalStatus !== 'NOT_REQUESTED' ? (
                      <span
                        className="triage-detail-tab-dot triage-detail-tab-dot--active"
                        title="Commercial record active"
                        role="img"
                        aria-label="Commercial record active"
                      />
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="communications" className="triage-detail-tab">
                    Communications
                    {unreadCommCount > 0 ? (
                      <Badge variant="warning" className="h-5 min-w-5 justify-center px-1.5">
                        {unreadCommCount}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="journey" className="triage-detail-tab">
                    Journey &amp; audit
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="triage-detail-tab">
                    Notes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Client journey */}
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
                      <CardTitle className="text-base">Client journey</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 px-4 pb-4 pt-0 sm:flex-row sm:items-stretch sm:gap-3 sm:px-5 sm:pb-5">
                      <JourneyStage
                        level="Level 1"
                        title="Executive Triage"
                        status={level1Complete ? 'Completed' : 'In progress'}
                        detail={l1Detail}
                        tone={level1Complete ? 'success' : 'warning'}
                      />
                      <div className="hidden items-center sm:flex" aria-hidden="true">
                        <ArrowRight className="size-4 text-slate-300" />
                      </div>
                      <JourneyStage
                        level="Level 2"
                        title="Executive Advisory Diagnostic"
                        status={l2Status.label}
                        detail={l2Detail}
                        tone={l2Status.tone}
                      />
                      <div className="hidden items-center sm:flex" aria-hidden="true">
                        <ArrowRight className="size-4 text-slate-300" />
                      </div>
                      <JourneyStage
                        level="Level 3"
                        title="Assurance"
                        status={l3StatusLabel}
                        tone={l3Status.tone}
                      />
                    </CardContent>
                  </Card>

                  {recommendedAction ? (
                    <Card className="rounded-xl border-rose-200 bg-rose-50/60 shadow-sm">
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-moss-red"
                          aria-hidden="true"
                        >
                          <Crosshair className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-moss-red">
                            Next recommended action
                          </p>
                          <p className="m-0 text-sm font-semibold text-slate-900">{recommendedAction.title}</p>
                          <p className="m-0 text-sm text-slate-600">{recommendedAction.body}</p>
                        </div>
                        {/* Secondary outline action — the single primary CTA lives in the header. */}
                        {recommendedAction.actionLabel && recommendedAction.href ? (
                          <Button
                            asChild
                            variant="outline"
                            className="h-10 shrink-0 whitespace-nowrap border-rose-200 bg-white px-4 font-semibold text-slate-800 hover:bg-white hover:text-moss-red"
                          >
                            <Link href={recommendedAction.href}>{recommendedAction.actionLabel}</Link>
                          </Button>
                        ) : recommendedAction.actionLabel && recommendedAction.onClickKind ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 shrink-0 whitespace-nowrap border-rose-200 bg-white px-4 font-semibold text-slate-800 hover:bg-white hover:text-moss-red"
                            disabled={busy}
                            onClick={() => {
                              if (recommendedAction.onClickKind) runNextAction(recommendedAction.onClickKind);
                            }}
                          >
                            {recommendedAction.actionLabel}
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}

                  {hasCommercial ? (
                    <Card className="rounded-xl border-sky-200 bg-sky-50/40 shadow-sm">
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"
                          aria-hidden="true"
                        >
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="m-0 text-sm font-semibold text-slate-900">Commercial progression</p>
                            <Badge
                              variant={proposalBadgeVariant(isConverted ? 'CONVERTED' : proposalStatus)}
                              className="shrink-0 whitespace-nowrap"
                            >
                              {isConverted ? 'Converted' : humanizeStatus(proposalStatus)}
                            </Badge>
                            {item.proposalReference ? (
                              <span className="text-xs font-semibold text-slate-500">
                                {item.proposalReference}
                              </span>
                            ) : null}
                          </div>
                          <p className="m-0 text-sm text-slate-700">Executive Advisory Diagnostic</p>
                          {commercialProgressLine ? (
                            <p className="m-0 text-sm text-slate-600">{commercialProgressLine}</p>
                          ) : null}
                          <p className="m-0 text-xs text-slate-500">
                            Requested {fmt(item.proposalRequestedAt || item.diagnosticRequestedAt)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 shrink-0 whitespace-nowrap border-sky-200 bg-white px-4 font-semibold text-slate-800 hover:bg-white hover:text-sky-700"
                          onClick={() => setTab('commercial')}
                        >
                          View commercial record
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}
                </TabsContent>

                <TabsContent value="scores" className="mt-0 space-y-4">
                  {score == null && !categories.length ? (
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Indication not available</CardTitle>
                        <CardDescription>
                          Scores appear after the complimentary questionnaire is completed and evaluated.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ) : (
                    <>
                      <Card
                        className="egt-assurance-score-card rounded-xl border-slate-200 shadow-sm"
                        style={
                          assurancePresentation?.visual
                            ? { borderLeftColor: assurancePresentation.visual.colourHex }
                            : undefined
                        }
                      >
                        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Assurance score
                            </p>
                            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                              {score != null ? `${score} / 100` : '—'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              Based on {responseRows.length} questionnaire response
                              {responseRows.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          {band ? (
                            <EgtAssuranceBandBadge
                              label={band}
                              visual={assurancePresentation?.visual}
                              className="egt-assurance-band--lg"
                            />
                          ) : null}
                        </CardContent>
                      </Card>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <MetricCard
                          label="Governance"
                          value={
                            assessment?.maturityScore != null
                              ? `${Number(assessment.maturityScore).toFixed(1)} / 100`
                              : '—'
                          }
                          hint="Maturity index"
                        />
                        <MetricCard
                          label="Confidence"
                          value={
                            assessment?.methodologyConfidence != null
                              ? `${(Number(assessment.methodologyConfidence) * 100).toFixed(0)}%`
                              : '—'
                          }
                          hint="Methodology confidence"
                        />
                        <MetricCard
                          label="Opportunity"
                          value={
                            assessment?.opportunityScore != null
                              ? `${Number(assessment.opportunityScore).toFixed(1)} / 100`
                              : '—'
                          }
                          hint="Follow-up potential"
                        />
                      </div>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                          <CardTitle className="text-base">Interpretation</CardTitle>
                          {band ? (
                            <EgtAssuranceBandBadge
                              label={band}
                              visual={assurancePresentation?.visual}
                              className="shrink-0"
                            />
                          ) : null}
                        </CardHeader>
                        <CardContent>
                          <p className="m-0 text-sm leading-relaxed text-slate-700">
                            {assuranceInterpretation(assurancePresentation?.assuranceBand.code, band)}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-base">Assurance dimensions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <CategoryBars items={categories} />
                        </CardContent>
                      </Card>
                      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <p className="m-0 text-xs leading-relaxed text-slate-500">
                          <span className="font-semibold text-slate-600">Basis of interpretation:</span> Level 1
                          Executive Governance Triage is questionnaire-based decision support only. It is not an
                          assessment, audit, assurance opinion, or Security Cost Leakage Assessment™.
                        </p>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="responses" className="mt-0">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <CardTitle className="text-base">Questionnaire responses</CardTitle>
                        <CardDescription>
                          Active triage answers ({TOTAL_TRIAGE_QUESTIONS} questions — same set as the public
                          website)
                        </CardDescription>
                      </div>
                      <Input
                        className="h-10 max-w-xs shrink-0"
                        placeholder="Search code, question or answer…"
                        value={responseQuery}
                        onChange={(e) => setResponseQuery(e.target.value)}
                      />
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-slate-200">
                        <table className="w-full min-w-[560px] text-sm">
                          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="whitespace-nowrap px-3 py-2.5">Code</th>
                              <th className="min-w-[220px] px-3 py-2.5">Question</th>
                              <th className="min-w-[140px] px-3 py-2.5">Answer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredResponses.map((row: any) => (
                              <tr key={row.id} className="border-t border-slate-100">
                                <td className="whitespace-nowrap px-3 py-2.5 align-top">
                                  <code className="text-xs">{row.question?.code}</code>
                                </td>
                                <td className="px-3 py-2.5 align-top text-slate-700">{row.question?.text}</td>
                                <td className="px-3 py-2.5 align-top font-medium text-slate-900">
                                  {stripUnintendedLeadingDash(row.responseOption?.label || '') || '—'}
                                </td>
                              </tr>
                            ))}
                            {!filteredResponses.length && (
                              <tr>
                                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                                  {item.completedAt
                                    ? 'No responses match your search.'
                                    : 'Responses appear when the questionnaire is completed.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="commercial" className="mt-0">
                  <TriageCommercialPanel
                    submissionId={item.id}
                    item={item}
                    commercialOwners={commercialOwners}
                    busy={busy}
                    onReload={() => load({ soft: true })}
                    focusSection={commercialFocus}
                    onFocusHandled={clearCommercialFocus}
                  />
                </TabsContent>

                <TabsContent value="communications" className="mt-0">
                  <TriageCommunicationsPanel
                    submissionId={item.id}
                    item={item}
                    initialAction={commAction}
                    onInitialActionHandled={clearCommAction}
                    onSummaryChange={(summary) => setUnreadCommCount(summary.unreadCount)}
                  />
                </TabsContent>

                <TabsContent value="journey" className="mt-0 space-y-4">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Commercial Journey</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ol className="space-y-0">
                        {(item.commercialJourney || []).map((step: any) => {
                          const done = Boolean(step.at);
                          const current = Boolean(step.active) && !done;
                          return (
                            <WorkflowStep
                              key={step.key}
                              state={done ? 'done' : current ? 'current' : 'pending'}
                              label={`${step.label}${step.at ? ` · ${fmt(step.at)}` : current ? ' · In progress' : ''}`}
                            />
                          );
                        })}
                      </ol>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Lifecycle & audit trail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(item.audit || []).length ? (
                        <ol className="space-y-0">
                          {item.audit.map((event: any) => (
                            <WorkflowStep
                              key={event.id}
                              state="done"
                              label={`${humanizeStatus(event.action)} · ${fmt(event.createdAt)}`}
                            />
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-muted-foreground">No audit events recorded.</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="notes" className="mt-0">
                  <TriageNotesPanel
                    submissionId={item.id}
                    initialNotes={(item.notes || []) as TriageNoteItem[]}
                    onNotesChange={(next) => setItem((prev: any) => (prev ? { ...prev, notes: next } : prev))}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {sidebarContent ? (
              <aside className="space-y-4 lg:sticky lg:top-[7rem] lg:self-start">{sidebarContent}</aside>
            ) : null}
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
