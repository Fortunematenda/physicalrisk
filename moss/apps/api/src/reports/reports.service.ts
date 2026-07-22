import { BadRequestException, Inject, Injectable, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ConfigService } from '@nestjs/config';
import { ReportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../evidence/storage.service';
import { AuditService } from '../audit/audit.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { EmailService } from '../email/email.service';
import type { AuthUser } from '../common/current-user.decorator';
import { ADMIN_ROLES, ANALYST_ROLES, APPROVER_ROLES, INTERNAL_ROLES, requireRole } from '../common/roles';
import { EspoCrmService } from '../crm/espocrm.service';

const money = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(value || 0);
const percent = (value: number) => `${((value || 0) * 100).toFixed(1)}%`;
const BRAND = '#c41230';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly assessments: AssessmentsService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    @Optional() @Inject(forwardRef(() => EspoCrmService)) private readonly crm?: EspoCrmService,
  ) {}

  private createPdf(assessment: any, reportType: ReportType): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: assessment.title, Author: 'Physical Risk · MOSS' } });
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const snapshot = assessment.scoreSnapshots[0];
      const leakage = snapshot.leakageResult as any;
      const categories = (snapshot.categoryScores as any[]) || [];
      const recommendations = (assessment.recommendations || []).filter((r: any) => r.includeInReport !== false);
      const isPreliminary = reportType === ReportType.PRELIMINARY_EXECUTIVE;
      const reportLabel = isPreliminary ? 'Preliminary Executive Report' : 'Approved Executive Report';

      // 1. Cover
      doc.rect(0, 0, doc.page.width, 120).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(11).text('PHYSICAL RISK', 48, 36);
      doc.fontSize(22).text('MOSS', 48, 54);
      doc.fontSize(10).text('Management Operating Security System', 48, 82);
      doc.fillColor('#111111').fontSize(20).text(reportLabel, 48, 160);
      doc.moveDown(0.5).fontSize(12).fillColor('#555555')
        .text('Security Cost Leakage Index (SCLI) – Executive Assurance Gap Decision Report');
      doc.moveDown(2).fillColor('#111111').fontSize(11);
      doc.text(`Organisation: ${assessment.organisation.name}`);
      doc.text(`Assessment reference: ${assessment.reference}`);
      doc.text(`Assessment date: ${new Date(assessment.submittedAt || assessment.createdAt).toLocaleDateString('en-ZA')}`);
      doc.text(`Methodology: ${snapshot.modelVersion}`);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`);
      if (isPreliminary) {
        doc.moveDown().fillColor(BRAND).fontSize(10)
          .text('PRELIMINARY – Subject to analyst review and approval.');
      }

      // 2–4. Org + executive summary
      doc.addPage().fillColor('#111111').fontSize(16).text('Executive Summary');
      doc.moveDown().fontSize(10).fillColor('#333333');
      doc.text(
        `This ${isPreliminary ? 'preliminary' : 'approved'} report summarises the Security Cost Leakage Index assessment for ${assessment.organisation.name}. ` +
        `Scores and financial estimates are decision-support outputs based on calibration inputs and questionnaire responses. ` +
        `They do not constitute an audit opinion or proof of actual loss.`,
      );
      doc.moveDown().fillColor('#111111').fontSize(11);
      doc.text(`Overall SCLI Risk Score: ${Number(snapshot.overallRiskScore).toFixed(1)} / 100`);
      doc.text(`Risk rating: ${snapshot.riskBand}`);
      doc.text(`Governance maturity score: ${Number(snapshot.maturityScore).toFixed(1)} / 100`);
      doc.text(`Confidence rating (methodology): ${percent(Number(snapshot.methodologyConfidence))}`);
      doc.text(`Evidence confidence: ${percent(Number(snapshot.evidenceConfidence))}`);
      doc.text(`Opportunity score: ${Number(snapshot.opportunityScore).toFixed(1)} / 100`);

      doc.moveDown(1.2).fontSize(14).text('Leakage estimates');
      doc.moveDown(0.4).fontSize(10);
      doc.text(`Minimum leakage estimate: ${money(leakage.minimumLeakageValue)} (${percent(leakage.minimumLeakageRate)})`);
      doc.text(`Likely leakage estimate: ${money(leakage.likelyLeakageValue)} (${percent(leakage.likelyLeakageRate)})`);
      doc.text(`Maximum exposure estimate: ${money(leakage.maximumExposureValue)} (${percent(leakage.maximumExposureRate)})`);
      doc.text(`Recoverable-value range: ${money(leakage.recoverableLow)} – ${money(leakage.recoverableHigh)}`);

      // Category scores
      doc.moveDown(1.2).fontSize(14).fillColor('#111111').text('Category scores');
      doc.moveDown(0.4).fontSize(10);
      const sortedCats = [...categories].sort((a, b) => Number(b.score) - Number(a.score));
      sortedCats.forEach((category: any) => {
        doc.text(`${category.category}: ${Number(category.score).toFixed(1)} / 100`);
      });

      // Top risk drivers
      doc.moveDown(1.2).fontSize(14).text('Top risk drivers');
      doc.moveDown(0.4).fontSize(10);
      const drivers = sortedCats.slice(0, 5);
      if (!drivers.length) doc.text('No category scores available.');
      drivers.forEach((category: any, i: number) => {
        doc.text(`${i + 1}. ${category.category} (${Number(category.score).toFixed(1)} / 100)`);
      });

      // Recommendations + next steps
      doc.addPage().fontSize(16).fillColor('#111111').text('Recommendations');
      doc.moveDown().fontSize(10);
      if (!recommendations.length) doc.text('No recommendations were selected for this report.');
      recommendations.forEach((recommendation: any, index: number) => {
        doc.fontSize(12).fillColor('#111111').text(`${index + 1}. ${recommendation.title} — ${recommendation.priority}`);
        doc.fontSize(10).fillColor('#333333').text(recommendation.summary);
        if (recommendation.serviceOffering) {
          doc.fillColor('#555555').text(`Mapped service offering: ${recommendation.serviceOffering}`);
        }
        if (recommendation.suggestedNextStep) {
          doc.fillColor('#555555').text(`Suggested next step: ${recommendation.suggestedNextStep}`);
        }
        doc.fillColor('#111111').moveDown();
      });

      doc.moveDown(0.5).fontSize(14).text('Proposed next steps');
      doc.moveDown(0.4).fontSize(10).fillColor('#333333');
      const nextSteps = recommendations
        .map((r: any) => r.suggestedNextStep)
        .filter(Boolean);
      if (nextSteps.length) {
        nextSteps.forEach((step: string, i: number) => doc.text(`${i + 1}. ${step}`));
      } else {
        doc.text('1. Complete analyst review of evidence and calibration where required.');
        doc.text('2. Agree a scoped Physical Risk assurance engagement against the highest-risk categories.');
        doc.text('3. Validate recoverable-value estimates through targeted evidence sampling.');
      }

      // Methodology / assumptions / disclaimer
      doc.addPage().fillColor('#111111').fontSize(16).text('Methodology, assumptions and limitations');
      doc.moveDown().fontSize(10).fillColor('#333333');
      doc.text(`Methodology version: ${snapshot.modelVersion}`);
      doc.moveDown().text(
        'The SCLI model combines weighted executive responses with calibration variables including security spend, estate scale, ' +
        'guard-force scale, technology coverage, manual-record reliance, proof gaps, internal capacity and allowance complexity. ' +
        'Financial estimates use the seeded leakage assumptions retained against this questionnaire version.',
      );
      doc.moveDown().text(
        'Assumptions and limitations: rates and multipliers are indicative industry-informed defaults used for decision support. ' +
        'Results may change when calibration inputs, evidence confidence or questionnaire responses change. ' +
        'Existing submitted assessments retain the questionnaire version used at submission.',
      );
      doc.moveDown().fillColor('#111111').fontSize(12).text('Disclaimer');
      doc.moveDown(0.3).fontSize(9).fillColor('#555555').text(
        'This report is a preliminary or approved executive decision-support assessment, not an audit finding. ' +
        'Financial estimates require validation through independent evidence review. ' +
        'Physical Risk and MOSS accept no liability for commercial decisions taken solely on the basis of this report without further assurance work.',
      );
      doc.end();
    });
  }

  async generate(assessmentId: string, user: AuthUser, opts?: { reportType?: ReportType }) {
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: {
        organisation: true,
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        recommendations: { orderBy: { priority: 'desc' } },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (!assessment.scoreSnapshots[0]) throw new BadRequestException('Evaluate the assessment before generating a report.');

    const approvedStatuses = new Set(['APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED']);
    let reportType = opts?.reportType;
    if (!reportType) {
      reportType = approvedStatuses.has(assessment.status)
        ? ReportType.VERIFIED_EXECUTIVE
        : ReportType.PRELIMINARY_EXECUTIVE;
    }
    if (reportType === ReportType.VERIFIED_EXECUTIVE) {
      requireRole(user, APPROVER_ROLES, 'Approved executive reports require approver permission.');
      if (!approvedStatuses.has(assessment.status)) {
        throw new BadRequestException('Approved executive reports can only be generated after approval.');
      }
    } else {
      requireRole(user, ANALYST_ROLES, 'Analyst permission required to generate preliminary reports.');
      if (!assessment.submittedAt && assessment.status === 'DRAFT') {
        throw new BadRequestException('Preliminary reports can be generated after submission.');
      }
    }

    const prior = await this.prisma.report.count({
      where: { assessmentId, reportType },
    });
    const version = prior + 1;
    const buffer = await this.createPdf(assessment, reportType);
    const label = reportType === ReportType.PRELIMINARY_EXECUTIVE ? 'Preliminary' : 'Approved-Executive';
    const fileName = `${assessment.reference}-${label}-v${version}.pdf`;
    const storageKey = `assessments/${assessment.id}/reports/${Date.now()}-${fileName}`;
    await this.storage.put(storageKey, buffer, 'application/pdf');

    const report = await this.prisma.report.create({
      data: {
        assessmentId,
        title: `${assessment.title} ${label} Report`,
        status: 'GENERATED',
        reportType,
        version,
        storageKey,
        fileName,
        generatedById: user.id,
        generatedAt: new Date(),
        approvedAt: reportType === ReportType.VERIFIED_EXECUTIVE ? new Date() : null,
      },
    });

    if (reportType === ReportType.VERIFIED_EXECUTIVE) {
      await this.prisma.assessmentSession.update({
        where: { id: assessmentId },
        data: { status: 'REPORT_GENERATED' },
      });
    }

    await this.audit.record({
      userId: user.id,
      action: 'GENERATE_REPORT',
      entityType: 'Report',
      entityId: report.id,
      metadata: { assessmentId, reportType, version },
    });
    try {
      await this.crm?.queueOpportunitySync(assessmentId);
    } catch {
      // CRM downtime must not block report generation
    }
    return { ...report, downloadUrl: await this.storage.signedDownloadUrl(storageKey) };
  }

  async issue(id: string, recipient: string, user: AuthUser) {
    requireRole(user, APPROVER_ROLES, 'Approver permission required to issue reports.');
    const report = await this.prisma.report.findUnique({ where: { id }, include: { assessment: { include: { organisation: true } } } });
    if (!report || !report.storageKey) throw new NotFoundException('Generated report not found.');
    await this.assessments.checkAccess(report.assessmentId, user);
    const url = await this.storage.signedDownloadUrl(report.storageKey, 60 * 60 * 24 * 7);

    try {
      await this.email.enqueue({
        recipient,
        subject: `${report.assessment.organisation.name} – MOSS Executive Report`,
        template: 'report_issued',
        relatedType: 'Report',
        relatedId: id,
        organisationId: report.assessment.organisationId,
        payload: {
          url,
          reference: report.assessment.reference,
          organisationName: report.assessment.organisation.name,
          attachmentStorageKey: report.storageKey,
          attachmentFileName: report.fileName || `${report.assessment.reference}-report.pdf`,
          attachmentContentType: 'application/pdf',
        },
      });
    } catch {
      // Email failures must not block report issuance
    }

    const updated = await this.prisma.report.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } });
    await this.prisma.assessmentSession.update({ where: { id: report.assessmentId }, data: { status: 'REPORT_ISSUED' } });
    await this.audit.record({ userId: user.id, action: 'ISSUE_REPORT', entityType: 'Report', entityId: id, metadata: { recipient } });
    try {
      await this.crm?.queueReportUpdate(report.assessmentId);
    } catch {
      // CRM downtime must not block report issuance
    }
    return updated;
  }

  async listAll(user: AuthUser) {
    const where = INTERNAL_ROLES.has(user.role)
      ? {}
      : { assessment: { organisation: { memberships: { some: { userId: user.id } } } } };

    const reports = await this.prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      include: {
        generatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assessment: {
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            organisationId: true,
            organisation: { select: { id: true, name: true, industry: true } },
          },
        },
      },
    });

    const reportIds = reports.map((r) => r.id);
    const emailJobs = reportIds.length
      ? await this.prisma.emailJob.findMany({
          where: { relatedType: 'Report', relatedId: { in: reportIds } },
          select: { relatedId: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const emailsByReport = new Map<string, { sent: number; failed: number; pending: number }>();
    for (const job of emailJobs) {
      if (!job.relatedId) continue;
      const bucket = emailsByReport.get(job.relatedId) || { sent: 0, failed: 0, pending: 0 };
      if (job.status === 'SENT') bucket.sent += 1;
      else if (job.status === 'FAILED') bucket.failed += 1;
      else bucket.pending += 1;
      emailsByReport.set(job.relatedId, bucket);
    }

    const items = reports.map((report) => {
      const delivery = emailsByReport.get(report.id) || { sent: 0, failed: 0, pending: 0 };
      let uiStatus = String(report.status).toLowerCase();
      if (report.status === 'GENERATED') uiStatus = 'generated';
      if (report.status === 'ISSUED') uiStatus = 'issued';
      if (report.status === 'DRAFT') uiStatus = 'draft';
      if (report.status === 'APPROVED') uiStatus = 'pending';
      if (report.status === 'SUPERSEDED') uiStatus = 'draft';
      if (delivery.failed > 0 && report.status !== 'ISSUED') uiStatus = 'failed';

      return {
        ...report,
        reference: `RPT-${report.id.slice(-6).toUpperCase()}`,
        uiStatus,
        fileSizeLabel: report.storageKey ? 'PDF' : '—',
        delivery,
      };
    });

    const preliminary = items.filter((r) => r.reportType === 'PRELIMINARY_EXECUTIVE').length;
    const verified = items.filter((r) => r.reportType === 'VERIFIED_EXECUTIVE').length;
    const issued = items.filter((r) => r.status === 'ISSUED').length;
    const generated = items.filter((r) => r.status === 'GENERATED').length;
    const draft = items.filter((r) => r.status === 'DRAFT' || r.status === 'SUPERSEDED').length;
    const failed = items.filter((r) => r.uiStatus === 'failed').length;
    const pending = items.filter((r) => r.uiStatus === 'pending').length;

    const allEmailJobs = await this.prisma.emailJob.findMany({
      where: { relatedType: 'Report' },
      select: { status: true },
      take: 500,
    });
    const emailSent = allEmailJobs.filter((j) => j.status === 'SENT').length;
    const emailFailed = allEmailJobs.filter((j) => j.status === 'FAILED').length;
    const emailPending = allEmailJobs.filter((j) => !['SENT', 'FAILED'].includes(j.status)).length;
    const emailTotal = Math.max(allEmailJobs.length, 1);

    const recentActivity = items.slice(0, 8).map((r) => ({
      id: r.id,
      title:
        r.status === 'ISSUED'
          ? 'Executive report issued'
          : r.status === 'GENERATED'
            ? `${r.reportType === 'PRELIMINARY_EXECUTIVE' ? 'Preliminary' : 'Approved'} report generated`
            : `Report ${r.status.toLowerCase()}`,
      reference: r.assessment?.reference || r.reference,
      reportId: r.id,
      at: r.issuedAt || r.generatedAt || r.createdAt,
      tone: r.status === 'ISSUED' ? 'ok' : r.uiStatus === 'failed' ? 'danger' : 'info',
    }));

    return {
      items,
      summary: {
        total: items.length,
        preliminary,
        verified,
        issued,
        generated,
        draft,
        pending,
        failed,
      },
      deliveryHealth: {
        sent: emailSent,
        failed: emailFailed,
        pending: emailPending,
        sentPct: Math.round((emailSent / emailTotal) * 100),
        failedPct: Math.round((emailFailed / emailTotal) * 100),
        pendingPct: Math.round((emailPending / emailTotal) * 100),
      },
      recentActivity,
    };
  }

  async listForAssessment(assessmentId: string, user: AuthUser) {
    await this.assessments.checkAccess(assessmentId, user);
    return this.prisma.report.findMany({
      where: { assessmentId },
      orderBy: [{ reportType: 'asc' }, { version: 'desc' }],
    });
  }

  async get(id: string, user: AuthUser) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { assessment: { include: { organisation: true } }, generatedBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!report) throw new NotFoundException('Report not found.');
    await this.assessments.checkAccess(report.assessmentId, user);

    const lead = await this.prisma.publicLead.findFirst({
      where: { assessmentId: report.assessmentId },
      orderBy: { updatedAt: 'desc' },
      select: { email: true, firstName: true, lastName: true },
    });

    const recipientEmail =
      report.assessment.organisation.primaryEmail?.trim()
      || lead?.email?.trim()
      || '';

    return {
      ...report,
      downloadUrl: report.storageKey ? await this.storage.signedDownloadUrl(report.storageKey) : null,
      suggestedRecipientEmail: recipientEmail,
      contact: lead
        ? { email: lead.email, name: `${lead.firstName} ${lead.lastName}`.trim() }
        : {
            email: report.assessment.organisation.primaryEmail || '',
            name: report.assessment.organisation.name,
          },
    };
  }
}
