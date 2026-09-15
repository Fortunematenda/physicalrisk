/**
 * Executive Advisory — structured business consequence selection (Stage 2).
 *
 * Categories are fixed selectable values. Free-text narrative belongs in
 * `businessConsequenceDetail` / `otherBusinessConsequence`, not as the
 * primary consequence field.
 */

export const EAD_BUSINESS_CONSEQUENCE_OPTIONS = [
  { code: 'REPUTATIONAL_DAMAGE', label: 'Reputational damage' },
  { code: 'FINANCIAL_LOSS', label: 'Financial loss' },
  { code: 'BUSINESS_INTERRUPTION', label: 'Business interruption' },
  { code: 'PARTIAL_BUSINESS_INTERRUPTION', label: 'Partial business interruption' },
  { code: 'BUSINESS_DISRUPTION', label: 'Business disruption' },
  { code: 'LOSS_OF_LIFE', label: 'Loss of life' },
  { code: 'EMPLOYEE_SAFETY_RISK', label: 'Employee safety risk' },
  { code: 'REGULATORY_COMPLIANCE_EXPOSURE', label: 'Regulatory / compliance exposure' },
  { code: 'OTHER', label: 'Other' },
] as const;

export type EadBusinessConsequenceCode =
  (typeof EAD_BUSINESS_CONSEQUENCE_OPTIONS)[number]['code'];

const CODE_SET = new Set<string>(EAD_BUSINESS_CONSEQUENCE_OPTIONS.map((o) => o.code));

const LABEL_BY_CODE: Record<EadBusinessConsequenceCode, string> = Object.fromEntries(
  EAD_BUSINESS_CONSEQUENCE_OPTIONS.map((o) => [o.code, o.label]),
) as Record<EadBusinessConsequenceCode, string>;

export function isEadBusinessConsequenceCode(value: unknown): value is EadBusinessConsequenceCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

export function parseBusinessConsequenceCodes(raw: unknown): EadBusinessConsequenceCode[] {
  if (!Array.isArray(raw)) return [];
  const out: EadBusinessConsequenceCode[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isEadBusinessConsequenceCode(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function businessConsequenceLabel(code: EadBusinessConsequenceCode): string {
  return LABEL_BY_CODE[code];
}

export function formatBusinessConsequenceLabels(
  codes: readonly EadBusinessConsequenceCode[],
  otherText?: string | null,
): string[] {
  return codes.map((code) => {
    if (code === 'OTHER') {
      const other = String(otherText || '').trim();
      return other ? `Other: ${other}` : 'Other';
    }
    return businessConsequenceLabel(code);
  });
}

/**
 * Compatibility string for existing PDF/report rendering that still expects
 * a single `businessConsequence` text field.
 */
export function formatBusinessConsequencesForLegacyReport(
  codes: readonly EadBusinessConsequenceCode[],
  otherText?: string | null,
): string {
  return formatBusinessConsequenceLabels(codes, otherText).join('; ');
}

export type BusinessConsequenceValidation = {
  ok: boolean;
  error: string | null;
  requiresOtherText: boolean;
};

export function validateBusinessConsequences(
  codes: readonly EadBusinessConsequenceCode[],
  otherText?: string | null,
): BusinessConsequenceValidation {
  if (!codes.length) {
    return {
      ok: false,
      error: 'Select at least one business consequence.',
      requiresOtherText: false,
    };
  }
  const requiresOtherText = codes.includes('OTHER');
  if (requiresOtherText && !String(otherText || '').trim()) {
    return {
      ok: false,
      error: 'Enter the other consequence.',
      requiresOtherText: true,
    };
  }
  return { ok: true, error: null, requiresOtherText };
}

/**
 * Whether structured consequences satisfy the required field.
 * Legacy free-text alone is preserved for display but does not satisfy completion
 * once Stage 2 is in effect — consultants must select structured categories.
 */
export function hasValidBusinessConsequences(
  codes: readonly EadBusinessConsequenceCode[],
  otherText?: string | null,
): boolean {
  return validateBusinessConsequences(codes, otherText).ok;
}

/** Normalize other text: clear when OTHER is not selected. */
export function normalizeOtherBusinessConsequence(
  codes: readonly EadBusinessConsequenceCode[],
  otherText?: string | null,
): string | null {
  if (!codes.includes('OTHER')) return null;
  const trimmed = String(otherText || '').trim();
  return trimmed || null;
}
