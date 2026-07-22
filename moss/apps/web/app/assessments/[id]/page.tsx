'use client';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { MetricCard, StatusBadge } from '../../../components/Ui';
import { ApiError, apiFetch, money, pct } from '../../../lib/api';

type MissingFields = { missingInputs: string[]; missingQuestions: string[] };

const CALIBRATION_GROUPS = [
  { id: 'org', title: 'Organisation profile', hint: 'Who you are assessing', codes: ['C1', 'C2'] },
  { id: 'scale', title: 'Scale and spend', hint: 'Sites, force and contract value', codes: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'] },
  { id: 'tech', title: 'Technology and verification', hint: 'Coverage that drives leakage assumptions', codes: ['C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18'] },
  { id: 'allowance', title: 'Allowances and commercial flags', hint: 'Cost drivers that inflate leakage exposure', codes: ['C19', 'C20', 'C21', 'C22', 'C23'] },
];

function isFilled(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function riskTone(score: number) {
  if (score <= 25) return 'low';
  if (score <= 55) return 'mid';
  return 'high';
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

  const load = useCallback(() => apiFetch(`/assessments/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const inputMap = useMemo(() => Object.fromEntries((data?.inputValues || []).map((x: any) => [x.inputDefinitionId, x.value])), [data]);
  const responseMap = useMemo(() => Object.fromEntries((data?.responses || []).map((x: any) => [x.questionId, x])), [data]);
  const questions = data?.questionnaireVersion?.questions || [];
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
      missingInputs: inputs.filter((def: any) => def.required && !isFilled(inputMap[def.id])).map((def: any) => def.code),
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
    if (def.valueType === 'PERCENT') value = Number(raw) / 100;
    if (def.valueType === 'NUMBER' || def.valueType === 'CURRENCY') value = Number(raw);
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

  async function saveResponse(q: any, responseOptionId: string, advance = false) {
    setSavingOption(responseOptionId);
    setError('');
    try {
      await apiFetch(`/assessments/${id}/responses/${q.code}`, { method: 'PATCH', body: JSON.stringify({ responseOptionId }) });
      setData((old: any) => ({
        ...old,
        responses: [
          ...old.responses.filter((x: any) => x.questionId !== q.id),
          { questionId: q.id, responseOptionId, responseOption: q.options.find((o: any) => o.id === responseOptionId), question: q },
        ],
      }));
      clearMissingCode(q.code);
      if (advance && qIndex < questions.length - 1) {
        window.setTimeout(() => setQIndex((i) => Math.min(i + 1, questions.length - 1)), 220);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingOption('');
    }
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
            <p className="eyebrow">{data.reference}</p>
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
                    {def.valueType === 'SELECT' ? (
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
                    ) : (
                      <input
                        key={`${def.id}-${stored === undefined ? 'empty' : 'set'}`}
                        type={def.valueType === 'TEXT' ? 'text' : 'number'}
                        step={def.valueType === 'PERCENT' ? '0.1' : '1'}
                        defaultValue={stored === undefined ? '' : (def.valueType === 'PERCENT' ? Number(stored || 0) * 100 : stored ?? '')}
                        onBlur={(e) => saveInput(def, e.target.value)}
                        id={def.id}
                      />
                    )}
                    <small>{def.guidance}{def.valueType === 'PERCENT' ? ' Enter as 0–100%.' : ''}</small>
                  </div>
                );
              })}
            </div>

            <div className="assess-nav">
              <button className="btn secondary" disabled={calStep === 0} onClick={() => setCalStep((s) => Math.max(0, s - 1))}>Back</button>
              {calStep < CALIBRATION_GROUPS.length - 1 ? (
                <button className="btn" onClick={() => setCalStep((s) => Math.min(CALIBRATION_GROUPS.length - 1, s + 1))}>Continue</button>
              ) : (
                <button className="btn" onClick={() => { setTab('questionnaire'); setQIntro(true); }}>Start questionnaire</button>
              )}
            </div>
          </section>
        )}

        {tab === 'questionnaire' && (
          <section className="assess-stage">
            {qIntro ? (
              <div className="assess-intro">
                <p className="eyebrow">Executive SCLI questionnaire</p>
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
              <>
                <div className="assess-stage-head">
                  <div>
                    <p className="eyebrow">{currentQuestion.category}</p>
                    <p className="q-counter">Question {qIndex + 1} of {questions.length}</p>
                  </div>
                  <div className="q-progress-wrap">
                    <span>{qProgress}% complete</span>
                    <div className="progress"><span style={{ width: `${qProgress}%` }} /></div>
                  </div>
                </div>

                <div className={`question-focus${missingSet.has(currentQuestion.code) ? ' missing' : ''}`} data-field-code={currentQuestion.code}>
                  <div className="question-focus-meta">
                    <span className="question-code">{currentQuestion.code}</span>
                    <span className="question-weight">Weight {Number(currentQuestion.weight)}</span>
                    {missingSet.has(currentQuestion.code) && <span className="missing-tag">Required</span>}
                  </div>
                  <h2 className="question-focus-title">{currentQuestion.text}</h2>
                  <p className="evidence-hint"><strong>Suggested evidence:</strong> {currentQuestion.evidenceHint}</p>

                  <div className="option-list">
                    {[...currentQuestion.options].sort((a: any, b: any) => a.sortOrder - b.sortOrder).map((o: any) => {
                      const selected = selectedId === o.id;
                      const tone = riskTone(Number(o.riskScore));
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className={`option-card tone-${tone}${selected ? ' selected' : ''}`}
                          disabled={!!savingOption}
                          onClick={() => saveResponse(currentQuestion, o.id, true)}
                        >
                          <span className="option-check">{selected ? '✓' : ''}</span>
                          <span className="option-label">{o.label}</span>
                          <span className="option-score">Risk {Number(o.riskScore).toFixed(0)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="assess-nav">
                  <button className="btn secondary" disabled={qIndex === 0} onClick={() => setQIndex((i) => Math.max(0, i - 1))}>Back</button>
                  <div className="assess-nav-right">
                    {qIndex < questions.length - 1 ? (
                      <button className="btn" disabled={!selectedId} onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}>Next</button>
                    ) : (
                      <>
                        <button className="btn secondary" disabled={busy} onClick={() => action(`/assessments/${id}/evaluate`, 'Scores recalculated.', true)}>Recalculate</button>
                        <button className="btn" disabled={busy || !selectedId} onClick={() => action(`/assessments/${id}/submit`, 'Assessment evaluated successfully.', true)}>Submit and evaluate</button>
                      </>
                    )}
                  </div>
                </div>

                <div className="q-jump">
                  {questions.map((q: any, i: number) => {
                    const done = !!responseMap[q.id]?.responseOptionId;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        className={`q-jump-dot${i === qIndex ? ' active' : ''}${done ? ' done' : ''}${missingSet.has(q.code) ? ' alert' : ''}`}
                        onClick={() => setQIndex(i)}
                        title={q.code}
                      />
                    );
                  })}
                </div>
              </>
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
                    <p className="muted">SCLI risk {Number(snapshot.overallRiskScore).toFixed(1)}/100 · Maturity {Number(snapshot.maturityScore).toFixed(1)}/100</p>
                  </div>
                  <div className="results-hero-leak">
                    <span>Likely leakage</span>
                    <strong>{money(leakage.likelyLeakageValue)}</strong>
                    <small>{pct(leakage.likelyLeakageRate)} of annual security spend</small>
                  </div>
                </section>
                <div className="grid metrics">
                  <MetricCard label="SCLI risk score" value={`${Number(snapshot.overallRiskScore).toFixed(1)}/100`} detail={snapshot.riskBand} />
                  <MetricCard label="Maturity view" value={`${Number(snapshot.maturityScore).toFixed(1)}/100`} detail="100 minus risk" />
                  <MetricCard label="Likely leakage" value={money(leakage.likelyLeakageValue)} detail={pct(leakage.likelyLeakageRate)} />
                  <MetricCard label="Recoverable range" value={`${money(leakage.recoverableLow)} – ${money(leakage.recoverableHigh)}`} detail={`Opportunity ${Number(snapshot.opportunityScore).toFixed(1)}/100`} />
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
                    <h3 className="section-title">Leakage range</h3>
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
