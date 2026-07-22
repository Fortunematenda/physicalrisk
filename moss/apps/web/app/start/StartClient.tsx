'use client';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { PhysicalRiskShell } from '@/components/PhysicalRiskShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

type InputDef = {
  code: string;
  label: string;
  guidance?: string;
  valueType: string;
  required: boolean;
  options?: string[];
};

type Question = {
  code: string;
  category: string;
  text: string;
  required: boolean;
  evidenceHint?: string;
  options: Array<{ id: string; label: string; sortOrder: number }>;
};

type Questionnaire = {
  code: string;
  name: string;
  description?: string;
  version: string;
  inputDefinitions: InputDef[];
  questions: Question[];
};

const CALIBRATION_GROUPS = [
  { id: 'org', title: 'Organisation profile', hint: 'Who you are assessing', codes: ['C1', 'C2'] },
  { id: 'scale', title: 'Scale and spend', hint: 'Sites, force and contract value', codes: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'] },
  { id: 'tech', title: 'Technology and verification', hint: 'Coverage that drives leakage assumptions', codes: ['C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18'] },
  { id: 'allowance', title: 'Allowances and commercial flags', hint: 'Cost drivers that inflate leakage exposure', codes: ['C19', 'C20', 'C21', 'C22', 'C23'] },
];

const CONSENT_TEXT =
  'By continuing, you consent to Physical Risk collecting and processing the information you provide for the purpose of conducting a preliminary Security Cost Leakage assessment and contacting you about the results. This questionnaire is decision-support only and is not an audit finding.';

const SESSION_KEY = 'moss_public_assessment_session';

type StoredSession = { leadId: string; email: string };

type ResumePayload = {
  leadId: string;
  details: {
    organisationName: string;
    industry: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  progress: {
    phase: 'calibration' | 'questions';
    calStep: number;
    questionIndex: number;
    label?: string;
    percent?: number;
  };
  inputs?: Record<string, unknown>;
  responses?: Record<string, string>;
  message?: string;
};

function isFilled(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.leadId || !parsed?.email) return null;
    return { leadId: parsed.leadId, email: String(parsed.email).toLowerCase() };
  } catch {
    return null;
  }
}

function persistSession(leadId: string, email: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ leadId, email: email.trim().toLowerCase() }));
}

