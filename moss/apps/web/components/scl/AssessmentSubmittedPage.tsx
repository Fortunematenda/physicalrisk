type Props = {
  email: string;
  reference?: string | null;
};

/** Post-submit confirmation. Completion is captured automatically. */
export function AssessmentSubmittedPage({ email, reference }: Props) {
  return (
    <section className="scl-exec-assessment">
      <div className="scl-exec-shell">
        <div className="scl-exec-assess-wrap scl-exec-submitted">
          <p className="scl-exec-eyebrow">Questionnaire completed</p>
          <h1 className="scl-exec-submitted-title">Thank you</h1>
          <p className="scl-exec-lead">
            Your Preliminary Executive Governance Indication has been sent to{' '}
            <strong>{email}</strong>. Please check your inbox (and spam folder) for the PDF attachment.
          </p>
          {reference ? (
            <p className="scl-exec-submitted-ref">
              Reference: <strong>{reference}</strong>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
