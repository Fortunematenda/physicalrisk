/**
 * Executive Governance Triage (Level 1) — assurance score semantics.
 *
 * Stored snapshots keep `overallRiskScore` as the legacy exposure indicator
 * (higher = greater concern). Prospect-facing surfaces derive `assuranceScore`
 * as 100 − exposure. Raw questionnaire answers remain the source of truth.
 */

export const ASSURANCE_BAND_THRESHOLDS = {
  STRONG_ASSURANCE: 80,
  MODERATE_ASSURANCE: 60,
  SIGNIFICANT_IMPROVEMENT: 40,
} as const;

export type AssuranceBandCode =
  | 'REQUIRES_PRIORITY_INTERVENTION'
  | 'SIGNIFICANT_IMPROVEMENT_REQUIRED'
  | 'MODERATE_ASSURANCE'
  | 'STRONG_ASSURANCE';

export type AssuranceBand = {
  code: AssuranceBandCode;
  displayLabel: string;
  shortLabel: string;
};

export type EgtAssuranceColourName = 'GREEN' | 'YELLOW' | 'AMBER' | 'RED';

export type EgtAssuranceVisual = {
  band: AssuranceBand;
  colourName: EgtAssuranceColourName;
  colourHex: string;
  panelHex: string;
  textHex: string;
  accessibleLabel: string;
  bandIndex: 0 | 1 | 2 | 3;
};

export type EgtCategoryExposureScore = {
  category: string;
  score: number;
  weightedScore?: number;
  totalWeight?: number;
};

export type EgtAssuranceCategoryScore = {
  category: string;
  assuranceScore: number;
  exposureIndicator: number;
  band: AssuranceBand;
};

export type EgtAssuranceSnapshotInput = {
  /** Legacy stored exposure score (higher = greater concern). */
  overallRiskScore?: number | null;
  /** Stored inverse of exposure when present. */
  maturityScore?: number | null;
  categoryScores?: EgtCategoryExposureScore[] | null;
};

export type EgtAssurancePresentation = {
  assuranceScore: number;
  exposureIndicator: number;
  legacyExposureScore: number;
  assuranceBand: AssuranceBand;
  visual: EgtAssuranceVisual;
  diagnosis: string;
  categoryScores: EgtAssuranceCategoryScore[];
  warningIndicators: EgtAssuranceCategoryScore[];
};

const ASSURANCE_VISUAL: Record<AssuranceBandCode, Omit<EgtAssuranceVisual, 'band'>> = {
  REQUIRES_PRIORITY_INTERVENTION: {
    colourName: 'RED',
    colourHex: '#d20a11',
    panelHex: '#fef2f2',
    textHex: '#7f1d1d',
    accessibleLabel: 'REQUIRES PRIORITY INTERVENTION — RED',
    bandIndex: 0,
  },
  SIGNIFICANT_IMPROVEMENT_REQUIRED: {
    colourName: 'AMBER',
    colourHex: '#d97706',
    panelHex: '#fff7ed',
    textHex: '#9a3412',
    accessibleLabel: 'SIGNIFICANT IMPROVEMENT REQUIRED — AMBER',
    bandIndex: 1,
  },
  MODERATE_ASSURANCE: {
    colourName: 'YELLOW',
    colourHex: '#ca8a04',
    panelHex: '#fefce8',
    textHex: '#854d0e',
    accessibleLabel: 'MODERATE ASSURANCE — YELLOW',
    bandIndex: 2,
  },
  STRONG_ASSURANCE: {
    colourName: 'GREEN',
    colourHex: '#15803d',
    panelHex: '#ecfdf5',
    textHex: '#14532d',
    accessibleLabel: 'STRONG ASSURANCE — GREEN',
    bandIndex: 3,
  },
};

export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

/** Convert legacy exposure score to prospect-facing assurance score. */
export function exposureToAssuranceScore(exposureScore: number): number {
  return Math.round((100 - clampScore(exposureScore)) * 1000) / 1000;
}

/** Internal exposure mirror derived from assurance. */
export function assuranceToExposureIndicator(assuranceScore: number): number {
  return exposureToAssuranceScore(assuranceScore);
}

