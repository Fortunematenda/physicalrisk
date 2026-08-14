'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileUp,
  Layers,
  Lock,
  Save,
  ShieldCheck,
} from 'lucide-react';

import { StatCard } from '@/components/dashboard/stat-card';
import { useConfirm } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { apiFetch } from '../../../../lib/api';
import {
  MOSS_SCORE_LABELS,
  formatAssessmentProgress,
  formatMossAssessmentStatus,
  formatMossControlStatus,
  formatMossScore,
  hasFinancialMapping,
  listMethodologyItems,
  mossApiErrorMessage,
  scoringGuidanceFor,
} from '../../../../lib/moss';

type Workspace = {
  assessment: {
    id: string;
    reference: string;
    title: string;
    status: string;
    organisation: { name: string };
    site?: { name: string; siteCode: string } | null;
    submittedAt?: string | null;
    lockedAt?: string | null;
    reviewedAt?: string | null;
    reviewNote?: string | null;
    returnReason?: string | null;
    approvedAt?: string | null;
  };
  catalogue: { version?: string; title?: string };
  progress?: { assessedControls: number; totalControls: number; completionPercent: number };
  controlsScored: number;
  controlsTotal: number;
  progressPercent: number;
  overallMossScore: string;
  scoringMethodology?: string;
  configurationStatus?: string;
  overallScore?: number | null;
  scoreLabels: Record<string, string>;
  canSubmit?: boolean;
  isSubmitted?: boolean;
  workflow?: {
    isEditable: boolean;
    isLocked: boolean;
    canMarkReviewed: boolean;
    canApprove: boolean;
    canReturn: boolean;
  };
  resume?: { controlCode: string | null; domainCode: string | null };
  domains: Array<{
    id: string;
    domainCode: string;
    name: string;
    scored: number;
    total: number;
    assessedControls?: number;
    totalControls?: number;
    completionPercent: number;
    controls: Array<{
      id: string;
      controlCode: string;
      name: string;
      status: string;
      assessorScore: number | null;
      hasScore: boolean;
    }>;
  }>;
};

type ControlState = {
  control: {
    controlCode: string;
    name: string;
    controlFunction: string | null;
    owner: string | null;
    frequency: string | null;
    metric: string | null;
    thresholdText?: string | null;
    threshold?: string | null;
    evidenceStandards: unknown;
    inspectionMethodology: unknown;
    failureConditions: unknown;
    fraudIndicators: unknown;
    mossScoringRules: unknown;
    technologySubstitutionLogic: string | null;
    manpowerOptimisationLogic: string | null;
    financialMapping: Record<string, unknown>;
  };
  assessment: {
    controlAssessment: {
      assessorScore: number | null;
      scoreRationale: string | null;
      comment: string | null;
      findingText: string | null;
      status: string;
      exists?: boolean;
    };
  };
  scoreLabels: Record<string, string>;
};

type SaveUiState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

