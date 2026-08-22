/**
 * SCL calibration percentage bands (C10–C18).
 *
 * Scoring historically expects a single 0–1 fraction per field.
 * Default mapping uses provisional band midpoints until Physical Risk confirms otherwise.
 */

export type PercentRangeCode =
  | '0_10'
  | '11_20'
  | '21_30'
  | '31_40'
  | '41_50'
  | '51_60'
  | '61_70'
  | '71_80'
  | '81_90'
  | '91_100';

export type PercentRangeDefinition = {
  rangeCode: PercentRangeCode;
  min: number;
  max: number;
  label: string;
};

/** Persisted JSON shape for PERCENT calibration inputs (preferred). */
export type PercentRangeValue = {
  rangeCode: PercentRangeCode;
  min: number;
  max: number;
  unit: 'percent';
};

export const SCL_PERCENT_RANGES: readonly PercentRangeDefinition[] = [
  { rangeCode: '0_10', min: 0, max: 10, label: '0–10%' },
  { rangeCode: '11_20', min: 11, max: 20, label: '11–20%' },
  { rangeCode: '21_30', min: 21, max: 30, label: '21–30%' },
  { rangeCode: '31_40', min: 31, max: 40, label: '31–40%' },
  { rangeCode: '41_50', min: 41, max: 50, label: '41–50%' },
  { rangeCode: '51_60', min: 51, max: 60, label: '51–60%' },
  { rangeCode: '61_70', min: 61, max: 70, label: '61–70%' },
  { rangeCode: '71_80', min: 71, max: 80, label: '71–80%' },
  { rangeCode: '81_90', min: 81, max: 90, label: '81–90%' },
  { rangeCode: '91_100', min: 91, max: 100, label: '91–100%' },
] as const;

export type PercentRangeMappingStatus =
  | 'PENDING_CLIENT_CONFIRMATION'
  | 'PROVISIONAL_MIDPOINT'
  | 'CONFIGURED';

/**
 * Configurable band → scoring-fraction map.
 * `PROVISIONAL_MIDPOINT` and `CONFIGURED` both resolve via `fractionsByRangeCode`.
 */
export type PercentRangeMappingConfig = {
  status: PercentRangeMappingStatus;
  /** Values in 0–1 (same scale as legacy PERCENT persistence after ÷100). */
  fractionsByRangeCode: Partial<Record<PercentRangeCode, number>>;
  notes: string;
};

/** Midpoint of inclusive percent band as 0–1 fraction (e.g. 21–30 → 0.255). */
export function midpointFractionForBand(def: PercentRangeDefinition): number {
  return (def.min + def.max) / 2 / 100;
}

export function buildMidpointFractionsByRangeCode(): Record<PercentRangeCode, number> {
  return Object.fromEntries(
    SCL_PERCENT_RANGES.map((def) => [def.rangeCode, midpointFractionForBand(def)]),
  ) as Record<PercentRangeCode, number>;
}

/**
 * Default for live scoring: provisional midpoints so C10–C18 range answers can evaluate.
 * Replace with client-approved fractions and status CONFIGURED when Physical Risk confirms.
 */
export const DEFAULT_PERCENT_RANGE_MAPPING: PercentRangeMappingConfig = {
  status: 'PROVISIONAL_MIDPOINT',
  fractionsByRangeCode: buildMidpointFractionsByRangeCode(),
  notes:
    'PROVISIONAL: band → fraction uses inclusive midpoints (e.g. 21–30% → 0.255) until Physical Risk ' +
    'confirms an approved mapping (midpoint / min / max / custom table). Structured rangeCode remains source of truth.',
};

export function isPercentRangeValue(value: unknown): value is PercentRangeValue {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rangeCode === 'string' &&
    typeof v.min === 'number' &&
    typeof v.max === 'number' &&
    (v.unit === 'percent' || v.unit === undefined)
  );
}

export function findPercentRange(rangeCode: string | undefined | null): PercentRangeDefinition | undefined {
  if (!rangeCode) return undefined;
  return SCL_PERCENT_RANGES.find((r) => r.rangeCode === rangeCode);
}

export function buildPercentRangeValue(rangeCode: PercentRangeCode): PercentRangeValue {
  const def = findPercentRange(rangeCode);
  if (!def) throw new Error(`Unknown percentage range code: ${rangeCode}`);
  return { rangeCode: def.rangeCode, min: def.min, max: def.max, unit: 'percent' };
}

export function formatPercentRangeSelection(value: unknown): string {
  if (isPercentRangeValue(value)) {
    const def = findPercentRange(value.rangeCode);
    return def ? `Estimated percentage: ${def.label}` : `Estimated percentage: ${value.min}–${value.max}%`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const pct = value <= 1 ? value * 100 : value;
    return `Estimated percentage: ${pct.toFixed(pct % 1 === 0 ? 0 : 1)}% (legacy exact)`;
  }
  return '';
}

export type ResolvePercentResult =
  | { ok: true; fraction: number; source: 'legacy-number' | 'configured-mapping' | 'provisional-midpoint' }
  | { ok: false; reason: 'pending-mapping' | 'unknown-range' | 'empty'; rangeCode?: string };

function mappingAllowsScoring(status: PercentRangeMappingStatus): boolean {
  return status === 'CONFIGURED' || status === 'PROVISIONAL_MIDPOINT';
}

/**
 * Resolve a stored PERCENT input to a 0–1 fraction for leakage calibration.
 * Blocks only while mapping status is PENDING_CLIENT_CONFIRMATION.
 */
export function resolvePercentForScoring(
  value: unknown,
  mapping: PercentRangeMappingConfig = DEFAULT_PERCENT_RANGE_MAPPING,
): ResolvePercentResult {
  if (value === undefined || value === null || value === '') {
    return { ok: false, reason: 'empty' };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value > 1 ? value / 100 : value;
    return { ok: true, fraction: Math.min(1, Math.max(0, fraction)), source: 'legacy-number' };
  }

  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    const n = Number(value);
    const fraction = n > 1 ? n / 100 : n;
    return { ok: true, fraction: Math.min(1, Math.max(0, fraction)), source: 'legacy-number' };
  }

  if (isPercentRangeValue(value)) {
    if (!mappingAllowsScoring(mapping.status)) {
      return { ok: false, reason: 'pending-mapping', rangeCode: value.rangeCode };
    }
    const configured = mapping.fractionsByRangeCode[value.rangeCode];
    if (typeof configured !== 'number' || !Number.isFinite(configured)) {
      return { ok: false, reason: 'unknown-range', rangeCode: value.rangeCode };
    }
    return {
      ok: true,
      fraction: Math.min(1, Math.max(0, configured)),
      source: mapping.status === 'PROVISIONAL_MIDPOINT' ? 'provisional-midpoint' : 'configured-mapping',
    };
  }

  return { ok: false, reason: 'empty' };
}

/** Calibration codes that use PERCENT valueType in published SCLI. */
export const SCL_PERCENT_INPUT_CODES = [
  'C10',
  'C11',
  'C12',
  'C13',
  'C14',
  'C15',
  'C16',
  'C17',
  'C18',
] as const;
