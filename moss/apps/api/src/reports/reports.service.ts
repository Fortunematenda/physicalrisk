import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductCode, ReportStatus, ReportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../evidence/storage.service';
import { AuditService } from '../audit/audit.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { EmailService } from '../email/email.service';
import type { AuthUser } from '../common/current-user.decorator';
import { ADMIN_ROLES, ANALYST_ROLES, APPROVER_ROLES, INTERNAL_ROLES, requireRole } from '../common/roles';
import { EspoCrmService } from '../crm/espocrm.service';
import {
  buildSclReportDocumentMeta,
  buildSclReportFileName,
  resolveSclReportBrandConfig,
  resolveSclReportLogoPath,
} from './scl-report-branding';
import { buildScoringMatrixPanels, renderSclExecutivePdf } from './scl-report-pdf';
import { ProposalTokenService } from '../common/proposal-token.service';
import { PHYSICAL_RISK_PRODUCTS } from '@moss/shared';

const ADVISORY_REPORT_PRODUCTS = new Set<ProductCode>([
  ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
  ProductCode.CONTRACT_SLA_ASSURANCE,
  ProductCode.VENDOR_PERFORMANCE_ASSURANCE,
  ProductCode.GOVERNANCE_EXECUTIVE_ASSURANCE,
  ProductCode.CYBER_PHYSICAL_DEPENDENCY,
  ProductCode.SHIELD360,
]);

const LEGACY_REPORT_PRODUCTS = new Set<string>(['SCLI_COST_LEAKAGE', 'EXECUTIVE_GOVERNANCE_TRIAGE']);

