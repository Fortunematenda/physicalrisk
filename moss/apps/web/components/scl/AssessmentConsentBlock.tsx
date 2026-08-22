'use client';

type Props = {
  consentAccepted: boolean;
  insightsOptIn: boolean;
  onConsentChange: (next: boolean) => void;
  onInsightsChange: (next: boolean) => void;
};

/** Consent block for the final executive-details step (after form fields). */
export function AssessmentConsentBlock({
  consentAccepted,
  insightsOptIn,
  onConsentChange,
  onInsightsChange,
}: Props) {
  return (
    <div className="scl-exec-consent-card">
      <label className="scl-exec-consent-row">
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => onConsentChange(e.target.checked)}
        />
        <span>
          I authorise Physical Risk to process my details and responses to generate this report and
          contact me about its findings. <em className="scl-exec-req">*</em>
        </span>
      </label>
      <label className="scl-exec-consent-row">
        <input
          type="checkbox"
          checked={insightsOptIn}
          onChange={(e) => onInsightsChange(e.target.checked)}
        />
        <span>I would also like to receive occasional Physical Risk executive insights.</span>
      </label>
      <p className="scl-exec-consent-note">
        Your information is used for the stated purposes. You may request access, correction or deletion
        by emailing info@physicalrisk.com.
      </p>
    </div>
  );
}