function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export default function StartAssessmentClient() {
  const params = useSearchParams();
  const source = params.get('source') || 'wordpress';

  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [phase, setPhase] = useState<'intro' | 'details' | 'calibration' | 'questions' | 'thanks'>('intro');
  const [calStep, setCalStep] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState('');
  const [bootState, setBootState] = useState<'loading-questionnaire' | 'ready' | 'load-error'>(
    'loading-questionnaire',
  );
  const [website, setWebsite] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [resumeHint, setResumeHint] = useState('');
  const [savedSession, setSavedSession] = useState<StoredSession | null>(null);
  const [thankYouMessage, setThankYouMessage] = useState(
    'Thank you for finishing. Our experts will be in contact with you.',
  );

  const [details, setDetails] = useState({
    organisationName: params.get('org') || '',
    industry: '',
    firstName: '',
    lastName: '',
    email: params.get('email') || '',
    phone: '',
  });
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});

  function applyResume(data: ResumePayload, opts?: { skipPhase?: boolean }) {
    setLeadId(data.leadId);
    setDetails({
      organisationName: data.details.organisationName || '',
      industry: data.details.industry || '',
      firstName: data.details.firstName || '',
      lastName: data.details.lastName || '',
      email: data.details.email || '',
      phone: data.details.phone || '',
    });
    // Ensure calibration step 1 (Organisation profile) is always prepopulated from the entered details.
    // Some backend resume payloads may omit `C1/C2` in `inputs`, which would otherwise leave the org fields blank.
    setInputs({
      ...(data.inputs || {}),
      C1: (data.details.organisationName || '').trim(),
      ...(data.details.industry ? { C2: data.details.industry } : {}),
    });
    setResponses(data.responses || {});
    persistSession(data.leadId, data.details.email);
    setSavedSession({ leadId: data.leadId, email: data.details.email.toLowerCase() });
    if (data.message) setResumeHint(data.message);
    if (!opts?.skipPhase) {
      const nextPhase = data.progress.phase === 'questions' ? 'questions' : 'calibration';
      setPhase(nextPhase);
      setCalStep(Math.max(0, data.progress.calStep ?? 0));
      setQIndex(Math.max(0, data.progress.questionIndex ?? 0));
      setConsentAccepted(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // This endpoint creates an HTTP-only anonymous assessment session and
        // returns only the currently published public questionnaire definition.
        const res = await fetch(`${API_BASE}/public/start?source=${encodeURIComponent(source)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Unable to load questionnaire.');
        if (cancelled) return;
        setQuestionnaire(data);
        setBootState('ready');

        const session = readStoredSession();
        setSavedSession(session);
        if (!session) return;

        const resumeRes = await fetch(`${API_BASE}/public/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ leadId: session.leadId }),
        });
        const resumeData = await resumeRes.json().catch(() => null);
        if (cancelled) return;
        if (!resumeRes.ok) {
          clearSession();
          setSavedSession(null);
          return;
        }
        applyResume(resumeData as ResumePayload);
      } catch (e: any) {
        if (!cancelled) {
          setBootError(e.message || 'Unable to load questionnaire.');
          setBootState('load-error');
        }
        return;
      }
      if (!cancelled) setBootState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  const questions = questionnaire?.questions || [];
  const currentQuestion = questions[qIndex];
  const currentGroup = CALIBRATION_GROUPS[calStep];
  const groupInputs = useMemo(
    () => (questionnaire?.inputDefinitions || []).filter((def) => currentGroup?.codes.includes(def.code)),
    [questionnaire, currentGroup],
  );
  const industryOptions = useMemo(() => {
    const def = questionnaire?.inputDefinitions.find((d) => d.code === 'C2');
    return def?.options || [];
  }, [questionnaire]);

  const answeredCount = Object.values(responses).filter(Boolean).length;
  const qProgress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;

  const currentCalComplete = useMemo(
    () => groupInputs.every((def) => !def.required || isFilled(inputs[def.code])),
    [groupInputs, inputs],
  );

  const detailsComplete = useMemo(() => {
    const needed = ['organisationName', 'firstName', 'lastName', 'email'] as const;
    return needed.every((key) => String(details[key] || '').trim());
  }, [details]);

  function setInputValue(code: string, value: unknown) {
    setInputs((prev) => ({ ...prev, [code]: value }));
  }

  function missingDetails() {
    const needed = ['organisationName', 'firstName', 'lastName', 'email'] as const;
    return needed.filter((key) => !String(details[key] || '').trim());
  }

  function syncOrgIntoCalibration(nextInputs?: Record<string, unknown>): Record<string, unknown> {
    const base = nextInputs || inputs;
    return {
      ...base,
      C1: details.organisationName.trim(),
      ...(details.industry ? { C2: details.industry } : {}),
    };
  }

  function buildInputPayload(sourceInputs: Record<string, unknown>) {
    if (!questionnaire) return [];
    return questionnaire.inputDefinitions.map((def) => {
      let value = sourceInputs[def.code];
      if (def.valueType === 'PERCENT' && value !== undefined && value !== null && value !== '') {
        value = Number(value) / 100;
      }
      if ((def.valueType === 'NUMBER' || def.valueType === 'CURRENCY') && value !== undefined && value !== null && value !== '') {
        value = Number(value);
      }
      return { code: def.code, value };
    }).filter((item) => isFilled(item.value));
  }

  async function saveProgress(payload: {
    phase: 'calibration' | 'questions';
    calStep?: number;
    questionIndex?: number;
    progressLabel: string;
    progressPercent: number;
    inputs?: Record<string, unknown>;
    responses?: Record<string, string>;
  }) {
    if (!leadId) return;
    const responseMap = payload.responses || responses;
    try {
      await fetch(`${API_BASE}/public/leads/${leadId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          phase: payload.phase,
          calStep: payload.calStep,
          questionIndex: payload.questionIndex,
          progressLabel: payload.progressLabel,
          progressPercent: payload.progressPercent,
          inputs: buildInputPayload(payload.inputs || inputs),
          responses: Object.entries(responseMap)
            .filter(([, optionId]) => !!optionId)
            .map(([questionCode, responseOptionId]) => ({ questionCode, responseOptionId })),
        }),
      });
      persistSession(leadId, details.email);
    } catch {
      // Progress sync is best-effort; completion still works at the end.
    }
  }

  async function continueCalibration() {
    const nextStep = calStep + 1;
    const label = `Calibration · Step ${nextStep + 1} of ${CALIBRATION_GROUPS.length} (${CALIBRATION_GROUPS[nextStep].title})`;
    const percent = Math.round(5 + ((nextStep + 1) / CALIBRATION_GROUPS.length) * 35);
    await saveProgress({
      phase: 'calibration',
      calStep: nextStep,
      progressLabel: label,
      progressPercent: percent,
      inputs: syncOrgIntoCalibration(),
    });
    setCalStep(nextStep);
  }

  async function startQuestions() {
    await saveProgress({
      phase: 'questions',
      calStep: CALIBRATION_GROUPS.length - 1,
      questionIndex: 0,
      progressLabel: `Questionnaire · Question 1 of ${questions.length}`,
      progressPercent: 45,
      inputs: syncOrgIntoCalibration(),
    });
    setPhase('questions');
    setQIndex(0);
  }

  async function selectQuestionOption(optionId: string) {
    if (!currentQuestion) return;
    const nextResponses = { ...responses, [currentQuestion.code]: optionId };
    setResponses(nextResponses);
    const answered = Object.values(nextResponses).filter(Boolean).length;
    const nextIndex = qIndex < questions.length - 1 ? qIndex + 1 : qIndex;
    const nextQuestion = questions[nextIndex];
    const percent = Math.round(45 + (answered / Math.max(questions.length, 1)) * 50);
    await saveProgress({
      phase: 'questions',
      questionIndex: nextIndex,
      progressLabel: nextQuestion
        ? `Question ${nextIndex + 1} of ${questions.length} · ${nextQuestion.category}`
        : `Question ${qIndex + 1} of ${questions.length} · ${currentQuestion.category}`,
      progressPercent: Math.min(percent, 95),
      inputs: syncOrgIntoCalibration(),
      responses: nextResponses,
    });
    if (qIndex < questions.length - 1) {
      window.setTimeout(() => setQIndex((i) => i + 1), 180);
    }
  }

  async function continueFromDetails() {
    setError('');
    const missing = missingDetails();
    if (missing.length) {
      setError('Please complete your organisation and contact details before continuing.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/public/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...details, website }),
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) {
        const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || `Unable to save your details (${response.status}).`;
        throw new Error(message);
      }
      applyResume(data as ResumePayload);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function resumeSavedSession() {
    if (!savedSession) return;
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/public/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ leadId: savedSession.leadId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        clearSession();
        setSavedSession(null);
        throw new Error(data?.message || 'Could not resume your previous assessment.');
      }
      applyResume(data as ResumePayload);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    if (!questionnaire || !leadId) {
      setError('Your contact details were not saved. Please go back and enter them again.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const synced = syncOrgIntoCalibration();
      const inputPayload = questionnaire.inputDefinitions.map((def) => {
        let value = synced[def.code];
        if (def.valueType === 'PERCENT' && value !== undefined && value !== null && value !== '') {
          value = Number(value) / 100;
        }
        if ((def.valueType === 'NUMBER' || def.valueType === 'CURRENCY') && value !== undefined && value !== null && value !== '') {
          value = Number(value);
        }
        return { code: def.code, value };
      }).filter((item) => isFilled(item.value));

      const responsePayload = Object.entries(responses)
        .filter(([, optionId]) => !!optionId)
        .map(([questionCode, responseOptionId]) => ({ questionCode, responseOptionId }));

      const response = await fetch(`${API_BASE}/public/complete-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...details,
          leadId,
          website,
          inputs: inputPayload,
          responses: responsePayload,
        }),
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) {
        const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message || `Unable to submit (${response.status}).`;
        throw new Error(message);
      }
      setThankYouMessage(data.message || thankYouMessage);
      clearSession();
      setSavedSession(null);
      setPhase('thanks');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (bootState === 'load-error') {
    return (
      <PhysicalRiskShell>
        <div className="public-quiz-main">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Unable to load questionnaire</AlertTitle>
            <AlertDescription>{bootError}</AlertDescription>
          </Alert>
        </div>
      </PhysicalRiskShell>
    );
  }
  if (!questionnaire || bootState !== 'ready') {
    return (
      <PhysicalRiskShell>
        <div className="public-quiz-main flex min-h-[320px] items-center justify-center">
          <Card className="w-full max-w-md shadow-sm">
            <CardContent className="flex items-center justify-center gap-3 py-10 text-sm text-moss-muted">
              <Loader2 className="size-5 animate-spin text-moss-red" aria-hidden="true" />
              {bootState === 'loading-questionnaire' && 'Loading questionnaire…'}
            </CardContent>
          </Card>
        </div>
      </PhysicalRiskShell>
    );
  }

  return (
    <PhysicalRiskShell>
      <div className="public-quiz">
        <main className="public-quiz-main">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {resumeHint && (phase === 'calibration' || phase === 'questions') && (
            <Alert className="mb-4">
              <AlertDescription>{resumeHint}</AlertDescription>
            </Alert>
          )}

          {phase === 'intro' && (
            <Card className="assess-intro public-panel border-moss-border shadow-sm">
              <CardHeader className="space-y-3 p-6 pb-0">
                <p className="eyebrow">Security cost leakage assessment</p>
                <h1>Complete the <em>Cost Leakage</em> questionnaire</h1>
              </CardHeader>
              <CardContent className="space-y-4 p-6 pt-4">
                {savedSession && !leadId && (
                  <div className="consent-box rounded-lg border border-moss-border bg-moss-page/50 p-4">
                    <p>We found an unfinished assessment on this device.</p>
                    <div className="mt-3 flex justify-end">
                      <Button disabled={loading} onClick={resumeSavedSession}>
                        {loading ? 'Resuming…' : 'Continue where you left off →'}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="consent-box rounded-lg border border-moss-border bg-moss-page/50 p-4">
                  <p>{CONSENT_TEXT}</p>
                  <label className="consent-check mt-3 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(e) => setConsentAccepted(e.target.checked)}
                      className="mt-1"
                    />
                    <span>I consent to Physical Risk processing my details for this assessment and follow-up contact.</span>
                  </label>
                </div>
                <div className="intro-metrics">
                  <div><span>Questions</span><strong>{questions.length}</strong></div>
                  <div><span>Calibration</span><strong>{questionnaire.inputDefinitions.length}</strong></div>
                  <div><span>Est. time</span><strong>~15 min</strong></div>
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t border-moss-border/60 p-6 pt-0">
                <Button disabled={!consentAccepted} onClick={() => setPhase('details')}>
                  Begin assessment →
                </Button>
              </CardFooter>
            </Card>
          )}

          {phase === 'details' && (
            <Card className="public-panel border-moss-border shadow-sm">
              <CardHeader className="space-y-2 p-6 pb-0">
                <p className="eyebrow">Your details</p>
                <h2>Tell us who is completing this</h2>
                <p className="muted">We capture your contact details now so our team can follow up, even if you leave mid-way. Your organisation name will carry into calibration.</p>
              </CardHeader>
              <CardContent className="p-6 pt-4">
                <div className="form-grid" style={{ marginTop: 0 }}>
                <div aria-hidden="true" className="absolute -left-[10000px]" tabIndex={-1}>
                  <label htmlFor="website">Website</label>
                  <input
                    id="website"
                    name="website"
                    autoComplete="off"
                    tabIndex={-1}
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Organisation name</label>
                  <input
                    required
                    value={details.organisationName}
                    onChange={(e) => setDetails({ ...details, organisationName: e.target.value })}
                    placeholder="Enter organisation or business unit name"
                  />
                </div>
                <div className="field">
                  <label>Industry</label>
                  <select
                    value={details.industry}
                    onChange={(e) => setDetails({ ...details, industry: e.target.value })}
                  >
                    <option value="">Select industry</option>
                    {industryOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} placeholder="Optional" />
                </div>
                <div className="field">
                  <label>First name</label>
                  <input required value={details.firstName} onChange={(e) => setDetails({ ...details, firstName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input required value={details.lastName} onChange={(e) => setDetails({ ...details, lastName: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Work email</label>
                  <input required type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                </div>
                </div>
              </CardContent>
              <CardFooter className="assess-nav justify-between border-t border-moss-border/60 p-6">
                <Button variant="outline" onClick={() => setPhase('intro')}>Back</Button>
                <Button disabled={loading || !detailsComplete} onClick={continueFromDetails}>
                  {loading ? 'Saving details…' : 'Continue to calibration'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {phase === 'calibration' && (
            <Card className="public-panel border-moss-border shadow-sm">
              <CardHeader className="p-6 pb-0">
                <div className="assess-stage-head">
                  <div>
                    <p className="eyebrow">Calibration · Step {calStep + 1} of {CALIBRATION_GROUPS.length}</p>
                    <h2>{currentGroup.title}</h2>
                    <p className="muted">{currentGroup.hint}</p>
                  </div>
                  <div className="step-dots">
                    {CALIBRATION_GROUPS.map((g, i) => (
                      <button
                        key={g.id}
                        type="button"
                        className={`step-dot${i === calStep ? ' active' : ''}`}
                        disabled={i > calStep}
                        onClick={() => i <= calStep && setCalStep(i)}
                        aria-label={g.title}
                      />
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-4">
                <div className="form-grid assess-cal-grid">
                {groupInputs.map((def) => {
                  const value = inputs[def.code];
                  const isOrgName = def.code === 'C1';
                  return (
                    <div className="field" key={def.code}>
                      <label>{def.label}{def.required && <span className="req">*</span>}</label>
                      {def.valueType === 'SELECT' ? (
                        <select
                          value={value === undefined || value === null ? '' : String(value)}
                          onChange={(e) => {
                            setInputValue(def.code, e.target.value);
                            if (def.code === 'C2') setDetails((d) => ({ ...d, industry: e.target.value }));
                          }}
                        >
                          <option value="">Select…</option>
                          {(def.options || []).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : def.valueType === 'BOOLEAN' ? (
                        <div className="choice-grid dual">
                          {['YES', 'NO'].map((o) => (
                            <button key={o} type="button" className={`choice-pill${String(value).toUpperCase() === o ? ' selected' : ''}`} onClick={() => setInputValue(def.code, o)}>{o}</button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={def.valueType === 'TEXT' ? 'text' : 'number'}
                          step={def.valueType === 'PERCENT' ? '0.1' : '1'}
                          value={value === undefined || value === null ? '' : String(value)}
                          readOnly={isOrgName}
                          onChange={(e) => {
                            setInputValue(def.code, e.target.value);
                            if (isOrgName) setDetails((d) => ({ ...d, organisationName: e.target.value }));
                          }}
                        />
                      )}
                      <small>
                        {isOrgName
                          ? 'Prepopulated from your details. Go back to change it.'
                          : `${def.guidance || ''}${def.valueType === 'PERCENT' ? ' Enter as 0–100%.' : ''}`}
                      </small>
                    </div>
                  );
                })}
                </div>
              </CardContent>
              <CardFooter className="assess-nav justify-between border-t border-moss-border/60 p-6">
                <Button variant="outline" onClick={() => (calStep === 0 ? setPhase('details') : setCalStep((s) => s - 1))}>Back</Button>
                {calStep < CALIBRATION_GROUPS.length - 1 ? (
                  <Button disabled={!currentCalComplete} onClick={() => void continueCalibration()}>Continue</Button>
                ) : (
                  <Button disabled={!currentCalComplete} onClick={() => void startQuestions()}>
                    Start questionnaire
                  </Button>
                )}
              </CardFooter>
            </Card>
          )}

          {phase === 'questions' && currentQuestion && (
            <Card className="public-panel border-moss-border shadow-sm">
              <CardHeader className="p-6 pb-0">
              <div className="assess-stage-head">
                <div>
                  <p className="eyebrow">{currentQuestion.category}</p>
                  <p className="q-counter">Question {qIndex + 1} of {questions.length}</p>
                </div>
                <div className="q-progress-wrap min-w-[140px]">
                  <span className="text-sm font-medium text-moss-text">{qProgress}% complete</span>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-moss-page">
                    <div
                      className="h-full rounded-full bg-moss-red transition-all duration-300"
                      style={{ width: `${qProgress}%` }}
                      role="progressbar"
                      aria-valuenow={qProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              </div>
              </CardHeader>
              <CardContent className="p-6 pt-4">
              <div className="question-focus">
                <h2 className="question-focus-title">{currentQuestion.text}</h2>
                {currentQuestion.evidenceHint && (
                  <p className="evidence-hint"><strong>Suggested evidence:</strong> {currentQuestion.evidenceHint}</p>
                )}
                <div className="option-list">
                  {[...currentQuestion.options].sort((a, b) => a.sortOrder - b.sortOrder).map((o) => {
                    const selected = responses[currentQuestion.code] === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={`option-card${selected ? ' selected' : ''}`}
                        onClick={() => { void selectQuestionOption(o.id); }}
                      >
                        <span className="option-check">{selected ? '✓' : ''}</span>
                        <span className="option-label">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </CardContent>
              <CardFooter className="flex-col gap-4 border-t border-moss-border/60 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="assess-nav w-full justify-between border-0 p-0 sm:w-auto">
                <Button variant="outline" onClick={() => (qIndex === 0 ? setPhase('calibration') : setQIndex((i) => i - 1))}>Back</Button>
                <div className="assess-nav-right">
                  {qIndex < questions.length - 1 ? (
                    <Button disabled={!responses[currentQuestion.code]} onClick={() => setQIndex((i) => i + 1)}>Next</Button>
                  ) : (
                    <Button disabled={!responses[currentQuestion.code] || loading} onClick={finish}>
                      {loading ? 'Submitting…' : 'Submit & evaluate'}
                    </Button>
                  )}
                </div>
              </div>
              <div className="q-jump w-full justify-center sm:w-auto">
                {questions.map((q, i) => (
                  <button
                    key={q.code}
                    type="button"
                    className={cn(
                      'q-jump-dot',
                      i === qIndex && 'active',
                      responses[q.code] && 'done',
                    )}
                    onClick={() => {
                      if (i <= qIndex || responses[q.code]) setQIndex(i);
                    }}
                  />
                ))}
              </div>
              </CardFooter>
            </Card>
          )}

          {phase === 'thanks' && (
            <Card className="assess-intro public-panel border-moss-border shadow-sm">
              <CardHeader className="space-y-3 p-6 pb-0">
              <p className="eyebrow">Submission received</p>
              <h1>Thank you for finishing</h1>
              </CardHeader>
              <CardContent className="space-y-3 p-6 pt-4">
              <p className="muted" style={{ maxWidth: 520 }}>
                {thankYouMessage}
              </p>
              <p className="muted">
                We’ve emailed a confirmation to <strong>{details.email}</strong>. Our experts will be in contact with you.
              </p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </PhysicalRiskShell>
  );
}
