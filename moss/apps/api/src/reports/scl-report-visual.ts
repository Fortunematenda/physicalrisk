import type { RiskBand } from '@moss/shared';
import { getRiskBand } from '@moss/shared';

/**
 * Executive PDF visual system for SCLI.
 * Colours map 1:1 to approved risk bands / thresholds — no scoring changes.
 *
 * Controlled  0–39.99 → Green
 * Moderate   40–59.99 → Yellow
 * High       60–74.99 → Amber
 * Critical     75–100 → Red
 */

export type SclVisualColourName = 'GREEN' | 'YELLOW' | 'AMBER' | 'RED';

export type SclClassificationVisual = {
  band: RiskBand;
  /** Short executive word (Controlled → CONTROLLED, etc.). */
  classificationWord: string;
  colourName: SclVisualColourName;
  /** Fill / accent hex. */
  colourHex: string;
  /** Darker text hex for contrast on light backgrounds. */
  textHex: string;
  /** Light panel background. */
  panelHex: string;
  /**
   * Accessible label — never colour alone.
   * Example: HIGH RISK — AMBER
   */
  accessibleLabel: string;
  /** Coarse band index 0–3 for the four-segment indicator. */
  bandIndex: 0 | 1 | 2 | 3;
  /** Threshold copy for footnotes (approved methodology). */
  thresholdLabel: string;
};

const VISUAL_BY_BAND: Record<RiskBand, Omit<SclClassificationVisual, 'band'>> = {
  Controlled: {
    classificationWord: 'CONTROLLED',
    colourName: 'GREEN',
    colourHex: '#15803d',
    textHex: '#14532d',
    panelHex: '#ecfdf5',
    accessibleLabel: 'CONTROLLED RISK — GREEN',
    bandIndex: 0,
    thresholdLabel: '0–39.99',
  },
  Moderate: {
    classificationWord: 'MODERATE',
    colourName: 'YELLOW',
    colourHex: '#ca8a04',
    textHex: '#854d0e',
    panelHex: '#fefce8',
    accessibleLabel: 'MODERATE RISK — YELLOW',
    bandIndex: 1,
    thresholdLabel: '40–59.99',
  },
  High: {
    classificationWord: 'HIGH',
    colourName: 'AMBER',
    colourHex: '#d97706',
    textHex: '#9a3412',
    panelHex: '#fff7ed',
    accessibleLabel: 'HIGH RISK — AMBER',
    bandIndex: 2,
    thresholdLabel: '60–74.99',
  },
  Critical: {
    classificationWord: 'CRITICAL',
    colourName: 'RED',
    colourHex: '#d20a11',
    textHex: '#7f1d1d',
    panelHex: '#fef2f2',
    accessibleLabel: 'CRITICAL RISK — RED',
    bandIndex: 3,
    thresholdLabel: '75–100',
  },
};

export function resolveSclClassificationVisual(
  riskBandOrScore: RiskBand | string | number | null | undefined,
): SclClassificationVisual {
  let band: RiskBand;
  if (typeof riskBandOrScore === 'number') {
    band = getRiskBand(riskBandOrScore);
  } else {
    const raw = String(riskBandOrScore || '').trim();
    if (raw === 'Controlled' || raw === 'Moderate' || raw === 'High' || raw === 'Critical') {
      band = raw;
    } else if (raw.toLowerCase() === 'low') {
      band = 'Controlled';
    } else {
      band = 'Controlled';
    }
  }
  return { band, ...VISUAL_BY_BAND[band] };
}

export function listSclClassificationVisuals(): SclClassificationVisual[] {
  return (['Controlled', 'Moderate', 'High', 'Critical'] as RiskBand[]).map((band) =>
    resolveSclClassificationVisual(band),
  );
}

export type SclExecutiveSummaryInput = {
  companyName: string;
  assessmentDateLabel: string;
  reference: string;
  overallRiskScore: number;
  riskBand: RiskBand | string;
  likelyLeakageValue: number;
  likelyLeakageRate: number;
  minimumLeakageValue?: number;
  maximumExposureValue?: number;
  /** Category risk drivers (higher score = more risk). */
  keyRiskAreas: Array<{ category: string; score: number }>;
  priorityAction: string;
  isPreliminary?: boolean;
};

export function buildPriorityActionText(input: {
  recommendations?: Array<{ suggestedNextStep?: string | null; title?: string | null; priority?: string | null }>;
  shortName?: string;
}): string {
  const withStep = (input.recommendations || []).find((r) => String(r.suggestedNextStep || '').trim());
  if (withStep?.suggestedNextStep) return String(withStep.suggestedNextStep).trim();
  const top = (input.recommendations || [])[0];
  if (top?.title) {
    return `Prioritise: ${top.title}${top.priority ? ` (${top.priority})` : ''}.`;
  }
  const firm = input.shortName || 'Physical Risk';
  return `Schedule a scoped ${firm} assurance review against the highest-risk categories and validate indicative leakage estimates with evidence.`;
}
