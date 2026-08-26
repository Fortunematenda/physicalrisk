'use client';

type Props = {
  onStart: () => void;
};

/** Five executive themes from the SCL triage landing panel. */
const FIVE_EXECUTIVE_QUESTIONS = [
  'Are you receiving value for your security expenditure?',
  'Are contracted services being delivered as required?',
  'Can reported security performance be independently verified?',
  'Where could security expenditure be leaking?',
  'Is executive oversight sufficient to identify underperformance?',
];

export function AssessmentLandingHero({ onStart }: Props) {
  return (
    <main id="landing" className="scl-triage-landing">
      <section className="scl-triage-hero">
        <div className="scl-triage-hero-left">
          <p className="scl-exec-eyebrow">Complimentary executive questionnaire</p>
          <h1>Can your organisation prove that security is governed, delivered and worth what it costs?</h1>
          <p className="scl-exec-lead">
            The Executive Governance Triage identifies preliminary indicators of governance exposure,
            security cost leakage, provider underperformance, unreliable reporting and operational fragility.
          </p>
          <div className="scl-exec-actions">
            <button type="button" className="scl-exec-btn scl-exec-btn-primary" onClick={onStart}>
              Start the 3-minute questionnaire
            </button>
          </div>
          <p className="scl-triage-micro">
            15 executive questions · About 3 minutes · Complimentary preliminary report · No obligation
          </p>
        </div>

        <aside className="scl-triage-hero-right" aria-label="Five executive questions">
          <div className="scl-triage-side-title">Five executive questions</div>
          {FIVE_EXECUTIVE_QUESTIONS.map((q, i) => (
            <div className="scl-triage-qline" key={q}>
              <span className="scl-triage-qnum">{String(i + 1).padStart(2, '0')}</span>
              <span>{q}</span>
            </div>
          ))}
          <p className="scl-triage-side-disclaimer">
            This is a preliminary indication based on your responses, not an audit or independent assurance
            opinion.
          </p>
        </aside>
      </section>
    </main>
  );
}
