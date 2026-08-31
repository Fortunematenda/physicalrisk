/** Enterprise qualification bands for Executive Governance Triage (Level 1). */

export type EgtQualificationOption = {
  value: string;
  label: string;
};

/** Current operational-site bands (new submissions only). */
export const EGT_OPERATIONAL_SITES_OPTIONS: EgtQualificationOption[] = [
  { value: 'SITES_20_40', label: '20–40 sites' },
  { value: 'SITES_41_60', label: '41–60 sites' },
  { value: 'SITES_61_80', label: '61–80 sites' },
  { value: 'SITES_81_100', label: '81–100 sites' },
  { value: 'SITES_100_PLUS', label: 'More than 100 sites' },
];

/** Retired site bands — display only; not offered on new forms. */
export const EGT_LEGACY_OPERATIONAL_SITES_OPTIONS: Array<EgtQualificationOption & { count: number }> = [
  { value: 'SITES_1', label: '1 site', count: 1 },
  { value: 'SITES_2_5', label: '2–5 sites', count: 3 },
  { value: 'SITES_6_20', label: '6–20 sites', count: 12 },
  { value: 'SITES_21_50', label: '21–50 sites', count: 35 },
  { value: 'SITES_50_PLUS', label: 'More than 50 sites', count: 75 },
];

/** Current annual security expenditure bands (new submissions only). */
export const EGT_SECURITY_EXPENDITURE_OPTIONS: EgtQualificationOption[] = [
  { value: 'SECURITY_SPEND_10_50M', label: 'R10–R50 million' },
  { value: 'SECURITY_SPEND_51_100M', label: 'R51–R100 million' },
  { value: 'SECURITY_SPEND_101_150M', label: 'R101–R150 million' },
  { value: 'SECURITY_SPEND_151_200M', label: 'R151–R200 million' },
  { value: 'SECURITY_SPEND_200M_PLUS', label: 'Above R200 million' },
];

/** Retired expenditure bands — display only; not offered on new forms. */
export const EGT_LEGACY_SECURITY_EXPENDITURE_OPTIONS: Array<EgtQualificationOption & { amount: number }> = [
  { value: 'SECURITY_SPEND_BELOW_2M', label: 'Below R2 million', amount: 1_000_000 },
  { value: 'SECURITY_SPEND_2_10M', label: 'R2–R10 million', amount: 6_000_000 },
  { value: 'SECURITY_SPEND_10_50M_LEGACY', label: 'R10–R50 million', amount: 30_000_000 },
  { value: 'SECURITY_SPEND_50_100M', label: 'R50–R100 million', amount: 75_000_000 },
  { value: 'SECURITY_SPEND_100M_PLUS', label: 'Above R100 million', amount: 150_000_000 },
];

const ALL_SITE_OPTIONS = [...EGT_OPERATIONAL_SITES_OPTIONS, ...EGT_LEGACY_OPERATIONAL_SITES_OPTIONS];
const ALL_SPEND_OPTIONS = [...EGT_SECURITY_EXPENDITURE_OPTIONS, ...EGT_LEGACY_SECURITY_EXPENDITURE_OPTIONS];

const SITE_VALUE_SET = new Set(ALL_SITE_OPTIONS.map((o) => o.value));
const SPEND_VALUE_SET = new Set(ALL_SPEND_OPTIONS.map((o) => o.value));

function normalizeSelection(value: unknown): string {
  return String(value ?? '').trim();
}

function findSiteOptionByValueOrLabel(selection: string) {
  return ALL_SITE_OPTIONS.find((o) => o.value === selection || o.label === selection);
}

function findSpendOptionByValueOrLabel(selection: string) {
  return ALL_SPEND_OPTIONS.find((o) => o.value === selection || o.label === selection);
}

export function isOperationalSitesBandCode(value: unknown): boolean {
  return SITE_VALUE_SET.has(normalizeSelection(value));
}

export function isSecurityExpenditureBandCode(value: unknown): boolean {
  return SPEND_VALUE_SET.has(normalizeSelection(value));
}

