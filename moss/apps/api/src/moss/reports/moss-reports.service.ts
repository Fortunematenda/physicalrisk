import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AssessmentStatus, ProductCode, ReportType } from '@prisma/client';
import { MOSS_SCORE_LABELS } from '@moss/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../evidence/storage.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { ANALYST_ROLES, APPROVER_ROLES, requireRole } from '../../common/roles';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';
import { MossResultsService } from '../results/moss-results.service';

const BRAND = '#c41230';

/** Colour bands for MOSS maturity 0–4 (display only; scoring unchanged). */
const MATURITY_BAND: Record<number, { label: string; fill: string }> = {
  0: { label: MOSS_SCORE_LABELS[0], fill: '#b91c1c' },
  1: { label: MOSS_SCORE_LABELS[1], fill: '#ea580c' },
  2: { label: MOSS_SCORE_LABELS[2], fill: '#ca8a04' },
  3: { label: MOSS_SCORE_LABELS[3], fill: '#16a34a' },
  4: { label: MOSS_SCORE_LABELS[4], fill: '#0f766e' },
};

function bandForScore(score: number | null | undefined) {
  if (score == null || Number.isNaN(Number(score))) return null;
  const rounded = Math.max(0, Math.min(4, Math.round(Number(score))));
  return MATURITY_BAND[rounded];
}

