'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildPercentRangeValue,
  buildMoneyRangeValue,
  isMoneyRangeValue,
  isPercentRangeValue,
  isSclMoneyLossCode,
  SCL_PERCENT_RANGES,
  SCL_MONEY_RANGES,
} from '@moss/shared';

import { AssessmentConsentBlock } from '@/components/scl/AssessmentConsentBlock';
import { AssessmentContactForm } from '@/components/scl/AssessmentContactForm';
import { AssessmentLandingHero } from '@/components/scl/AssessmentLandingHero';
import { AssessmentNavigation } from '@/components/scl/AssessmentNavigation';
import { AssessmentProgress } from '@/components/scl/AssessmentProgress';
import { AssessmentQuestionCard } from '@/components/scl/AssessmentQuestionCard';
import { AssessmentRangeOption, AssessmentResponseOption } from '@/components/scl/AssessmentResponseOption';
import { AssessmentSubmittedPage } from '@/components/scl/AssessmentSubmittedPage';
import { SclAssessmentShell } from '@/components/scl/SclAssessmentShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { readSclAttribution, type SclAttribution } from '@/lib/scl-attribution';
import {
  isOperationalSitesSelectionComplete,
  isSecurityExpenditureComplete,
  operationalSitesValueFromStored,
  resolveOperationalSitesBandValue,
  resolveSecurityExpenditureBandValue,
  securityExpenditureValueFromStored,
  type ContactDetails,
  type InputDef,
  type Question,
  isJobTitleValueComplete,
  SCL_PUBLIC_TRIAGE_QUESTION_CODES,
  filterSclActiveTriageQuestions,
} from '@/lib/scl-assessment-types';
import {
  buildSclFlowSteps,
  calibrationDefaultsFromDefinitions,
  sclStepLabel,
} from '@/lib/scl-continuous-steps';
import { isIndustryValueComplete } from '@/lib/scl-industry-other';
import { deriveDuplicateCalibrationInputs } from '@/lib/scl-questionnaire-calibration-bridge';
import { IndustryWithOtherField } from '@/components/IndustryWithOtherField';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/gw';
const SESSION_KEY = 'moss_public_assessment_session';
const DRAFT_KEY = 'moss_public_assessment_draft_v2';

type Questionnaire = {
  id: string;
  name: string;
  version: string;
  inputDefinitions: InputDef[];
  questions: Question[];
};

type UiPhase = 'landing' | 'assess' | 'submitted';

function isValidWorkEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isContactStepComplete(
  details: ContactDetails,
  consentAccepted: boolean,
  questions: Question[],
  responses: Record<string, string>,
): boolean {
  if (!consentAccepted) return false;
  if (
    !details.firstName.trim() ||
    !details.lastName.trim() ||
    !details.organisationName.trim() ||
    !isJobTitleValueComplete(details.role) ||
    !details.country.trim() ||
    !isValidWorkEmail(details.email) ||
    !isOperationalSitesSelectionComplete(details.totalSites) ||
    !isSecurityExpenditureComplete(details.securityExpenditure)
  ) {
    return false;
  }
  const triageCodes = new Set<string>(SCL_PUBLIC_TRIAGE_QUESTION_CODES);
  return questions
    .filter((q) => triageCodes.has(q.code))
    .every((q) => Boolean(responses[q.code]));
}

function isFilled(value: unknown) {
  if (isPercentRangeValue(value) || isMoneyRangeValue(value)) return true;
  return value !== undefined && value !== null && value !== '';
}

function readStoredSession(): { leadId: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.leadId || !parsed?.email) return null;
    return { leadId: parsed.leadId, email: String(parsed.email).toLowerCase() };
  } catch {
    return null;
  }
}

