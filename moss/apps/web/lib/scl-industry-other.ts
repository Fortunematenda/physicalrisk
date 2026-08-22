/** Helpers for SCLI C2 industry select when the catalogue includes "Other". */

export function findOtherIndustryOption(options: string[]): string | undefined {
  return (options || []).find((o) => /^other$/i.test(String(o).trim()));
}

export function isOtherIndustryLabel(value: unknown): boolean {
  return /^other$/i.test(String(value || '').trim());
}

export function isIndustryValueComplete(value: unknown): boolean {
  const v = String(value ?? '').trim();
  if (!v) return false;
  // Bare "Other" means the user still needs to specify a name.
  if (isOtherIndustryLabel(v)) return false;
  return true;
}

export type IndustrySelectState = {
  /** Value bound to the <select> / pill group. */
  selectValue: string;
  /** Free-text when Other is active. */
  otherText: string;
  showOther: boolean;
};

/**
 * Map a stored C2 / industry string onto select + optional Other text.
 * Custom values (not in the catalogue) are treated as Other + that text.
 */
export function resolveIndustrySelectState(
  value: unknown,
  options: string[],
): IndustrySelectState {
  const opts = options || [];
  const otherLabel = findOtherIndustryOption(opts) || 'Other';
  const v = String(value ?? '').trim();
  if (!v) return { selectValue: '', otherText: '', showOther: false };
  if (opts.includes(v) && !isOtherIndustryLabel(v)) {
    return { selectValue: v, otherText: '', showOther: false };
  }
  return {
    selectValue: otherLabel,
    otherText: isOtherIndustryLabel(v) ? '' : v,
    showOther: true,
  };
}
