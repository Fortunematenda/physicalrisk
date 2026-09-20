'use client';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  filterSclActiveTriageQuestions,
  isMoneyRangeValue,
  isPercentRangeValue,
  isSclMoneyLossCode,
  type MoneyRangeValue,
  type PercentRangeValue,
} from '@moss/shared';
import { AuthGate } from '@/components/AuthGate';
import { CostLeakageBreadcrumb } from '@/components/assessments/CostLeakageBreadcrumb';
import { IndustryWithOtherField } from '@/components/IndustryWithOtherField';
import { MoneyRangeSelector } from '@/components/MoneyRangeSelector';
import { PercentRangeSelector } from '@/components/PercentRangeSelector';
import { ZarCurrencyInput } from '@/components/ZarCurrencyInput';
import { Shell } from '@/components/Shell';
import { MetricCard, StatusBadge } from '@/components/Ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, apiFetch, money, pct } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { isIndustryValueComplete } from '@/lib/scl-industry-other';
import { resolveNextQuestion } from '@/lib/scl-question-nav';
import { splitOptionPresentation } from '@/lib/scl-option-label';
import { cn } from '@/lib/utils';

type MissingFields = { missingInputs: string[]; missingQuestions: string[] };

const CALIBRATION_GROUPS = [
  { id: 'org', title: 'Organisation profile', hint: 'Who you are assessing', codes: ['C1', 'C2'] },
  { id: 'scale', title: 'Scale and spend', hint: 'Sites, force and contract value', codes: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'] },
  { id: 'tech', title: 'Technology and verification', hint: 'Coverage that drives leakage assumptions', codes: ['C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18'] },
  { id: 'allowance', title: 'Allowances and commercial flags', hint: 'Cost drivers that inflate leakage exposure', codes: ['C19', 'C20', 'C21', 'C22', 'C23'] },
];

function isFilled(value: unknown) {
  if (isPercentRangeValue(value) || isMoneyRangeValue(value)) return true;
  return value !== undefined && value !== null && value !== '';
}

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('profile');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<MissingFields>({ missingInputs: [], missingQuestions: [] });
  const [calStep, setCalStep] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [qIntro, setQIntro] = useState(true);
  const [savingOption, setSavingOption] = useState('');
  const [questionError, setQuestionError] = useState('');
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => apiFetch(`/assessments/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  function clearAdvanceTimer() {
    if (advanceTimerRef.current != null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  useEffect(() => () => clearAdvanceTimer(), []);

  const inputMap = useMemo(() => Object.fromEntries((data?.inputValues || []).map((x: any) => [x.inputDefinitionId, x.value])), [data]);
  const responseMap = useMemo(() => Object.fromEntries((data?.responses || []).map((x: any) => [x.questionId, x])), [data]);
  const questions = useMemo(
    () => filterSclActiveTriageQuestions((data?.questionnaireVersion?.questions || []) as any[]),
    [data],
  );
  const inputs = data?.questionnaireVersion?.inputDefinitions || [];

  const progress = useMemo(() => {
    if (!data) return 0;
    const total = inputs.length + questions.length;
    const answered = data.inputValues.length + data.responses.filter((r: any) => r.responseOptionId).length;
    return Math.round((answered / Math.max(1, total)) * 100);
  }, [data, inputs.length, questions.length]);

  const qProgress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round((data.responses.filter((r: any) => r.responseOptionId).length / questions.length) * 100);
  }, [data, questions.length]);

  const missingSet = useMemo(() => new Set([...missing.missingInputs, ...missing.missingQuestions]), [missing]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const q of questions) if (!seen.includes(q.category)) seen.push(q.category);
    return seen;
  }, [questions]);

  const currentQuestion = questions[qIndex];
  const currentGroup = CALIBRATION_GROUPS[calStep];
  const groupInputs = useMemo(
    () => inputs.filter((def: any) => currentGroup?.codes.includes(def.code)),
    [inputs, currentGroup],
  );

  useEffect(() => {
    if (!missing.missingQuestions.length || !questions.length) return;
    const idx = questions.findIndex((q: any) => missing.missingQuestions.includes(q.code));
    if (idx >= 0) {
      setTab('questionnaire');
      setQIntro(false);
      setQIndex(idx);
    }
  }, [missing.missingQuestions, questions]);

  useEffect(() => {
    if (!missing.missingInputs.length || !inputs.length) return;
    const code = missing.missingInputs[0];
    const groupIdx = CALIBRATION_GROUPS.findIndex((g) => g.codes.includes(code));
    if (groupIdx >= 0) {
      setTab('profile');
      setCalStep(groupIdx);
    }
  }, [missing.missingInputs, inputs.length]);

  function collectMissing(): MissingFields {
    if (!data) return { missingInputs: [], missingQuestions: [] };
    return {
      missingInputs: inputs
        .filter((def: any) => {
          if (!def.required) return false;
          const stored = inputMap[def.id];
          if (def.code === 'C2') return !isIndustryValueComplete(stored);
          return !isFilled(stored);
        })
        .map((def: any) => def.code),
      missingQuestions: questions.filter((q: any) => q.required && !responseMap[q.id]?.responseOptionId).map((q: any) => q.code),
    };
  }

  function applyMissing(next: MissingFields, fallbackMessage = 'Complete all required fields before evaluation.') {
    setMissing(next);
    const leftover = [...next.missingInputs, ...next.missingQuestions];
    setError(leftover.length ? `${fallbackMessage} Still needed: ${leftover.join(', ')}.` : fallbackMessage);
    if (next.missingInputs.length) setTab('profile');
    else if (next.missingQuestions.length) {
      setTab('questionnaire');
      setQIntro(false);
    }
  }

  function clearMissingCode(code: string) {
    setMissing((prev) => ({
      missingInputs: prev.missingInputs.filter((c) => c !== code),
      missingQuestions: prev.missingQuestions.filter((c) => c !== code),
    }));
  }

  async function saveInput(def: any, raw: any) {
    setError('');
    let value = raw;
    if (def.valueType === 'PERCENT') {
      if (isPercentRangeValue(raw)) {
        value = raw;
      } else {
        const n = Number(String(raw).replace(/[,\s]/g, ''));
        value = Number.isFinite(n) ? (n > 1 ? n / 100 : n) : 0;
      }
    }
    if (def.valueType === 'CURRENCY' && isSclMoneyLossCode(def.code) && isMoneyRangeValue(raw)) {
      value = raw;
    } else if (def.valueType === 'NUMBER' || def.valueType === 'CURRENCY') {
      const cleaned = String(raw ?? '').replace(/[Rr$€£]/g, '').replace(/[\s\u00A0,]/g, '').trim();
      const n = Number(cleaned);
      value = Number.isFinite(n) ? n : 0;
    }
    try {
      await apiFetch(`/assessments/${id}/inputs/${def.code}`, { method: 'PATCH', body: JSON.stringify({ value }) });
      setData((old: any) => ({
        ...old,
        inputValues: [...old.inputValues.filter((x: any) => x.inputDefinitionId !== def.id), { inputDefinitionId: def.id, value }],
      }));
      clearMissingCode(def.code);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveResponse(q: any, responseOptionId: string) {
    setSavingOption(responseOptionId);
    setError('');
    setQuestionError('');
    // Optimistic select so Next validation sees the answer immediately (no silent disable/race).
    setData((old: any) => ({
      ...old,
      responses: [
        ...old.responses.filter((x: any) => x.questionId !== q.id),
        { questionId: q.id, responseOptionId, responseOption: q.options.find((o: any) => o.id === responseOptionId), question: q },
      ],
    }));
    clearMissingCode(q.code);
    try {
      await apiFetch(`/assessments/${id}/responses/${q.code}`, { method: 'PATCH', body: JSON.stringify({ responseOptionId }) });
      // Do not auto-advance — user clicks Next.
    } catch (e: any) {
      setError(e.message);
      // Roll back optimistic select on failure.
      setData((old: any) => ({
        ...old,
        responses: old.responses.filter((x: any) => !(x.questionId === q.id && x.responseOptionId === responseOptionId)),
      }));
    } finally {
      setSavingOption('');
    }
  }

  function goNextQuestion() {
    if (!currentQuestion) return;
    const selected = responseMap[currentQuestion.id]?.responseOptionId;
    const result = resolveNextQuestion({
      qIndex,
      questionCount: questions.length,
      hasAnswer: !!selected,
    });
    if (!result.ok) {
      setQuestionError(result.error);
      return;
    }
    setQuestionError('');
    clearAdvanceTimer();
    if (result.nextIndex !== qIndex) setQIndex(result.nextIndex);
  }

  function goBackQuestion() {
    setQuestionError('');
    clearAdvanceTimer();
    if (qIndex <= 0) {
      setTab('profile');
      setCalStep(Math.max(0, CALIBRATION_GROUPS.length - 1));
      return;
    }
    setQIndex((i) => Math.max(0, i - 1));
  }

  async function action(path: string, message: string, requireComplete = false) {
    setBusy(true);
    setError('');
    setNotice('');
    if (requireComplete) {
      const localMissing = collectMissing();
      if (localMissing.missingInputs.length || localMissing.missingQuestions.length) {
        applyMissing(localMissing);
        setBusy(false);
        return;
      }
      setMissing({ missingInputs: [], missingQuestions: [] });
    }
    try {
      const result: any = await apiFetch(path, { method: 'POST' });
      setNotice(message);
      if (result?.downloadUrl) window.open(result.downloadUrl, '_blank');
      await load();
      if (path.includes('/submit') || path.includes('/evaluate')) setTab('results');
    } catch (e: any) {
      if (e instanceof ApiError && (e.details?.missingInputs || e.details?.missingQuestions)) {
        applyMissing(
          {
            missingInputs: e.details.missingInputs || [],
            missingQuestions: e.details.missingQuestions || [],
          },
          e.message,
        );
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('title', file.name);
    setBusy(true);
    try {
      await apiFetch(`/evidence/assessment/${id}`, { method: 'POST', body: form });
      setNotice('Evidence uploaded.');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  if (!data) {
    return (
      <AuthGate>
        <Shell
          title="Security Cost Leakage"
          hideSearch
          hideTitle
          headerLeading={<CostLeakageBreadcrumb current="…" />}
        >
          <p className="text-sm text-slate-500">Loading assessment…</p>
        </Shell>
      </AuthGate>
    );
  }

  const snapshot = data.scoreSnapshots?.[0];
  const leakage = snapshot?.leakageResult as any;
  const categoryScores = (snapshot?.categoryScores || []) as any[];
  const leftover = [...missing.missingInputs, ...missing.missingQuestions];
  const answeredCount = data.responses.filter((r: any) => r.responseOptionId).length;
  const selectedId = currentQuestion ? responseMap[currentQuestion.id]?.responseOptionId : '';
  const statusLabel = String(data.status || '').replace(/_/g, ' ');

  const tabs: Array<{ key: string; label: string; count: number }> = [
    { key: 'profile', label: 'Calibration', count: missing.missingInputs.length },
    { key: 'questionnaire', label: 'Questionnaire', count: missing.missingQuestions.length },
    { key: 'evidence', label: 'Evidence', count: 0 },
    { key: 'results', label: 'Results', count: 0 },
  ];

  return (
    <AuthGate>
      <Shell
        title={data.title || 'Security Cost Leakage'}
        hideSearch
        hideTitle
        headerLeading={<CostLeakageBreadcrumb current={data.reference || data.title || 'Assessment'} />}
      >
        <div className="space-y-4 pb-8">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="m-0">{error}</p>
              {leftover.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.missingInputs.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      onClick={() => setTab('profile')}
                    >
                      {code}
                    </button>
                  ))}
                  {missing.missingQuestions.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      onClick={() => {
                        const idx = questions.findIndex((q: any) => q.code === code);
                        setTab('questionnaire');
                        setQIntro(false);
                        if (idx >= 0) setQIndex(idx);
                      }}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <p className="m-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          ) : null}

          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    SCL Assessment · {data.reference}
                  </p>
                  <h1 className="m-0 text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                    {data.organisation.name}
                  </h1>
                  <p className="m-0 text-sm text-slate-500">
                    {data.title}
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                    {data.questionnaireVersion.questionnaire.name} · Version {data.questionnaireVersion.version}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={data.status} />
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                      {answeredCount}/{questions.length} questions
                    </Badge>
                  </div>
                </div>
                <div className="grid min-w-[200px] grid-cols-3 gap-2 sm:min-w-[280px]">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-center">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overall</p>
                    <p className="m-0 mt-0.5 text-lg font-semibold text-slate-900">{progress}%</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-center">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Answered</p>
                    <p className="m-0 mt-0.5 text-lg font-semibold text-slate-900">{answeredCount}/{questions.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-center">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <p className="m-0 mt-0.5 text-sm font-semibold capitalize text-slate-900">{statusLabel}</p>
                  </div>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  tab === key
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800',
                )}
              >
                {label}
                {count > 0 ? (
                  <Badge variant="warning" className="h-5 min-w-5 justify-center px-1.5">
                    {count}
                  </Badge>
                ) : null}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-5 sm:p-6">
                <div className="min-w-0 space-y-1">
                  <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Step {calStep + 1} of {CALIBRATION_GROUPS.length}
                  </p>
                  <CardTitle className="text-lg">{currentGroup.title}</CardTitle>
                  <CardDescription>{currentGroup.hint}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CALIBRATION_GROUPS.map((g, i) => (
                    <button
                      key={g.id}
                      type="button"
                      aria-label={g.title}
                      onClick={() => setCalStep(i)}
                      className={cn(
                        'size-2.5 rounded-full transition-colors',
                        i === calStep ? 'bg-slate-900' : 'bg-slate-300 hover:bg-slate-400',
                        g.codes.some((c) => missingSet.has(c)) && i !== calStep && 'bg-amber-400',
                      )}
                    />
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
                {groupInputs.some(
                  (d: any) =>
                    d.valueType === 'PERCENT' || (d.valueType === 'CURRENCY' && isSclMoneyLossCode(d.code)),
                ) && (
                  <p className="m-0 text-sm text-slate-500">Select an estimated range for each item below.</p>
                )}
                <div className="form-grid assess-cal-grid">
                  {groupInputs.map((def: any) => {
                    const stored = inputMap[def.id];
                    const value = stored;
                    const isMissing = missingSet.has(def.code);
                    return (
                      <div className={`field${isMissing ? ' missing' : ''}`} key={def.id} data-field-code={def.code}>
                        <label>
                          <span className="field-code">{def.code}</span>
                          {def.label}
                          {def.required && <span className="req">*</span>}
                          {isMissing && <span className="missing-tag">Required</span>}
                        </label>
                        {def.valueType === 'SELECT' && def.code === 'C2' ? (
                          <IndustryWithOtherField
                            variant="pills"
                            options={def.options || []}
                            value={value}
                            onChange={(next) => void saveInput(def, next)}
                          />
                        ) : def.valueType === 'SELECT' ? (
                          <div className="choice-grid">
                            {(def.options || []).map((o: string) => (
                              <button
                                key={o}
                                type="button"
                                className={`choice-pill${String(value ?? '') === o ? ' selected' : ''}`}
                                onClick={() => saveInput(def, o)}
                              >
                                {o}
                              </button>
                            ))}
                          </div>
                        ) : def.valueType === 'BOOLEAN' ? (
                          <div className="choice-grid dual">
                            {['YES', 'NO'].map((o) => (
                              <button
                                key={o}
                                type="button"
                                className={`choice-pill${String(value ?? '').toUpperCase() === o ? ' selected' : ''}`}
                                onClick={() => saveInput(def, o)}
                              >
                                {o}
                              </button>
                            ))}
                          </div>
                        ) : def.valueType === 'PERCENT' ? (
                          <PercentRangeSelector
                            value={stored}
                            onChange={(next: PercentRangeValue) => void saveInput(def, next)}
                          />
                        ) : def.valueType === 'CURRENCY' && isSclMoneyLossCode(def.code) ? (
                          <MoneyRangeSelector
                            value={stored}
                            onChange={(next: MoneyRangeValue) => void saveInput(def, next)}
                          />
                        ) : def.code === 'C5' && def.valueType === 'CURRENCY' ? (
                          <ZarCurrencyInput value={stored} id={def.id} step={100000} onCommit={(next) => void saveInput(def, next)} />
                        ) : (
                          <input
                            key={`${def.id}-${stored === undefined ? 'empty' : 'set'}`}
                            type={def.valueType === 'TEXT' ? 'text' : 'number'}
                            step="1"
                            min={def.valueType === 'NUMBER' || def.valueType === 'CURRENCY' ? 0 : undefined}
                            defaultValue={stored === undefined ? '' : (stored ?? '')}
                            onBlur={(e) => saveInput(def, e.target.value)}
                            id={def.id}
                          />
                        )}
                        {def.guidance ? <small>{def.guidance}</small> : null}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={calStep === 0}
                    onClick={() => setCalStep((s) => Math.max(0, s - 1))}
                  >
                    Back
                  </Button>
                  {calStep < CALIBRATION_GROUPS.length - 1 ? (
                    <Button
                      type="button"
                      onClick={() => setCalStep((s) => Math.min(CALIBRATION_GROUPS.length - 1, s + 1))}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        setTab('questionnaire');
                        setQIntro(false);
                        setQIndex(0);
                      }}
                    >
                      Next
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'questionnaire' && (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                {qIntro ? (
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Executive SCL questionnaire
                      </p>
                      <h2 className="m-0 text-xl font-semibold text-slate-900">
                        Answer one focused question at a time
                      </h2>
                      <p className="m-0 text-sm text-slate-500">
                        {questions.length} controlled questions across {categories.length} dimensions. Each option carries a governed risk score — pick the best fit, not the longest answer.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Questions</p>
                        <p className="m-0 mt-0.5 text-lg font-semibold text-slate-900">{questions.length}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Answered</p>
                        <p className="m-0 mt-0.5 text-lg font-semibold text-slate-900">{answeredCount}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Est. time</p>
                        <p className="m-0 mt-0.5 text-lg font-semibold text-slate-900">~12 min</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => {
                        const inCat = questions.filter((q: any) => q.category === cat);
                        const done = inCat.filter((q: any) => responseMap[q.id]?.responseOptionId).length;
                        return (
                          <div
                            key={cat}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                          >
                            <strong className="font-medium text-slate-800">{cat}</strong>
                            <span className="text-slate-500">{done}/{inCat.length}</span>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        setQIntro(false);
                        setQIndex(0);
                      }}
                    >
                      {answeredCount ? 'Resume assessment' : 'Begin assessment'}
                    </Button>
                  </div>
                ) : currentQuestion ? (
                  <div className="scl-triage">
                    <header className="scl-triage-progress">
                      <div className="scl-triage-progress-top">
                        <div>
                          <p className="scl-triage-series">Security Cost Leakage</p>
                          <p className="scl-triage-counter">
                            Question {qIndex + 1} of {questions.length}
                          </p>
                        </div>
                        <p className="scl-triage-pct">{qProgress}% complete</p>
                      </div>
                      <div
                        className="scl-triage-bar"
                        role="progressbar"
                        aria-valuenow={qProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ width: `${qProgress}%` }} />
                      </div>
                    </header>

                    <section className={`scl-triage-card${missingSet.has(currentQuestion.code) ? ' missing-border' : ''}`}>
                      <p className="scl-triage-category">{currentQuestion.category}</p>
                      <h2 className="scl-triage-question">{currentQuestion.text}</h2>
                      <p className="scl-triage-prompt">Select the response that best reflects the current position.</p>
                      {currentQuestion.evidenceHint ? (
                        <p className="evidence-hint" style={{ marginTop: -8, marginBottom: 18 }}>
                          <strong>Suggested evidence:</strong> {currentQuestion.evidenceHint}
                        </p>
                      ) : null}
                      <div className="scl-triage-options" role="radiogroup" aria-label="Response options">
                        {[...currentQuestion.options].sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((o: any) => {
                          const selected = selectedId === o.id;
                          const { title, description } = splitOptionPresentation(o.label);
                          return (
                            <button
                              key={o.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={`scl-triage-option${selected ? ' selected' : ''}`}
                              disabled={!!savingOption}
                              onClick={() => saveResponse(currentQuestion, o.id)}
                            >
                              <span className="scl-triage-radio" aria-hidden="true" />
                              <span className="scl-triage-option-copy">
                                <strong>{title}</strong>
                                {description ? <span>{description}</span> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {questionError ? (
                        <p className="field-error" role="alert" style={{ marginTop: 16, color: '#b91c1c', fontWeight: 650 }}>
                          {questionError}
                        </p>
                      ) : null}
                    </section>

                    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                      <Button type="button" variant="outline" onClick={goBackQuestion}>
                        Previous
                      </Button>
                      {qIndex < questions.length - 1 ? (
                        <Button type="button" onClick={goNextQuestion}>
                          Next question
                        </Button>
                      ) : (
                        <div className="ml-auto flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => action(`/assessments/${id}/evaluate`, 'Scores recalculated.', true)}
                          >
                            Recalculate
                          </Button>
                          <Button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (!selectedId) {
                                setQuestionError('Please select an answer before submitting.');
                                return;
                              }
                              setQuestionError('');
                              action(`/assessments/${id}/submit`, 'Assessment evaluated successfully.', true);
                            }}
                          >
                            Submit and evaluate
                          </Button>
                        </div>
                      )}
                    </footer>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {tab === 'evidence' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-5 sm:p-6">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base">Evidence register</CardTitle>
                    <CardDescription>
                      Upload contracts, SLAs, reports, reconciliations and assurance records.
                    </CardDescription>
                  </div>
                  <Button asChild>
                    <label className="cursor-pointer">
                      Upload file
                      <input type="file" hidden onChange={upload} />
                    </label>
                  </Button>
                </CardHeader>
                <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Document</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Question</th>
                          <th className="px-3 py-2 font-semibold">Uploaded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.evidence.map((e: any) => (
                          <tr key={e.id} className="border-t border-slate-100">
                            <td className="px-3 py-2.5">
                              <strong className="font-medium text-slate-900">{e.title}</strong>
                              <br />
                              <span className="text-xs text-slate-500">{e.fileName}</span>
                            </td>
                            <td className="px-3 py-2.5"><StatusBadge value={e.status} /></td>
                            <td className="px-3 py-2.5 text-slate-600">{e.questionCode || 'General'}</td>
                            <td className="px-3 py-2.5 text-slate-600">{formatDate(e.uploadedAt)}</td>
                          </tr>
                        ))}
                        {!data.evidence.length ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                              No evidence uploaded.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
                  <CardTitle className="text-base">Evidence review rules</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                  {['Submitted', 'Under review', 'Verified', 'Partially verified', 'Rejected or missing'].map((x) => (
                    <div key={x} className="space-y-0.5 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <p className="m-0 text-sm font-medium text-slate-900">{x}</p>
                      <p className="m-0 text-xs text-slate-500">
                        Risk and confidence remain separate; evidence improves confidence but does not erase a confirmed control gap.
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'results' && (
            <>
              {!snapshot ? (
                <Card className="rounded-xl border-slate-200 shadow-sm">
                  <CardContent className="p-8 text-center text-sm text-slate-500">
                    Complete and evaluate the questionnaire to generate results.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
                      <div className="min-w-0 space-y-1">
                        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Evaluation outcome
                        </p>
                        <h2 className="m-0 text-2xl font-semibold text-slate-900">{snapshot.riskBand}</h2>
                        <p className="m-0 text-sm text-slate-500">
                          Exposure score {Number(snapshot.overallRiskScore).toFixed(1)}/100 · higher scores indicate greater exposure
                        </p>
                      </div>
                      <div className="min-w-[200px] rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Modelled leakage estimate
                        </p>
                        <p className="m-0 mt-1 text-xl font-semibold text-slate-900">
                          {money(leakage.likelyLeakageValue)}
                        </p>
                        <p className="m-0 mt-0.5 text-xs text-slate-500">
                          {pct(leakage.likelyLeakageRate)} of annual security spend · evidence validation required
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Exposure score" value={`${Number(snapshot.overallRiskScore).toFixed(1)}/100`} detail={snapshot.riskBand} />
                    <MetricCard label="Evidence confidence" value={`${Number(snapshot.evidenceConfidence ?? 0).toFixed(1)}/100`} detail="Confidence in supporting evidence" />
                    <MetricCard label="Modelled leakage" value={money(leakage.likelyLeakageValue)} detail={pct(leakage.likelyLeakageRate)} />
                    <MetricCard label="Modelled recoverable range" value={`${money(leakage.recoverableLow)} – ${money(leakage.recoverableHigh)}`} detail={`Opportunity ${Number(snapshot.opportunityScore).toFixed(1)}/100`} />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
                        <CardTitle className="text-base">Category risk profile</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                        {categoryScores.map((c) => (
                          <div className="score-bar" key={c.category}>
                            <span>{c.category}</span>
                            <div className="score-track"><span style={{ width: `${Math.min(100, Number(c.score))}%` }} /></div>
                            <strong>{Number(c.score).toFixed(1)}</strong>
                          </div>
                        ))}
                        <h3 className="section-title !mt-4">Modelled leakage range — validate against evidence</h3>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                            <span className="text-xs text-slate-500">Minimum</span>
                            <strong className="mt-0.5 block text-lg text-slate-900">{money(leakage.minimumLeakageValue)}</strong>
                            <span className="text-xs text-slate-500">{pct(leakage.minimumLeakageRate)}</span>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                            <span className="text-xs text-slate-500">Likely</span>
                            <strong className="mt-0.5 block text-lg text-slate-900">{money(leakage.likelyLeakageValue)}</strong>
                            <span className="text-xs text-slate-500">{pct(leakage.likelyLeakageRate)}</span>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                            <span className="text-xs text-slate-500">Maximum</span>
                            <strong className="mt-0.5 block text-lg text-slate-900">{money(leakage.maximumExposureValue)}</strong>
                            <span className="text-xs text-slate-500">{pct(leakage.maximumExposureRate)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border-slate-200 shadow-sm">
                      <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
                        <CardTitle className="text-base">Priority recommendations</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                        {data.recommendations.map((r: any) => (
                          <div key={r.id} className="space-y-1 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                            <StatusBadge value={r.priority} />
                            <p className="m-0 text-sm font-medium text-slate-900">{r.title}</p>
                            <p className="m-0 text-xs text-slate-500">{r.summary}</p>
                            {r.serviceOffering ? (
                              <p className="m-0 text-xs text-slate-600">
                                <strong>Engagement:</strong> {r.serviceOffering}
                              </p>
                            ) : null}
                          </div>
                        ))}
                        {!data.recommendations.length ? (
                          <p className="m-0 text-sm text-slate-500">No rules triggered.</p>
                        ) : null}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="rounded-xl border-slate-200 shadow-sm">
                    <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
                      <CardTitle className="text-base">Report output</CardTitle>
                      <CardDescription>
                        Generate the executive PDF, then open it to email the client with the report attached.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2 px-5 pb-5 sm:px-6 sm:pb-6">
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => action(`/reports/assessment/${id}/generate`, 'Executive report generated.')}
                      >
                        Generate PDF report
                      </Button>
                      {data.reports?.[0] ? (
                        <Button asChild variant="outline">
                          <Link href={`/reports/${data.reports[0].id}`}>Open latest report</Link>
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </Shell>
    </AuthGate>
  );
}
