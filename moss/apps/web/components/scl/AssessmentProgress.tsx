'use client';

type Props = {
  title?: string;
  phaseLabel?: string;
  step: number;
  total: number;
};

export function AssessmentProgress({
  title = 'Executive Governance Triage',
  phaseLabel,
  step,
  total,
}: Props) {
  const pct = total ? Math.round((step / total) * 100) : 0;
  return (
    <div className="scl-triage-assess-head">
      <p className="scl-exec-eyebrow scl-triage-assess-eyebrow">{title}</p>
      <div className="scl-triage-toprow">
        <span>
          Question {step} of {total}
          {phaseLabel ? ` · ${phaseLabel}` : ''}
        </span>
      </div>
      <div
        className="scl-exec-progress"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% complete`}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
