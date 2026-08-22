/**
 * SCL monetary-loss bands (C6 / C7 — estimated annual security losses).
 *
 * Audit: no approved Physical Risk monetary band catalogue exists in-repo.
 * The band list below is a **provisional UI catalogue** only — not methodology-approved.
 * Scoring must not invent midpoint/min/max until Physical Risk confirms mapping.
 */

import { formatZar } from './money';

export type MoneyRangeCode =
  | 'UNDER_100K'
  | 'R100K_R250K'
  | 'R250K_R500K'
  | 'R500K_R1M'
  | 'R1M_R2M'
  | 'R2M_R5M'
  | 'R5M_R10M'
  | 'R10M_PLUS';

export type MoneyRangeDefinition = {
  code: MoneyRangeCode;
  min: number;
  /** null = open-ended upper bound (e.g. R10,000,000+) */
  max: number | null;
  label: string;
  /** Only populated when Physical Risk approves a calculation point for this band. */
  calculationValue?: number;
};

/** Persisted JSON for CURRENCY loss fields when captured as a band. */
export type MoneyRangeValue = {
  code: MoneyRangeCode;
  min: number;
  max: number | null;
  label: string;
  unit: 'ZAR';
};

export type MoneyRangeMappingStatus = 'PENDING_CLIENT_CONFIRMATION' | 'CONFIGURED';

export type MoneyRangeMappingConfig = {
  status: MoneyRangeMappingStatus;
  /**
   * Optional explicit ZAR amounts keyed by band code.
   * Used only when status === 'CONFIGURED'. Never auto-filled with midpoints.
   */
  amountsByCode: Partial<Record<MoneyRangeCode, number>>;
  notes: string;
  /** Marks whether the UI band list itself is client-approved. */
  bandCatalogueStatus: 'PROVISIONAL_UI_PENDING_CLIENT_CONFIRMATION' | 'CLIENT_APPROVED';
};

function bandLabel(min: number, max: number | null): string {
  if (max === null) return `${formatZar(min)}+`;
  if (min === 0) return `Under ${formatZar(max)}`;
  return `${formatZar(min)} – ${formatZar(max)}`;
}

/**
 * Provisional UI bands — replace/confirm with Physical Risk before treating as permanent methodology.
 * Labels always use formatZar (never raw 250000).
 */
export const SCL_MONEY_RANGES: readonly MoneyRangeDefinition[] = [
  { code: 'UNDER_100K', min: 0, max: 100_000, label: bandLabel(0, 100_000) },
  { code: 'R100K_R250K', min: 100_000, max: 250_000, label: bandLabel(100_000, 250_000) },
  { code: 'R250K_R500K', min: 250_000, max: 500_000, label: bandLabel(250_000, 500_000) },
  { code: 'R500K_R1M', min: 500_000, max: 1_000_000, label: bandLabel(500_000, 1_000_000) },
  { code: 'R1M_R2M', min: 1_000_000, max: 2_000_000, label: bandLabel(1_000_000, 2_000_000) },
  { code: 'R2M_R5M', min: 2_000_000, max: 5_000_000, label: bandLabel(2_000_000, 5_000_000) },
  { code: 'R5M_R10M', min: 5_000_000, max: 10_000_000, label: bandLabel(5_000_000, 10_000_000) },
  { code: 'R10M_PLUS', min: 10_000_000, max: null, label: bandLabel(10_000_000, null) },
] as const;

export const DEFAULT_MONEY_RANGE_MAPPING: MoneyRangeMappingConfig = {
  status: 'PENDING_CLIENT_CONFIRMATION',
  amountsByCode: {},
  bandCatalogueStatus: 'PROVISIONAL_UI_PENDING_CLIENT_CONFIRMATION',
  notes:
    'No approved monetary-loss band catalogue or band→amount scoring map was found in the codebase. ' +
    'UI bands are provisional. Do not use midpoint/min/max for scoring until Physical Risk confirms.',
};