function reportEmailLabels(productCode: string) {
  const product = PHYSICAL_RISK_PRODUCTS[productCode as keyof typeof PHYSICAL_RISK_PRODUCTS];
  const productName = product?.name || 'Physical Risk';
  if (productCode === 'SCLI_COST_LEAKAGE') {
    return {
      subjectSuffix: 'Cost Leakage Executive Report',
      productReportLabel: 'Cost Leakage executive report',
    };
  }
  if (productCode === 'EXECUTIVE_ADVISORY_DIAGNOSTIC') {
    return {
      subjectSuffix: 'Executive Advisory Diagnostic Report',
      productReportLabel: 'Executive Advisory Diagnostic report',
    };
  }
  if (productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE') {
    return {
      subjectSuffix: 'Executive Governance Triage Report',
      productReportLabel: 'Executive Governance Triage report',
    };
  }
  return {
    subjectSuffix: `${productName} Report`,
    productReportLabel: `${productName} report`,
  };
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly assessments: AssessmentsService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly proposalTokens: ProposalTokenService,
    @Optional() @Inject(forwardRef(() => EspoCrmService)) private readonly crm?: EspoCrmService,
  ) {}

  /** Cost Leakage / triage and advisory PDFs share the Report table but use different product scopes. */
  private async checkReportAccess(assessmentId: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: { organisationId: true, productCode: true },
    });
    if (!session) throw new NotFoundException('Report not found.');

    const productCode = String(session.productCode);
    const supported =
      ADVISORY_REPORT_PRODUCTS.has(session.productCode) || LEGACY_REPORT_PRODUCTS.has(productCode);
    if (!supported) throw new NotFoundException('Report not found.');

    if (INTERNAL_ROLES.has(user.role)) return;

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId: session.organisationId } },
    });
    if (!membership) throw new ForbiddenException('You do not have access to this report.');
  }

  private async listReportSection(
    user: AuthUser,
    productFilter: { productCode: ProductCode | { in: ProductCode[] } },
  ) {
    const reports = await this.prisma.report.findMany({
      where: {
        status: { not: ReportStatus.SUPERSEDED },
        assessment: {
          productCode: productFilter.productCode,
          ...(INTERNAL_ROLES.has(user.role)
            ? {}
            : { organisation: { memberships: { some: { userId: user.id } } } }),
        },
      },
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
            productCode: true,
            organisationId: true,
            organisation: { select: { id: true, name: true, industry: true } },
          },
        },
      },
    });

    const triageAssessmentIds = [
      ...new Set(
        reports
          .filter((r) => r.assessment?.productCode === ProductCode.EXECUTIVE_GOVERNANCE_TRIAGE)
          .map((r) => r.assessment.id),
      ),
    ];
    const triageLeads = triageAssessmentIds.length
      ? await this.prisma.publicLead.findMany({
          where: { assessmentId: { in: triageAssessmentIds } },
          select: { id: true, assessmentId: true },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    const triageSubmissionByAssessment = new Map<string, string>();
    for (const lead of triageLeads) {
      if (lead.assessmentId && !triageSubmissionByAssessment.has(lead.assessmentId)) {
        triageSubmissionByAssessment.set(lead.assessmentId, lead.id);
      }
    }

    const items = reports.map((report) => {
      let uiStatus = String(report.status).toLowerCase();
      if (report.status === 'GENERATED') uiStatus = 'generated';
      if (report.status === 'ISSUED') uiStatus = 'issued';
      if (report.status === 'DRAFT') uiStatus = 'draft';
      if (report.status === 'APPROVED') uiStatus = 'pending';
      if (report.status === 'SUPERSEDED') uiStatus = 'draft';

      return {
        ...report,
        reference: `RPT-${report.id.slice(-6).toUpperCase()}`,
        uiStatus,
        fileSizeLabel: report.storageKey ? 'PDF' : '—',
        delivery: { sent: 0, failed: 0, pending: 0 },
        // Canonical triage workspace id (PublicLead), not assessmentSession id.
        triageSubmissionId: triageSubmissionByAssessment.get(report.assessment.id) || null,
      };
    });

    return {
      items,
      summary: {
        total: items.length,
        issued: items.filter((r) => r.status === 'ISSUED').length,
        generated: items.filter((r) => r.status === 'GENERATED').length,
        draft: items.filter((r) => r.status === 'DRAFT' || r.status === 'SUPERSEDED').length,
      },
    };
  }

  private async createPdf(assessment: any, reportType: ReportType): Promise<Buffer> {
    const brand = resolveSclReportBrandConfig(this.config);
    const logoPath = resolveSclReportLogoPath(brand);
    const snapshot = assessment.scoreSnapshots[0];
    const leakage = snapshot.leakageResult as any;
    const categories = (snapshot.categoryScores as any[]) || [];
    const recommendations = (assessment.recommendations || []).filter(
      (r: any) => r.includeInReport !== false,
    );
    const isPreliminary = reportType === ReportType.PRELIMINARY_EXECUTIVE;
    const reportLabel = isPreliminary ? 'Preliminary Executive Report' : 'Approved Executive Report';
    const meta = buildSclReportDocumentMeta({
      organisationName: assessment.organisation?.name,
      reference: assessment.reference,
      assessmentDate: assessment.submittedAt || assessment.createdAt,
      reportTypeLabel: reportLabel,
      methodologyVersion: snapshot.modelVersion,
      isPreliminary,
    });
    const questions = assessment.questionnaireVersion?.questions || [];
    const responseByQuestionId = new Map<string, string>(
      (assessment.responses || [])
        .filter((r: any) => r.questionId && r.responseOptionId)
        .map((r: any) => [String(r.questionId), String(r.responseOptionId)]),
    );
    const scoringMatrix = buildScoringMatrixPanels(
      questions.map((q: any) => ({
        id: q.id,
        text: q.text,
        code: q.code,
        selectedOptionId: responseByQuestionId.get(String(q.id)) || null,
        options: (q.options || []).map((o: any) => ({
          id: o.id,
          label: o.label,
          riskScore: Number(o.riskScore),
        })),
      })),
      { answeredOnly: true },
    );
    const lead = await this.prisma.publicLead.findFirst({
      where: { assessmentId: assessment.id },
      orderBy: { createdAt: 'desc' },
    });
    const prospectName = lead
      ? [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim()
      : '';

    if (lead?.id) {
      try {
        brand.ctaUrl = this.proposalTokens.buildPublicUrl(lead.id);
        brand.ctaLabel = 'Request an Executive Advisory Proposal';
      } catch {
        // Keep configured fallback CTA if token signing fails.
      }
    }

    return renderSclExecutivePdf({
      brand,
      logoPath,
      companyName: meta.companyName,
      reference: meta.reference,
      assessmentDateLabel: meta.assessmentDateLabel,
      reportTitle: meta.reportTitle,
      isPreliminary,
      modelVersion: snapshot.modelVersion,
      overallRiskScore: Number(snapshot.overallRiskScore),
      maturityScore: Number(snapshot.maturityScore),
      riskBand: snapshot.riskBand,
      methodologyConfidence: Number(snapshot.methodologyConfidence),
      evidenceConfidence: Number(snapshot.evidenceConfidence),
      opportunityScore: Number(snapshot.opportunityScore),
      prospectName: prospectName || null,
      selectedServices: brand.productLine,
      leakage: {
        estimatedLossesLow: leakage?.estimatedLossesLow,
        estimatedLossesHigh: leakage?.estimatedLossesHigh,
        estimatedLossesLowBand: leakage?.estimatedLossesLowBand,
        estimatedLossesHighBand: leakage?.estimatedLossesHighBand,
        minimumLeakageValue: Number(leakage?.minimumLeakageValue || 0),
        minimumLeakageRate: Number(leakage?.minimumLeakageRate || 0),
        likelyLeakageValue: Number(leakage?.likelyLeakageValue || 0),
        likelyLeakageRate: Number(leakage?.likelyLeakageRate || 0),
        maximumExposureValue: Number(leakage?.maximumExposureValue || 0),
        maximumExposureRate: Number(leakage?.maximumExposureRate || 0),
        recoverableLow: Number(leakage?.recoverableLow || 0),
        recoverableHigh: Number(leakage?.recoverableHigh || 0),
      },
      categoryScores: categories.map((c: any) => ({
        category: String(c.category),
        score: Number(c.score),
      })),
      recommendations,
      scoringMatrix,
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
        questionnaireVersion: {
          include: {
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
        responses: {
          select: { questionId: true, responseOptionId: true },
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (!['SCLI_COST_LEAKAGE', 'EXECUTIVE_GOVERNANCE_TRIAGE'].includes(String(assessment.productCode))) {
      throw new BadRequestException('This report renderer supports Executive Governance Triage and Security Cost Leakage only.');
    }
    if (!assessment.scoreSnapshots[0]) throw new BadRequestException('Evaluate the assessment before generating a report.');

    const approvedStatuses = new Set(['APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED']);
    let reportType = opts?.reportType;
    if (!reportType) {
      reportType = approvedStatuses.has(assessment.status)
        ? ReportType.VERIFIED_EXECUTIVE
        : ReportType.PRELIMINARY_EXECUTIVE;
    }
    if (assessment.productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE' && reportType === ReportType.VERIFIED_EXECUTIVE) {
      throw new BadRequestException('Level 1 triage cannot produce a verified executive assessment report.');
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

    const existing = await this.prisma.report.findFirst({
      where: {
        assessmentId,
        reportType,
        status: { not: ReportStatus.SUPERSEDED },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    // Keep a single active report per assessment + type: replace in place.
    const version = existing?.version ?? 1;
    const buffer = await this.createPdf(assessment, reportType);
    const label = reportType === ReportType.PRELIMINARY_EXECUTIVE ? 'Preliminary' : 'Approved-Executive';
    const brand = resolveSclReportBrandConfig(this.config);
    const assessmentDate = assessment.submittedAt || assessment.createdAt;
    const fileName = buildSclReportFileName({
      companyName: assessment.organisation.name,
      assessmentDate,
      reference: assessment.reference,
      brand,
    });
    // Stable storage object key (not the download filename) so replace-in-place and history stay intact.
    const storageKey = existing?.storageKey
      ? existing.storageKey
      : `assessments/${assessment.id}/reports/${assessment.reference}-${label}.pdf`;
    await this.storage.put(storageKey, buffer, 'application/pdf');

    // Any other active rows of this type become historical only.
    await this.prisma.report.updateMany({
      where: {
        assessmentId,
        reportType,
        status: { not: ReportStatus.SUPERSEDED },
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      data: { status: ReportStatus.SUPERSEDED },
    });

    const report = existing
      ? await this.prisma.report.update({
          where: { id: existing.id },
          data: {
            title: `${assessment.title} ${label} Report`,
            status: 'GENERATED',
            storageKey,
            fileName,
            generatedById: user.id,
            generatedAt: new Date(),
            approvedAt:
              reportType === ReportType.VERIFIED_EXECUTIVE
                ? new Date()
                : existing.approvedAt,
            issuedAt: null,
          },
        })
      : await this.prisma.report.create({
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

    if (assessment.productCode === 'EXECUTIVE_GOVERNANCE_TRIAGE' && reportType === ReportType.VERIFIED_EXECUTIVE) {
      throw new BadRequestException('Level 1 triage cannot produce a verified executive assessment report.');
    }
    if (reportType === ReportType.VERIFIED_EXECUTIVE) {
      await this.prisma.assessmentSession.update({
        where: { id: assessmentId },
        data: { status: 'REPORT_GENERATED' },
      });
    }

    await this.audit.record({
      userId: user.id,
      action: existing ? 'REPLACE_REPORT' : 'GENERATE_REPORT',
      entityType: 'Report',
      entityId: report.id,
      metadata: { assessmentId, reportType, version, replaced: Boolean(existing) },
    });
    try {
      await this.crm?.queueOpportunitySync(assessmentId);
    } catch {
      // CRM downtime must not block report generation
    }
    return { ...report, downloadUrl: await this.storage.signedDownloadUrl(storageKey, 900, fileName) };
  }

  async issue(id: string, recipient: string, user: AuthUser) {
    requireRole(user, APPROVER_ROLES, 'Approver permission required to issue reports.');
    const report = await this.prisma.report.findUnique({ where: { id }, include: { assessment: { include: { organisation: true } } } });
    if (!report || !report.storageKey) throw new NotFoundException('Generated report not found.');
    await this.checkReportAccess(report.assessmentId, user);
    const attachmentName =
      report.fileName ||
      buildSclReportFileName({
        companyName: report.assessment.organisation.name,
        assessmentDate: report.assessment.submittedAt || report.assessment.createdAt,
        reference: report.assessment.reference,
        brand: resolveSclReportBrandConfig(this.config),
      });
    const url = await this.storage.signedDownloadUrl(report.storageKey, 60 * 60 * 24 * 7, attachmentName);
    const emailLabels = reportEmailLabels(String(report.assessment.productCode));

    try {
      await this.email.enqueue({
        recipient,
        subject: `${report.assessment.organisation.name} – ${emailLabels.subjectSuffix}`,
        template: 'report_issued',
        relatedType: 'Report',
        relatedId: id,
        organisationId: report.assessment.organisationId,
        payload: {
          url,
          reference: report.assessment.reference,
          organisationName: report.assessment.organisation.name,
          productCode: report.assessment.productCode,
          productReportLabel: emailLabels.productReportLabel,
          attachmentStorageKey: report.storageKey,
          attachmentFileName: attachmentName,
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

  async remove(id: string, user: AuthUser) {
    requireRole(user, ANALYST_ROLES, 'Analyst permission required to delete reports.');
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { assessment: { select: { id: true, productCode: true } } },
    });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.assessment.productCode !== 'SCLI_COST_LEAKAGE') {
      throw new BadRequestException('This endpoint deletes Cost Leakage reports only.');
    }
    await this.assessments.checkAccess(report.assessmentId, user);

    if (report.storageKey) {
      await this.storage.delete(report.storageKey);
    }

    await this.prisma.report.delete({ where: { id } });
    await this.audit.record({
      userId: user.id,
      action: 'DELETE_REPORT',
      entityType: 'Report',
      entityId: id,
      metadata: {
        assessmentId: report.assessmentId,
        reportType: report.reportType,
        fileName: report.fileName,
      },
    });
    return { ok: true, id };
  }

  async listAll(user: AuthUser) {
    const executiveAdvisoryProducts = [
      ...ADVISORY_REPORT_PRODUCTS,
      ProductCode.EXECUTIVE_GOVERNANCE_TRIAGE,
    ];

    const sclSection = await this.listReportSection(user, { productCode: ProductCode.SCLI_COST_LEAKAGE });
    const executiveAdvisorySection = await this.listReportSection(user, {
      productCode: { in: executiveAdvisoryProducts },
    });

    const items = sclSection.items;
    const reportIds = items.map((r) => r.id);
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

    for (const report of items) {
      const delivery = emailsByReport.get(report.id) || { sent: 0, failed: 0, pending: 0 };
      if (delivery.failed > 0 && report.status !== 'ISSUED') {
        report.uiStatus = 'failed';
      }
      report.delivery = delivery;
    }

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
      scl: sclSection,
      executiveAdvisory: executiveAdvisorySection,
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
      where: { assessmentId, status: { not: 'SUPERSEDED' } },
      orderBy: [{ reportType: 'asc' }, { version: 'desc' }],
    });
  }

  async get(id: string, user: AuthUser) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { assessment: { include: { organisation: true } }, generatedBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!report) throw new NotFoundException('Report not found.');
    await this.checkReportAccess(report.assessmentId, user);

    const lead = await this.prisma.publicLead.findFirst({
      where: { assessmentId: report.assessmentId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const recipientEmail =
      report.assessment.organisation.primaryEmail?.trim()
      || lead?.email?.trim()
      || '';

    return {
      ...report,
      downloadUrl: report.storageKey
        ? await this.storage.signedDownloadUrl(report.storageKey, 900, report.fileName || undefined)
        : null,
      suggestedRecipientEmail: recipientEmail,
      triageSubmissionId: lead?.id || null,
      contact: lead
        ? { email: lead.email, name: `${lead.firstName} ${lead.lastName}`.trim() }
        : {
            email: report.assessment.organisation.primaryEmail || '',
            name: report.assessment.organisation.name,
          },
    };
  }
}
