import { PROPOSAL_CURRENCY_OPTIONS } from '../components/triage/proposal/proposal-workspace-types';

/** Same list the API accepts (SOMOD_SUPPORTED_CURRENCIES). */
export const SOMOD_CURRENCY_OPTIONS = PROPOSAL_CURRENCY_OPTIONS;

const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CHF: 'CHF',
  CAD: 'C$',
  NAD: 'N$',
};

export function currencySymbol(currency?: string | null): string {
  const code = String(currency || 'ZAR').trim().toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}

export const SOMOD_MAX_MONEY = 999_999_999_999.99;

export type SetupFieldKey =
  | 'monthly_contract_value'
  | 'monthly_guard_cost'
  | 'monthly_supervisor_cost'
  | 'days_per_month'
  | 'shift_hours'
  | 'response_delay_cost_rate'
  | 'default_incident_severity_multiplier'
  | 'patrol_value_per_miss'
  | 'technology_capex_total'
  | 'technology_monthly_opex'
  | 'technology_lifespan_months';

export type SetupFieldDef = {
  key: SetupFieldKey;
  label: string;
  /** Shown under the input so the unit is never ambiguous. */
  unit: string;
  kind: 'money' | 'number';
  required: boolean;
  min: number;
  minExclusive?: boolean;
  max: number;
  /** Increment for the stepper buttons and arrow keys; typed values are never rounded to it. */
  step: number;
  integer?: boolean;
};

/** Mirrors FINANCIAL_SETUP_RULES in the API (somod-financial-formulas.ts). */
export const SETUP_FIELDS: readonly SetupFieldDef[] = [
  { key: 'monthly_contract_value', label: 'Monthly contract value', unit: 'Per month', kind: 'money', required: true, min: 0, minExclusive: true, max: SOMOD_MAX_MONEY, step: 10_000 },
  { key: 'monthly_guard_cost', label: 'Monthly guard cost', unit: 'Per guard, per month', kind: 'money', required: true, min: 0, minExclusive: true, max: SOMOD_MAX_MONEY, step: 10 },
  { key: 'monthly_supervisor_cost', label: 'Monthly supervisor cost', unit: 'Per supervisor, per month', kind: 'money', required: true, min: 0, minExclusive: true, max: SOMOD_MAX_MONEY, step: 5 },
  { key: 'days_per_month', label: 'Days per month', unit: 'Days (28–31)', kind: 'number', required: true, min: 28, max: 31, step: 1, integer: true },
  { key: 'shift_hours', label: 'Shift hours', unit: 'Hours per shift (up to 24)', kind: 'number', required: true, min: 0, minExclusive: true, max: 24, step: 0.5 },
  { key: 'response_delay_cost_rate', label: 'Response delay cost rate', unit: 'Per minute of response delay, before the severity multiplier', kind: 'money', required: true, min: 0, max: SOMOD_MAX_MONEY, step: 5 },
  { key: 'default_incident_severity_multiplier', label: 'Default incident severity multiplier', unit: 'Factor from 1 to 5', kind: 'number', required: true, min: 1, max: 5, step: 1 },
  { key: 'patrol_value_per_miss', label: 'Patrol value per miss', unit: 'Per missed patrol', kind: 'money', required: true, min: 0, max: SOMOD_MAX_MONEY, step: 10 },
  { key: 'technology_capex_total', label: 'Technology CAPEX total', unit: 'One-off total', kind: 'money', required: false, min: 0, max: SOMOD_MAX_MONEY, step: 10_000 },
  { key: 'technology_monthly_opex', label: 'Technology monthly OPEX', unit: 'Per month', kind: 'money', required: false, min: 0, max: SOMOD_MAX_MONEY, step: 1_000 },
  { key: 'technology_lifespan_months', label: 'Technology lifespan', unit: 'Months (1–600); required when CAPEX is entered', kind: 'number', required: false, min: 1, max: 600, step: 1, integer: true },
];

export type SetupValues = Record<SetupFieldKey, string> & { currency: string };

/**
 * Turns typed or pasted text ("R 2,500,000.00", "2 500 000", "ZAR 1500") into a plain numeric
 * string. Returns '' for empty input and null when the text is not a number.
 */
export function parseAmountInput(text: string): string | null {
  const cleaned = String(text ?? '')
    .replace(/[\s\u00a0\u202f,]/g, '')
    .replace(/^(ZAR|USD|EUR|GBP|AUD|CHF|CAD|NAD|R|N\$|A\$|C\$|\$|€|£)/i, '');
  if (!cleaned) return '';
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned;
}

export function formatAmount(value: number, kind: SetupFieldDef['kind']): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: kind === 'money' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Display a stored value in the selected currency, e.g. "R 2,500,000". */
export function formatCurrency(value: unknown, currency?: string | null, decimals = 0): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return '—';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
  return `${currencySymbol(currency)} ${formatted}`;
}

function limit(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function validateSetupField(field: SetupFieldDef, raw: string): string | null {
  const parsed = parseAmountInput(raw);
  if (parsed === null) return `${field.label} must be a valid number.`;
  if (parsed === '') return field.required ? `${field.label} is required.` : null;
  const value = Number(parsed);
  if (field.minExclusive && value <= field.min) return `${field.label} must be greater than ${limit(field.min)}.`;
  if (value < field.min || value > field.max) {
    return field.minExclusive
      ? `${field.label} must not exceed ${limit(field.max)}.`
      : `${field.label} must be between ${limit(field.min)} and ${limit(field.max)}.`;
  }
  if (field.integer && !Number.isInteger(value)) return `${field.label} must be a whole number.`;
  if (!field.integer && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    return `${field.label} allows at most 2 decimal places.`;
  }
  return null;
}

export function validateSetup(values: SetupValues): Partial<Record<SetupFieldKey, string>> {
  const errors: Partial<Record<SetupFieldKey, string>> = {};
  for (const field of SETUP_FIELDS) {
    const message = validateSetupField(field, values[field.key]);
    if (message) errors[field.key] = message;
  }
  const capex = Number(parseAmountInput(values.technology_capex_total) || 0);
  if (!errors.technology_lifespan_months && capex > 0 && !parseAmountInput(values.technology_lifespan_months)) {
    errors.technology_lifespan_months = 'Technology lifespan is required when technology CAPEX is entered.';
  }
  return errors;
}

/** Numeric payload for POST /somod/:id/financial-model. Formatting never reaches the API. */
export function setupPayload(values: SetupValues): Record<string, string | number | null> {
  const payload: Record<string, string | number | null> = { currency: values.currency };
  for (const field of SETUP_FIELDS) {
    const parsed = parseAmountInput(values[field.key]);
    payload[field.key] = parsed ? Number(parsed) : null;
  }
  return payload;
}

/** Moves a value by one step, keeping two-decimal precision and the field limits. */
export function stepAmount(field: SetupFieldDef, raw: string, direction: 1 | -1): string {
  const parsed = parseAmountInput(raw);
  const current = parsed ? Number(parsed) : field.minExclusive ? field.min : direction > 0 ? field.min - field.step : field.min;
  let next = Math.round((current + direction * field.step) * 100) / 100;
  if (next > field.max) next = field.max;
  if (next < field.min) next = field.min;
  if (field.minExclusive && next <= field.min) return parsed ?? '';
  return String(next);
}
