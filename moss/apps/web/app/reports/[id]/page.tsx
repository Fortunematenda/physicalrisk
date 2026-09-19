'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { PdfPreviewDialog } from '@/components/triage/proposal/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '../../../lib/api';
import { formatAdvisoryReportVersion, advisoryWorkspaceHref, isExecutiveAdvisoryDiagnostic } from '@/lib/advisory-report';

const ADVISORY_PRODUCTS = new Set([
  'EXECUTIVE_GOVERNANCE_TRIAGE',
  'EXECUTIVE_ADVISORY_DIAGNOSTIC',
  'CONTRACT_SLA_ASSURANCE',
  'VENDOR_PERFORMANCE_ASSURANCE',
  'GOVERNANCE_EXECUTIVE_ASSURANCE',
  'CYBER_PHYSICAL_DEPENDENCY',
  // LEGACY ONLY — historical Shield 360 reports remain navigable.
  'SHIELD360',
]);

function engagementHref(productCode?: string, assessmentId?: string, triageSubmissionId?: string | null, reference?: string | null) {
  if (productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE') {
    const triageId = triageSubmissionId || assessmentId;
    return triageId ? `/triage/${triageId}` : null;
  }
  if (!assessmentId) return null;
  if (productCode === 'SCLI_COST_LEAKAGE') return `/assessments/${assessmentId}`;
  if (
    isExecutiveAdvisoryDiagnostic({ productCode, reference })
  ) {
    return advisoryWorkspaceHref({
      assessmentId,
      productCode,
      reference,
      hasOutcome: true,
    });
  }
  if (productCode && ADVISORY_PRODUCTS.has(productCode)) return `/advisory/${assessmentId}`;
  return `/assessments/${assessmentId}`;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const forcePdf = searchParams.get('pdf') === '1';
  const [report, setReport] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const productCode = String(report?.assessment?.productCode || '');
  const assessmentRef = String(report?.assessment?.reference || '');
  const isTriageReport = productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE';
  const isEadReport = isExecutiveAdvisoryDiagnostic({
    productCode,
    reference: assessmentRef,
  });
  const isAdvisoryReport = useMemo(() => {
    if (viewParam === 'advisory') return true;
    if (viewParam === 'scl') return false;
    if (isTriageReport) return false;
    return ADVISORY_PRODUCTS.has(productCode) || isEadReport;
  }, [viewParam, productCode, isTriageReport, isEadReport]);

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
        const ref = String(data.assessment?.reference || '');
        // Triage indications live on Triage submissions — don't keep a separate reports surface.
        if (code === 'EXECUTIVE_GOVERNANCE_TRIAGE') {
          const triageId = data.triageSubmissionId || data.assessment?.id;
          router.replace(triageId ? `/triage/${triageId}` : '/triage');
          return;
        }
        // EAD reports open Diagnostic outcome by default (PDF via ?pdf=1).
        if (
          isExecutiveAdvisoryDiagnostic({ productCode: code, reference: ref }) &&
          data.assessment?.id &&
          !forcePdf
        ) {
          router.replace(
            advisoryWorkspaceHref({
              assessmentId: data.assessment.id,
              productCode: code,
              reference: ref,
              hasOutcome: true,
            }),
          );
          return;
        }
        if ((ADVISORY_PRODUCTS.has(code) || isExecutiveAdvisoryDiagnostic({ productCode: code, reference: ref })) && viewParam !== 'advisory') {
          router.replace(`/reports/${id}?view=advisory${forcePdf ? '&pdf=1' : ''}`);
        }
      })
      .catch((e) => setError(e.message));
  }, [id, router, viewParam, forcePdf]);

  useEffect(() => {
    if (!isAdvisoryReport || !forcePdf || !report?.downloadUrl) {
      setPreviewBytes(null);
      setPreviewOpen(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    fetch(report.downloadUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load report PDF for preview.');
        return res.arrayBuffer();
      })
      .then((bytes) => {
        if (cancelled) return;
        setPreviewBytes(bytes);
        setPreviewOpen(true);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setPreviewError(e.message || 'Unable to preview this report.');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdvisoryReport, forcePdf, report?.downloadUrl]);

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

  const backHref = isAdvisoryReport ? '/reports#executive-advisory-reports' : '/reports';
  const backLabel = isAdvisoryReport ? 'Back to advisory reports' : 'Back to Cost Leakage reports';
  const workHref = engagementHref(
    productCode,
    report?.assessment?.id,
    report?.triageSubmissionId,
    assessmentRef,
  );

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
                {formatAdvisoryReportVersion(report.version)}
                {' · '}
                Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-ZA') : 'Not yet generated'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                {isAdvisoryReport ? (
                  <Button
                    type="button"
                    disabled={previewLoading || !report.downloadUrl}
                    onClick={() => setPreviewOpen(true)}
                  >
                    {previewLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                    View report
                  </Button>
                ) : null}
                {report.downloadUrl && (
                  <a className="btn secondary" href={report.downloadUrl} target="_blank" rel="noreferrer">
                    <Download className="mr-1 inline size-4" />
                    Download PDF
                  </a>
                )}
                {workHref ? (
                  <Link className="btn secondary" href={workHref}>
                    {productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC'
                      ? 'Open diagnostic outcome'
                      : 'Open engagement'}
                  </Link>
                ) : null}
                <Link className="btn secondary" href={backHref}>
                  {backLabel}
                </Link>
              </div>
              {previewError ? <p className="error" style={{ marginTop: 12 }}>{previewError}</p> : null}
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

        <PdfPreviewDialog
          open={previewOpen && Boolean(previewBytes)}
          onOpenChange={setPreviewOpen}
          pdfBytes={previewBytes}
          title={report?.title || 'Executive Advisory report'}
          description="On-screen report preview. Use Download PDF if you need a file."
          downloadLabel="Download PDF"
          onDownload={() => {
            if (report?.downloadUrl) {
              window.open(report.downloadUrl, '_blank', 'noopener,noreferrer');
            }
          }}
        />
      </Shell>
    </AuthGate>
  );
}