export default function StartAssessmentClient() {
  const params = useSearchParams();
  const source = params.get('source') || params.get('utm_source') || 'wordpress';
  const [attribution] = useState<SclAttribution>(() => readSclAttribution(params));

  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [uiPhase, setUiPhase] = useState<UiPhase>('landing');
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [stepError, setStepError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState('');
  const [website, setWebsite] = useState('');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [insightsOptIn, setInsightsOptIn] = useState(false);
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);

  const [details, setDetails] = useState<ContactDetails>({
    organisationName: params.get('org') || '',
    industry: '',
    totalSites: '',
    firstName: '',
    lastName: '',
    email: params.get('email') || '',
    phone: '',
    role: '',
    country: 'South Africa',
    securityExpenditure: '',
    primaryConcern: '',
  });
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [responses, setResponses] = useState<Record<string, string>>({});

  const steps = useMemo(() => {
    const questions = filterSclActiveTriageQuestions(
      (questionnaire?.questions || []) as Question[],
    );
    return buildSclFlowSteps(questionnaire?.inputDefinitions || [], questions);
  }, [questionnaire]);
  const current = steps[stepIndex];
  const industryOptions = useMemo(() => {
    const def = questionnaire?.inputDefinitions.find((d) => d.code === 'C2');
    return def?.options || [];
  }, [questionnaire]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/start?source=${encodeURIComponent(source)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Unable to load questionnaire.');
        if (cancelled) return;
        setQuestionnaire(data);

        const session = readStoredSession();
        if (session?.leadId) {
          const resumeRes = await fetch(`${API_BASE}/public/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ leadId: session.leadId }),
          });
          if (resumeRes.ok) {
            const resume = await resumeRes.json();
            if (cancelled) return;
            setLeadId(resume.leadId);
            setDetails((d) => ({
              ...d,
              organisationName: resume.details?.organisationName || d.organisationName,
              industry: resume.details?.industry || d.industry,
              totalSites:
                resume.inputs?.C3 != null && resume.inputs.C3 !== ''
                  ? operationalSitesValueFromStored(resume.inputs.C3)
                  : d.totalSites,
              firstName: resume.details?.firstName || d.firstName,
              lastName: resume.details?.lastName || d.lastName,
              email: resume.details?.email || d.email,
              phone: resume.details?.phone || d.phone,
              role: resume.details?.jobTitle || resume.details?.role || d.role,
              securityExpenditure:
                resume.inputs?.C5 != null && resume.inputs.C5 !== ''
                  ? securityExpenditureValueFromStored(resume.inputs.C5)
                  : d.securityExpenditure,
            }));
            setInputs(resume.inputs || {});
            setResponses(resume.responses || {});
            // Consent stays on the final details step — do not auto-accept on resume.
            // Resume into continuous flow at last known question index when possible.
            const flowQuestions = filterSclActiveTriageQuestions(
              (data.questions || []) as Question[],
            );
            const flow = buildSclFlowSteps(data.inputDefinitions || [], flowQuestions);
            const inputStepCount = flow.filter((s) => s.kind === 'input').length;
            if (resume.progress?.phase === 'questions') {
              setStepIndex(inputStepCount + Math.max(0, resume.progress.questionIndex || 0));
              setUiPhase('assess');
            } else if (resume.progress?.phase === 'calibration') {
              // Public flow skips calibration — resume at the first questionnaire step.
              setStepIndex(inputStepCount);
              setUiPhase('assess');
            }
          }
        } else {
          try {
            const draftRaw = localStorage.getItem(DRAFT_KEY);
            if (draftRaw) {
              const draft = JSON.parse(draftRaw);
              if (draft?.inputs) setInputs(draft.inputs);
              if (draft?.responses) setResponses(draft.responses);
              if (draft?.details) setDetails((d) => ({ ...d, ...draft.details, role: draft.details.role || '' }));
              if (draft?.consentAccepted) setConsentAccepted(true);
              if (draft?.insightsOptIn) setInsightsOptIn(true);
              if (typeof draft?.stepIndex === 'number' && draft.uiPhase === 'assess') {
                setStepIndex(draft.stepIndex);
                setUiPhase('assess');
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (!cancelled) setBootState('ready');
      } catch (e) {
        if (!cancelled) {
          setBootState('error');
          setBootError(e instanceof Error ? e.message : 'Unable to start assessment.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (uiPhase !== 'assess') return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          uiPhase,
          stepIndex,
          inputs,
          responses,
          details,
          consentAccepted,
          insightsOptIn,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [uiPhase, stepIndex, inputs, responses, details, consentAccepted, insightsOptIn]);

  function mergedCalibrationInputs(sourceInputs: Record<string, unknown>) {
    if (!questionnaire) return sourceInputs;
    return {
      ...sourceInputs,
      ...deriveDuplicateCalibrationInputs(questionnaire.questions, responses, sourceInputs),
    };
  }

  function resolvedInputsForSubmit(sourceInputs: Record<string, unknown>) {
    return mergedCalibrationInputs({
      ...calibrationDefaultsFromDefinitions(questionnaire?.inputDefinitions),
      ...sourceInputs,
    });
  }

  function buildInputPayload(sourceInputs: Record<string, unknown>) {
    if (!questionnaire) return [];
    const resolved = resolvedInputsForSubmit(sourceInputs);
    return questionnaire.inputDefinitions
      .map((def) => {
        let value = resolved[def.code];
        if (def.valueType === 'PERCENT' && value !== undefined && value !== null && value !== '') {
          if (!isPercentRangeValue(value)) {
            const n = Number(String(value).replace(/[,\s]/g, ''));
            value = Number.isFinite(n) ? (n > 1 ? n / 100 : n) : value;
          }
        }
        if (def.valueType === 'CURRENCY' && isSclMoneyLossCode(def.code) && isMoneyRangeValue(value)) {
          value = value;
        } else if (
          (def.valueType === 'NUMBER' || def.valueType === 'CURRENCY') &&
          value !== undefined &&
          value !== null &&
          value !== ''
        ) {
          const cleaned = String(value).replace(/[Rr$€£]/g, '').replace(/[\s\u00A0,]/g, '').trim();
          const n = Number(cleaned);
          value = Number.isFinite(n) ? n : value;
        }
        return { code: def.code, value };
      })
      .filter((item) => isFilled(item.value));
  }

  async function saveProgressBestEffort(nextStepIndex: number) {
    if (!leadId) return;
    const nextStep = steps[nextStepIndex];
    const inQuestions = nextStep?.kind === 'question' || nextStep?.kind === 'contact';
    try {
      await fetch(`${API_BASE}/public/leads/${leadId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          phase: inQuestions ? 'questions' : 'calibration',
          calStep: 0,
          questionIndex: inQuestions && nextStep.kind === 'question' ? nextStep.index : 0,
          progressLabel: `Step ${nextStepIndex + 1} of ${steps.length}`,
          progressPercent: Math.round(((nextStepIndex + 1) / Math.max(steps.length, 1)) * 100),
          inputs: buildInputPayload(inputs),
          responses: Object.entries(responses)
            .filter(([, id]) => !!id)
            .map(([questionCode, responseOptionId]) => ({ questionCode, responseOptionId })),
        }),
      });
    } catch {
      /* best effort */
    }
  }

  function stepComplete(): boolean {
    if (!current) return false;
    if (current.kind === 'contact') {
      return isContactStepComplete(
        details,
        consentAccepted,
        questionnaire?.questions || [],
        responses,
      );
    }
    if (current.kind === 'question') {
      return Boolean(responses[current.question.code]);
    }
    const def = current.def;
    if (!def.required) return true;
    if (def.code === 'C2') return isIndustryValueComplete(inputs[def.code]);
    return isFilled(inputs[def.code]);
  }

  function goNext() {
    if (!stepComplete()) {
      setStepError(
        current?.kind === 'contact'
          ? 'Please complete all required fields before submitting.'
          : 'Please complete this step before continuing.',
      );
      return;
    }
    setStepError('');
    if (current?.kind === 'input' && current.def.code === 'C1') {
      setDetails((d) => ({
        ...d,
        organisationName: d.organisationName || String(inputs.C1 || ''),
      }));
    }
    if (current?.kind === 'input' && current.def.code === 'C2') {
      setDetails((d) => ({
        ...d,
        industry: d.industry || String(inputs.C2 || ''),
      }));
    }
    if (current?.kind === 'contact') {
      void submitAssessment();
      return;
    }
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(next);
    void saveProgressBestEffort(next);
    window.scrollTo(0, 0);
  }

  function goBack() {
    if (stepIndex <= 0) {
      setUiPhase('landing');
      return;
    }
    setStepError('');
    setStepIndex((s) => s - 1);
    window.scrollTo(0, 0);
  }

  async function ensureLead(): Promise<string> {
    if (leadId) return leadId;
    const org = details.organisationName.trim() || String(inputs.C1 || '').trim();
    const res = await fetch(`${API_BASE}/public/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        organisationName: org,
        industry: details.industry || String(inputs.C2 || '') || undefined,
        firstName: details.firstName.trim(),
        lastName: details.lastName.trim(),
        email: details.email.trim(),
        phone: details.phone.trim() || undefined,
        jobTitle: details.role.trim() || undefined,
        attribution: {
          ...attribution,
          country: details.country.trim() || undefined,
          primaryConcern: details.primaryConcern.trim() || undefined,
          totalSites: details.totalSites || undefined,
          securityExpenditure: details.securityExpenditure || undefined,
          insightsOptIn,
        },
        website: website || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || 'Unable to save your details.');
    setLeadId(data.leadId);
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ leadId: data.leadId, email: details.email.trim().toLowerCase() }),
    );
    return data.leadId as string;
  }

  async function submitAssessment() {
    setLoading(true);
    setError('');
    try {
      const activeLeadId = await ensureLead();
      const res = await fetch(`${API_BASE}/public/complete-assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          leadId: activeLeadId,
          organisationName: details.organisationName.trim() || String(inputs.C1 || '').trim(),
          industry: details.industry || String(inputs.C2 || '') || undefined,
          firstName: details.firstName.trim(),
          lastName: details.lastName.trim(),
          email: details.email.trim(),
          phone: details.phone.trim() || undefined,
          jobTitle: details.role.trim() || undefined,
          attribution: {
            ...attribution,
            country: details.country.trim() || undefined,
            primaryConcern: details.primaryConcern.trim() || undefined,
            totalSites: details.totalSites || undefined,
            securityExpenditure: details.securityExpenditure || undefined,
            insightsOptIn,
          },
          website: website || undefined,
          inputs: buildInputPayload({
            ...inputs,
            C1: details.organisationName.trim() || inputs.C1,
            C2: details.industry || inputs.C2,
            C3: resolveOperationalSitesBandValue(details.totalSites) ?? inputs.C3,
            C5: resolveSecurityExpenditureBandValue(details.securityExpenditure) ?? inputs.C5,
            ...deriveDuplicateCalibrationInputs(questionnaire?.questions || [], responses, {
              ...calibrationDefaultsFromDefinitions(questionnaire?.inputDefinitions),
              ...inputs,
              C1: details.organisationName.trim() || inputs.C1,
              C2: details.industry || inputs.C2,
              C3: resolveOperationalSitesBandValue(details.totalSites) ?? inputs.C3,
              C5: resolveSecurityExpenditureBandValue(details.securityExpenditure) ?? inputs.C5,
            }),
          }),
          responses: Object.entries(responses)
            .filter(([, id]) => !!id)
            .map(([questionCode, responseOptionId]) => ({ questionCode, responseOptionId })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Unable to submit assessment.');
      localStorage.removeItem(DRAFT_KEY);
      setSubmittedReference(data.reference || data.assessmentId || null);
      setUiPhase('submitted');
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed.');
    } finally {
      setLoading(false);
    }
  }

  if (bootState === 'loading') {
    return (
      <SclAssessmentShell>
        <div className="scl-exec-shell" style={{ padding: '80px 0', textAlign: 'center' }}>
          <Loader2 className="inline size-6 animate-spin" /> Loading assessment…
        </div>
      </SclAssessmentShell>
    );
  }

  if (bootState === 'error') {
    return (
      <SclAssessmentShell>
        <div className="scl-exec-shell" style={{ padding: '48px 0' }}>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{bootError}</AlertDescription>
          </Alert>
        </div>
      </SclAssessmentShell>
    );
  }

  return (
    <SclAssessmentShell>
      {error && (
        <div className="scl-exec-shell" style={{ paddingTop: 16 }}>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div aria-hidden="true" className="absolute -left-[10000px]">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" autoComplete="off" tabIndex={-1} value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {uiPhase === 'landing' && (
        <AssessmentLandingHero
          onStart={() => {
            setUiPhase('assess');
            setStepIndex(0);
            window.scrollTo(0, 0);
          }}
        />
      )}

      {uiPhase === 'assess' && current && (
        <section className="scl-exec-assessment">
          <div className="scl-exec-shell">
            <div className="scl-exec-assess-wrap">
              <AssessmentProgress
                title={
                  current.kind === 'contact'
                    ? 'Your preliminary report is ready'
                    : 'Executive Governance Triage'
                }
                phaseLabel={current.kind === 'contact' ? 'Final step' : sclStepLabel(current)}
                step={stepIndex + 1}
                total={steps.length}
              />

              {current.kind === 'contact' ? (
                <>
                  <AssessmentQuestionCard
                    phase="Report delivery"
                    question="Where should we address it?"
                    help="Complete your professional details to receive your personalised Preliminary Executive Governance Indication Report."
                    error={stepError}
                  >
                    <AssessmentContactForm
                      details={{
                        ...details,
                        organisationName: details.organisationName || String(inputs.C1 || ''),
                        industry: details.industry || String(inputs.C2 || ''),
                        totalSites:
                          details.totalSites ||
                          (inputs.C3 != null ? operationalSitesValueFromStored(inputs.C3) : ''),
                        securityExpenditure:
                          details.securityExpenditure ||
                          (inputs.C5 != null
                            ? securityExpenditureValueFromStored(inputs.C5)
                            : ''),
                      }}
                      industryOptions={industryOptions}
                      onChange={setDetails}
                    />
                    <AssessmentConsentBlock
                      consentAccepted={consentAccepted}
                      insightsOptIn={insightsOptIn}
                      onConsentChange={setConsentAccepted}
                      onInsightsChange={setInsightsOptIn}
                    />
                  </AssessmentQuestionCard>
                  <AssessmentNavigation
                    canGoBack
                    canGoNext={stepComplete()}
                    nextLabel="Submit"
                    loading={loading}
                    onBack={goBack}
                    onNext={goNext}
                  />
                </>
              ) : current.kind === 'question' ? (
                <>
                  <AssessmentQuestionCard
                    phase={current.question.category}
                    question={current.question.text}
                    help="Select the response that best reflects the current position."
                    error={stepError}
                  >
                    <div
                      className="scl-exec-options scl-exec-options-grid"
                      role="radiogroup"
                    >
                      {[...current.question.options]
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((o) => (
                          <AssessmentResponseOption
                            key={o.id}
                            selected={responses[current.question.code] === o.id}
                            label={o.label}
                            onSelect={() => {
                              setResponses((prev) => ({ ...prev, [current.question.code]: o.id }));
                              setStepError('');
                            }}
                          />
                        ))}
                    </div>
                  </AssessmentQuestionCard>
                  <AssessmentNavigation
                    canGoBack
                    canGoNext={stepComplete()}
                    nextLabel="Next question"
                    onBack={goBack}
                    onNext={goNext}
                  />
                </>
              ) : (
                <>
                  <AssessmentQuestionCard
                    phase="Executive calibration"
                    question={current.def.label}
                    help={current.def.guidance || 'An estimate is sufficient for this preliminary assessment.'}
                    error={stepError}
                  >
                    {current.def.valueType === 'PERCENT' ? (
                      <AssessmentRangeOption
                        value={
                          isPercentRangeValue(inputs[current.def.code])
                            ? (inputs[current.def.code] as { rangeCode: string }).rangeCode
                            : null
                        }
                        onChange={(key) => {
                          const built = buildPercentRangeValue(key as never);
                          if (built) setInputs((prev) => ({ ...prev, [current.def.code]: built }));
                          setStepError('');
                        }}
                        options={SCL_PERCENT_RANGES.map((r) => ({ key: r.rangeCode, label: r.label }))}
                      />
                    ) : current.def.valueType === 'CURRENCY' && isSclMoneyLossCode(current.def.code) ? (
                      <AssessmentRangeOption
                        value={
                          isMoneyRangeValue(inputs[current.def.code])
                            ? (inputs[current.def.code] as { code: string }).code
                            : null
                        }
                        onChange={(key) => {
                          const built = buildMoneyRangeValue(key as never);
                          if (built) setInputs((prev) => ({ ...prev, [current.def.code]: built }));
                          setStepError('');
                        }}
                        options={SCL_MONEY_RANGES.map((r) => ({ key: r.code, label: r.label }))}
                      />
                    ) : current.def.valueType === 'SELECT' && current.def.code === 'C2' ? (
                      <IndustryWithOtherField
                        options={current.def.options || []}
                        value={String(inputs.C2 || '')}
                        onChange={(next) => {
                          setInputs((prev) => ({ ...prev, C2: next }));
                          setDetails((d) => ({ ...d, industry: next }));
                          setStepError('');
                        }}
                      />
                    ) : current.def.valueType === 'SELECT' ? (
                      <div className="scl-exec-options" role="radiogroup">
                        {(current.def.options || []).map((o) => (
                          <AssessmentResponseOption
                            key={o}
                            selected={String(inputs[current.def.code] || '') === o}
                            label={o}
                            onSelect={() => {
                              setInputs((prev) => ({ ...prev, [current.def.code]: o }));
                              setStepError('');
                            }}
                          />
                        ))}
                      </div>
                    ) : current.def.valueType === 'BOOLEAN' ? (
                      <div className="scl-exec-options scl-exec-options-grid" role="radiogroup">
                        {['YES', 'NO'].map((o) => (
                          <AssessmentResponseOption
                            key={o}
                            selected={String(inputs[current.def.code] || '').toUpperCase() === o}
                            label={o === 'YES' ? 'Yes' : 'No'}
                            onSelect={() => {
                              setInputs((prev) => ({ ...prev, [current.def.code]: o }));
                              setStepError('');
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="scl-exec-fields">
                        <div className="scl-exec-field scl-exec-wide">
                          <input
                            type={current.def.valueType === 'TEXT' ? 'text' : 'number'}
                            value={
                              inputs[current.def.code] === undefined || inputs[current.def.code] === null
                                ? ''
                                : String(inputs[current.def.code])
                            }
                            onChange={(e) => {
                              setInputs((prev) => ({ ...prev, [current.def.code]: e.target.value }));
                              if (current.def.code === 'C1') {
                                setDetails((d) => ({ ...d, organisationName: e.target.value }));
                              }
                              setStepError('');
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </AssessmentQuestionCard>
                  <AssessmentNavigation
                    canGoBack={stepIndex > 0}
                    canGoNext={stepComplete()}
                    nextLabel="Next question"
                    onBack={goBack}
                    onNext={goNext}
                  />
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {uiPhase === 'submitted' && (
        <AssessmentSubmittedPage
          email={details.email.trim()}
          reference={submittedReference}
        />
      )}
    </SclAssessmentShell>
  );
}
