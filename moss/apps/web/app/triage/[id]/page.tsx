'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { isSclActiveTriageQuestionCode, SCL_ACTIVE_TRIAGE_QUESTION_CODES, deriveEgtAssurancePresentation } from '@moss/shared';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  Mail,
  Phone,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
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
    IN_PREPARATION: 'In preparation',
    SENT: 'Sent',
    ACCEPTED: 'Accepted',
    DECLINED: 'Declined',
    EXPIRED: 'Expired',
    PROPOSAL_REQUESTED: 'Proposal requested',
    PROPOSAL_IN_PREPARATION: 'In preparation',
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

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-slate-100 py-2 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
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
  tone,
}: {
  level: string;
  title: string;
  status: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{level}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{title}</p>
      <Badge
        variant={
          tone === 'success' ? 'success' : tone === 'info' ? 'info' : tone === 'warning' ? 'warning' : 'secondary'
        }
        className="mt-1.5 shrink-0 whitespace-nowrap"
      >
        {status}
      </Badge>
    </div>
  );
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [responseQuery, setResponseQuery] = useState('');
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [commercialOwners, setCommercialOwners] = useState<any[]>([]);
  const [leadMenuOpen, setLeadMenuOpen] = useState(false);
  const proposalFileRef = useRef<HTMLInputElement>(null);

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
    setError('');
    // Never blank the whole page when we already have data (tab changes / soft refresh).
    const soft = Boolean(opts?.soft) || Boolean(itemRef.current);
    if (!soft) setLoading(true);
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
      setError(e instanceof Error ? e.message : 'Unable to load submission.');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    itemRef.current = null;
    if (id) void load({ soft: false });
  }, [id, load]);

  useEffect(() => {
    apiFetch<any[]>('/admin/users/analysts').then(setAnalysts).catch(() => []);
    apiFetch<any[]>('/triage/commercial-owners').then(setCommercialOwners).catch(() => []);
  }, []);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ unreadCount: number }>(`/triage/submissions/${id}/communications/summary`)
      .then((summary) => setUnreadCommCount(summary.unreadCount || 0))
      .catch(() => setUnreadCommCount(0));
  }, [id, tab]);

  async function run(fn: () => Promise<void>, success?: { title: string; description: string }) {
    setBusy(true);
    setError('');
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
      setError(message);
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
    setError('');
    try {
      const data = await apiFetch<{ engagement: { id: string } }>(`/triage/submissions/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify(force ? { force: true } : {}),
      });
      if (data?.engagement?.id) window.location.href = `/advisory/${data.engagement.id}`;
      else await load({ soft: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unable to create the Executive Advisory Diagnostic.';
      setError(message);
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
    return (item?.responses || []).filter((row: any) => isSclActiveTriageQuestionCode(row.question?.code));
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
      const st = String(item.convertedEngagement.status || '');
      if (['REPORT_ISSUED', 'REPORT_GENERATED', 'CLOSED', 'APPROVED', 'SUBMITTED'].includes(st)) {
        return { label: humanizeStatus(st), tone: 'success' as const };
      }
      return { label: humanizeStatus(st) || 'In progress', tone: 'info' as const };
    }
    if (['IN_PREPARATION', 'REQUESTED', 'SENT', 'ACCEPTED'].includes(proposalStatus)) {
      return { label: 'In preparation', tone: 'warning' as const };
    }
    if (item?.diagnosticRequestedAt) return { label: 'In preparation', tone: 'warning' as const };
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

  const recommendedAction = (() => {
    if (!item) return null;
    if (item.closedAt && !isConverted) {
      return {
        title: 'Lead closed',
        body: 'This triage lead is closed. Use Reopen lead in the ⋮ menu if you want to continue.',
        badge: { label: 'Closed', variant: 'secondary' as const },
      };
    }
    if (isConverted && item.convertedEngagement?.id) {
      if (!analystName) {
        return {
          title: 'Executive Advisory Diagnostic',
          body: 'Level 2 has been created. Assign a consultant before continuing the diagnostic.',
          badge: { label: 'Assign consultant', variant: 'warning' as const },
        };
      }
      return {
        title: 'Executive Advisory Diagnostic',
        body: `${analystName} is assigned. Continue the Level 2 diagnostic from the header action.`,
        badge: { label: l2Status.label, variant: l2Status.tone },
      };
    }
    if (level1Complete && !item.contactedAt && !item.closedAt) {
      return {
        title: 'Initial outreach',
        body: 'Confirm contact with the organisation before Level 2 preparation.',
        badge: { label: 'Contact pending', variant: 'warning' as const },
      };
    }
    if (level1Complete && !item.reviewedAt && !item.closedAt) {
      return {
        title: 'Review triage indication',
        body: 'Confirm the Level 1 indication has been reviewed before Level 2 preparation.',
        badge: { label: 'Review pending', variant: 'warning' as const },
      };
    }
    if (level1Complete && !isConverted && !item.closedAt) {
      return {
        title: 'Executive Advisory Diagnostic',
        body: 'This triage has been reviewed and is ready for Level 2 preparation.',
        badge: { label: 'Ready for Level 2', variant: 'success' as const },
      };
    }
    if (!level1Complete) {
      return {
        title: 'Awaiting questionnaire completion',
        body: 'Level 1 triage is still in progress.',
        badge: { label: 'In progress', variant: 'warning' as const },
      };
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

  if (loading || !item) {
    return (
      <AuthGate>
        <Shell title="Triage submission" hideSearch>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="triage-detail-workspace space-y-4 pb-8">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <Skeleton className="h-4 w-48" />
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
          )}
        </Shell>
      </AuthGate>
    );
  }

  const commercialNeedsAction =
    ['REQUESTED', 'IN_PREPARATION', 'SENT'].includes(proposalStatus) && !item.convertedAt && !item.closedAt;

  const displayCta = normalizePrimaryCta(item.primaryCta, item.activeProposal);

  return (
    <AuthGate>
      <Shell title={`Triage · ${assessment?.reference || item.organisationName}`} hideSearch>
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
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to continue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Information card */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
                    <Link
                      href="/triage"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                      aria-label="Back to triage list"
                    >
                      <ChevronLeft className="size-4" aria-hidden="true" />
                    </Link>
                    <Link
                      href="/triage"
                      className="font-medium text-slate-500 transition-colors hover:text-slate-800"
                    >
                      Executive Triage
                    </Link>
                    <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                    <span className="font-medium text-slate-900">{assessment?.reference || '—'}</span>
                  </nav>
                  <h1 className="text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                    {item.organisationName}
                  </h1>
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
                    {isConverted ? (
                      <Badge variant="info" className="shrink-0 whitespace-nowrap">
                        Converted
                      </Badge>
                    ) : null}
                    {band ? (
                      <EgtAssuranceBandBadge
                        label={band}
                        visual={assurancePresentation?.visual}
                        className="shrink-0"
                      />
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-600">
                    {[item.firstName, item.lastName].filter(Boolean).join(' ')}
                    {item.email ? ` · ${item.email}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:items-start">
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
                        className="org2-menu-btn"
                        aria-label="Lead actions"
                        disabled={busy}
                        onClick={() => setLeadMenuOpen((open) => !open)}
                      >
                        <IconMoreVertical />
                      </button>
                    }
                  >
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

              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-slate-600"
                    disabled={!item.email?.trim()}
                    title={item.email?.trim() ? 'Email client' : 'No email address on this submission'}
                    onClick={() => setTab('communications', { action: 'compose' })}
                  >
                    <Mail className="size-3.5" aria-hidden="true" />
                    Email client
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2 text-slate-600"
                    disabled={!item.phone?.trim()}
                    title={item.phone?.trim() ? `Call ${item.phone}` : 'No telephone number on this submission'}
                    onClick={() => {
                      if (item.phone?.trim()) window.location.href = `tel:${item.phone.trim()}`;
                    }}
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    {item.phone?.trim() || 'No number'}
                  </Button>
                </div>

                <div className="ml-auto w-full max-w-[280px] sm:w-auto">
                  <p className="mb-1 text-xs font-medium text-slate-500">Assigned analyst</p>
                  <FilterSelect
                    value={item.assignedAnalystId || ''}
                    onChange={(v) => void assignAnalyst(v)}
                    disabled={busy || !analysts.length}
                    placeholder="Not assigned"
                    includeAll
                    emptyValue=""
                    aria-label="Assigned analyst"
                    triggerClassName="h-9 w-full min-w-[200px]"
                    options={analysts.map((a) => ({
                      value: a.id,
                      label: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || a.id,
                    }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs directly below information card */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <Tabs value={tab} onValueChange={(v) => setTab(parseTabId(v))}>
                <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto bg-slate-100 p-1">
                  <TabsTrigger value="overview" className="shrink-0 whitespace-nowrap">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="scores" className="shrink-0 whitespace-nowrap">
                    Scores & indication
                  </TabsTrigger>
                  <TabsTrigger value="responses" className="shrink-0 gap-2 whitespace-nowrap">
                    Responses
                    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5">
                      {responseRows.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="commercial" className="shrink-0 gap-2 whitespace-nowrap">
                    Commercial
                    {commercialNeedsAction ? (
                      <span className="inline-flex shrink-0" title="Needs attention">
                        <Bell
                          className="size-3.5 text-amber-600"
                          aria-label="Needs attention"
                        />
                      </span>
                    ) : proposalStatus !== 'NOT_REQUESTED' ? (
                      <Badge variant="info" className="h-5 whitespace-nowrap px-1.5">
                        Active
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="communications" className="shrink-0 gap-2 whitespace-nowrap">
                    Communications
                    {unreadCommCount > 0 ? (
                      <Badge variant="warning" className="h-5 min-w-5 justify-center px-1.5">
                        {unreadCommCount}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="journey" className="shrink-0 whitespace-nowrap">
                    Journey & audit
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="shrink-0 whitespace-nowrap">
                    Notes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-0 space-y-4">
                  {/* Product journey */}
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-stretch sm:gap-3 sm:p-5">
                      <JourneyStage
                        level="Level 1"
                        title="Triage"
                        status={level1Complete ? 'Completed' : 'In progress'}
                        tone={level1Complete ? 'success' : 'warning'}
                      />
                      <div className="hidden items-center sm:flex" aria-hidden="true">
                        <ArrowRight className="size-4 text-slate-300" />
                      </div>
                      <JourneyStage
                        level="Level 2"
                        title="Executive Advisory Diagnostic"
                        status={l2Status.label}
                        tone={l2Status.tone}
                      />
                      <div className="hidden items-center sm:flex" aria-hidden="true">
                        <ArrowRight className="size-4 text-slate-300" />
                      </div>
                      <JourneyStage level="Level 3" title="Assurance" status={l3Status.label} tone={l3Status.tone} />
                    </CardContent>
                  </Card>

                  {recommendedAction ? (
                    <Card className="rounded-xl border-moss-info/30 bg-moss-info/[0.04] shadow-sm">
                      <CardContent className="space-y-2 p-4 sm:p-5">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-moss-info">
                          Next recommended action
                        </p>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="m-0 text-sm font-semibold text-slate-900">{recommendedAction.title}</p>
                            <p className="m-0 text-sm text-slate-600">{recommendedAction.body}</p>
                          </div>
                          {recommendedAction.badge ? (
                            <Badge
                              variant={
                                recommendedAction.badge.variant === 'success'
                                  ? 'success'
                                  : recommendedAction.badge.variant === 'warning'
                                    ? 'warning'
                                    : recommendedAction.badge.variant === 'info'
                                      ? 'info'
                                      : 'secondary'
                              }
                              className="shrink-0 whitespace-nowrap"
                            >
                              {recommendedAction.badge.label}
                            </Badge>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}

                  {hasCommercial ? (
                    <Card
                      className={cn(
                        'rounded-xl shadow-sm',
                        commercialNeedsAction
                          ? 'border-amber-200 bg-amber-50/50'
                          : isConverted
                            ? 'border-moss-success/30 bg-moss-success/[0.03]'
                            : 'border-slate-200',
                      )}
                    >
                      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="m-0 text-sm font-semibold text-slate-900">Commercial handoff</p>
                            <Badge
                              variant={proposalBadgeVariant(isConverted ? 'CONVERTED' : proposalStatus)}
                              className="shrink-0 whitespace-nowrap"
                            >
                              {isConverted ? 'Converted' : humanizeStatus(proposalStatus)}
                            </Badge>
                          </div>
                          <p className="m-0 text-sm font-medium text-slate-800">
                            {item.proposalReference || 'No proposal reference'}
                          </p>
                          <p className="m-0 text-sm text-slate-600">Executive Advisory Diagnostic</p>
                          <p className="m-0 text-xs text-slate-500">
                            Requested {fmt(item.proposalRequestedAt || item.diagnosticRequestedAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="h-10 shrink-0 whitespace-nowrap px-4"
                          onClick={() => setTab('commercial')}
                        >
                          Open commercial record
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Organisation & contact</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl>
                          <Kv label="Organisation">{item.organisationName}</Kv>
                          <Kv label="Industry">{item.industry || '—'}</Kv>
                          <Kv label="Job title">{item.qualification?.jobTitle || '—'}</Kv>
                          <Kv label="Country / region">{item.qualification?.country || '—'}</Kv>
                          <Kv label="Operational sites">
                            {item.qualification?.operationalSitesLabel || '—'}
                          </Kv>
                          <Kv label="Annual security expenditure">
                            {item.qualification?.securityExpenditureLabel || '—'}
                          </Kv>
                          <Kv label="Primary concern">
                            {item.qualification?.primaryConcern || '—'}
                          </Kv>
                          <Kv label="Contact">
                            {item.firstName} {item.lastName}
                          </Kv>
                          <Kv label="Email">{item.email}</Kv>
                          <Kv label="Phone">{item.phone || '—'}</Kv>
                          <Kv label="Source">{item.source || 'Public website'}</Kv>
                        </dl>
                      </CardContent>
                    </Card>
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-base">Triage submission</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <dl>
                          <Kv label="Reference">{assessment?.reference || '—'}</Kv>
                          <Kv label="Stage">{humanizeStatus(item.displayStatus)}</Kv>
                          <Kv label="Assurance score">
                            {score != null ? `${score} / 100` : '—'}
                            {band ? ` · ${band}` : ''}
                          </Kv>
                          <Kv label="Progress">{item.completedAt ? 'Complete' : `${progress}%`}</Kv>
                          <Kv label="Created">{fmt(item.createdAt)}</Kv>
                          <Kv label="Completed">{fmt(item.completedAt)}</Kv>
                          <Kv label="Contacted">{fmt(item.contactedAt)}</Kv>
                          <Kv label="Level 2 route">
                            {item.convertedEngagement
                              ? `${item.convertedEngagement.reference} · ${humanizeStatus(item.convertedEngagement.status)}`
                              : 'Not yet converted'}
                          </Kv>
                        </dl>
                      </CardContent>
                    </Card>
                  </div>
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
                              ? Number(assessment.maturityScore).toFixed(1)
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
                              ? Number(assessment.opportunityScore).toFixed(1)
                              : '—'
                          }
                          hint="Follow-up potential"
                        />
                      </div>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-base">Assurance dimensions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <CategoryBars items={categories} />
                        </CardContent>
                      </Card>
                      <Card className="rounded-xl border-slate-200 shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-base">Basis of interpretation</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            This is Level 1 Executive Governance Triage — questionnaire-based decision support
                            only. It is not an assessment, audit, assurance opinion, or Security Cost Leakage
                            Assessment™.
                          </p>
                        </CardContent>
                      </Card>
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

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Executive Triage</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="m-0 list-none space-y-0 p-0">
                    {workflowSteps.map((step) => (
                      <WorkflowStep key={step.label} state={step.state} label={step.label} />
                    ))}
                  </ol>
                </CardContent>
              </Card>

            </aside>
          </div>
        </div>
      </Shell>
    </AuthGate>
  );
}
