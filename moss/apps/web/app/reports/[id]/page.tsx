'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { apiFetch } from '../../../lib/api';

const ADVISORY_PRODUCTS = new Set([
  'EXECUTIVE_GOVERNANCE_TRIAGE',
  'EXECUTIVE_ADVISORY_DIAGNOSTIC',
  'CONTRACT_SLA_ASSURANCE',
  'VENDOR_PERFORMANCE_ASSURANCE',
  'GOVERNANCE_EXECUTIVE_ASSURANCE',
  'CYBER_PHYSICAL_DEPENDENCY',
  'SHIELD360',
]);

function engagementHref(productCode?: string, assessmentId?: string, triageSubmissionId?: string | null) {
  if (productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE') {
    const triageId = triageSubmissionId || assessmentId;
    return triageId ? `/triage/${triageId}` : null;
  }
  if (!assessmentId) return null;
  if (productCode === 'SCLI_COST_LEAKAGE') return `/assessments/${assessmentId}`;
  if (productCode && ADVISORY_PRODUCTS.has(productCode)) return `/advisory/${assessmentId}`;
  return `/assessments/${assessmentId}`;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const [report, setReport] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const productCode = String(report?.assessment?.productCode || '');
  const isTriageReport = productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE';
  const isAdvisoryReport = useMemo(() => {
    if (viewParam === 'triage') return false;
    if (viewParam === 'advisory') return true;
    if (viewParam === 'scl') return false;
    if (isTriageReport) return false;
    return ADVISORY_PRODUCTS.has(productCode);
  }, [viewParam, productCode, isTriageReport]);

  useEffect(() => {
    apiFetch(`/reports/${id}`)
      .then((data) => {
        setReport(data);
        const suggested =
          data.suggestedRecipientEmail
          || data.assessment?.organisation?.primaryEmail
          || data.contact?.email
          || '';
        if (suggested) setEmail(suggested);

        const code = String(data.assessment?.productCode || '');
        if (code === 'EXECUTIVE_GOVERNANCE_TRIAGE' && viewParam !== 'triage') {
          router.replace(`/reports/${id}?view=triage`);
          return;
        }
        if (ADVISORY_PRODUCTS.has(code) && code !== 'EXECUTIVE_GOVERNANCE_TRIAGE' && viewParam !== 'advisory') {
          router.replace(`/reports/${id}?view=advisory`);
        }
      })
      .catch((e) => setError(e.message));
  }, [id, router, viewParam]);

  async function issue(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/reports/${id}/issue`, { method: 'POST', body: JSON.stringify({ email }) });
      setNotice('The report was issued by email.');
      const data = await apiFetch(`/reports/${id}`);
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const backHref = isTriageReport || viewParam === 'triage'
    ? '/reports#executive-triage-reports'
    : isAdvisoryReport
      ? '/reports#executive-advisory-reports'
      : '/reports';
  const backLabel = isTriageReport || viewParam === 'triage'
    ? 'Back to triage reports'
    : isAdvisoryReport
      ? 'Back to advisory reports'
      : 'Back to Cost Leakage reports';
  const workHref = engagementHref(productCode, report?.assessment?.id, report?.triageSubmissionId);

  return (
    <AuthGate>
      <Shell title={report?.title || (isAdvisoryReport ? 'Advisory report' : 'Executive Report')}>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {report ? (
          <div className="grid two-col">
            <section className="card">
              <p className="eyebrow">{report.assessment.reference}</p>
              <h2>{report.title}</h2>
              <p>{report.assessment.organisation.name}</p>
              <p><StatusBadge value={report.status} /></p>
              <p className="muted">
                Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-ZA') : 'Not yet generated'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {report.downloadUrl && (
                  <a className="btn" href={report.downloadUrl} target="_blank" rel="noreferrer">Download PDF</a>
                )}
                {workHref ? (
                  <Link className="btn secondary" href={workHref}>
                    Open engagement
                  </Link>
                ) : null}
                <Link className="btn secondary" href={backHref}>
                  {backLabel}
                </Link>
              </div>
            </section>
            <form className="card" onSubmit={issue}>
              <h2>Issue report</h2>
              <p className="muted small">
                Email the client the PDF report as an attachment, plus a secure seven-day download link. SMTP must be configured.
              </p>
              <div className="field">
                <label>Recipient email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@company.com"
                />
                {email && (
                  <small className="muted">Prefilled from the client organisation / lead contact. You can change it before sending.</small>
                )}
              </div>
              <button className="btn" style={{ marginTop: 16 }} disabled={busy}>
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </form>
          </div>
        ) : (
          <div className="loading-screen">Loading report…</div>
        )}
      </Shell>
    </AuthGate>
  );
}
