'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, FileText, Loader2, Lock, NotebookPen, Send } from 'lucide-react';
import { AuthGate } from '@/components/AuthGate';
import { AdvisoryBreadcrumb } from '@/components/advisory/AdvisoryBreadcrumb';
import { AdvisoryReportSummaryPreview } from '@/components/advisory/AdvisoryReportSummaryPreview';
import { RequestComprehensiveProposalCard } from '@/components/advisory/RequestComprehensiveProposalCard';
import { CreateLevel3EngagementsCard } from '@/components/triage/CreateLevel3EngagementsCard';
import { PdfPreviewDialog } from '@/components/triage/proposal/PdfPreviewDialog';
import { Shell } from '@/components/Shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import {
  advisoryWorkingPapersHref,
  pickLatestAdvisoryReport,
  type LatestAdvisoryReport,
} from '@/lib/advisory-report';
import { cn } from '@/lib/utils';
import { isLegacyShield360ProductCode } from '@moss/shared';

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function isDiagnosticCompleted(
  engagement: { status?: string | null },
  outcome: { confirmedAt?: string | null },
) {
  if (outcome?.confirmedAt) return true;
  const status = String(engagement?.status || '');
  return ['REPORT_ISSUED', 'REPORT_GENERATED', 'CLOSED', 'APPROVED'].includes(status);
}

