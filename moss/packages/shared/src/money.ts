/**
 * Parse questionnaire / API monetary and numeric inputs into a finite number.
 * Accepts plain numbers and common ZAR display forms (R, commas, spaces).
 * Does not invent values: empty → null.
 */
export function parseMoneyNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  // Prisma Decimal-like
  if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/[Rr$€£]/g, '')
      .replace(/[\s\u00A0\u202F,]/g, '')
      .trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce to a finite number for calculations; empty / invalid → fallback (default 0). */
export function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = parseMoneyNumber(value);
  return n === null ? fallback : n;
}

/**
 * Display ZAR with ASCII "R" and comma thousands separators.
 * Examples: 1200000 → "R1,200,000"; empty → "—"
 */
export function formatZar(value: unknown): string {
  const n = parseMoneyNumber(value);
  if (n === null) return '—';
  const rounded = Math.round(n);
  return `R${rounded.toLocaleString('en-US')}`;
}
