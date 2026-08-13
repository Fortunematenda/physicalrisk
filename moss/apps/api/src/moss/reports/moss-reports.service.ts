import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AssessmentStatus, ProductCode, ReportType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../evidence/storage.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { ANALYST_ROLES, APPROVER_ROLES, requireRole } from '../../common/roles';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';
import { MossResultsService } from '../results/moss-results.service';

const BRAND = '#c41230';

type MossResultsPayload = Awaited<ReturnType<MossResultsService['getResults']>>;

@Injectable()
export class MossReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly assessments: MossAssessmentsService,
    private readonly results: MossResultsService,
  ) {}

  private createPdf(results: MossResultsPayload, reportType: ReportType, title: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: title, Author: 'Physical Risk · MOSS' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const isPreliminary = reportType === ReportType.PRELIMINARY_EXECUTIVE;
      const reportLabel = isPreliminary ? 'Preliminary Executive Report' : 'Approved Executive Report';
      const recommendations = (results.recommendations || []).filter(
        (r: { includeInReport?: boolean | null }) => r.includeInReport !== false,
      );
      const domainScores = (results.domainScores || []) as Array<{
        domainCode?: string;
        name?: string;
        score?: number | null;
      }>;
      const findings = results.findings || [];
      const gaps = results.evidenceGaps || [];
      const distribution = results.scoreDistribution || {};

      doc.rect(0, 0, doc.page.width, 120).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(11).text('PHYSICAL RISK', 48, 36);
      doc.fontSize(22).text('MOSS', 48, 54);
      doc.fontSize(10).text('Master Catalogue Control Assessment', 48, 82);

      doc.fillColor('#111111').fontSize(20).text(reportLabel, 48, 160);
      doc.moveDown(0.5).fontSize(12).fillColor('#555555')
        .text('MOSS 100-Control Maturity Assessment – Executive Summary');
      doc.moveDown(2).fillColor('#111111').fontSize(11);
      doc.text(`Organisation: ${results.organisation?.name || '—'}`);
      if (results.site) {
        doc.text(`Site: ${results.site.siteCode} — ${results.site.name}`);
      }
      doc.text(`Assessment reference: ${results.reference || '—'}`);
      doc.text(`Catalogue: v${results.catalogueVersion || '3.0'}`);
      doc.text(`Methodology: ${results.scoringMethodology || '—'}`);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`);
      if (isPreliminary) {
        doc.moveDown().fillColor(BRAND).fontSize(10)
          .text('PRELIMINARY – Subject to analyst review and approval.');
      }

      doc.addPage().fillColor('#111111').fontSize(16).text('Executive Summary');
      doc.moveDown().fontSize(10).fillColor('#333333');
      doc.text(
        `This ${isPreliminary ? 'preliminary' : 'approved'} report summarises the MOSS Master Catalogue assessment for ${
          results.organisation?.name || 'the organisation'
        }. ` +
          'Scores reflect control maturity (0–4) aggregated with the published MOSS methodology. ' +
          'This report does not include Cost Leakage financial estimates and is not an audit opinion.',
      );
      doc.moveDown().fillColor('#111111').fontSize(11);
      doc.text(`Overall MOSS score: ${results.overallScoreDisplay ?? '—'}`);
      doc.text(`Domain maturity: ${results.domainMaturityDisplay ?? '—'}`);
      doc.text(`Completion: ${Number(results.completenessPercent || 0).toFixed(1)}%`);
      doc.text(`Findings: ${findings.length}`);
      doc.text(`Recommendations: ${recommendations.length}`);
      doc.text(`Evidence gaps (informational): ${gaps.length}`);

      doc.moveDown(1.2).fontSize(14).text('Score distribution (controls)');
      doc.moveDown(0.4).fontSize(10).fillColor('#333333');
      for (const score of [4, 3, 2, 1, 0] as const) {
        doc.text(`Score ${score}: ${(distribution as any)[score] ?? 0}`);
      }
      doc.text(`Unscored: ${(distribution as any).unscored ?? 0}`);

      doc.moveDown(1.2).fillColor('#111111').fontSize(14).text('Domain scores');
      doc.moveDown(0.4).fontSize(10).fillColor('#333333');
      if (!domainScores.length) {
        doc.text('No domain scores available. Evaluate the assessment first.');
      } else {
        const sorted = [...domainScores].sort(
          (a, b) => Number(b.score ?? -1) - Number(a.score ?? -1),
        );
        for (const domain of sorted) {
          const label = domain.name || domain.domainCode || 'Domain';
          const code = domain.domainCode ? `${domain.domainCode} — ` : '';
          const score =
            domain.score == null || Number.isNaN(Number(domain.score))
              ? '—'
              : Number(domain.score).toFixed(2);
          doc.text(`${code}${label}: ${score}`);
        }
      }

      doc.addPage().fillColor('#111111').fontSize(16).text('Findings');
      doc.moveDown().fontSize(10).fillColor('#333333');
      if (!findings.length) {
        doc.text('No structured findings recorded for this assessment.');
      } else {
        findings.slice(0, 40).forEach((finding: any, index: number) => {
          doc.fontSize(12).fillColor('#111111').text(
            `${index + 1}. ${finding.title}${finding.controlCode ? ` (${finding.controlCode})` : ''}`,
          );
          doc.fontSize(10).fillColor('#555555').text(
            `Severity: ${finding.severityDisplay || finding.severity || 'Not classified'}`,
          );
          if (finding.description) {
            doc.fillColor('#333333').text(String(finding.description).slice(0, 600));
          }
          doc.moveDown(0.6);
        });
        if (findings.length > 40) {
          doc.fillColor('#555555').text(`…and ${findings.length - 40} more findings.`);
        }
      }

      doc.addPage().fillColor('#111111').fontSize(16).text('Recommendations');
      doc.moveDown().fontSize(10).fillColor('#333333');
      if (!recommendations.length) {
        doc.text('No recommendations were selected for this report.');
      } else {
        recommendations.slice(0, 40).forEach((recommendation: any, index: number) => {
          doc.fontSize(12).fillColor('#111111').text(
            `${index + 1}. ${recommendation.title}${
              recommendation.controlCode ? ` (${recommendation.controlCode})` : ''
            }`,
          );
          doc.fontSize(10).fillColor('#333333').text(String(recommendation.summary || '').slice(0, 800));
          doc.moveDown(0.6);
        });
        if (recommendations.length > 40) {
          doc.fillColor('#555555').text(`…and ${recommendations.length - 40} more recommendations.`);
        }
      }

      if (gaps.length) {
        doc.moveDown(1).fillColor('#111111').fontSize(14).text('Evidence gaps (informational)');
        doc.moveDown(0.4).fontSize(10).fillColor('#333333');
        doc.text(
          'Controls with evidence standards but no uploaded evidence. Gaps are not automatic compliance failures.',
        );
        gaps.slice(0, 30).forEach((gap: any) => {
          doc.text(`• ${gap.controlCode}: ${gap.label || 'Evidence not yet uploaded'}`);
        });
        if (gaps.length > 30) {
          doc.text(`…and ${gaps.length - 30} more.`);
        }
      }

      doc.moveDown(1.2).fillColor('#111111').fontSize(12).text('Disclaimer');
      doc.moveDown(0.3).fontSize(9).fillColor('#555555').text(
        'This MOSS report is a decision-support maturity assessment based on assessor scores and catalogue methodology. ' +
          'It is not an audit finding and does not include Cost Leakage / SCLI financial estimates. ' +
          'Automatic severity mapping and recommendation rules remain subject to client methodology confirmation. ' +
          'Physical Risk accepts no liability for commercial decisions taken solely on the basis of this report without further assurance work.',
      );

      doc.end();
    });
  }

  async generate(assessmentId: string, user: AuthUser, opts?: { reportType?: ReportType }) {
    await this.assessments.requireMossAssessment(assessmentId, user);

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        title: true,
        reference: true,
        status: true,
        productCode: true,
        submittedAt: true,
      },
    });
    if (!assessment || assessment.productCode !== ProductCode.MOSS) {
      throw new NotFoundException('MOSS assessment not found.');
    }

    const approvedStatuses = new Set<AssessmentStatus>([
      AssessmentStatus.APPROVED,
      AssessmentStatus.REPORT_GENERATED,
      AssessmentStatus.REPORT_ISSUED,
    ]);

    let reportType = opts?.reportType;
    if (!reportType) {
      reportType = approvedStatuses.has(assessment.status)
        ? ReportType.VERIFIED_EXECUTIVE
        : ReportType.PRELIMINARY_EXECUTIVE;
    }

    if (reportType === ReportType.VERIFIED_EXECUTIVE) {
      requireRole(user, APPROVER_ROLES, 'Approved MOSS executive reports require approver permission.');
      if (!approvedStatuses.has(assessment.status)) {
        throw new BadRequestException('Approved MOSS reports can only be generated after approval.');
      }
    } else {
      requireRole(user, ANALYST_ROLES, 'Analyst permission required to generate MOSS reports.');
    }

    const results = await this.results.getResults(assessmentId, user);
    const prior = await this.prisma.report.count({
      where: { assessmentId, reportType },
    });
    const version = prior + 1;
    const buffer = await this.createPdf(results, reportType, assessment.title);
    const label = reportType === ReportType.PRELIMINARY_EXECUTIVE ? 'Preliminary' : 'Approved-Executive';
    const fileName = `${assessment.reference}-${label}-v${version}.pdf`;
    const storageKey = `assessments/${assessment.id}/reports/moss-${Date.now()}-${fileName}`;
    await this.storage.put(storageKey, buffer, 'application/pdf');

    const report = await this.prisma.report.create({
      data: {
        assessmentId,
        title: `${assessment.title} MOSS ${label} Report`,
        status: 'GENERATED',
        reportType,
        version,
        storageKey,
        fileName,
        mimeType: 'application/pdf',
        generatedById: user.id,
        generatedAt: new Date(),
        approvedAt: reportType === ReportType.VERIFIED_EXECUTIVE ? new Date() : null,
      },
    });

    if (reportType === ReportType.VERIFIED_EXECUTIVE) {
      await this.prisma.assessmentSession.update({
        where: { id: assessmentId },
        data: { status: AssessmentStatus.REPORT_GENERATED },
      });
    }

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_GENERATE_REPORT',
      entityType: 'Report',
      entityId: report.id,
      metadata: { assessmentId, reportType, version, productCode: ProductCode.MOSS },
    });

    return {
      ...report,
      productCode: ProductCode.MOSS,
      downloadPath: `/moss/reports/${report.id}/file`,
      downloadUrl: await this.storage.signedDownloadUrl(storageKey),
    };
  }

  async listForAssessment(assessmentId: string, user: AuthUser) {
    await this.assessments.requireMossAssessment(assessmentId, user);
    const reports = await this.prisma.report.findMany({
      where: { assessmentId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        generatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return Promise.all(
      reports.map(async (report) => ({
        ...report,
        productCode: ProductCode.MOSS,
        downloadPath: `/moss/reports/${report.id}/file`,
        downloadUrl: report.storageKey
          ? await this.storage.signedDownloadUrl(report.storageKey)
          : null,
      })),
    );
  }

  async get(reportId: string, user: AuthUser) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        assessment: { select: { id: true, productCode: true, reference: true, title: true } },
        generatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!report || report.assessment.productCode !== ProductCode.MOSS) {
      throw new NotFoundException('MOSS report not found.');
    }
    await this.assessments.requireMossAssessment(report.assessmentId, user);
    return {
      ...report,
      productCode: ProductCode.MOSS,
      downloadPath: `/moss/reports/${report.id}/file`,
      downloadUrl: report.storageKey
        ? await this.storage.signedDownloadUrl(report.storageKey)
        : null,
    };
  }

  async downloadFile(reportId: string, user: AuthUser) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        assessment: { select: { id: true, productCode: true } },
      },
    });
    if (!report || report.assessment.productCode !== ProductCode.MOSS || !report.storageKey) {
      throw new NotFoundException('MOSS report file not found.');
    }
    await this.assessments.requireMossAssessment(report.assessmentId, user);
    const buffer = await this.storage.getBuffer(report.storageKey);
    if (!buffer.length) {
      throw new NotFoundException('MOSS report file is empty or missing from storage.');
    }
    return {
      buffer,
      fileName: report.fileName || `${report.id}.pdf`,
      mimeType: report.mimeType || 'application/pdf',
    };
  }

  /** JSON payload for browser open via BFF (avoids empty binary proxy bodies). */
  async getContent(reportId: string, user: AuthUser) {
    const file = await this.downloadFile(reportId, user);
    return {
      id: reportId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.buffer.length,
      base64: file.buffer.toString('base64'),
    };
  }
}
