'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { AuthGate } from '../../../components/AuthGate';
import { CostLeakageBreadcrumb } from '@/components/assessments/CostLeakageBreadcrumb';
import { Shell } from '../../../components/Shell';
import { StatusBadge } from '../../../components/Ui';
import { PdfPreviewDialog } from '@/components/triage/proposal/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const backHref = isAdvisoryReport ? '/advisory' : '/reports';
  const backLabel = isAdvisoryReport ? 'Back to diagnostics & assurance' : 'Back to Cost Leakage reports';
  const isCostLeakageReport = Boolean(report) && productCode === 'SCLI_COST_LEAKAGE';
  const costLeakageHeading =
    report?.reportType === 'PRELIMINARY_EXECUTIVE'
      ? 'Preliminary Cost Leakage report'
      : 'Approved Cost Leakage report';
  const workHref = engagementHref(
    productCode,
    report?.assessment?.id,
    report?.triageSubmissionId,
    assessmentRef,
  );

  // PDF deep-link: show only the preview dialog — never the issue/send page underneath.
  const pdfOnlyMode = Boolean(forcePdf && isAdvisoryReport);

  function leavePdfPreview() {
    if (isEadReport && report?.assessment?.id) {
      router.replace(
        advisoryWorkspaceHref({
          assessmentId: report.assessment.id,
          productCode,
          reference: assessmentRef,
          hasOutcome: true,
        }),
      );
      return;
    }
    if (workHref) {
      router.replace(workHref);
      return;
    }
    router.replace(backHref);
  }

  return (
    <AuthGate>
      <Shell
        title={
          isCostLeakageReport
            ? costLeakageHeading
            : report?.title || (isAdvisoryReport ? 'Advisory report' : 'Cost leakage report')
        }
        hideSearch={pdfOnlyMode || isCostLeakageReport}
        hideTitle={pdfOnlyMode || isCostLeakageReport}
        headerLeading={
          isCostLeakageReport && !pdfOnlyMode ? (
            <CostLeakageBreadcrumb current={report?.assessment?.reference || 'Report'} />
          ) : undefined
        }
      >
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}
        {notice && !pdfOnlyMode ? (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>
        ) : null}
        {pdfOnlyMode ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            {previewError ? (
              <div className="space-y-3 text-center">
                <p className="text-sm text-red-700">{previewError}</p>
                <Button type="button" variant="outline" onClick={() => leavePdfPreview()}>
                  Back
                </Button>
              </div>
            ) : previewLoading || !previewOpen ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Opening report preview…
              </p>
            ) : null}
          </div>
        ) : report ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardContent className="space-y-3 p-5 sm:p-6">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {report.assessment.reference}
                </p>
                <h1 className="m-0 text-xl font-semibold text-slate-900">
                  {isCostLeakageReport ? costLeakageHeading : report.title}
                </h1>
                <p className="m-0 text-sm text-slate-500">{report.assessment.organisation.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={report.status} />
                  <span className="text-sm text-slate-500">
                    {formatAdvisoryReportVersion(report.version)}
                    {' · '}
                    Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-ZA') : 'Not yet generated'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
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
                  {report.downloadUrl ? (
                    <Button asChild variant={isAdvisoryReport ? 'outline' : 'default'}>
                      <a href={report.downloadUrl} target="_blank" rel="noreferrer">
                        <Download className="size-4" />
                        Download PDF
                      </a>
                    </Button>
                  ) : null}
                  {workHref ? (
                    <Button asChild variant="outline">
                      <Link href={workHref}>
                        {productCode === 'SCLI_COST_LEAKAGE'
                          ? 'Open assessment'
                          : productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC'
                            ? 'Open diagnostic outcome'
                            : 'Open engagement'}
                      </Link>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline">
                    <Link href={backHref}>{backLabel}</Link>
                  </Button>
                </div>
                {previewError ? <p className="m-0 text-sm text-red-700">{previewError}</p> : null}
              </CardContent>
            </Card>
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <form onSubmit={issue}>
                <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-3">
                  <CardTitle className="text-base">Issue report</CardTitle>
                  <CardDescription>
                    Email the client the PDF report as an attachment, plus a secure seven-day download link. SMTP must be configured.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                  <div className="space-y-1.5">
                    <Label htmlFor="recipient-email">Recipient email</Label>
                    <Input
                      id="recipient-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="client@company.com"
                    />
                    {email ? (
                      <p className="m-0 text-xs text-slate-500">
                        Prefilled from the client organisation. You can change it before sending.
                      </p>
                    ) : null}
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? 'Sending…' : 'Send report'}
                  </Button>
                </CardContent>
              </form>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Loading report…</p>
        )}

        <PdfPreviewDialog
          open={previewOpen && Boolean(previewBytes)}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open && forcePdf) {
              leavePdfPreview();
            }
          }}
          pdfBytes={previewBytes}
          title={report?.title || 'Executive Advisory report'}
          description="On-screen report preview. Closing returns you to the diagnostic outcome."
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
