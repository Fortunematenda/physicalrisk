'use client';

type Props = {
  canGoBack: boolean;
  canGoNext: boolean;
  nextLabel: string;
  loading?: boolean;
  onBack: () => void;
  onNext: () => void;
};

export function AssessmentNavigation({
  canGoBack,
  canGoNext,
  nextLabel,
  loading,
  onBack,
  onNext,
}: Props) {
  return (
    <div className="scl-exec-navbuttons">
      <button
        type="button"
        className="scl-exec-btn scl-exec-btn-secondary"
        style={{ visibility: canGoBack ? 'visible' : 'hidden' }}
        onClick={onBack}
        disabled={!canGoBack || loading}
      >
        Previous
      </button>
      <button
        type="button"
        className={`scl-exec-btn scl-exec-btn-next${canGoNext ? ' ready' : ''}`}
        disabled={!canGoNext || loading}
        onClick={onNext}
      >
        {loading ? 'Please wait…' : nextLabel}
      </button>
    </div>
  );
}
