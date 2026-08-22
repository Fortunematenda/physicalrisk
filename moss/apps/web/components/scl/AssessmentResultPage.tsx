'use client';

import type { SclPublicResult } from '@/lib/scl-assessment-types';

const WORDPRESS_CONTACT = `${(process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://test.physicalrisk.com').replace(/\/$/, '')}/#contact`;

type Props = {
  result: SclPublicResult;
  onEmailHint?: string;
};

function categoryInterpretation(_category: string, score: number): string {
  if (score >= 75) {
    return 'Critical exposure indicators suggest priority independent review.';
  }
  if (score >= 60) {
    return 'Elevated leakage or underperformance indicators warrant focused independent validation.';
  }
  if (score >= 40) {
    return 'Assurance may not be consistently matched to independently verifiable delivery evidence.';
  }
  return 'Responses indicate relatively stronger control indicators; independent validation remains decision-support only.';
}

/** On-screen report matches the EGT visual layout (score /100, dimensions, priorities). */
export function AssessmentResultPage({ result, onEmailHint }: Props) {
  const score =
    result.overallRiskScore != null && Number.isFinite(Number(result.overallRiskScore))
      ? Math.round(Number(result.overallRiskScore))
      : null;
  const categories = [...(result.categoryScores || [])];
  const priorities = [...categories]
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 3);

  while (priorities.length < 3) {
    priorities.push({
      category: 'Assurance',
      score: score ?? 0,
    });
  }

  return (
    <section className="scl-exec-result">
      <div className="scl-triage-report-page">
        <div className="scl-triage-report-heading">
          <div>
            <div className="scl-exec-eyebrow">Your complimentary report</div>
            <h2>Preliminary Security Cost Leakage Indication Report</h2>
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
          <h3 className="scl-triage-report-title scl-triage-report-title-single">Security Cost Leakage Report</h3>

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
            className={`scl-triage-result-panel scl-triage-result-panel--${(result.colourName || 'RED').toLowerCase()}`}
          >
            <div className="scl-triage-score">
              <small>
                SECURITY COST
                <br />
                LEAKAGE INDICATION
              </small>
              <div className="scl-triage-score-big">
                {score != null ? (
                  <>
                    {score}
                    <span className="scl-triage-score-denom">/100</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="scl-triage-position">
              <small>PRELIMINARY POSITION</small>
              <h2>{result.diagnosis}</h2>
              <p>
                Your responses indicate where security cost leakage may require independent validation
                {result.accessibleLabel ? ` (${result.accessibleLabel})` : ''}. The result does not confirm
                that controls operate as described.
              </p>
            </div>
          </div>

          {categories.length > 0 ? (
            <div className="scl-egt-dimensions">
              <h4>Dimension indications</h4>
              <ul>
                {categories.map((c) => {
                  const s = Math.max(0, Math.min(100, Math.round(Number(c.score) || 0)));
                  return (
                    <li key={c.category}>
                      <span className="scl-egt-dim-label">{c.category}</span>
                      <span className="scl-egt-dim-track" aria-hidden>
                        <span className="scl-egt-dim-fill" style={{ width: `${s}%` }} />
                      </span>
                      <span className="scl-egt-dim-value">{s}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="scl-egt-priorities">
            <h4>Priority exposure indicators</h4>
            <div className="scl-egt-priority-grid">
              {priorities.map((p, i) => (
                <article key={`${p.category}-${i}`} className="scl-egt-priority-card">
                  <span className="scl-egt-priority-num">{i + 1}</span>
                  <h5>{p.category}</h5>
                  <p>{categoryInterpretation(p.category, Number(p.score) || 0)}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="scl-egt-next">
            <div className="scl-exec-eyebrow">Recommended next step</div>
            <h4>Convert the indication into defensible evidence.</h4>
            <p>
              A focused Physical Risk diagnostic translates this preliminary Security Cost Leakage indication
              into independently verifiable findings, contract enforceability gaps, and a practical executive
              remediation sequence.
            </p>
            <hr />
            <p className="scl-egt-route">
              <strong>Focused route indicated:</strong> Security Cost Leakage Assessment™
            </p>
            <a className="scl-exec-btn scl-exec-btn-primary" href={WORDPRESS_CONTACT} target="_blank" rel="noreferrer">
              Request an Executive Advisory Diagnostic
            </a>
          </div>

          <div className="scl-egt-basis">
            <h4>Important basis of interpretation</h4>
            <p>
              This complimentary indication is derived from questionnaire responses and the governed Security
              Cost Leakage model. It is decision-support only and does not constitute an audit, assurance
              opinion, or confirmation that controls operate as described. Reference {result.reference}.
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
