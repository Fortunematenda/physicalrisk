import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { getRiskBand } from '@moss/shared';

import { DEFAULT_SCL_REPORT_BRANDING, resolveSclReportLogoPath } from './scl-report-branding';
import { buildScoringMatrixPanels, renderSclExecutivePdf } from './scl-report-pdf';
import {
  buildPriorityActionText,
  listSclClassificationVisuals,
  resolveSclClassificationVisual,
} from './scl-report-visual';

describe('SCL report visual classification', () => {
  it('maps approved bands to Green / Yellow / Amber / Red with accessible labels', () => {
    expect(resolveSclClassificationVisual(25).accessibleLabel).toBe('CONTROLLED RISK — GREEN');
    expect(resolveSclClassificationVisual(50).accessibleLabel).toBe('MODERATE RISK — YELLOW');
    expect(resolveSclClassificationVisual(71).accessibleLabel).toBe('HIGH RISK — AMBER');
    expect(resolveSclClassificationVisual(80).accessibleLabel).toBe('CRITICAL RISK — RED');
    expect(getRiskBand(71)).toBe('High');
  });

  it('lists all four visuals in methodology order', () => {
    const list = listSclClassificationVisuals();
    expect(list.map((v) => v.colourName)).toEqual(['GREEN', 'YELLOW', 'AMBER', 'RED']);
  });

  it('builds priority action from recommendations without inventing scoring', () => {
    expect(
      buildPriorityActionText({
        recommendations: [{ suggestedNextStep: 'Validate SLA evidence on Q1–Q3.' }],
      }),
    ).toBe('Validate SLA evidence on Q1–Q3.');
  });

  it('scoring matrix keeps only the client-selected option per answered question', () => {
    const panels = buildScoringMatrixPanels(
      [
        {
          code: 'Q1',
          text: 'Deployment verification',
          selectedOptionId: 'opt-b',
          options: [
            { id: 'opt-a', label: 'Real-time verification', riskScore: 5 },
            { id: 'opt-b', label: 'Vendor self-reporting only', riskScore: 70 },
            { id: 'opt-c', label: 'No verification', riskScore: 95 },
          ],
        },
        {
          code: 'Q2',
          text: 'Unanswered question',
          selectedOptionId: null,
          options: [
            { id: 'opt-d', label: 'Defined remedies', riskScore: 0 },
            { id: 'opt-e', label: 'No leverage', riskScore: 80 },
          ],
        },
      ],
      { answeredOnly: true },
    );

    expect(panels).toHaveLength(1);
    expect(panels[0].code).toBe('Q1');
    expect(panels[0].rows).toHaveLength(1);
    expect(panels[0].rows[0]).toMatchObject({
      description: 'Vendor self-reporting only',
      riskScore: 70,
      selected: true,
    });
  });
});

describe('SCL executive PDF band fixtures', () => {
  const outDir = join(process.cwd(), '..', '..', '..', 'docs', 'assets', 'scl-report-visual');

  const samples: Array<{
    file: string;
    score: number;
    company: string;
    leakage: number;
    rate: number;
  }> = [
    { file: 'SCL-executive-CONTROLLED-GREEN.pdf', score: 28, company: 'Greenvale Logistics', leakage: 420_000, rate: 0.042 },
    { file: 'SCL-executive-MODERATE-YELLOW.pdf', score: 52, company: 'Yellowstone Retail Group', leakage: 980_000, rate: 0.078 },
    { file: 'SCL-executive-HIGH-AMBER.pdf', score: 71, company: 'ABC Mining', leakage: 1_850_000, rate: 0.11 },
    { file: 'SCL-executive-CRITICAL-RED.pdf', score: 82, company: 'Redline Ports Authority', leakage: 3_400_000, rate: 0.16 },
  ];

  it('renders a test PDF for each classification band', async () => {
    mkdirSync(outDir, { recursive: true });
    const logoPath = resolveSclReportLogoPath(DEFAULT_SCL_REPORT_BRANDING);

    for (const sample of samples) {
      const band = getRiskBand(sample.score);
      const visual = resolveSclClassificationVisual(band);
      const buffer = await renderSclExecutivePdf({
        brand: DEFAULT_SCL_REPORT_BRANDING,
        logoPath,
        companyName: sample.company,
        reference: `SCLI-DEMO-${visual.colourName}`,
        assessmentDateLabel: '20 August 2026, 14:30',
        reportTitle: 'Preliminary Executive Report',
        isPreliminary: true,
        modelVersion: 'SCLI 1.1',
        overallRiskScore: sample.score,
        maturityScore: 100 - sample.score,
        riskBand: band,
        methodologyConfidence: 0.72,
        evidenceConfidence: 0.55,
        opportunityScore: 61,
        leakage: {
          estimatedLossesLow: sample.leakage * 0.6,
          estimatedLossesHigh: sample.leakage * 1.2,
          minimumLeakageValue: sample.leakage * 0.55,
          minimumLeakageRate: sample.rate * 0.55,
          likelyLeakageValue: sample.leakage,
          likelyLeakageRate: sample.rate,
          maximumExposureValue: sample.leakage * 1.45,
          maximumExposureRate: Math.min(0.2, sample.rate * 1.4),
          recoverableLow: sample.leakage * 0.25,
          recoverableHigh: sample.leakage * 0.65,
        },
        categoryScores: [
          { category: 'Executive Assurance', score: sample.score + 4 },
          { category: 'Contract and SLA Enforcement', score: sample.score - 2 },
          { category: 'Technology and Verification', score: sample.score },
          { category: 'Labour Deployment', score: Math.max(10, sample.score - 8) },
        ],
        recommendations: [
          {
            title: 'Independent verification of contracted security services',
            priority: 'HIGH',
            summary: 'Strengthen independent verification against contracted SLAs.',
            suggestedNextStep: 'Commission a scoped Physical Risk assurance review of the top risk categories.',
          },
          {
            title: 'Contract enforceability',
            priority: 'MEDIUM',
            summary: 'Tighten remedies and escalation clauses.',
            suggestedNextStep: 'Redraft service levels, remedies, and escalation clauses.',
          },
        ],
        prospectName: 'Client Executive',
        scoringMatrix: [
          {
            title: 'Contracted deployment verification',
            code: 'Q1',
            hasSelection: true,
            rows: [
              {
                maturityLabel: 'Weak',
                description: 'Vendor self-reporting only',
                riskScore: 70,
                tone: 'weak',
                selected: true,
              },
            ],
          },
          {
            title: 'SLA measurability',
            code: 'Q2',
            hasSelection: true,
            rows: [
              {
                maturityLabel: 'Acceptable',
                description: 'Partially measurable',
                riskScore: 45,
                tone: 'acceptable',
                selected: true,
              },
            ],
          },
        ],
      });

      expect(buffer.byteLength).toBeGreaterThan(2000);
      // PDF magic
      expect(buffer.subarray(0, 4).toString('utf8')).toBe('%PDF');
      writeFileSync(join(outDir, sample.file), buffer);
      expect(visual.accessibleLabel).toContain(visual.colourName);
    }
  }, 30_000);
});
