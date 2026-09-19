'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  exposureToAssuranceScore,
  getAssuranceBand,
  getEadModuleCriteria,
  isCountableEadEvidenceStatus,
  likertOptionsForCriterion,
  parseDiagnosticResponses,
  resolveEgtAssuranceVisual,
  scoreEadDiagnosticCriteria,
  type EadDiagnosticAnswers,
  type EadDiagnosticCriterion,
  type EadLikertValue,
} from '@moss/shared';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Settings2, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ManageDiagnosticQuestionsDialog, type AssessmentDiagnosticQuestion } from './ManageDiagnosticQuestionsDialog';

type EvidenceRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  moduleCode?: string | null;
  status?: string;
  uploadedAt: string;
};

function countableEvidence(rows: EvidenceRow[]) {
  return rows.filter((row) => isCountableEadEvidenceStatus(row.status));
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(mime: string, name: string) {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'file';
}

export function EadDiagnosticPanel({
  assessmentId,
  moduleCode,
  moduleName,
  diagnosticResponses,
  legacyExposureRating,
  locked,
  busy,
  criteria: criteriaProp,
  questions = [],
  onAnswersChange,
  onQuestionsChanged,
  onEvidenceChange,
}: {
  assessmentId: string;
  moduleCode: string;
  moduleName?: string;
  diagnosticResponses?: unknown;
  legacyExposureRating?: number | null;
  locked: boolean;
  busy: boolean;
  criteria?: EadDiagnosticCriterion[];
  questions?: AssessmentDiagnosticQuestion[];
  onAnswersChange: (answers: EadDiagnosticAnswers) => void;
  onQuestionsChanged?: () => Promise<void> | void;
  /** Fired whenever the module-scoped evidence list changes (upload/delete/load). */
  onEvidenceChange?: (count: number) => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const criteria = useMemo(() => {
    if (criteriaProp?.length) return criteriaProp;
    return getEadModuleCriteria(moduleCode) || [];
  }, [criteriaProp, moduleCode]);
  const initial = useMemo(() => parseDiagnosticResponses(diagnosticResponses), [diagnosticResponses]);
  const [answers, setAnswers] = useState<EadDiagnosticAnswers>(initial?.answers || {});
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAnswers(initial?.answers || {});
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiFetch<EvidenceRow[]>(
          `/evidence/assessment/${assessmentId}?moduleCode=${encodeURIComponent(moduleCode)}`,
        );
        if (!cancelled) {
          setEvidence(rows);
          setEvidenceError('');
          onEvidenceChange?.(countableEvidence(rows).length);
        }
      } catch (e: any) {
        if (!cancelled) {
          setEvidence([]);
          setEvidenceError(e?.message || 'Unable to load evidence.');
          onEvidenceChange?.(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally omit onEvidenceChange from deps — parent passes inline callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, moduleCode]);

  const scored = useMemo(() => scoreEadDiagnosticCriteria(criteria, answers), [criteria, answers]);
  const hasStructured = scored.answeredCount > 0;
  const legacyAssurance =
    !hasStructured && legacyExposureRating != null && Number.isFinite(Number(legacyExposureRating))
      ? exposureToAssuranceScore(Number(legacyExposureRating))
      : null;
  const displayAssurance = hasStructured ? scored.assuranceScore : legacyAssurance;
  const displayVisual =
    displayAssurance == null ? null : resolveEgtAssuranceVisual(displayAssurance);
  const displayBand = displayAssurance == null ? null : getAssuranceBand(displayAssurance);
  const exposureLabel = scored.exposureBand;

  function setAnswer(code: string, value: EadLikertValue) {
    const next = { ...answers, [code]: value };
    setAnswers(next);
    onAnswersChange(next);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || locked) return;
    setEvidenceBusy(true);
    setEvidenceError('');
    try {
      const uploaded: EvidenceRow[] = [];
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        body.append('moduleCode', moduleCode);
        body.append('title', file.name);
        body.append('documentType', 'ADVISORY_MODULE_EVIDENCE');
        const row = await apiFetch<EvidenceRow>(`/evidence/assessment/${assessmentId}`, {
          method: 'POST',
          body,
        });
        uploaded.push(row);
      }
      setEvidence((prev) => {
        const next = [...uploaded, ...prev];
        onEvidenceChange?.(countableEvidence(next).length);
        return next;
      });
    } catch (e: any) {
      setEvidenceError(e?.message || 'Upload failed.');
    } finally {
      setEvidenceBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeEvidence(id: string) {
    if (locked) return;
    setEvidenceBusy(true);
    setEvidenceError('');
    try {
      await apiFetch(`/evidence/${id}`, { method: 'DELETE' });
      setEvidence((prev) => {
        const next = prev.filter((e) => e.id !== id);
        onEvidenceChange?.(countableEvidence(next).length);
        return next;
      });
    } catch (e: any) {
      setEvidenceError(e?.message || 'Remove failed.');
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function openEvidence(id: string) {
    const res = await apiFetch<{ url: string }>(`/evidence/${id}/download`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  }

  if (!criteria.length) {
    return (
      <p className="m-0 text-sm text-slate-500">
        Structured diagnostic criteria are not configured for this module.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-semibold text-slate-800">Assurance score</p>
            <p className="m-0 mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {displayAssurance == null ? '—' : Math.round(displayAssurance)}
              <span className="text-base font-medium text-slate-500"> / 100</span>
            </p>
            <p className="m-0 mt-1 text-xs text-slate-500">
              {hasStructured
                ? 'Calculated automatically from the diagnostic responses below.'
                : legacyAssurance != null
                  ? 'Legacy score from a previous manual entry. Answer the criteria below to recalculate.'
                  : 'Answer the diagnostic criteria below to calculate the score.'}
            </p>
          </div>
          {displayBand && displayVisual ? (
            <div className="text-right">
              <Badge
                className="shrink-0 px-2.5 py-1 text-sm"
                style={{
                  backgroundColor: displayVisual.panelHex,
                  color: displayVisual.textHex,
                  borderColor: displayVisual.colourHex,
                  borderWidth: 1,
                }}
              >
                {displayBand.displayLabel}
              </Badge>
              {exposureLabel ? (
                <p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {exposureLabel === 'Critical' || exposureLabel === 'High'
                    ? `${exposureLabel} exposure`
                    : exposureLabel === 'Moderate'
                      ? 'Moderate exposure'
                      : 'Controlled'}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="relative flex h-2.5 w-full overflow-hidden rounded-full">
            {/* Assurance direction: 0 Critical (left) → 100 Controlled (right) */}
            <div className="h-full bg-red-600" style={{ width: '40%' }} title="Priority / Critical 0–39" />
            <div className="h-full bg-orange-500" style={{ width: '20%' }} title="Improve / High 40–59" />
            <div className="h-full bg-amber-400" style={{ width: '20%' }} title="Moderate 60–79" />
            <div className="h-full bg-emerald-500" style={{ width: '20%' }} title="Strong / Controlled 80–100" />
            {displayAssurance != null ? (
              <span
                className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow"
                style={{ left: `${Math.min(100, Math.max(0, displayAssurance))}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
          <div className="flex justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Critical</span>
            <span>High</span>
            <span>Moderate</span>
            <span>Controlled</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="m-0 text-sm font-semibold text-slate-900">Diagnostic criteria</h3>
            <p className="m-0 mt-1 text-xs text-slate-500">
              Select one answer per criterion. The assurance score updates automatically.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy || locked}
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="size-3.5" />
            Manage questions
          </Button>
        </div>
        {criteria.map((criterion) => {
          const options = likertOptionsForCriterion(criterion.allowNa);
          const selected = answers[criterion.code] || '';
          return (
            <fieldset key={criterion.code} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-900">{criterion.title}</legend>
              <p className="m-0 text-sm text-slate-600">{criterion.question}</p>
              <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label={`${criterion.title} response`}>
                {options.map((opt) => {
                  const active = selected === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={locked || busy}
                      title={opt.helpText}
                      aria-pressed={active}
                      aria-label={`${opt.label}${opt.helpText ? `. ${opt.helpText}` : ''}`}
                      onClick={() => setAnswer(criterion.code, opt.value)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                        active
                          ? 'border-[#c41230] bg-[#fdecee] text-[#c41230]'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                        (locked || busy) && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      {opt.shortLabel}
                    </button>
                  );
                })}
              </div>
              {selected === 'NOT_AWARE' ? (
                <p className="m-0 text-xs text-slate-500">
                  Consider documenting the visibility or governance gap in the Finding or Supporting
                  evidence / limitation.
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label className="text-sm font-semibold text-slate-900">Supporting evidence files</Label>
            <p className="m-0 mt-0.5 text-xs text-slate-500">
              Upload supporting evidence for this module, or record an explicit evidence limitation below.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={locked || busy || evidenceBusy}
            onClick={() => fileRef.current?.click()}
          >
            {evidenceBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            Add supporting evidence
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,image/*"
            disabled={locked || busy || evidenceBusy}
            onChange={(e) => void uploadFiles(e.target.files)}
          />
        </div>
        {evidenceError ? <p className="m-0 text-xs font-medium text-red-700">{evidenceError}</p> : null}
        {evidence.length ? (
          <ul className="m-0 space-y-2 p-0">
            {evidence.map((row) => {
              const kind = fileKind(row.mimeType, row.fileName);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {kind === 'image' ? (
                      <ImageIcon className="size-4 shrink-0 text-slate-500" />
                    ) : kind === 'pdf' ? (
                      <FileText className="size-4 shrink-0 text-slate-500" />
                    ) : (
                      <Paperclip className="size-4 shrink-0 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-medium text-slate-900">{row.fileName}</p>
                      <p className="m-0 text-[11px] text-slate-500">
                        {row.mimeType || 'file'} · {formatBytes(row.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[#c41230] hover:underline"
                      onClick={() => void openEvidence(row.id)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-slate-600 hover:underline"
                      onClick={() => void openEvidence(row.id)}
                    >
                      Download
                    </button>
                    {!locked ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-700"
                        disabled={evidenceBusy}
                        onClick={() => void removeEvidence(row.id)}
                      >
                        <Trash2 className="size-3.5" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 text-xs text-slate-400">No files attached yet.</p>
        )}
      </div>

      <ManageDiagnosticQuestionsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        assessmentId={assessmentId}
        moduleCode={moduleCode}
        moduleName={moduleName || moduleCode}
        questions={questions}
        locked={locked}
        onChanged={async () => {
          await onQuestionsChanged?.();
        }}
      />
    </div>
  );
}

/** @deprecated Prefer EadDiagnosticPanel with moduleCode */
export function ConsequenceDiagnosticPanel(
  props: Omit<Parameters<typeof EadDiagnosticPanel>[0], 'moduleCode'> & { moduleCode?: string },
) {
  return <EadDiagnosticPanel {...props} moduleCode={props.moduleCode || 'CONSEQUENCE'} />;
}
