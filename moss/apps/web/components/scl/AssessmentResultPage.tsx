'use client';

import type { SclPublicResult } from '@/lib/scl-assessment-types';
import {
  assuranceCategoryInterpretation,
  assuranceDimensionTierLabel,
  deriveEgtAssurancePresentation,
} from '@moss/shared';

const WORDPRESS_CONTACT = `${(process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://test.physicalrisk.com').replace(/\/$/, '')}/#contact`;

type Props = {
  result: SclPublicResult;
  onEmailHint?: string;
};

/** On-screen report matches the EGT visual layout (assurance score /100, dimensions, priorities). */
export function AssessmentResultPage({ result, onEmailHint }: Props) {
  const presentation = deriveEgtAssurancePresentation({
    overallRiskScore: result.exposureIndicator ?? null,
    maturityScore: result.assuranceScore ?? result.overallRiskScore ?? null,
    categoryScores: (result.categoryScores || []).map((c) => ({
      category: c.category,
      score: c.exposureIndicator ?? (100 - Number(c.score || 0)),
    })),
  });

  const score =
    presentation?.assuranceScore ??
    (result.assuranceScore != null && Number.isFinite(Number(result.assuranceScore))
      ? Math.round(Number(result.assuranceScore))
      : result.overallRiskScore != null && Number.isFinite(Number(result.overallRiskScore))
        ? Math.round(Number(result.overallRiskScore))
        : null);

  const categories = presentation?.categoryScores || [];
  const priorities = presentation?.warningIndicators || [];

  while (priorities.length < 3) {
    priorities.push({
      category: 'Assurance',
      assuranceScore: score ?? 0,
      exposureIndicator: 100 - (score ?? 0),
      band: {
        code: 'MODERATE_ASSURANCE',
        displayLabel: 'Moderate assurance',
        shortLabel: 'Moderate',
      },
    });
  }

  const bandLabel = presentation?.assuranceBand.displayLabel || result.riskBand || null;
  const diagnosis = presentation?.diagnosis || result.diagnosis;
  const colourName = presentation?.visual.colourName || result.colourName || 'RED';

  return (
    <section className="scl-exec-result">
      <div className="scl-triage-report-page">
        <div className="scl-triage-report-heading">
          <div>
            <div className="scl-exec-eyebrow">Your complimentary report</div>
            <h2>Preliminary Executive Governance Indication</h2>
          </div>
          {result.downloadUrl ? (
            <a className="scl-exec-btn scl-exec-btn-primary" href={result.downloadUrl} target="_blank" rel="noreferrer">
              Download report (PDF)
            </a>
          ) : (
            <button type="button" className="scl-exec-btn scl-exec-btn-primary" disabled>
              Preparing PDF…
            </button>
          )}
        </div>

        <div className="scl-triage-report-frame">
          <div className="scl-triage-report-brand">
            <img src="/physical_risk_logo_main.png" alt="Physical Risk" className="scl-triage-report-logo" />
            <div className="scl-triage-report-brand-right">
              <b>PHYSICAL RISK CONSULTANCY (PTY) LTD</b>
              <small>
                Independent Executive Security Advisory
                <br />
                physicalrisk.com · info@physicalrisk.com
              </small>
            </div>
          </div>

          <div className="scl-exec-eyebrow scl-triage-report-eyebrow">Complimentary preliminary indication</div>
          <h3 className="scl-triage-report-title scl-triage-report-title-single">Executive Governance Indication</h3>

          <div className="scl-triage-report-meta">
            <div>
              <b>PREPARED FOR</b>
              <span>{result.prospectName || '—'}</span>
            </div>
            <div>
              <b>ORGANISATION</b>
              <span>{result.organisationName}</span>
            </div>
            <div>
              <b>DATE</b>
              <span>{result.assessmentDateLabel}</span>
            </div>
            <div>
              <b>REFERENCE</b>
              <span>{result.reference}</span>
            </div>
          </div>

          <div
            className={`scl-triage-result-panel scl-triage-result-panel--${String(colourName).toLowerCase()}`}
          >
            <div className="scl-triage-score">
              <small>ASSURANCE SCORE</small>
              <div className="scl-triage-score-big">
                {score != null ? (
                  <>
                    {Math.round(score)}
                    <span className="scl-triage-score-denom">/100</span>
                  </>
                ) : (
                  bandLabel || '—'
                )}
              </div>
              {bandLabel ? (
                <div className="scl-triage-score-band">{String(bandLabel).toUpperCase()}</div>
              ) : null}
            </div>
            <div className="scl-triage-position">
              <small>PRELIMINARY POSITION</small>
              <h2>{diagnosis}</h2>
              <p>
                Your responses indicate where governance, assurance, provider-performance or expenditure concerns may
                require independent validation
                {result.accessibleLabel ? ` (${result.accessibleLabel})` : ''}. The result does not confirm that
                controls operate as described.
              </p>
            </div>
          </div>

          {categories.length > 0 ? (
            <div className="scl-egt-dimensions">
              <h4>Assurance dimensions</h4>
              <ul>
                {categories.map((c) => {
                  const s = Math.max(0, Math.min(100, Math.round(Number(c.assuranceScore) || 0)));
                  return (
                    <li key={c.category}>
                      <span className="scl-egt-dim-label">{c.category}</span>
                      <span className="scl-egt-dim-track" aria-hidden>
                        <span className="scl-egt-dim-fill" style={{ width: `${s}%` }} />
                      </span>
                      <span className="scl-egt-dim-value">
                        {s} · {assuranceDimensionTierLabel(s)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="scl-egt-priorities">
            <h4>Strongest warning indicators</h4>
            <div className="scl-egt-priority-grid">
              {priorities.map((p, i) => (
                <article key={`${p.category}-${i}`} className="scl-egt-priority-card">
                  <span className="scl-egt-priority-num">{i + 1}</span>
                  <h5>
                    {p.category}
                    {Number.isFinite(p.assuranceScore) ? ` — ${Math.round(p.assuranceScore)}` : ''}
                  </h5>
                  <p>{assuranceCategoryInterpretation(p.category, Number(p.assuranceScore) || 0)}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="scl-egt-next">
            <div className="scl-exec-eyebrow">Recommended next step</div>
            <h4>Executive Advisory Diagnostic</h4>
            <p>
              Your Executive Governance Triage indicates that an Executive Advisory Diagnostic may be appropriate.
              Request a proposal for a consultant-led Executive Advisory Diagnostic. This remains preliminary triage —
              not an assessment, audit, assurance opinion, or Security Cost Leakage Assessment™.
            </p>
            <hr />
            <p className="scl-egt-route">
              <strong>Recommended entry product:</strong> Executive Advisory Diagnostic
            </p>
            <a className="scl-exec-btn scl-exec-btn-primary" href={WORDPRESS_CONTACT} target="_blank" rel="noreferrer">
              Request Executive Advisory Proposal
            </a>
            <p className="scl-triage-micro" style={{ marginTop: 12 }}>
              Prefer a conversation first? Use Discuss my results for an Executive Discussion.
            </p>
          </div>

          <div className="scl-egt-basis">
            <h4>Important basis of interpretation</h4>
            <p>
              This complimentary indication is derived from questionnaire responses only. It is Level 1 triage and
              decision-support: not an assessment, audit, assurance opinion, diagnostic conclusion, Security Cost
              Leakage Assessment™, or confirmation that controls operate as described. Reference {result.reference}.
            </p>
          </div>

          <div className="scl-egt-footer">
            <span>INDEPENDENT ASSURANCE. MEASURABLE PERFORMANCE. STRONGER GOVERNANCE.</span>
            <span>{result.reference}</span>
          </div>
        </div>

        <div className="scl-exec-result-actions">
          <a className="scl-exec-btn scl-exec-btn-secondary" href={WORDPRESS_CONTACT} target="_blank" rel="noreferrer">
            Discuss my results
          </a>
        </div>
        {onEmailHint ? <p className="scl-exec-help" style={{ marginTop: 12 }}>{onEmailHint}</p> : null}
      </div>
    </section>
  );
}
