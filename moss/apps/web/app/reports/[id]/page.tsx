'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { apiFetch } from '../../../lib/api';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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
      })
      .catch((e) => setError(e.message));
  }, [id]);

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

  return (
    <AuthGate>
      <Shell title="Executive Report">
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {report ? (
          <div className="grid two-col">
            <section className="card">
              <p className="eyebrow">{report.assessment.reference}</p>
              <h2>{report.title}</h2>
              <p>{report.assessment.organisation.name}</p>
              <p><StatusBadge value={report.status} /></p>
              <p className="muted">Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-ZA') : 'Not yet generated'}</p>
              {report.downloadUrl && (
                <a className="btn" href={report.downloadUrl} target="_blank" rel="noreferrer">Download PDF</a>
              )}
            </section>
            <form className="card" onSubmit={issue}>
              <h2>Issue report</h2>
              <p className="muted small">Email the client the PDF report as an attachment, plus a secure seven-day download link. SMTP must be configured.</p>
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
