'use client';

type Props = {
  phase: string;
  question: string;
  help?: string;
  children: React.ReactNode;
  error?: string;
};

export function AssessmentQuestionCard({ phase, question, help, children, error }: Props) {
  return (
    <div className="scl-exec-card">
      <div className="scl-exec-phase">{phase}</div>
      <h2 className="scl-exec-q">{question}</h2>
      {help ? <p className="scl-exec-help">{help}</p> : null}
      {children}
      {error ? (
        <p className="scl-exec-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