/** Calibration codes treated as monetary-loss range fields. */
export const SCL_MONEY_LOSS_INPUT_CODES = ['C6', 'C7'] as const;

export function isSclMoneyLossCode(code: string): boolean {
  return (SCL_MONEY_LOSS_INPUT_CODES as readonly string[]).includes(code);
}

export function isMoneyRangeValue(value: unknown): value is MoneyRangeValue {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === 'string' &&
    typeof v.min === 'number' &&
    (typeof v.max === 'number' || v.max === null) &&
    typeof v.label === 'string' &&
    (v.unit === 'ZAR' || v.unit === undefined)
  );
}

export function findMoneyRange(code: string | undefined | null): MoneyRangeDefinition | undefined {
  if (!code) return undefined;
  return SCL_MONEY_RANGES.find((r) => r.code === code);
}

export function buildMoneyRangeValue(code: MoneyRangeCode): MoneyRangeValue {
  const def = findMoneyRange(code);
  if (!def) throw new Error(`Unknown monetary range code: ${code}`);
  return {
    code: def.code,
    min: def.min,
    max: def.max,
    label: def.label,
    unit: 'ZAR',
  };
}

export function formatMoneyRangeLabel(value: unknown): string {
  if (isMoneyRangeValue(value)) {
    return value.label || findMoneyRange(value.code)?.label || '—';
  }
  return formatZar(value);
}

export function formatMoneyRangeSelection(value: unknown): string {
  if (isMoneyRangeValue(value)) {
    return `Estimated losses: ${formatMoneyRangeLabel(value)}`;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return `Estimated losses: ${formatZar(value)} (legacy exact)`;
  }
  return '';
}

/**
 * PDF / report line for client-estimated annual losses (low–high).
 * Prefers structured band labels so pending scoring maps never render as R0.
 * Uses " to " between sides when either side is a band (labels already contain en-dashes).
 */
export function formatClientEstimatedLosses(
  lowAmount: unknown,
  highAmount: unknown,
  lowBand?: MoneyRangeValue | null,
  highBand?: MoneyRangeValue | null,
): string {
  const left = lowBand ? formatMoneyRangeLabel(lowBand) : formatZar(lowAmount);
  const right = highBand ? formatMoneyRangeLabel(highBand) : formatZar(highAmount);
  const separator = lowBand || highBand ? ' to ' : ' – ';
  return `${left}${separator}${right}`;
}

export type ResolveMoneyResult =
  | { ok: true; amount: number; source: 'legacy-number' | 'configured-mapping' }
  | { ok: false; reason: 'pending-mapping' | 'unknown-range' | 'empty'; code?: string };

/**
 * Resolve stored CURRENCY loss input to a single ZAR amount for numeric echo fields.
 * Never invents midpoint/min/max while mapping status is PENDING_CLIENT_CONFIRMATION.
 */
export function resolveMoneyForScoring(
  value: unknown,
  mapping: MoneyRangeMappingConfig = DEFAULT_MONEY_RANGE_MAPPING,
): ResolveMoneyResult {
  if (value === undefined || value === null || value === '') {
    return { ok: false, reason: 'empty' };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { ok: true, amount: Math.max(0, value), source: 'legacy-number' };
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[Rr$€£]/g, '').replace(/[\s\u00A0,]/g, '').trim();
    if (cleaned && Number.isFinite(Number(cleaned))) {
      return { ok: true, amount: Math.max(0, Number(cleaned)), source: 'legacy-number' };
    }
  }

  if (isMoneyRangeValue(value)) {
    if (mapping.status !== 'CONFIGURED') {
      return { ok: false, reason: 'pending-mapping', code: value.code };
    }
    const configured = mapping.amountsByCode[value.code];
    if (typeof configured !== 'number' || !Number.isFinite(configured)) {
      return { ok: false, reason: 'unknown-range', code: value.code };
    }
    return { ok: true, amount: Math.max(0, configured), source: 'configured-mapping' };
  }

  return { ok: false, reason: 'empty' };
}