export default function AdvisoryOutcomePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBytes, setPreviewBytes] = useState<ArrayBuffer | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDownloadUrl, setPreviewDownloadUrl] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendReportId, setSendReportId] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState('');
  const [sendBusy, setSendBusy] = useState(false);

  const load = useCallback(async () => {
    const row = await apiFetch<any>(`/advisory/${id}/outcome`);
    setData(row);
    setNotes(row.outcome?.commercialAdminNotes || '');
    if (row.outcome?.commercialAdminNotes) setNotesOpen(false);
    return row;
  }, [id]);

  useEffect(() => {
    void load()
      .then(() => setLoadFailed(false))
      .catch((e: Error) => {
        const msg = String(e.message || '');
        if (/not been confirmed|only available for Executive Advisory/i.test(msg)) {
          router.replace(`/advisory/${id}`);
          return;
        }
        setLoadFailed(true);
        toast({
          title: 'Unable to load outcome',
          description: e.message,
          variant: 'error',
        });
      });
  }, [load, toast, router, id]);

  async function openReportPreview(reportId: string) {
    setPreviewLoading(true);
    try {
      const report = await apiFetch<{ downloadUrl?: string; title?: string }>(`/reports/${reportId}`);
      if (!report?.downloadUrl) {
        throw new Error('Report file is not available yet.');
      }
      const res = await fetch(report.downloadUrl);
      if (!res.ok) throw new Error('Unable to load report PDF for preview.');
      const bytes = await res.arrayBuffer();
      setPreviewBytes(bytes);
      setPreviewDownloadUrl(report.downloadUrl);
      setPreviewOpen(true);
    } catch (e: unknown) {
      toast({
        title: 'Unable to open report',
        description: e instanceof Error ? e.message : 'Preview failed.',
        variant: 'error',
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openSendReport(reportId: string) {
    setSendBusy(true);
    setSendReportId(reportId);
    try {
      const report = await apiFetch<{
        suggestedRecipientEmail?: string | null;
        assessment?: { organisation?: { primaryEmail?: string | null } };
        contact?: { email?: string | null };
      }>(`/reports/${reportId}`);
      const suggested =
        report.suggestedRecipientEmail
        || report.assessment?.organisation?.primaryEmail
        || report.contact?.email
        || data?.engagement?.organisation?.primaryEmail
        || '';
      setSendEmail(String(suggested || '').trim());
      setSendOpen(true);
    } catch (e: unknown) {
      setSendReportId(null);
      toast({
        title: 'Unable to prepare send',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSendBusy(false);
    }
  }

  async function sendReport() {
    if (!sendReportId) return;
    const email = sendEmail.trim();
    if (!email) {
      toast({
        title: 'Recipient required',
        description: 'Enter a client email address before sending.',
        variant: 'error',
      });
      return;
    }
    setSendBusy(true);
    try {
      await apiFetch(`/reports/${sendReportId}/issue`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSendOpen(false);
      setSendReportId(null);
      toast({
        title: 'Report sent',
        description: `The executive report was emailed to ${email}.`,
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: 'Send failed',
        description: e instanceof Error ? e.message : 'Unable to send report.',
        variant: 'error',
      });
    } finally {
      setSendBusy(false);
    }
  }

  async function saveNotes() {
    setBusy(true);
    try {
      await apiFetch(`/advisory/${id}/commercial-proposal`, {
        method: 'POST',
        body: JSON.stringify({ action: 'SAVE_NOTES', commercialAdminNotes: notes }),
      });
      toast({ title: 'Internal note saved', variant: 'success' });
      await load();
      setNotesOpen(false);
    } catch (e: unknown) {
      toast({
        title: 'Unable to save note',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  const recommendationCount = useMemo(() => {
    const list = Array.isArray(data?.recommendations) ? data.recommendations : [];
    return list.filter(
      (r: { productCode?: string }) =>
        r.productCode && !isLegacyShield360ProductCode(r.productCode),
    ).length;
  }, [data]);

  if (!data) {
    return (
      <AuthGate>
        <Shell
          title="Diagnostic outcome"
          hideSearch
          hideTitle
          headerLeading={<AdvisoryBreadcrumb current="…" />}
        >
          {loadFailed ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Unable to load outcome</CardTitle>
                <CardDescription>Check the toast notification for details, then retry.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="mx-auto max-w-[1440px] space-y-3 px-1">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          )}
        </Shell>
      </AuthGate>
    );
  }

  const { engagement, outcome } = data;
  const canManageCommercial = Boolean(data.permissions?.canManageCommercial);
  const confirmedByName = [outcome.confirmedBy?.firstName, outcome.confirmedBy?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const diagnosticName = engagement.productLabel || engagement.title || 'Executive Advisory Diagnostic';
  const completed = isDiagnosticCompleted(engagement, outcome);
  const latestReport = pickLatestAdvisoryReport(
    (engagement.reports || []) as LatestAdvisoryReport[],
  );
  const proposal = data.comprehensiveProposal || null;
  const modules = Array.isArray(engagement.advisoryModuleReviews)
    ? engagement.advisoryModuleReviews
    : [];

  return (
    <AuthGate>
      <Shell
        title={`Diagnostic outcome · ${engagement.reference}`}
        hideSearch
        hideTitle
        headerLeading={<AdvisoryBreadcrumb current={engagement.reference || 'Outcome'} />}
      >
        <div className="outcome-workspace mx-auto max-w-[1440px] space-y-5 px-1 pb-10">
          {/* 1. Header */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {completed ? (
                    <Badge variant="success" className="gap-1 px-2.5 py-1 text-xs">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Completed
                    </Badge>
                  ) : null}
                  {completed ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"
                      title="This routing outcome was confirmed when the diagnostic was completed."
                    >
                      <Lock className="size-3.5" aria-hidden="true" />
                      Outcome confirmed
                    </span>
                  ) : null}
                </div>
                <div className="space-y-0.5">
                  <h1 className="m-0 text-xl font-semibold leading-snug text-slate-900 sm:text-2xl">
                    {diagnosticName}
                  </h1>
                  <p className="m-0 text-sm font-semibold tracking-wide text-slate-500">
                    {engagement.reference}
                  </p>
                </div>
                <p className="m-0 text-sm text-slate-700">
                  {engagement.organisation?.name || 'Organisation'}
                </p>
                {completed ? (
                  <p className="m-0 text-sm text-slate-600">
                    Completed{' '}
                    <time dateTime={outcome.confirmedAt || undefined}>{fmt(outcome.confirmedAt)}</time>
                    {confirmedByName ? (
                      <>
                        {' · '}
                        {confirmedByName}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {latestReport?.id ? (
                  <Button
                    size="lg"
                    type="button"
                    className="h-11 shrink-0 whitespace-nowrap px-4"
                    disabled={previewLoading}
                    onClick={() => void openReportPreview(latestReport.id)}
                  >
                    {previewLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                    View report
                  </Button>
                ) : (
                  <Button size="lg" asChild className="h-11 shrink-0 whitespace-nowrap px-4">
                    <Link href={advisoryWorkingPapersHref(String(id))}>Generate report</Link>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="h-11 shrink-0 whitespace-nowrap px-4"
                >
                  <Link href={advisoryWorkingPapersHref(String(id))}>
                    <NotebookPen className="size-4" />
                    Open working papers
                  </Link>
                </Button>
                {latestReport?.id ? (
                  <Button
                    variant="outline"
                    size="lg"
                    type="button"
                    className="h-11 shrink-0 whitespace-nowrap px-4"
                    disabled={sendBusy}
                    onClick={() => void openSendReport(latestReport.id)}
                  >
                    {sendBusy && !sendOpen ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* 2. Executive Outcome | Commercial next step */}
          {modules.length ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.95fr)]">
              <Card className="rounded-xl border-slate-200 shadow-sm self-start">
                <CardContent className="p-5 sm:p-6">
                  <AdvisoryReportSummaryPreview
                    modules={modules}
                    recommendationCount={recommendationCount}
                    variant="hero"
                  />
                </CardContent>
              </Card>
              <div className="space-y-4">
                <RequestComprehensiveProposalCard
                  assessmentId={String(id)}
                  recommendations={Array.isArray(data.recommendations) ? data.recommendations : []}
                  comprehensiveProposal={proposal}
                  canRequest={Boolean(data.permissions?.canRequestComprehensiveProposal)}
                  canOpenWorkspace={Boolean(data.permissions?.canOpenProposalWorkspace)}
                  organisationName={engagement.organisation?.name}
                  onChanged={() => load()}
                  variant="commercial"
                />
              </div>
            </div>
          ) : null}

          {/* Stage 13 — full width under the outcome row so the score card does not stretch */}
          {proposal?.status === 'ACCEPTED' && proposal?.id ? (
            <CreateLevel3EngagementsCard
              proposalId={String(proposal.id)}
              proposalNumber={proposal.proposalNumber}
              proposalStatus={proposal.status}
              organisationName={engagement.organisation?.name}
              items={data.comprehensiveProposal?.deliveryEngagements || []}
              canCreate={Boolean(data.permissions?.canCreateLevel3Engagements)}
              onChanged={() => load()}
            />
          ) : null}

          {/* 3. Module scorecard */}
          {modules.length ? (
            <AdvisoryReportSummaryPreview modules={modules} variant="scorecard" />
          ) : null}

          {/* 4. Priority executive attention */}
          {modules.length ? (
            <div className="max-w-2xl">
              <AdvisoryReportSummaryPreview modules={modules} variant="priority" />
            </div>
          ) : null}

          {/* 5. Recommended next engagements */}
          <RequestComprehensiveProposalCard
            assessmentId={String(id)}
            recommendations={Array.isArray(data.recommendations) ? data.recommendations : []}
            comprehensiveProposal={proposal}
            canRequest={Boolean(data.permissions?.canRequestComprehensiveProposal)}
            canOpenWorkspace={Boolean(data.permissions?.canOpenProposalWorkspace)}
            onChanged={() => load()}
            variant="recommendations"
          />

          {/* Internal commercial note (admins) */}
          {canManageCommercial ? (
            <Card className="rounded-xl border-slate-200 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                {!notesOpen && !(outcome.commercialAdminNotes || '').trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => setNotesOpen(true)}
                  >
                    + Add internal commercial note
                  </Button>
                ) : !notesOpen && (outcome.commercialAdminNotes || '').trim() ? (
                  <div className="space-y-2">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Internal commercial note
                    </p>
                    <p className="m-0 whitespace-pre-wrap text-sm text-slate-700">
                      {outcome.commercialAdminNotes}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setNotesOpen(true)}
                    >
                      Edit
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="m-0 text-sm font-medium text-slate-800">Internal commercial note</p>
                    <Textarea
                      rows={3}
                      value={notes}
                      disabled={busy}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Internal only — not shown to clients."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="h-9"
                        disabled={busy || notes === (outcome.commercialAdminNotes || '')}
                        onClick={() => void saveNotes()}
                      >
                        Save note
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9"
                        disabled={busy}
                        onClick={() => {
                          setNotes(outcome.commercialAdminNotes || '');
                          setNotesOpen(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* 7. Product journey */}
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Product journey
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-5 sm:pt-2">
              <ol className="m-0 flex list-none flex-col gap-3 p-0 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2">
                <JourneyStep
                  done
                  level="Level 1"
                  title="Executive Triage"
                  detail={
                    engagement.parentAssessment?.reference ? (
                      <Link
                        href={`/triage/${engagement.parentAssessment.triageSubmissionId || engagement.parentAssessment.id}`}
                        className="font-medium text-slate-800 underline-offset-2 hover:underline"
                      >
                        {engagement.parentAssessment.reference}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <JourneyConnector />
                <JourneyStep
                  done
                  level="Level 2"
                  title="Executive Advisory"
                  detail={engagement.reference}
                />
                <JourneyConnector />
                <JourneyStep
                  done={Boolean(proposal)}
                  level="Commercial"
                  title="Proposal"
                  detail={
                    proposal
                      ? `${proposal.proposalNumber}`
                      : 'Pending'
                  }
                />
                <JourneyConnector />
                <JourneyStep
                  done={Boolean(
                    proposal?.status === 'ACCEPTED' &&
                      (data.comprehensiveProposal?.deliveryEngagements || []).some(
                        (d: { engagement?: unknown }) => d.engagement,
                      ),
                  )}
                  level="Level 3"
                  title="Focused assurance"
                  detail={
                    proposal?.status === 'ACCEPTED'
                      ? (data.comprehensiveProposal?.deliveryEngagements || []).some(
                          (d: { engagement?: unknown }) => d.engagement,
                        )
                        ? 'In delivery'
                        : 'Authorised — create when ready'
                      : proposal
                        ? 'After proposal acceptance'
                        : 'After commercial'
                  }
                />
              </ol>
            </CardContent>
          </Card>
        </div>

        <PdfPreviewDialog
          open={previewOpen && Boolean(previewBytes)}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreviewBytes(null);
          }}
          pdfBytes={previewBytes}
          title={latestReport?.title || 'Executive Advisory report'}
          description="On-screen report preview. Closing returns you to this diagnostic outcome."
          downloadLabel="Download PDF"
          onDownload={() => {
            if (previewDownloadUrl) {
              window.open(previewDownloadUrl, '_blank', 'noopener,noreferrer');
            }
          }}
        />

        <Dialog
          open={sendOpen}
          onOpenChange={(open) => {
            setSendOpen(open);
            if (!open) setSendReportId(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send report</DialogTitle>
              <DialogDescription>
                Email the client the executive PDF as an attachment, plus a secure seven-day download link.
              </DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Recipient email</span>
              <Input
                type="email"
                required
                autoFocus
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="client@company.com"
                disabled={sendBusy}
              />
            </label>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={sendBusy}
                onClick={() => setSendOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={sendBusy || !sendEmail.trim()} onClick={() => void sendReport()}>
                {sendBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sendBusy ? 'Sending…' : 'Send report'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Shell>
    </AuthGate>
  );
}

function JourneyStep({
  done,
  level,
  title,
  detail,
}: {
  done: boolean;
  level: string;
  title: string;
  detail: ReactNode;
}) {
  return (
    <li
      className={cn(
        'min-w-0 flex-1 rounded-lg border px-3 py-2.5',
        done ? 'border-moss-success/30 bg-moss-success/[0.04]' : 'border-slate-200 bg-white',
      )}
    >
      <p className="m-0 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {done ? (
          <CheckCircle2 className="size-3.5 text-moss-success" aria-hidden="true" />
        ) : (
          <span className="inline-block size-3.5 rounded-full border-2 border-slate-300" aria-hidden="true" />
        )}
        {level}
      </p>
      <p className="m-0 mt-1 text-sm font-semibold text-slate-900">{title}</p>
      <p className="m-0 mt-0.5 text-xs text-slate-600">{detail}</p>
    </li>
  );
}

function JourneyConnector() {
  return (
    <li
      className="hidden items-center px-0.5 text-slate-300 sm:flex"
      aria-hidden="true"
    >
      →
    </li>
  );
}