function MethodologyBlock({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  const items = listMethodologyItems(value);
  return (
    <details open={defaultOpen} className="group rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
          {title}
        </span>
      </summary>
      {items.length ? (
        <ul className="mt-2 space-y-1 pl-4 text-sm text-slate-600">
          {items.map((x) => (
            <li key={x} className="list-disc">{x}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">None recorded in catalogue.</p>
      )}
    </details>
  );
}

export default function MossWorkspacePage() {
  const params = useParams<{ id: string }>();
  const confirm = useConfirm();
  const assessmentId = params.id;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [domainCode, setDomainCode] = useState('');
  const [controlCode, setControlCode] = useState('');
  const [controlState, setControlState] = useState<ControlState | null>(null);
  const [assessorScore, setAssessorScore] = useState<number | null>(null);
  const [scoreRationale, setScoreRationale] = useState('');
  const [comment, setComment] = useState('');
  const [findingText, setFindingText] = useState('');
  const [saveState, setSaveState] = useState<SaveUiState>('idle');
  const [error, setError] = useState('');
  const [financialOpen, setFinancialOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const [showReturnBox, setShowReturnBox] = useState(false);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [evidenceStandards, setEvidenceStandards] = useState<unknown>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [promotingFinding, setPromotingFinding] = useState(false);
  const [notice, setNotice] = useState('');
  const initialResumeDone = useRef(false);

  const saveSeq = useRef(0);
  const dirtyRef = useRef(false);
  const valuesRef = useRef({ assessorScore: null as number | null, scoreRationale: '', comment: '', findingText: '' });

  valuesRef.current = { assessorScore, scoreRationale, comment, findingText };

  const loadWorkspace = useCallback(async () => {
    const data = await apiFetch<Workspace>(`/moss/assessments/${assessmentId}`);
    setWorkspace(data);
    setDomainCode((prev) => prev || data.domains[0]?.domainCode || '');
    return data;
  }, [assessmentId]);

  const loadControl = useCallback(async (code: string) => {
    if (!code) return;
    const data = await apiFetch<ControlState>(`/moss/assessments/${assessmentId}/controls/${code}`);
    setControlState(data);
    setControlCode(code);
    setAssessorScore(data.assessment.controlAssessment.assessorScore);
    setScoreRationale(data.assessment.controlAssessment.scoreRationale || '');
    setComment(data.assessment.controlAssessment.comment || '');
    setFindingText(data.assessment.controlAssessment.findingText || '');
    setSaveState('idle');
    dirtyRef.current = false;
    void loadEvidence(code);
    try {
      window.localStorage.setItem(`moss-resume-${assessmentId}`, code);
    } catch {
      /* ignore */
    }
  }, [assessmentId]);

  useEffect(() => {
    initialResumeDone.current = false;
    loadWorkspace()
      .then(async (data) => {
        if (initialResumeDone.current) return;
        initialResumeDone.current = true;

        let code = data.resume?.controlCode || '';
        let domain = data.resume?.domainCode || '';

        // Prefer browser resume pointer when still valid (where the user left off).
        try {
          const stored = window.localStorage.getItem(`moss-resume-${assessmentId}`);
          const flat = data.domains.flatMap((d) => d.controls.map((c) => ({ ...c, domainCode: d.domainCode })));
          if (stored && flat.some((c) => c.controlCode === stored)) {
            const hit = flat.find((c) => c.controlCode === stored)!;
            code = hit.controlCode;
            domain = hit.domainCode;
          }
        } catch {
          /* ignore */
        }

        if (!code) code = data.domains[0]?.controls[0]?.controlCode || '';
        if (!domain) {
          domain = data.domains.find((d) => d.controls.some((c) => c.controlCode === code))?.domainCode
            || data.domains[0]?.domainCode
            || '';
        }
        if (domain) setDomainCode(domain);
        if (code) await loadControl(code);
      })
      .catch((e: unknown) => setError(mossApiErrorMessage(e, 'Unable to load MOSS assessment.')));
  }, [loadWorkspace, loadControl, assessmentId]);

  const activeDomain = useMemo(
    () => workspace?.domains.find((d) => d.domainCode === domainCode) || workspace?.domains[0],
    [workspace, domainCode],
  );

  const flatControls = useMemo(
    () => (workspace?.domains || []).flatMap((d) => d.controls.map((c) => ({ ...c, domainCode: d.domainCode }))),
    [workspace],
  );

  const currentIndex = flatControls.findIndex((c) => c.controlCode === controlCode);
  const scoreLabels = workspace?.scoreLabels || controlState?.scoreLabels || Object.fromEntries(
    Object.entries(MOSS_SCORE_LABELS).map(([k, v]) => [k, v]),
  );

  const save = useCallback(async (partial?: { assessorScore?: number | null }) => {
    if (!controlCode) return;
    const seq = ++saveSeq.current;
    const savingControl = controlCode;
    setSaveState('saving');
    setError('');
    const snapshot = { ...valuesRef.current };
    const nextScore = partial && 'assessorScore' in partial ? partial.assessorScore ?? null : snapshot.assessorScore;
    try {
      await apiFetch(`/moss/assessments/${assessmentId}/controls/${savingControl}`, {
        method: 'PATCH',
        body: JSON.stringify({
          assessorScore: nextScore,
          scoreRationale: snapshot.scoreRationale,
          comment: snapshot.comment,
          findingText: snapshot.findingText,
        }),
      });
      if (seq !== saveSeq.current || controlCode !== savingControl) return;

      const current = valuesRef.current;
      const unchanged =
        current.assessorScore === nextScore
        && current.scoreRationale === snapshot.scoreRationale
        && current.comment === snapshot.comment
        && current.findingText === snapshot.findingText;
      if (unchanged) {
        dirtyRef.current = false;
        setSaveState('saved');
      } else {
        setSaveState('unsaved');
      }

      await loadWorkspace();
      if (seq !== saveSeq.current || controlCode !== savingControl) return;

      // Refresh methodology/status only — do not clobber newer local edits.
      const refreshed = await apiFetch<ControlState>(`/moss/assessments/${assessmentId}/controls/${savingControl}`);
      if (seq !== saveSeq.current || controlCode !== savingControl) return;
      setControlState(refreshed);
      if (unchanged) {
        setAssessorScore(refreshed.assessment.controlAssessment.assessorScore);
        setScoreRationale(refreshed.assessment.controlAssessment.scoreRationale || '');
        setComment(refreshed.assessment.controlAssessment.comment || '');
        setFindingText(refreshed.assessment.controlAssessment.findingText || '');
      }
    } catch (err: unknown) {
      if (seq !== saveSeq.current) return;
      setSaveState('error');
      setError(mossApiErrorMessage(err, 'Save failed.'));
    }
  }, [assessmentId, controlCode, loadWorkspace]);

  useEffect(() => {
    if (!controlCode || !dirtyRef.current) return;
    const handle = window.setTimeout(() => {
      void save();
    }, 800);
    return () => window.clearTimeout(handle);
  }, [scoreRationale, comment, findingText, controlCode, save]);

  async function selectScore(score: number) {
    setAssessorScore(score);
    valuesRef.current = { ...valuesRef.current, assessorScore: score };
    setError('');
    await save({ assessorScore: score });
  }

  function mustSelectScoreBeforeLeaving(): boolean {
    const editable = workspace?.workflow?.isEditable
      ?? !Boolean(workspace?.isSubmitted || workspace?.assessment?.submittedAt);
    if (!editable) return false;
    if (assessorScore != null) return false;
    setError('Select a maturity score (0–4) on this control before continuing.');
    return true;
  }

  async function navigateToControl(nextCode: string, nextDomainCode?: string) {
    if (!nextCode || nextCode === controlCode) return;
    if (mustSelectScoreBeforeLeaving()) return;
    if (dirtyRef.current) await save();
    if (nextDomainCode) setDomainCode(nextDomainCode);
    await loadControl(nextCode);
  }

  async function goRelative(delta: number) {
    if (delta > 0 && mustSelectScoreBeforeLeaving()) return;
    if (dirtyRef.current) await save();
    const next = flatControls[currentIndex + delta];
    if (!next) return;
    setDomainCode(next.domainCode);
    await loadControl(next.controlCode);
  }

  async function submitAssessment(confirmIncomplete = false) {
    if (dirtyRef.current) await save();
    setSubmitting(true);
    setError('');
    setSubmitMessage('');
    try {
      const data = await apiFetch<Workspace>(`/moss/assessments/${assessmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ confirmIncomplete }),
      });
      setWorkspace(data);
      setSubmitMessage(
        confirmIncomplete
          ? 'Assessment submitted (incomplete controls confirmed).'
          : 'Assessment submitted successfully.',
      );
    } catch (err: unknown) {
      const details = err && typeof err === 'object' && 'details' in err ? (err as any).details : null;
      if (details?.code === 'MOSS_INCOMPLETE_SUBMIT_CONFIRMATION_REQUIRED') {
        const ok = await confirm({
          title: 'Submit incomplete assessment',
          description: `Submit assessment with incomplete controls?\n\nScored ${details.controlsScored}/${details.controlsTotal} (${details.completenessPercent}%).`,
          confirmLabel: 'Submit anyway',
          variant: 'default',
        });
        if (ok) {
          setSubmitting(false);
          await submitAssessment(true);
          return;
        }
        setError('Submission cancelled — incomplete controls not confirmed.');
      } else {
        setError(mossApiErrorMessage(err, 'Unable to submit assessment.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function runWorkflow(action: 'mark-reviewed' | 'approve' | 'return') {
    setWorkflowBusy(true);
    setError('');
    setSubmitMessage('');
    try {
      if (action === 'return') {
        if (!returnComment.trim()) {
          setError('Add a return comment before sending the assessment back.');
          return;
        }
        const updated = await apiFetch<Workspace>(`/moss/assessments/${assessmentId}/return`, {
          method: 'POST',
          body: JSON.stringify({ comment: returnComment.trim() }),
        });
        setWorkspace(updated);
        setShowReturnBox(false);
        setReturnComment('');
        setSubmitMessage('Assessment returned for more work.');
        return;
      }
      if (action === 'mark-reviewed') {
        const updated = await apiFetch<Workspace>(`/moss/assessments/${assessmentId}/mark-reviewed`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        setWorkspace(updated);
        setSubmitMessage('Assessment marked as reviewed.');
        return;
      }
      const updated = await apiFetch<Workspace>(`/moss/assessments/${assessmentId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setWorkspace(updated);
      setSubmitMessage('Assessment approved and locked.');
    } catch (e) {
      setError(mossApiErrorMessage(e, 'Workflow action failed.'));
    } finally {
      setWorkflowBusy(false);
    }
  }

  async function loadEvidence(code: string) {
    if (!code) return;
    try {
      const res = await apiFetch<{ evidence: any[]; evidenceStandards: unknown }>(
        `/moss/assessments/${assessmentId}/controls/${code}/evidence`,
      );
      setEvidence(res.evidence || []);
      setEvidenceStandards(res.evidenceStandards);
    } catch {
      setEvidence([]);
    }
  }

  async function uploadEvidence(file: File | null) {
    if (!file || !controlCode) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      await apiFetch(`/moss/assessments/${assessmentId}/controls/${controlCode}/evidence`, {
        method: 'POST',
        body: fd,
      });
      await loadEvidence(controlCode);
      setNotice('Evidence uploaded.');
    } catch (e) {
      setError(mossApiErrorMessage(e, 'Evidence upload failed.'));
    } finally {
      setUploading(false);
    }
  }

  async function downloadEvidence(ev: { id: string; fileName?: string; title?: string }) {
    if (!controlCode) return;
    setDownloadingId(ev.id);
    setError('');
    try {
      const res = await apiFetch<{ url?: string; downloadUrl?: string }>(
        `/moss/assessments/${assessmentId}/controls/${controlCode}/evidence/${ev.id}/download`,
      );
      const url = res.url || res.downloadUrl;
      if (!url) throw new Error('Download link unavailable.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(mossApiErrorMessage(e, 'Evidence download failed.'));
    } finally {
      setDownloadingId(null);
    }
  }

  async function promoteFinding() {
    const text = findingText.trim();
    if (!controlCode || !text) return;
    setPromotingFinding(true);
    setError('');
    setNotice('');
    try {
      // Persist control finding text first so promote can read it server-side.
      if (dirtyRef.current) {
        await save();
      }
      await apiFetch(`/moss/assessments/${assessmentId}/findings`, {
        method: 'POST',
        body: JSON.stringify({
          controlCode,
          title: `${controlCode} finding`,
          description: text,
          promoteFindingText: true,
        }),
      });
      setNotice('Finding promoted to structured findings.');
    } catch (e) {
      setError(mossApiErrorMessage(e, 'Unable to promote finding.'));
    } finally {
      setPromotingFinding(false);
    }
  }

  function markDirty() {
    dirtyRef.current = true;
    setSaveState('unsaved');
  }

  const guidance = scoringGuidanceFor(controlState?.control.mossScoringRules, assessorScore);
  const threshold = controlState?.control.thresholdText || controlState?.control.threshold;
  const financial = controlState?.control.financialMapping;
  const progressScored = workspace?.progress?.assessedControls ?? workspace?.controlsScored ?? 0;
  const progressTotal = workspace?.progress?.totalControls ?? workspace?.controlsTotal ?? 100;
  const progressPercent = workspace?.progress?.completionPercent ?? workspace?.progressPercent ?? 0;
  const isLastControl = currentIndex >= 0 && currentIndex >= flatControls.length - 1;
  const allScored = progressTotal > 0 && progressScored >= progressTotal;
  const canSubmit = Boolean(workspace?.canSubmit ?? (allScored && !workspace?.assessment?.submittedAt));
  const isSubmitted = Boolean(workspace?.isSubmitted || workspace?.assessment?.submittedAt);
  const workflow = workspace?.workflow;
  const isEditable = workflow?.isEditable ?? !isSubmitted;
  const isLocked = Boolean(workflow?.isLocked || workspace?.assessment?.lockedAt);

  const saveLabel =
    saveState === 'unsaved' ? 'Unsaved'
      : saveState === 'saving' ? 'Saving…'
        : saveState === 'saved' ? 'Saved'
          : saveState === 'error' ? 'Save failed'
            : '';

  return (
    <div className="w-full min-w-0 space-y-5">
      {error ? <p className="error">{error}</p> : null}
      {notice && !error ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {!workspace && !error ? <p className="text-sm text-slate-500">Loading workspace…</p> : null}

      {workspace ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Controls</h2>
              <p className="mt-1 text-sm text-slate-500">
                <span className="font-semibold text-slate-700">{workspace.assessment.reference}</span>
                {' · '}
                {workspace.assessment.title}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {workspace.assessment.organisation.name}
                {workspace.assessment.site
                  ? ` · Site ${workspace.assessment.site.siteCode} — ${workspace.assessment.site.name}`
                  : ''}
                {' · '}
                Catalogue v{workspace.catalogue.version || '3.0'}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Overall MOSS Score:{' '}
                <span className="font-semibold text-slate-800">
                  {workspace.overallMossScore || '—'}
                </span>
                {workspace.scoringMethodology ? (
                  <span className="text-slate-400"> · {workspace.scoringMethodology}</span>
                ) : null}
              </p>
              {workspace.assessment.returnReason ? (
                <p className="error mt-2 mb-0">Returned: {workspace.assessment.returnReason}</p>
              ) : null}
              {submitMessage ? (
                <p className="mt-2 mb-0 text-sm font-medium text-emerald-700">{submitMessage}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs font-semibold">
                {formatMossAssessmentStatus(workspace.assessment.status)}
              </Badge>
              {!isEditable ? (
                <Badge variant="outline" className="gap-1 rounded-md px-2.5 py-1 text-xs font-semibold">
                  <Lock className="size-3" aria-hidden="true" />
                  {isLocked ? 'Locked' : 'Read-only'}
                </Badge>
              ) : null}
              {saveLabel ? (
                <span className="text-xs font-medium text-slate-500">{saveLabel}</span>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href="/moss/assessments">Back</Link>
              </Button>
              {canSubmit ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting || workflowBusy}
                  className="bg-[#c41230] hover:bg-[#a10f28]"
                  onClick={() => void submitAssessment()}
                >
                  {submitting ? 'Submitting…' : 'Submit for review'}
                </Button>
              ) : null}
              {workflow?.canMarkReviewed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={workflowBusy}
                  onClick={() => void runWorkflow('mark-reviewed')}
                >
                  {workflowBusy ? 'Working…' : 'Mark reviewed'}
                </Button>
              ) : null}
              {workflow?.canApprove ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={workflowBusy}
                  className="bg-[#c41230] hover:bg-[#a10f28]"
                  onClick={() => void runWorkflow('approve')}
                >
                  {workflowBusy ? 'Working…' : 'Approve & lock'}
                </Button>
              ) : null}
              {workflow?.canReturn ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={workflowBusy}
                  onClick={() => setShowReturnBox((v) => !v)}
                >
                  Return for edits
                </Button>
              ) : null}
            </div>
          </div>

          {showReturnBox ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Return for edits</CardTitle>
                <CardDescription>Tell the assessor what needs to change.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="moss-return-comment">Comment</Label>
                  <Textarea
                    id="moss-return-comment"
                    rows={3}
                    value={returnComment}
                    onChange={(e) => setReturnComment(e.target.value)}
                    placeholder="What needs to change?"
                  />
                </div>
                <Button
                  type="button"
                  disabled={workflowBusy}
                  className="bg-[#c41230] hover:bg-[#a10f28]"
                  onClick={() => void runWorkflow('return')}
                >
                  Confirm return
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {(isSubmitted || workspace.assessment.reviewedAt || workspace.assessment.approvedAt) && (
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {isSubmitted && workspace.assessment.submittedAt ? (
                <span>Submitted · {new Date(workspace.assessment.submittedAt).toLocaleString()}</span>
              ) : null}
              {workspace.assessment.reviewedAt ? (
                <span>Reviewed · {new Date(workspace.assessment.reviewedAt).toLocaleString()}</span>
              ) : null}
              {workspace.assessment.approvedAt ? (
                <span className="font-medium text-emerald-700">
                  Approved · {new Date(workspace.assessment.approvedAt).toLocaleString()}
                </span>
              ) : null}
            </div>
          )}

          <div className="dash2-kpi-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={ClipboardList}
              title="Progress"
              value={`${progressPercent}%`}
              description={formatAssessmentProgress(progressScored, progressTotal, progressPercent)}
              tone="violet"
            />
            <StatCard
              icon={CheckCircle2}
              title="Controls scored"
              value={`${progressScored} / ${progressTotal}`}
              description="Assessed against catalogue"
              tone="teal"
            />
            <StatCard
              icon={Layers}
              title="Domains"
              value={workspace.domains.length}
              description="Active catalogue domains"
              tone="blue"
            />
            <StatCard
              icon={ShieldCheck}
              title="Status"
              value={formatMossAssessmentStatus(workspace.assessment.status)}
              description={`Catalogue v${workspace.catalogue.version || '3.0'}`}
              tone="slate"
            />
          </div>

          <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,240px)_minmax(0,260px)_minmax(0,1fr)]">
            <Card className="max-h-[75vh] overflow-hidden rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Domains</CardTitle>
                <CardDescription>Select a domain to score</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[calc(75vh-5.5rem)] space-y-2 overflow-y-auto pb-4">
                {workspace.domains.map((d) => {
                  const assessed = d.assessedControls ?? d.scored;
                  const total = d.totalControls ?? d.total;
                  const active = d.domainCode === activeDomain?.domainCode;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        if (d.controls[0]) {
                          void navigateToControl(d.controls[0].controlCode, d.domainCode);
                        } else {
                          setDomainCode(d.domainCode);
                        }
                      }}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-[#c41230]/20 bg-[#fdecee] text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        {d.domainCode}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">{d.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {assessed} / {total} · {d.completionPercent}%
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="max-h-[75vh] overflow-hidden rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {activeDomain?.domainCode || 'Controls'}
                </CardTitle>
                <CardDescription>
                  {activeDomain?.name || 'Select a domain'}
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[calc(75vh-5.5rem)] space-y-2 overflow-y-auto pb-4">
                {(activeDomain?.controls || []).map((c) => {
                  const active = c.controlCode === controlCode;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void navigateToControl(c.controlCode, activeDomain?.domainCode)}
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-[#c41230]/20 bg-[#fdecee] text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        {c.controlCode}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold leading-snug">{c.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {c.hasScore
                          ? formatMossScore(c.assessorScore, scoreLabels)
                          : formatMossControlStatus(c.status)}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="max-h-[75vh] min-w-0 overflow-hidden rounded-xl border-slate-200 shadow-sm">
              <CardContent className="max-h-[75vh] space-y-4 overflow-y-auto p-5">
                {!controlState ? (
                  <p className="text-sm text-slate-500">Select a control.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="m-0 text-lg font-bold tracking-tight text-slate-900">
                          {controlState.control.controlCode} — {controlState.control.name}
                        </h3>
                        <p className="mt-1 mb-0 text-sm text-slate-500">
                          Status:{' '}
                          {formatMossControlStatus(controlState.assessment.controlAssessment.status)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!isEditable}
                        onClick={() => void save()}
                        className="gap-1.5"
                      >
                        <Save className="size-3.5" aria-hidden="true" />
                        Save
                      </Button>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Control function / objective
                      </p>
                      <p className="mt-1 mb-0 text-sm text-slate-800">
                        {controlState.control.controlFunction || '—'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Owner', controlState.control.owner],
                        ['Frequency', controlState.control.frequency],
                        ['Metric', controlState.control.metric],
                        ['Threshold', threshold],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
                          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 mb-0 text-sm font-medium text-slate-800">{value || '—'}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <MethodologyBlock title="Evidence Standards" value={controlState.control.evidenceStandards} />
                      <MethodologyBlock title="Inspection Methodology" value={controlState.control.inspectionMethodology} />
                      <MethodologyBlock title="Failure Conditions" value={controlState.control.failureConditions} />
                      <MethodologyBlock title="Fraud / Manipulation Indicators" value={controlState.control.fraudIndicators} />
                      <MethodologyBlock title="MOSS Scoring Rules" value={controlState.control.mossScoringRules} />
                    </div>

                    {(controlState.control.technologySubstitutionLogic || controlState.control.manpowerOptimisationLogic) && (
                      <details className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                          Optimisation Logic
                        </summary>
                        <div className="mt-2 space-y-2 text-sm text-slate-700">
                          <p className="m-0">
                            <strong>Technology Substitution</strong>
                            <br />
                            {controlState.control.technologySubstitutionLogic || '—'}
                          </p>
                          <p className="m-0">
                            <strong>Manpower Optimisation</strong>
                            <br />
                            {controlState.control.manpowerOptimisationLogic || '—'}
                          </p>
                        </div>
                      </details>
                    )}

                    {hasFinancialMapping(financial) ? (
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFinancialOpen((v) => !v)}
                        >
                          {financialOpen ? 'Hide' : 'Show'} Financial Mapping / Methodology
                        </Button>
                        {financialOpen ? (
                          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                            <p className="m-0 text-slate-500">
                              Financial mapping reference from the catalogue. Calculation engines
                              for these formulas are not enabled in this release.
                            </p>
                            {financial?.eventUnit != null ? (
                              <p className="m-0"><strong>Event Unit</strong><br />{String(financial.eventUnit)}</p>
                            ) : null}
                            {financial?.costCategory != null ? (
                              <p className="m-0"><strong>Cost Category</strong><br />{String(financial.costCategory)}</p>
                            ) : null}
                            {financial?.formulaReference != null ? (
                              <p className="m-0"><strong>Formula</strong><br />{String(financial.formulaReference)}</p>
                            ) : null}
                            {financial?.leakageQuantification != null ? (
                              <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs">
                                {JSON.stringify(financial.leakageQuantification, null, 2)}
                              </pre>
                            ) : null}
                            {financial?.slaPenaltyLogic != null ? (
                              <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs">
                                {JSON.stringify(financial.slaPenaltyLogic, null, 2)}
                              </pre>
                            ) : null}
                            {financial?.incidentToCostConversion != null ? (
                              <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs">
                                {JSON.stringify(financial.incidentToCostConversion, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="m-0 mb-3 text-sm font-bold text-slate-900">MOSS Maturity Score</h4>
                      <div
                        role="radiogroup"
                        aria-label="MOSS maturity score"
                        className="grid grid-cols-5 gap-2"
                      >
                        {[0, 1, 2, 3, 4].map((score) => {
                          const selected = assessorScore === score;
                          return (
                            <button
                              key={score}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={!isEditable}
                              onClick={() => void selectScore(score)}
                              className={cn(
                                'min-h-[72px] rounded-xl border px-2 py-2 text-center transition-colors disabled:opacity-60',
                                selected
                                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                                  : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
                              )}
                            >
                              <div className="text-lg font-bold">{score}</div>
                              <div className={cn('text-[10px] leading-tight', selected ? 'text-white/90' : 'text-slate-500')}>
                                {scoreLabels[String(score)] || MOSS_SCORE_LABELS[score]}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {isEditable && assessorScore == null ? (
                        <p className="mt-3 mb-0 text-sm font-medium text-amber-700">
                          Select a maturity score (0–4) before moving to the next control.
                        </p>
                      ) : null}
                      {guidance ? (
                        <p className="mt-3 mb-0 text-sm text-slate-500">
                          <strong className="text-slate-700">Selected score guidance:</strong> {guidance}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="moss-score-rationale">Score Rationale</Label>
                      <Textarea
                        id="moss-score-rationale"
                        rows={3}
                        value={scoreRationale}
                        placeholder="Explain why this maturity score was selected..."
                        disabled={!isEditable}
                        onChange={(e) => {
                          setScoreRationale(e.target.value);
                          markDirty();
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="moss-assessor-comments">Assessor Comments</Label>
                      <Textarea
                        id="moss-assessor-comments"
                        rows={3}
                        value={comment}
                        placeholder="Optional assessor notes..."
                        disabled={!isEditable}
                        onChange={(e) => {
                          setComment(e.target.value);
                          markDirty();
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="moss-finding-text">Finding</Label>
                      <Textarea
                        id="moss-finding-text"
                        rows={3}
                        value={findingText}
                        placeholder="Record any control-specific finding..."
                        disabled={!isEditable}
                        onChange={(e) => {
                          setFindingText(e.target.value);
                          markDirty();
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={promotingFinding || !findingText.trim() || !isEditable}
                          onClick={() => void promoteFinding()}
                        >
                          {promotingFinding ? 'Promoting…' : 'Promote to structured finding'}
                        </Button>
                        <Link
                          href={`/moss/assessments/${assessmentId}/findings`}
                          className="text-sm font-medium text-slate-500 hover:text-slate-800"
                        >
                          View findings
                        </Link>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <FileUp className="size-4 text-slate-500" aria-hidden="true" />
                        <h4 className="m-0 text-sm font-bold text-slate-900">Evidence</h4>
                      </div>
                      <div className="mb-3">
                        <MethodologyBlock
                          title="Evidence Standards (catalogue methodology)"
                          value={evidenceStandards ?? controlState?.control.evidenceStandards}
                          defaultOpen
                        />
                      </div>
                      <p className="mb-3 text-xs text-slate-500">
                        Uploaded files are actual evidence — not the same as catalogue standards.
                      </p>
                      <input
                        type="file"
                        disabled={uploading || !isEditable}
                        onChange={(e) => void uploadEvidence(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-300"
                      />
                      {uploading ? <p className="mt-2 text-sm text-slate-500">Uploading…</p> : null}
                      <ul className="mt-3 m-0 list-none space-y-2 p-0">
                        {evidence.map((ev) => (
                          <li
                            key={ev.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                          >
                            <span className="min-w-0 text-sm">
                              <strong className="text-slate-900">{ev.title || ev.fileName}</strong>
                              <span className="text-slate-500"> · {ev.status}</span>
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={downloadingId === ev.id}
                              onClick={() => void downloadEvidence(ev)}
                            >
                              {downloadingId === ev.id ? 'Opening…' : 'Download'}
                            </Button>
                          </li>
                        ))}
                        {!evidence.length ? (
                          <li className="text-sm text-slate-500">No evidence uploaded yet.</li>
                        ) : null}
                      </ul>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={currentIndex <= 0}
                        onClick={() => void goRelative(-1)}
                        className="gap-1"
                      >
                        <ChevronLeft className="size-3.5" aria-hidden="true" />
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!isEditable}
                        onClick={() => void save()}
                        className="gap-1.5"
                      >
                        <Save className="size-3.5" aria-hidden="true" />
                        Save
                      </Button>
                      {!isLastControl ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={currentIndex < 0 || (isEditable && assessorScore == null)}
                          title={
                            isEditable && assessorScore == null
                              ? 'Select a maturity score (0–4) before continuing'
                              : undefined
                          }
                          onClick={() => void goRelative(1)}
                          className="gap-1"
                        >
                          Next
                          <ChevronRight className="size-3.5" aria-hidden="true" />
                        </Button>
                      ) : canSubmit ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={submitting}
                          className="bg-[#c41230] hover:bg-[#a10f28]"
                          onClick={() => void submitAssessment()}
                        >
                          {submitting ? 'Submitting…' : 'Submit for review'}
                        </Button>
                      ) : isSubmitted ? (
                        <span className="text-sm text-slate-500">Last control · Assessment submitted</span>
                      ) : allScored ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={submitting}
                          className="bg-[#c41230] hover:bg-[#a10f28]"
                          onClick={() => void submitAssessment()}
                        >
                          {submitting ? 'Submitting…' : 'Submit for review'}
                        </Button>
                      ) : (
                        <span className="text-sm text-slate-500">Last control</span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
