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
import { AuthGate } from '../../../components/AuthGate';
import { IndustryWithOtherField } from '../../../components/IndustryWithOtherField';
import { MoneyRangeSelector } from '../../../components/MoneyRangeSelector';
import { PercentRangeSelector } from '../../../components/PercentRangeSelector';
import { ZarCurrencyInput } from '../../../components/ZarCurrencyInput';
import { Shell } from '../../../components/Shell';
import { MetricCard, StatusBadge } from '../../../components/Ui';
import { ApiError, apiFetch, money, pct } from '../../../lib/api';
import { isIndustryValueComplete } from '../../../lib/scl-industry-other';
import { resolveNextQuestion } from '../../../lib/scl-question-nav';
import { splitOptionPresentation } from '../../../lib/scl-option-label';

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

  if (!data) return <AuthGate><div className="loading-screen">Loading assessment…</div></AuthGate>;

  const snapshot = data.scoreSnapshots?.[0];
  const leakage = snapshot?.leakageResult as any;
  const categoryScores = (snapshot?.categoryScores || []) as any[];
  const leftover = [...missing.missingInputs, ...missing.missingQuestions];
  const answeredCount = data.responses.filter((r: any) => r.responseOptionId).length;
  const selectedId = currentQuestion ? responseMap[currentQuestion.id]?.responseOptionId : '';

  return (
    <AuthGate>
      <Shell title={data.title} actions={<><StatusBadge value={data.status} /><Link className="btn secondary" href="/assessments">Back</Link></>}>
        {error && (
          <div className="error">
            <p style={{ margin: 0 }}>{error}</p>
            {leftover.length > 0 && (
              <div className="missing-chips">
                {missing.missingInputs.map((code) => (
                  <button key={code} type="button" className="missing-chip" onClick={() => setTab('profile')}>{code}</button>
                ))}
                {missing.missingQuestions.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className="missing-chip"
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
            )}
          </div>
        )}
        {notice && <p className="notice">{notice}</p>}

        <section className="assess-hero">
          <div>
            <p className="eyebrow">SCL Assessment · {data.reference}</p>
            <h2>{data.organisation.name}</h2>
            <p className="muted">{data.questionnaireVersion.questionnaire.name} · Version {data.questionnaireVersion.version}</p>
          </div>
          <div className="assess-hero-stats">
            <div><span>Overall</span><strong>{progress}%</strong></div>
            <div><span>Questions</span><strong>{answeredCount}/{questions.length}</strong></div>
            <div><span>Status</span><strong>{String(data.status).replace(/_/g, ' ')}</strong></div>
          </div>
          <div className="progress assess-progress"><span style={{ width: `${progress}%` }} /></div>
        </section>

        <div className="tabs">
          {[
            ['profile', 'Calibration', missing.missingInputs.length],
            ['questionnaire', 'Questionnaire', missing.missingQuestions.length],
            ['evidence', 'Evidence', 0],
            ['results', 'Results', 0],
          ].map(([key, label, count]) => (
            <button key={key as string} onClick={() => setTab(key as string)} className={tab === key ? 'active' : ''}>
              {label as string}
              {Number(count) > 0 && <span className="tab-missing">{count}</span>}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <section className="assess-stage">
            <div className="assess-stage-head">
              <div>
                <p className="eyebrow">Step {calStep + 1} of {CALIBRATION_GROUPS.length}</p>
                <h2>{currentGroup.title}</h2>
                <p className="muted">{currentGroup.hint}</p>
              </div>
              <div className="step-dots">
                {CALIBRATION_GROUPS.map((g, i) => (
                  <button key={g.id} type="button" className={`step-dot${i === calStep ? ' active' : ''}${g.codes.some((c) => missingSet.has(c)) ? ' alert' : ''}`} onClick={() => setCalStep(i)} aria-label={g.title} />
                ))}
              </div>
            </div>

            {groupInputs.some(
              (d: any) =>
                d.valueType === 'PERCENT' || (d.valueType === 'CURRENCY' && isSclMoneyLossCode(d.code)),
            ) && <p className="assess-cal-hint">Select an estimated range for each item below.</p>}
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
                          <button key={o} type="button" className={`choice-pill${String(value ?? '').toUpperCase() === o ? ' selected' : ''}`} onClick={() => saveInput(def, o)}>{o}</button>
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

            <div className="assess-nav">
              <button className="btn secondary" disabled={calStep === 0} onClick={() => setCalStep((s) => Math.max(0, s - 1))}>Back</button>
              {calStep < CALIBRATION_GROUPS.length - 1 ? (
                <button type="button" className="btn" onClick={() => setCalStep((s) => Math.min(CALIBRATION_GROUPS.length - 1, s + 1))}>Next</button>
              ) : (
                <button type="button" className="btn" onClick={() => { setTab('questionnaire'); setQIntro(false); setQIndex(0); }}>Next</button>
              )}
            </div>
          </section>
        )}

        {tab === 'questionnaire' && (
          <section className="assess-stage">
            {qIntro ? (
              <div className="assess-intro">
                <p className="eyebrow">Executive SCL questionnaire</p>
                <h2>Answer one focused question at a time</h2>
                <p className="muted">
                  {questions.length} controlled questions across {categories.length} dimensions. Each option carries a governed risk score — pick the best fit, not the longest answer.
                </p>
                <div className="intro-metrics">
                  <div><span>Questions</span><strong>{questions.length}</strong></div>
                  <div><span>Answered</span><strong>{answeredCount}</strong></div>
                  <div><span>Est. time</span><strong>~12 min</strong></div>
                </div>
                <div className="category-rail">
                  {categories.map((cat) => {
                    const inCat = questions.filter((q: any) => q.category === cat);
                    const done = inCat.filter((q: any) => responseMap[q.id]?.responseOptionId).length;
                    return (
                      <div key={cat} className="category-chip">
                        <strong>{cat}</strong>
                        <span>{done}/{inCat.length}</span>
                      </div>
                    );
                  })}
                </div>
                <button className="btn" onClick={() => { setQIntro(false); setQIndex(0); }}>
                  {answeredCount ? 'Resume assessment' : 'Begin assessment'}
                </button>
              </div>
            ) : currentQuestion && (
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
                  {questionError && (
                    <p className="field-error" role="alert" style={{ marginTop: 16, color: '#b91c1c', fontWeight: 650 }}>
                      {questionError}
                    </p>
                  )}
                </section>

                <footer className="scl-triage-nav">
                  <button type="button" className="btn secondary scl-triage-prev" onClick={goBackQuestion}>Previous</button>
                  {qIndex < questions.length - 1 ? (
                    <button type="button" className="btn scl-triage-next" onClick={goNextQuestion}>Next question</button>
                  ) : (
                    <div className="assess-nav-right" style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" className="btn secondary" disabled={busy} onClick={() => action(`/assessments/${id}/evaluate`, 'Scores recalculated.', true)}>Recalculate</button>
                      <button
                        type="button"
                        className="btn scl-triage-next"
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
                      </button>
                    </div>
                  )}
                </footer>
              </div>
            )}
          </section>
        )}

        {tab === 'evidence' && (
          <div className="grid two-col">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Evidence register</h2>
                  <p className="muted small">Upload contracts, SLAs, reports, reconciliations and assurance records.</p>
                </div>
                <label className="btn">Upload file<input type="file" hidden onChange={upload} /></label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Document</th><th>Status</th><th>Question</th><th>Uploaded</th></tr></thead>
                  <tbody>
                    {data.evidence.map((e: any) => (
                      <tr key={e.id}>
                        <td><strong>{e.title}</strong><br /><span className="muted small">{e.fileName}</span></td>
                        <td><StatusBadge value={e.status} /></td>
                        <td>{e.questionCode || 'General'}</td>
                        <td>{new Date(e.uploadedAt).toLocaleDateString('en-ZA')}</td>
                      </tr>
                    ))}
                    {!data.evidence.length && <tr><td colSpan={4} className="muted">No evidence uploaded.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="card">
              <h2>Evidence review rules</h2>
              <div className="list">
                {['Submitted', 'Under review', 'Verified', 'Partially verified', 'Rejected or missing'].map((x) => (
                  <div className="list-item" key={x}>
                    <strong>{x}</strong>
                    <span className="muted small">Risk and confidence remain separate; evidence improves confidence but does not erase a confirmed control gap.</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}

        {tab === 'results' && (
          <>
            {!snapshot ? (
              <div className="empty">Complete and evaluate the questionnaire to generate results.</div>
            ) : (
              <>
                <section className="results-hero">
                  <div>
                    <p className="eyebrow">Evaluation outcome</p>
                    <h2>{snapshot.riskBand}</h2>
                    <p className="muted">Exposure score {Number(snapshot.overallRiskScore).toFixed(1)}/100 · higher scores indicate greater exposure</p>
                  </div>
                  <div className="results-hero-leak">
                    <span>Modelled leakage estimate</span>
                    <strong>{money(leakage.likelyLeakageValue)}</strong>
                    <small>{pct(leakage.likelyLeakageRate)} of annual security spend · evidence validation required</small>
                  </div>
                </section>
                <div className="grid metrics">
                  <MetricCard label="Exposure score" value={`${Number(snapshot.overallRiskScore).toFixed(1)}/100`} detail={snapshot.riskBand} />
                  <MetricCard label="Evidence confidence" value={`${Number(snapshot.evidenceConfidence ?? 0).toFixed(1)}/100`} detail="Confidence in supporting evidence" />
                  <MetricCard label="Modelled leakage" value={money(leakage.likelyLeakageValue)} detail={pct(leakage.likelyLeakageRate)} />
                  <MetricCard label="Modelled recoverable range" value={`${money(leakage.recoverableLow)} – ${money(leakage.recoverableHigh)}`} detail={`Opportunity ${Number(snapshot.opportunityScore).toFixed(1)}/100`} />
                </div>
                <div className="grid two-col">
                  <section className="card">
                    <h2>Category risk profile</h2>
                    {categoryScores.map((c) => (
                      <div className="score-bar" key={c.category}>
                        <span>{c.category}</span>
                        <div className="score-track"><span style={{ width: `${Math.min(100, Number(c.score))}%` }} /></div>
                        <strong>{Number(c.score).toFixed(1)}</strong>
                      </div>
                    ))}
                    <h3 className="section-title">Modelled leakage range — validate against evidence</h3>
                    <div className="three-col grid">
                      <div className="risk-box"><span className="muted small">Minimum</span><strong style={{ display: 'block', fontSize: 20 }}>{money(leakage.minimumLeakageValue)}</strong><span>{pct(leakage.minimumLeakageRate)}</span></div>
                      <div className="risk-box"><span className="muted small">Likely</span><strong style={{ display: 'block', fontSize: 20 }}>{money(leakage.likelyLeakageValue)}</strong><span>{pct(leakage.likelyLeakageRate)}</span></div>
                      <div className="risk-box"><span className="muted small">Maximum</span><strong style={{ display: 'block', fontSize: 20 }}>{money(leakage.maximumExposureValue)}</strong><span>{pct(leakage.maximumExposureRate)}</span></div>
                    </div>
                  </section>
                  <aside className="card">
                    <h2>Priority recommendations</h2>
                    <div className="list">
                      {data.recommendations.map((r: any) => (
                        <div className="list-item" key={r.id}>
                          <StatusBadge value={r.priority} />
                          <strong style={{ marginTop: 8 }}>{r.title}</strong>
                          <span className="muted small">{r.summary}</span>
                          {r.serviceOffering && <p className="small"><strong>Engagement:</strong> {r.serviceOffering}</p>}
                        </div>
                      ))}
                      {!data.recommendations.length && <p className="muted">No rules triggered.</p>}
                    </div>
                  </aside>
                </div>
                <section className="card" style={{ marginTop: 18 }}>
                  <div className="card-header">
                    <div>
                      <h2>Report output</h2>
                      <p className="muted small">Generate the executive PDF, then open it to email the client with the report attached.</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn" disabled={busy} onClick={() => action(`/reports/assessment/${id}/generate`, 'Executive report generated.')}>Generate PDF report</button>
                    {data.reports?.[0] && <Link className="btn secondary" href={`/reports/${data.reports[0].id}`}>Open latest report</Link>}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </Shell>
    </AuthGate>
  );
}
