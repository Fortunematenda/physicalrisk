import { describe, expect, it } from 'vitest';
import {
  asFiniteNumber,
  buildMoneyRangeValue,
  calculateLeakage,
  formatClientEstimatedLosses,
  formatZar,
  parseMoneyNumber,
  type ScliAssumptions,
  type ScliCalibrationInput,
} from '@moss/shared';

/**
 * Report DTO + PDF display-string regression for SCL monetary losses.
 * Asserts the exact strings reports.service passes to PDFKit (formatZar),
 * which is the display layer that previously showed R0.
 */
const assumptions: ScliAssumptions = {
  targetSitesPerInternalStaff: 25,
  guardForceSaturationPoint: 500,
  annualCostSaturationPoint: 50_000_000,
  protectedPremisesSaturationPoint: 200,
  geographicalFootprintSaturationPoint: 9,
  minimumLeakageCap: 0.12,
  minimumLeakageBaseFloor: 0.01,
  minimumManualRecordWeight: 0.02,
  minimumDelayedReportingWeight: 0.015,
  minimumSupervisoryProofGapWeight: 0.015,
  minimumAttendanceProofGapWeight: 0.015,
  minimumInternalCapacityGapWeight: 0.02,
  minimumScaleComplexityWeight: 0.01,
  minimumAllowanceComplexityWeight: 0.01,
  likelyLeakageCap: 0.25,
  likelySurveillanceGapWeight: 0.03,
  likelyAccessControlGapWeight: 0.025,
  likelyElectronicRecordGapWeight: 0.02,
  likelyRealtimePatrolGapWeight: 0.02,
  likelyManualRecordWeight: 0.02,
  likelyScaleComplexityWeight: 0.015,
  likelyAllowanceComplexityWeight: 0.015,
  maximumExposureCap: 0.4,
  maximumManualRecordWeight: 0.03,
  maximumDelayedReportingWeight: 0.025,
  maximumSupervisoryProofGapWeight: 0.02,
  maximumAttendanceProofGapWeight: 0.02,
  maximumSurveillanceGapWeight: 0.03,
  maximumElectronicRecordGapWeight: 0.02,
  maximumInternalCapacityGapWeight: 0.025,
  maximumAllowanceComplexityWeight: 0.02,
  recoverableLowFactor: 0.25,
  recoverableHighFactor: 0.65,
};

function baseCal(overrides: Partial<ScliCalibrationInput> = {}): ScliCalibrationInput {
  return {
    annualSecurityContractValue: 10_000_000,
    estimatedLossesLow: 0,
    estimatedLossesHigh: 0,
    protectedPremises: 40,
    guardForce: 120,
    internalSecurityTeamSize: 2,
    surveillanceCoverage: 0.6,
    accessControlCoverage: 0.5,
    integratedTechnologyCoverage: 0.4,
    technologySlaVerification: 0.5,
    manualRecordReliance: 0.4,
    realtimePatrolCoverage: 0.5,
    delayedPatrolReporting: 0.3,
    supervisoryProof: 0.5,
    attendanceProof: 0.5,
    allowanceFlags: [true, false, true, false, false],
    ...overrides,
  };
}

/** Same money lines reports.service createPdf writes into the PDF. */
function reportPdfLines(leakage: {
  estimatedLossesLow: number;
  estimatedLossesHigh: number;
  estimatedLossesLowBand?: unknown;
  estimatedLossesHighBand?: unknown;
  minimumLeakageValue: number;
  likelyLeakageValue: number;
}) {
  return {
    clientEstimated: `Client-estimated annual losses: ${formatClientEstimatedLosses(
      leakage.estimatedLossesLow,
      leakage.estimatedLossesHigh,
      leakage.estimatedLossesLowBand as any,
      leakage.estimatedLossesHighBand as any,
    )}`,
    minimum: `Minimum leakage estimate: ${formatZar(leakage.minimumLeakageValue)}`,
    likely: `Likely leakage estimate: ${formatZar(leakage.likelyLeakageValue)}`,
  };
}

describe('SCL report DTO / PDF monetary values', () => {
  const lossCases = [
    { input: 'R50,000', n: 50_000, pdf: 'R50,000' },
    { input: 'R250,000', n: 250_000, pdf: 'R250,000' },
    { input: 'R1,200,000', n: 1_200_000, pdf: 'R1,200,000' },
    { input: 'R10,000,000', n: 10_000_000, pdf: 'R10,000,000' },
  ];

  it.each(lossCases)('$input: input → stored → calc → report DTO → PDF line', ({ input, n, pdf }) => {
    const stored = asFiniteNumber(input, 0);
    expect(stored).toBe(n);
    expect(parseMoneyNumber(input)).toBe(n);

    const leakage = calculateLeakage(
      baseCal({ estimatedLossesLow: stored, estimatedLossesHigh: stored, annualSecurityContractValue: 10_000_000 }),
      assumptions,
      62,
    );

    expect(leakage.estimatedLossesLow).toBe(n);
    expect(leakage.estimatedLossesHigh).toBe(n);
    expect(leakage.likelyLeakageValue).toBeGreaterThan(0);

    const lines = reportPdfLines(leakage);
    expect(lines.clientEstimated).toBe(`Client-estimated annual losses: ${pdf} – ${pdf}`);
    expect(lines.clientEstimated).not.toContain('R0 – R0');
    expect(lines.likely).not.toBe('Likely leakage estimate: R0');
    expect(formatZar(leakage.likelyLeakageValue)).toMatch(/^R[\d,]+$/);
  });

  it('empty/not answered: parse null, PDF em dash for unanswered display', () => {
    expect(parseMoneyNumber('')).toBeNull();
    expect(parseMoneyNumber(null)).toBeNull();
    expect(formatZar(null)).toBe('—');
    expect(formatZar(undefined)).toBe('—');

    const leakage = calculateLeakage(baseCal({ estimatedLossesLow: 0, estimatedLossesHigh: 0 }), assumptions, 62);
    expect(leakage.estimatedLossesLow).toBe(0);
    // Unanswered display uses null → em dash (not inventing a loss figure)
    const unansweredLine = `Client-estimated annual losses: ${formatZar(null)} – ${formatZar(null)}`;
    expect(unansweredLine).toBe('Client-estimated annual losses: — – —');
  });

  it('ZAR range bands: display labels, never invent midpoint / never show R0 for answered ranges', () => {
    const lowBand = buildMoneyRangeValue('R250K_R500K');
    const highBand = buildMoneyRangeValue('R1M_R2M');
    // Pending mapping → numeric echo 0, but report must use band labels
    const leakage = {
      ...calculateLeakage(baseCal({ estimatedLossesLow: 0, estimatedLossesHigh: 0 }), assumptions, 62),
      estimatedLossesLowBand: lowBand,
      estimatedLossesHighBand: highBand,
    };
    expect(leakage.likelyLeakageValue).toBeGreaterThan(0);
    const lines = reportPdfLines(leakage);
    expect(lines.clientEstimated).toBe(
      'Client-estimated annual losses: R250,000 – R500,000 to R1,000,000 – R2,000,000',
    );
    expect(lines.clientEstimated).not.toContain('R0');
    expect(lines.likely).not.toBe('Likely leakage estimate: R0');
  });
});