export function getAssuranceBand(assuranceScore: number): AssuranceBand {
  const score = clampScore(assuranceScore);
  if (score >= ASSURANCE_BAND_THRESHOLDS.STRONG_ASSURANCE) {
    return {
      code: 'STRONG_ASSURANCE',
      displayLabel: 'Strong assurance',
      shortLabel: 'Strong',
    };
  }
  if (score >= ASSURANCE_BAND_THRESHOLDS.MODERATE_ASSURANCE) {
    return {
      code: 'MODERATE_ASSURANCE',
      displayLabel: 'Moderate assurance',
      shortLabel: 'Moderate',
    };
  }
  if (score >= ASSURANCE_BAND_THRESHOLDS.SIGNIFICANT_IMPROVEMENT) {
    return {
      code: 'SIGNIFICANT_IMPROVEMENT_REQUIRED',
      displayLabel: 'Significant improvement required',
      shortLabel: 'Improve',
    };
  }
  return {
    code: 'REQUIRES_PRIORITY_INTERVENTION',
    displayLabel: 'Requires priority intervention',
    shortLabel: 'Priority',
  };
}

export function resolveEgtAssuranceVisual(assuranceScore: number): EgtAssuranceVisual {
  const band = getAssuranceBand(assuranceScore);
  return { band, ...ASSURANCE_VISUAL[band.code] };
}

export function convertCategoryScoresToAssurance(
  categoryScores: EgtCategoryExposureScore[],
): EgtAssuranceCategoryScore[] {
  return categoryScores.map((row) => {
    const exposureIndicator = clampScore(Number(row.score) || 0);
    const assuranceScore = exposureToAssuranceScore(exposureIndicator);
    return {
      category: String(row.category || '').trim() || 'Category',
      assuranceScore,
      exposureIndicator,
      band: getAssuranceBand(assuranceScore),
    };
  });
}

/** Lowest assurance dimensions are the strongest warning areas. */
export function rankEgtWarningIndicators(
  categories: EgtAssuranceCategoryScore[],
  limit = 3,
): EgtAssuranceCategoryScore[] {
  return [...categories].sort((a, b) => a.assuranceScore - b.assuranceScore).slice(0, limit);
}

export function assuranceCategoryInterpretation(_category: string, assuranceScore: number): string {
  const band = getAssuranceBand(assuranceScore);
  switch (band.code) {
    case 'STRONG_ASSURANCE':
      return 'Responses indicate relatively stronger assurance indicators in this dimension; this remains questionnaire-based triage only.';
    case 'MODERATE_ASSURANCE':
      return 'Some assurance indicators in this dimension may warrant targeted executive validation.';
    case 'SIGNIFICANT_IMPROVEMENT_REQUIRED':
      return 'Elevated gaps in this dimension suggest independent validation may be appropriate.';
    default:
      return 'Weak assurance indicators in this dimension require priority independent review.';
  }
}

export function egtAssuranceDiagnosis(assuranceScore: number): string {
  return getAssuranceBand(assuranceScore).displayLabel;
}

export function deriveEgtAssurancePresentation(
  input: EgtAssuranceSnapshotInput,
): EgtAssurancePresentation | null {
  const hasExposure =
    input.overallRiskScore != null && Number.isFinite(Number(input.overallRiskScore));
  const hasMaturity =
    input.maturityScore != null && Number.isFinite(Number(input.maturityScore));

  if (!hasExposure && !hasMaturity) return null;

  const legacyExposureScore = hasExposure
    ? clampScore(Number(input.overallRiskScore))
    : assuranceToExposureIndicator(Number(input.maturityScore));

  const assuranceScore = hasMaturity
    ? Math.round(clampScore(Number(input.maturityScore)) * 10) / 10
    : exposureToAssuranceScore(legacyExposureScore);

  const exposureIndicator = assuranceToExposureIndicator(assuranceScore);
  const assuranceBand = getAssuranceBand(assuranceScore);
  const visual = resolveEgtAssuranceVisual(assuranceScore);
  const categoryScores = convertCategoryScoresToAssurance(input.categoryScores || []);
  const warningIndicators = rankEgtWarningIndicators(categoryScores);

  return {
    assuranceScore,
    exposureIndicator,
    legacyExposureScore,
    assuranceBand,
    visual,
    diagnosis: assuranceBand.displayLabel,
    categoryScores,
    warningIndicators,
  };
}

/** Short tier label for dimension bars (assurance direction). */
export function assuranceDimensionTierLabel(assuranceScore: number): string {
  const band = getAssuranceBand(assuranceScore);
  switch (band.code) {
    case 'STRONG_ASSURANCE':
      return 'Strong';
    case 'MODERATE_ASSURANCE':
      return 'Moderate';
    case 'SIGNIFICANT_IMPROVEMENT_REQUIRED':
      return 'Watch';
    default:
      return 'Priority';
  }
}