function formatScoreOutOfFour(score: number | null | undefined, display?: string | null) {
  if (display && /pending/i.test(display)) return display;
  if (score == null || Number.isNaN(Number(score))) return display || '—';
  const n = Number(score);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const band = bandForScore(n);
  return band ? `${text} / 4 · ${band.label}` : `${text} / 4`;
}

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
        domainName?: string;
        score?: number | null;
      }>;
      const findings = results.findings || [];
      const gaps = results.evidenceGaps || [];
      const distribution = results.scoreDistribution || {};

      doc.rect(0, 0, doc.page.width, 120).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(11).text('PHYSICAL RISK', 48, 36);
      doc.fontSize(22).text('MOSS', 48, 54);
      doc.fontSize(10).text('Management Oversight Security Standard — Master Catalogue Control Assessment', 48, 82);

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
          .text(
            'PRELIMINARY – Scoring may be complete, but this report is not approved. ' +
              'Use Mark reviewed → Approve & lock on the assessment Results/Controls pages, then generate the Approved Executive Report.',
          );
      } else {
        doc.moveDown().fillColor('#0f766e').fontSize(10)
          .text('APPROVED – Locked executive report. Later scoring changes require a new revision.');
      }

      const uploadedEvidence = ((results as any).evidenceUploaded || []) as Array<{
        fileName?: string;
        controlCode?: string | null;
        controlName?: string | null;
        domainCode?: string | null;
        domainName?: string | null;
        uploadedByName?: string | null;
        uploadedAt?: string | Date | null;
      }>;

      doc.addPage().fillColor('#111111').fontSize(16).text('Executive Summary');
      doc.moveDown().fontSize(10).fillColor('#333333');
      doc.text(
        `This ${isPreliminary ? 'preliminary' : 'approved'} report summarises the MOSS Master Catalogue assessment for ${
          results.organisation?.name || 'the organisation'
        }. ` +
          'Scores reflect control maturity on a 0–4 scale (Non-existent → Optimised), aggregated with the published MOSS methodology. ' +
          '100% scoring completion is not the same as analyst approval. ' +
          'This report does not include Cost Leakage financial estimates and is not an audit opinion.',
      );
      doc.moveDown().fillColor('#111111').fontSize(11);
      doc.text(
        `Overall MOSS score: ${formatScoreOutOfFour(
          results.overallScore as number | null,
          results.overallScoreDisplay,
        )}`,
      );
      {
        const dm = results.domainMaturityDisplay;
        const dmText =
          !dm || dm === '—' || /pending/i.test(String(dm))
            ? dm || '—'
            : String(dm).includes('/ 4')
              ? String(dm)
              : `${dm} / 4`;
        doc.text(`Domain maturity: ${dmText}`);
      }
      doc.text(`Completion (controls scored): ${Number(results.completenessPercent || 0).toFixed(1)}%`);
      doc.text(`Workflow status: ${results.status || '—'}${results.submittedAt ? ' · submitted for review' : ''}`);
      doc.text(`Findings: ${findings.length}`);
      doc.text(`Recommendations in this report: ${recommendations.length}`);
      doc.text(`Evidence uploaded: ${uploadedEvidence.length}`);
      doc.text(`Evidence gaps (informational): ${gaps.length}`);

      doc.moveDown(1.2).fontSize(14).fillColor('#111111').text('Maturity colour scale (0–4)');
      doc.moveDown(0.4);
      for (const score of [0, 1, 2, 3, 4] as const) {
        const band = MATURITY_BAND[score];
        const y = doc.y;
        doc.rect(48, y, 12, 12).fill(band.fill);
        doc.fillColor('#333333').fontSize(10).text(
          `${score} · ${band.label} — ${(distribution as any)[score] ?? 0} control(s)`,
          68,
          y,
        );
        doc.moveDown(0.15);
      }
      doc.fillColor('#333333').text(`Unscored: ${(distribution as any).unscored ?? 0}`);

      doc.moveDown(1.2).fillColor('#111111').fontSize(14).text('Domain scores (D01–D14)');
      doc.moveDown(0.4).fontSize(10).fillColor('#333333');
      if (!domainScores.length) {
        doc.text('No domain scores available. Evaluate the assessment first.');
      } else {
        const sorted = [...domainScores].sort((a, b) =>
          String(a.domainCode || '').localeCompare(String(b.domainCode || '')),
        );
        for (const domain of sorted) {
          const label =
            (domain as any).domainName || domain.name || domain.domainCode || 'Domain';
          const code = domain.domainCode || '';
          const scoreNum =
            domain.score == null || Number.isNaN(Number(domain.score))
              ? null
              : Number(domain.score);
          const band = bandForScore(scoreNum);
          const scoreText =
            scoreNum == null
              ? '—'
              : `${scoreNum.toFixed(2)} / 4${band ? ` · ${band.label}` : ''}`;
          const y = doc.y;
          if (band) {
            doc.rect(48, y + 1, 8, 8).fill(band.fill);
          }
          doc.fillColor('#333333').text(`${code} — ${label}: ${scoreText}`, band ? 64 : 48, y);
          doc.moveDown(0.12);
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
        doc.text(
          'No recommendations are marked for this report. Add them on the Recommendations tab and ensure “Include in report” is enabled.',
        );
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

      doc.addPage().fillColor('#111111').fontSize(16).text('Evidence');
      doc.moveDown().fontSize(10).fillColor('#333333');
      doc.text(
        'Uploaded evidence is listed for transparency. Gaps list catalogue standards that still have no upload; gaps are informational and are not automatic compliance failures.',
      );
      doc.moveDown(0.8).fillColor('#111111').fontSize(13).text('Uploaded evidence');
      doc.moveDown(0.3).fontSize(10).fillColor('#333333');
      if (!uploadedEvidence.length) {
        doc.text('No evidence documents have been uploaded for this assessment yet.');
      } else {
        uploadedEvidence.slice(0, 40).forEach((docItem, index) => {
          const where = [docItem.domainCode, docItem.controlCode, docItem.controlName]
            .filter(Boolean)
            .join(' · ');
          doc.fontSize(11).fillColor('#111111').text(
            `${index + 1}. ${docItem.fileName || 'Document'}${where ? ` — ${where}` : ''}`,
          );
          const meta = [
            docItem.uploadedByName ? `Uploaded by ${docItem.uploadedByName}` : null,
            docItem.uploadedAt
              ? new Date(docItem.uploadedAt).toLocaleDateString('en-ZA')
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          if (meta) doc.fontSize(9).fillColor('#555555').text(meta);
          doc.moveDown(0.35);
        });
        if (uploadedEvidence.length > 40) {
          doc.fillColor('#555555').text(`…and ${uploadedEvidence.length - 40} more documents.`);
        }
      }

      doc.moveDown(0.8).fillColor('#111111').fontSize(13).text('Evidence gaps (informational)');
      doc.moveDown(0.3).fontSize(10).fillColor('#333333');
      if (!gaps.length) {
        doc.text('No evidence gaps — every control with catalogue standards has at least one upload.');
      } else {
        gaps.slice(0, 40).forEach((gap: any) => {
          const heading = [gap.domainCode, gap.controlCode, gap.controlName || gap.label]
            .filter(Boolean)
            .join(' · ');
          doc.text(`• ${heading}`);
          if (Array.isArray(gap.requiredStandards) && gap.requiredStandards.length) {
            doc.fillColor('#555555').text(
              `  Expected: ${gap.requiredStandards.slice(0, 3).join('; ')}`,
            );
            doc.fillColor('#333333');
          }
        });
        if (gaps.length > 40) {
          doc.fillColor('#555555').text(`…and ${gaps.length - 40} more.`);
        }
      }

      doc.moveDown(1.2).fillColor('#111111').fontSize(12).text('Disclaimer');
      doc.moveDown(0.3).fontSize(9).fillColor('#555555').text(
        'This MOSS report is a decision-support maturity assessment based on assessor scores and the published catalogue. ' +
          'It is not an audit finding and does not include Cost Leakage financial estimates. ' +
          'Findings severity and recommendations are recorded by the assessor. ' +
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