export function isEgtQualificationBandCode(code: string, value: unknown): boolean {
  if (code === 'C3') return isOperationalSitesBandCode(value);
  if (code === 'C5') return isSecurityExpenditureBandCode(value);
  return false;
}

export function resolveOperationalSitesBandValue(
  selection: string | undefined | null,
): string | undefined {
  const match = findSiteOptionByValueOrLabel(normalizeSelection(selection));
  return match?.value;
}

export function resolveSecurityExpenditureBandValue(
  selection: string | undefined | null,
): string | undefined {
  const match = findSpendOptionByValueOrLabel(normalizeSelection(selection));
  return match?.value;
}

export function isOperationalSitesSelectionComplete(selection: string | undefined | null): boolean {
  return resolveOperationalSitesBandValue(selection) != null;
}

export function isSecurityExpenditureSelectionComplete(selection: string | undefined | null): boolean {
  const label = normalizeSelection(selection);
  if (!label) return false;
  if (/^prefer not to say$/i.test(label) || /^not known$/i.test(label)) return false;
  return resolveSecurityExpenditureBandValue(label) != null;
}

/** Friendly label for admin display, PDF context, and CRM — never raw enum codes. */
export function operationalSitesLabelFromStored(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const asText = normalizeSelection(value);
  const direct = findSiteOptionByValueOrLabel(asText);
  if (direct) return direct.label;

  const n = Number(asText.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return asText;

  let best = EGT_LEGACY_OPERATIONAL_SITES_OPTIONS[0];
  let bestDist = Math.abs(n - best.count);
  for (const opt of EGT_LEGACY_OPERATIONAL_SITES_OPTIONS) {
    const dist = Math.abs(n - opt.count);
    if (dist < bestDist) {
      best = opt;
      bestDist = dist;
    }
  }
  return best.label;
}

/** Friendly label for admin display, PDF context, and CRM — never raw enum codes. */
export function securityExpenditureLabelFromStored(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const asText = normalizeSelection(value);
  const direct = findSpendOptionByValueOrLabel(asText);
  if (direct) return direct.label;

  if (/^prefer not to say$/i.test(asText) || /^not known$/i.test(asText)) return '';

  const n = Number(asText.replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return asText;

  let best = EGT_LEGACY_SECURITY_EXPENDITURE_OPTIONS[0];
  let bestDist = Math.abs(n - best.amount);
  for (const opt of EGT_LEGACY_SECURITY_EXPENDITURE_OPTIONS) {
    const dist = Math.abs(n - opt.amount);
    if (dist < bestDist) {
      best = opt;
      bestDist = dist;
    }
  }
  return best.label;
}

/** Map stored C3/C5 to a current-form select value when possible. */
export function operationalSitesValueFromStored(value: unknown): string {
  const label = operationalSitesLabelFromStored(value);
  if (!label) return '';
  const current = EGT_OPERATIONAL_SITES_OPTIONS.find((o) => o.label === label);
  if (current) return current.value;
  const legacy = EGT_LEGACY_OPERATIONAL_SITES_OPTIONS.find((o) => o.label === label);
  return legacy?.value || normalizeSelection(value);
}

export function securityExpenditureValueFromStored(value: unknown): string {
  const label = securityExpenditureLabelFromStored(value);
  if (!label) return '';
  const current = EGT_SECURITY_EXPENDITURE_OPTIONS.find((o) => o.label === label);
  if (current) return current.value;
  const legacy = EGT_LEGACY_SECURITY_EXPENDITURE_OPTIONS.find((o) => o.label === label);
  return legacy?.value || normalizeSelection(value);
}

/**
 * Expenditure bands are indicative qualification metadata at Level 1.
 * They must not be converted to assumed exact ZAR amounts for leakage modelling.
 */
export function resolveSecurityExpenditureAmountForScoring(
  _selection: string | undefined | null,
): undefined {
  return undefined;
}
