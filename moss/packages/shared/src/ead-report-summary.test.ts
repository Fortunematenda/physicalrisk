import { describe, expect, it } from 'vitest';
import {
  EAD_PRIORITY_ASSURANCE_THRESHOLD,
  aggregateEadBusinessConsequences,
  buildEadReportSummary,
  calculateOverallEadAssuranceScore,
  collectEadRecommendations,
  selectEadPriorityAreas,
} from './ead-report-summary';
import { buildEadDiagnosticSnapshot } from './ead-diagnostic-scoring';

function moduleWithAssurance(
  code: string,
  name: string,
  assurance: number,
  extras: Partial<{
    finding: string;
    requiredDecision: string;
    businessConsequences: string[];
    recommendedProduct: string;
  }> = {},
) {
  const exposure = 100 - assurance;
  // Build a minimal diagnostic snapshot with matching calculated scores
  const snap = buildEadDiagnosticSnapshot(code, {}, new Date());
  snap.calculatedAssuranceScore = assurance;
  snap.calculatedExposureIndicator = exposure;
  return {
    moduleCode: code,
    moduleName: name,
    principalQuestion: `${name}?`,
    exposureRating: exposure,
    diagnosticResponses: snap,
    finding: extras.finding || `<p>Finding for ${name}</p>`,
    requiredDecision: extras.requiredDecision || `<p>Decision for ${name}</p>`,
    businessConsequences: extras.businessConsequences || ['FINANCIAL_LOSS'],
    recommendedProduct: extras.recommendedProduct || null,
  };
}

describe('ead-report-summary (Stage 6)', () => {
  const sampleModules = [
    moduleWithAssurance('CONSEQUENCE', 'Consequence Management', 35, {
      businessConsequences: ['FINANCIAL_LOSS', 'REPUTATIONAL_DAMAGE'],
      recommendedProduct: 'SCLI_COST_LEAKAGE',
    }),
    moduleWithAssurance('CONTRACTUAL', 'Contractual Assurance', 72, {
      businessConsequences: ['FINANCIAL_LOSS'],
      recommendedProduct: 'CONTRACT_SLA_ASSURANCE',
    }),
    moduleWithAssurance('FINANCIAL', 'Financial Assurance', 48, {
      businessConsequences: ['FINANCIAL_LOSS', 'BUSINESS_INTERRUPTION'],
    }),
    moduleWithAssurance('GOVERNANCE', 'Governance and accountability', 61),
    moduleWithAssurance('REPORTING', 'Reporting Integrity', 40, {
      businessConsequences: ['REPUTATIONAL_DAMAGE'],
    }),
    moduleWithAssurance('RESILIENCE', 'Operational Resilience', 76),
  ];

  it('calculates equal-weight overall assurance from module scores', () => {
    const summary = buildEadReportSummary({ modules: sampleModules });
    // (35+72+48+61+40+76)/6 = 55.333… → 55.3
    expect(summary.overallAssuranceScore).toBe(55.3);
    expect(summary.overallBand?.code).toBe('SIGNIFICANT_IMPROVEMENT_REQUIRED');
    expect(summary.moduleScores).toHaveLength(6);
  });

  it('priority areas are lowest-scoring modules below the moderate threshold', () => {
    const rows = buildEadReportSummary({ modules: sampleModules }).moduleScores;
    const priority = selectEadPriorityAreas(rows);
    expect(EAD_PRIORITY_ASSURANCE_THRESHOLD).toBe(60);
    expect(priority.map((p) => p.moduleCode)).toEqual(['CONSEQUENCE', 'REPORTING', 'FINANCIAL']);
    expect(priority[0]?.assuranceScore).toBe(35);
    expect(priority.every((p) => p.keyFinding.length > 0)).toBe(true);
  });

  it('shows no priority areas when all modules are strong', () => {
    const strong = sampleModules.map((m) =>
      moduleWithAssurance(m.moduleCode, m.moduleName, 85),
    );
    const priority = selectEadPriorityAreas(buildEadReportSummary({ modules: strong }).moduleScores);
    expect(priority).toEqual([]);
  });

  it('aggregates business consequences without duplicates', () => {
    const agg = aggregateEadBusinessConsequences(
      buildEadReportSummary({ modules: sampleModules }).moduleScores,
    );
    const financial = agg.find((a) => a.code === 'FINANCIAL_LOSS');
    expect(financial?.moduleCount).toBeGreaterThanOrEqual(3);
    const labels = agg.map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('deduplicates recommendations and never returns Shield 360', () => {
    const summary = buildEadReportSummary({
      modules: [
        ...sampleModules,
        moduleWithAssurance('X', 'X', 30, { recommendedProduct: 'SHIELD360' }),
      ],
      routes: [
        { productCode: 'SCLI_COST_LEAKAGE', priority: 'HIGH' },
        { productCode: 'SHIELD360', priority: 'OPTIONAL' },
        { productCode: 'CONTRACT_SLA_ASSURANCE' },
      ],
    });
    expect(summary.recommendations.map((r) => r.productCode)).toEqual([
      'SCLI_COST_LEAKAGE',
      'CONTRACT_SLA_ASSURANCE',
    ]);
    expect(summary.recommendations.every((r) => r.productCode !== 'SHIELD360')).toBe(true);
  });

  it('returns empty recommendations cleanly when none exist', () => {
    const modules = sampleModules.map((m) => ({ ...m, recommendedProduct: null }));
    const recs = collectEadRecommendations(
      buildEadReportSummary({ modules }).moduleScores,
      [],
    );
    expect(recs).toEqual([]);
  });

  it('calculateOverallEadAssuranceScore returns null when no scores', () => {
    expect(calculateOverallEadAssuranceScore([])).toBeNull();
  });

  it('builds evidence appendix labels', () => {
    const summary = buildEadReportSummary({
      modules: sampleModules,
      evidence: [
        { id: '1', fileName: 'incident.pdf', title: 'Incident Report 2026' },
        { id: '2', fileName: 'sla.xlsx', title: 'SLA Performance Report' },
      ],
    });
    expect(summary.evidence[0]?.appendixLabel).toBe('Appendix A');
    expect(summary.evidence[1]?.title).toBe('SLA Performance Report');
  });

  it('executive narrative is generated from actual scores', () => {
    const summary = buildEadReportSummary({ modules: sampleModules });
    expect(summary.executiveNarrative).toMatch(/assurance score 55\.3\/100/i);
    expect(summary.executiveNarrative).toMatch(/Consequence Management/i);
    expect(summary.executiveNarrative).not.toMatch(/Shield 360/i);
  });
});
