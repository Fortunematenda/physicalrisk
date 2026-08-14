import { BadRequestException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { SomodAssessmentStatus } from '@prisma/client';
import { StorageService } from '../../evidence/storage.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SomodAssessmentsService } from '../assessments/somod-assessments.service';
import { moneyNumber } from '../financial/somod-financial-formulas';
import { DEFAULT_SCENARIOS } from '../engines/somod-engines';

const BRAND = '#c41230';

function moneyZar(n: unknown) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(v);
}

@Injectable()
export class SomodReportsService {
  constructor(
    private readonly assessments: SomodAssessmentsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  private createPdf(input: {
    reference: string;
    title: string;
    status: SomodAssessmentStatus;
    organisationName: string;
    siteLabel: string | null;
    mossReference: string | null;
    notes: string | null;
    scenarios: Array<{
      scenarioType: string;
      label: string;
      monthlyTotalSecurityCost: number;
      monthlyOperationalLeakage: number;
      monthlyRecoverableValue: number;
      effectivenessScore: number | null;
      riskPosition: string | null;
    }>;
    cfo: {
      currentMonthlySpend: number;
      optimalMonthlySpend: number;
      monthlySavings: number;
      annualSavings: number;
      currentMonthlyLeakage: number;
      optimalMonthlyLeakage: number;
      monthlyRecoverableValue: number;
      requiredCapitalInvestment: number;
      paybackMonths: number | null;
    } | null;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: input.title, Author: 'Physical Risk · SOMOD' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const isApproved = input.status === SomodAssessmentStatus.APPROVED;
      const reportLabel = isApproved
        ? 'Approved Optimisation Summary'
        : 'Preliminary Optimisation Summary';

      doc.rect(0, 0, doc.page.width, 120).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(11).text('PHYSICAL RISK', 48, 36);
      doc.fontSize(22).text('SOMOD', 48, 54);
      doc.fontSize(10).text('Security Operating Model Optimisation Diagnostic', 48, 82);

      doc.fillColor('#111111').fontSize(18).text(reportLabel, 48, 160);
      doc.moveDown(0.4).fontSize(11).fillColor('#555555').text(input.title);
      doc.moveDown(1.2).fillColor('#111111').fontSize(11);
      doc.text(`Organisation: ${input.organisationName}`);
      if (input.siteLabel) doc.text(`Site: ${input.siteLabel}`);
      doc.text(`Assessment reference: ${input.reference}`);
      doc.text(`Status: ${input.status}`);
      if (input.mossReference) doc.text(`Linked MOSS: ${input.mossReference}`);
      doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`);
      doc.moveDown().fillColor(BRAND).fontSize(9);
      doc.text('Financial layer · SOMOD Current scenario.');
      if (!isApproved) {
        doc.moveDown(0.3).text('PRELIMINARY – Subject to review and approval.');
      }

      doc.addPage().fillColor('#111111').fontSize(16).text('CFO dashboard');
      doc.moveDown().fontSize(10).fillColor('#333333');
      if (!input.cfo) {
        doc.text('No CFO snapshot. Run calculate-financials first.');
      } else {
        const c = input.cfo;
        doc.text(`Current monthly spend: ${moneyZar(c.currentMonthlySpend)}`);
        doc.text(`Recommended Optimal monthly spend: ${moneyZar(c.optimalMonthlySpend)}`);
        doc.text(`Monthly savings: ${moneyZar(c.monthlySavings)}`);
        doc.text(`Annual savings: ${moneyZar(c.annualSavings)}`);
        doc.text(
          `Leakage (Current → Optimal): ${moneyZar(c.currentMonthlyLeakage)} → ${moneyZar(c.optimalMonthlyLeakage)}`,
        );
        doc.text(`Recoverable value: ${moneyZar(c.monthlyRecoverableValue)}`);
        doc.text(`Required capital investment: ${moneyZar(c.requiredCapitalInvestment)}`);
        doc.text(`Payback months: ${c.paybackMonths == null ? '—' : c.paybackMonths}`);
      }

      doc.addPage().fillColor('#111111').fontSize(16).text('Scenario financial outputs');
      doc.moveDown().fontSize(10).fillColor('#333333');
      for (const row of input.scenarios) {
        doc.fillColor('#111111').fontSize(12).text(row.label);
        doc.moveDown(0.2).fontSize(10).fillColor('#333333');
        doc.text(`Monthly total security cost: ${moneyZar(row.monthlyTotalSecurityCost)}`);
        doc.text(`Monthly operational leakage: ${moneyZar(row.monthlyOperationalLeakage)}`);
        doc.text(`Monthly recoverable value: ${moneyZar(row.monthlyRecoverableValue)}`);
        doc.text(`Effectiveness: ${row.effectivenessScore ?? '—'}`);
        doc.text(`Risk position: ${row.riskPosition ?? '—'}`);
        doc.moveDown(0.6);
      }

      if (input.notes?.trim()) {
        doc.moveDown(0.6).fillColor('#111111').fontSize(14).text('Notes');
        doc.moveDown(0.4).fontSize(10).fillColor('#333333').text(input.notes.trim());
      }

      doc.moveDown(1).fillColor('#777777').fontSize(8);
      doc.text('Physical Risk Consultancy · SOMOD summary export · Confidential', {
        align: 'center',
      });

      doc.end();
    });
  }

  async generate(assessmentId: string, user: AuthUser) {
    const assessment = await this.assessments.requireSomodAssessment(assessmentId, user);
    const outputs = await this.prisma.somodScenarioFinancialOutput.findMany({
      where: { somodAssessmentId: assessmentId },
    });
    if (outputs.length === 0) {
      throw new BadRequestException(
        'Run calculate-financials before generating a SOMOD report.',
      );
    }

    const labels = new Map(DEFAULT_SCENARIOS.map((s) => [s.scenarioType, s.label]));
    const cfo = await this.prisma.somodCfoDashboardSnapshot.findFirst({
      where: { somodAssessmentId: assessmentId },
      orderBy: { createdAt: 'desc' },
    });

    const buffer = await this.createPdf({
      reference: assessment.reference,
      title: assessment.title,
      status: assessment.status,
      organisationName: assessment.organisation.name,
      siteLabel: assessment.site
        ? `${assessment.site.name} (${assessment.site.siteCode})`
        : null,
      mossReference: assessment.mossAssessment?.reference || null,
      notes: assessment.notes,
      scenarios: outputs.map((o) => ({
        scenarioType: o.scenarioType,
        label: labels.get(o.scenarioType as any) || o.scenarioType,
        monthlyTotalSecurityCost: moneyNumber(o.monthlyTotalSecurityCost),
        monthlyOperationalLeakage: moneyNumber(o.monthlyOperationalLeakage),
        monthlyRecoverableValue: moneyNumber(o.monthlyRecoverableValue),
        effectivenessScore:
          o.effectivenessScore == null ? null : moneyNumber(o.effectivenessScore),
        riskPosition: o.riskPosition,
      })),
      cfo: cfo
        ? {
            currentMonthlySpend: moneyNumber(cfo.currentMonthlySpend),
            optimalMonthlySpend: moneyNumber(cfo.optimalMonthlySpend),
            monthlySavings: moneyNumber(cfo.monthlySavings),
            annualSavings: moneyNumber(cfo.annualSavings),
            currentMonthlyLeakage: moneyNumber(cfo.currentMonthlyLeakage),
            optimalMonthlyLeakage: moneyNumber(cfo.optimalMonthlyLeakage),
            monthlyRecoverableValue: moneyNumber(cfo.monthlyRecoverableValue),
            requiredCapitalInvestment: moneyNumber(cfo.requiredCapitalInvestment),
            paybackMonths:
              cfo.paybackMonths == null ? null : moneyNumber(cfo.paybackMonths),
          }
        : null,
    });

    const label =
      assessment.status === SomodAssessmentStatus.APPROVED ? 'Approved' : 'Preliminary';
    const fileName = `${assessment.reference}-${label}-Summary.pdf`;
    const storageKey = `somod/${assessment.id}/reports/${Date.now()}-${fileName}`;
    await this.storage.put(storageKey, buffer, 'application/pdf');

    await this.audit.record({
      userId: user.id,
      action: 'SOMOD_REPORT_GENERATED',
      entityType: 'SomodAssessment',
      entityId: assessmentId,
      organisationId: assessment.organisationId,
      metadata: { fileName, storageKey, label },
    });

    return {
      fileName,
      mimeType: 'application/pdf',
      size: buffer.length,
      storageKey,
      label,
      base64: buffer.toString('base64'),
    };
  }
}
