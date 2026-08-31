import { describe, expect, it } from 'vitest';
import {
  assuranceToExposureIndicator,
  deriveEgtAssurancePresentation,
  exposureToAssuranceScore,
  getAssuranceBand,
  rankEgtWarningIndicators,
  convertCategoryScoresToAssurance,
} from './egt-assurance-scoring';
import { calculateAssessmentScore } from './scoring';

describe('egt-assurance-scoring', () => {
  it('Test A — poorest responses yield low assurance and priority intervention band', () => {
    const poorest = calculateAssessmentScore([
      { code: 'Q1', category: 'Executive Assurance', weight: 10, riskScore: 90 },
      { code: 'Q2', category: 'Technology Verification', weight: 8, riskScore: 90 },
    ]);
    const presentation = deriveEgtAssurancePresentation({
      overallRiskScore: poorest.overallRiskScore,
      maturityScore: poorest.maturityScore,
      categoryScores: poorest.categoryScores,
    });
    expect(presentation).not.toBeNull();
    expect(presentation!.assuranceScore).toBeCloseTo(10, 0);
    expect(presentation!.assuranceBand.code).toBe('REQUIRES_PRIORITY_INTERVENTION');
    expect(presentation!.assuranceBand.displayLabel).toBe('Requires priority intervention');
  });

  it('Test B — strongest responses yield high assurance and strong band', () => {
    const strongest = calculateAssessmentScore([
      { code: 'Q1', category: 'Executive Assurance', weight: 10, riskScore: 0 },
      { code: 'Q2', category: 'Technology Verification', weight: 8, riskScore: 0 },
    ]);
    const presentation = deriveEgtAssurancePresentation({
      overallRiskScore: strongest.overallRiskScore,
      maturityScore: strongest.maturityScore,
      categoryScores: strongest.categoryScores,
    });
    expect(presentation).not.toBeNull();
    expect(presentation!.assuranceScore).toBeCloseTo(100, 0);
    expect(presentation!.assuranceBand.code).toBe('STRONG_ASSURANCE');
    expect(presentation!.assuranceBand.displayLabel).toBe('Strong assurance');
  });

  it('Test C — legacy exposure 68 becomes assurance approximately 32', () => {
    const presentation = deriveEgtAssurancePresentation({
      overallRiskScore: 68,
      maturityScore: 32,
      categoryScores: [{ category: 'Executive Assurance', score: 79 }],
    });
    expect(presentation!.assuranceScore).toBe(32);
    expect(presentation!.exposureIndicator).toBe(68);
    expect(presentation!.assuranceBand.code).toBe('REQUIRES_PRIORITY_INTERVENTION');
    expect(presentation!.categoryScores[0].assuranceScore).toBe(21);
  });

  it('Test D — assurance score 81 is strong assurance, not high risk', () => {
    const band = getAssuranceBand(81);
    expect(band.code).toBe('STRONG_ASSURANCE');
    expect(band.displayLabel).toBe('Strong assurance');
    expect(band.displayLabel.toLowerCase()).not.toContain('high');
    expect(band.displayLabel.toLowerCase()).not.toContain('risk');
  });

  it('Test E — warning indicators sort by lowest assurance first', () => {
    const categories = convertCategoryScoresToAssurance([
      { category: 'Contract & SLA Enforcement', score: 63 },
      { category: 'Executive Assurance', score: 79 },
      { category: 'Labour Deployment', score: 45 },
      { category: 'Technology Verification', score: 70 },
      { category: 'Loss, Reporting & Value', score: 66 },
    ]);
    const warnings = rankEgtWarningIndicators(categories);
    expect(warnings[0].category).toBe('Executive Assurance');
    expect(warnings[0].assuranceScore).toBe(21);
    expect(warnings[1].category).toBe('Technology Verification');
    expect(warnings[1].assuranceScore).toBe(30);
    expect(warnings[2].category).toBe('Loss, Reporting & Value');
    expect(warnings[2].assuranceScore).toBe(34);
  });

  it('Test F — report/web consistency from the same snapshot input', () => {
    const snapshot = {
      overallRiskScore: 68,
      maturityScore: 32,
      categoryScores: [
        { category: 'Executive Assurance', score: 79 },
        { category: 'Technology Verification', score: 70 },
      ],
    };
    const adminView = deriveEgtAssurancePresentation(snapshot);
    const publicView = deriveEgtAssurancePresentation(snapshot);
    expect(adminView).toEqual(publicView);
    expect(adminView!.assuranceScore).toBe(32);
    expect(adminView!.diagnosis).toBe('Requires priority intervention');
  });

  it('exposure and assurance are complementary', () => {
    expect(exposureToAssuranceScore(68)).toBe(32);
    expect(assuranceToExposureIndicator(32)).toBe(68);
  });

  it('uses assurance band thresholds from shared config', () => {
    expect(getAssuranceBand(39).code).toBe('REQUIRES_PRIORITY_INTERVENTION');
    expect(getAssuranceBand(40).code).toBe('SIGNIFICANT_IMPROVEMENT_REQUIRED');
    expect(getAssuranceBand(59).code).toBe('SIGNIFICANT_IMPROVEMENT_REQUIRED');
    expect(getAssuranceBand(60).code).toBe('MODERATE_ASSURANCE');
    expect(getAssuranceBand(79).code).toBe('MODERATE_ASSURANCE');
    expect(getAssuranceBand(80).code).toBe('STRONG_ASSURANCE');
  });
});
