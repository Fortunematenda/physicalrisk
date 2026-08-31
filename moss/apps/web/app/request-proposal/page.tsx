'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import { SclAssessmentShell } from '@/components/scl/SclAssessmentShell';

type Preview = {
  organisationName: string;
  recommendedProduct: string;
  alreadyRequested: boolean;
  proposalReference?: string | null;
  proposalStatus?: string;
  sourceTriageReference?: string | null;
  message: string;
};

type ConfirmResult = {
  ok: boolean;
  alreadyRequested: boolean;
  proposalReference?: string | null;
  sourceTriageReference?: string | null;
  message: string;
};

function RequestProposalInner() {
  const params = useSearchParams();
  const token = String(params.get('token') || '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      if (!token) {
        setError('This proposal link is invalid or has expired.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/public/triage/proposal?token=${encodeURIComponent(token)}`, {
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'This proposal link is invalid or has expired.');
        if (!cancelled) setPreview(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'This proposal link is invalid or has expired.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirm() {
    if (!token || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/public/triage/proposal`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Unable to submit your proposal request.');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to submit your proposal request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SclAssessmentShell>
      <main className="scl-exec-assessment" style={{ minHeight: '70vh' }}>
        <div className="scl-exec-shell">
          <div className="scl-exec-assess-wrap scl-exec-submitted">
            <p className="scl-exec-eyebrow">Executive Governance Triage</p>
            <h1 className="scl-exec-submitted-title">Request an Executive Advisory Proposal</h1>

            {loading ? <p className="scl-exec-lead">Validating your secure link…</p> : null}
            {error ? <p className="scl-exec-help" style={{ color: '#b91c1c' }}>{error}</p> : null}

            {!loading && !error && preview && !result ? (
              <>
                <p className="scl-exec-lead">
                  Organisation: <strong>{preview.organisationName}</strong>
                </p>
                <div className="scl-triage-conversion-card">
                  <p>{preview.message}</p>
                  <p style={{ marginTop: 12 }}>
                    Requesting a proposal will notify the Physical Risk advisory team. This does not purchase or
                    commission an assessment.
                  </p>
                  {preview.alreadyRequested ? (
                    <div className="scl-triage-request-success" role="status" style={{ marginTop: 16 }}>
                      <strong>Your proposal request has already been received.</strong>
                      {preview.proposalReference ? (
                        <p style={{ marginTop: 8 }}>Reference: {preview.proposalReference}</p>
                      ) : null}
                      {preview.sourceTriageReference ? (
                        <p style={{ marginTop: 8 }}>Source triage: {preview.sourceTriageReference}</p>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="scl-exec-btn scl-exec-btn-primary"
                      style={{ marginTop: 20, background: '#df0b12', color: '#fff' }}
                      disabled={submitting}
                      onClick={() => void confirm()}
                    >
                      {submitting ? 'Submitting…' : 'Request Proposal'}
                    </button>
                  )}
                </div>
              </>
            ) : null}

            {result ? (
              <div className="scl-triage-conversion-card">
                <h2>{result.alreadyRequested ? 'Already received' : 'Proposal request received'}</h2>
                <p style={{ marginTop: 12 }}>{result.message}</p>
                {result.proposalReference ? (
                  <p className="scl-exec-submitted-ref" style={{ marginTop: 16 }}>
                    Reference: <strong>{result.proposalReference}</strong>
                  </p>
                ) : null}
                {result.sourceTriageReference ? (
                  <p className="scl-exec-submitted-ref" style={{ marginTop: 8 }}>
                    Source triage: <strong>{result.sourceTriageReference}</strong>
                  </p>
                ) : null}
                <p className="scl-proposal-received-note">
                  The Physical Risk advisory team will contact you regarding the Executive Advisory Diagnostic.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </SclAssessmentShell>
  );
}

export default function RequestProposalPage() {
  return (
    <Suspense
      fallback={
        <SclAssessmentShell>
          <main className="scl-exec-assessment">
            <div className="scl-exec-shell">
              <p className="scl-exec-lead">Loading…</p>
            </div>
          </main>
        </SclAssessmentShell>
      }
    >
      <RequestProposalInner />
    </Suspense>
  );
}
