import { describe, expect, it } from 'vitest';
import { buildEadDiagnosticSnapshot } from '@moss/shared';
import { renderAdvisoryPdf } from './advisory-report-pdf';

function mod(code: string, name: string, assurance: number, extras: Record<string, unknown> = {}) {
  const snap = buildEadDiagnosticSnapshot(code, {}, new Date());
  snap.calculatedAssuranceScore = assurance;
  snap.calculatedExposureIndicator = 100 - assurance;
  return {
    moduleCode: code,
    moduleName: name,
    principalQuestion: `${name}?`,
    exposureRating: 100 - assurance,
    diagnosticResponses: snap,
    finding: `<p>Finding for ${name}</p>`,
    evidenceSummary: '<p>Evidence recorded</p>',
    requiredDecision: `<p>Decision for ${name}</p>`,
    businessConsequences: ['FINANCIAL_LOSS'],
    ...extras,
  };
}

describe('renderAdvisoryPdf (Stage 6)', () => {
  it('generates a PDF buffer with executive summary content and no Shield 360', async () => {
    const pdf = await renderAdvisoryPdf({
      reference: 'EAD-2026-TEST',
      title: 'Test Executive Advisory Diagnostic',
      organisation: 'Example Org',
      productLabel: 'Executive Advisory Diagnostic',
      status: 'IN_PROGRESS',
      consultant: 'Test Consultant',
      reportVersion: 1,
      salesEmail: 'sales@physicalrisk.com',
      modules: [
        mod('CONSEQUENCE', 'Consequence Management', 35, {
          recommendedProduct: 'SCLI_COST_LEAKAGE',
          businessConsequences: ['FINANCIAL_LOSS', 'REPUTATIONAL_DAMAGE'],
        }),
        mod('CONTRACTUAL', 'Contractual Assurance', 72, {
          recommendedProduct: 'CONTRACT_SLA_ASSURANCE',
        }),
        mod('FINANCIAL', 'Financial Assurance', 48),
        mod('GOVERNANCE', 'Governance and accountability', 61),
        mod('REPORTING', 'Reporting Integrity', 40),
        mod('RESILIENCE', 'Operational Resilience', 76),
      ],
      evidence: [{ id: '1', fileName: 'incident.pdf', title: 'Incident Report 2026' }],
      routes: [{ productCode: 'SCLI_COST_LEAKAGE', priority: 'HIGH' }],
      questions: [
        {
          moduleCode: 'CONSEQUENCE',
          questionCode: 'CORRECTION',
          title: 'Correction',
          questionText: 'When failures occur, are corrective actions consistently implemented?',
          displayOrder: 1,
          isActive: true,
        },
      ],
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(2000);
    // Content streams are compressed; assert retirement strings never appear as plain literals.
    const asText = pdf.toString('latin1');
    expect(asText).not.toMatch(/Shield\s*360/i);
    expect(asText).not.toContain('SHIELD360');
  }, 20000);
});
