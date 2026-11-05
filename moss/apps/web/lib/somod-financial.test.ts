import { describe, expect, it } from 'vitest';
import {
  SETUP_FIELDS,
  formatAmount,
  formatCurrency,
  parseAmountInput,
  setupPayload,
  stepAmount,
  validateSetup,
  validateSetupField,
  type SetupValues,
} from './somod-financial';

const field = (key: string) => SETUP_FIELDS.find((f) => f.key === key)!;

const valid: SetupValues = {
  currency: 'ZAR',
  monthly_contract_value: '2500000',
  monthly_guard_cost: '12000',
  monthly_supervisor_cost: '18000',
  days_per_month: '30',
  shift_hours: '12',
  response_delay_cost_rate: '50',
  default_incident_severity_multiplier: '2',
  patrol_value_per_miss: '250',
  technology_capex_total: '600000',
  technology_monthly_opex: '15000',
  technology_lifespan_months: '60',
};

describe('parseAmountInput', () => {
  it('accepts typed and pasted amounts with symbols, codes and separators', () => {
    expect(parseAmountInput('R 2,500,000.00')).toBe('2500000.00');
    expect(parseAmountInput('2 500 000')).toBe('2500000');
    expect(parseAmountInput('ZAR 1500.5')).toBe('1500.5');
    expect(parseAmountInput('$12,000')).toBe('12000');
    expect(parseAmountInput('  ')).toBe('');
    expect(parseAmountInput('12.')).toBe('12');
  });

  it('returns null for text that is not a number', () => {
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('1.2.3')).toBeNull();
    expect(parseAmountInput('Infinity')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats money with the selected currency without changing the stored number', () => {
    expect(formatAmount(2_500_000, 'money')).toBe('2,500,000.00');
    expect(formatCurrency(2_500_000, 'ZAR', 2)).toBe('R 2,500,000.00');
    expect(formatCurrency(1234.5, 'USD')).toBe('$ 1,235');
    expect(formatCurrency(null, 'ZAR')).toBe('—');
    expect(setupPayload({ ...valid, monthly_contract_value: 'R 2,500,000.00' }).monthly_contract_value).toBe(2_500_000);
  });
});

describe('validateSetupField', () => {
  it('rejects a severity multiplier of 9 and accepts 1–5', () => {
    const severity = field('default_incident_severity_multiplier');
    expect(validateSetupField(severity, '9')).toBe('Default incident severity multiplier must be between 1 and 5.');
    expect(validateSetupField(severity, '0')).toBe('Default incident severity multiplier must be between 1 and 5.');
    expect(validateSetupField(severity, '5')).toBeNull();
    expect(validateSetupField(severity, '1')).toBeNull();
  });

  it('accepts large contract values and flags invalid input', () => {
    const contract = field('monthly_contract_value');
    expect(validateSetupField(contract, '2,500,000.00')).toBeNull();
    expect(validateSetupField(contract, '0')).toBe('Monthly contract value must be greater than 0.');
    expect(validateSetupField(contract, '')).toBe('Monthly contract value is required.');
    expect(validateSetupField(contract, 'twelve')).toBe('Monthly contract value must be a valid number.');
    expect(validateSetupField(contract, '10.555')).toBe('Monthly contract value allows at most 2 decimal places.');
  });

  it('requires whole days within 28–31', () => {
    expect(validateSetupField(field('days_per_month'), '29.5')).toBe('Days per month must be a whole number.');
    expect(validateSetupField(field('days_per_month'), '32')).toBe('Days per month must be between 28 and 31.');
  });
});

describe('validateSetup', () => {
  it('passes a complete setup and requires lifespan when CAPEX is entered', () => {
    expect(validateSetup(valid)).toEqual({});
    expect(validateSetup({ ...valid, technology_lifespan_months: '' }).technology_lifespan_months).toMatch(
      /required when technology CAPEX/,
    );
    expect(validateSetup({ ...valid, technology_capex_total: '', technology_lifespan_months: '' })).toEqual({});
  });
});

describe('stepAmount', () => {
  it('uses field increments and does not round typed values', () => {
    expect(stepAmount(field('monthly_guard_cost'), '12347.5', 1)).toBe('12357.5');
    expect(stepAmount(field('monthly_supervisor_cost'), '18000', -1)).toBe('17995');
    expect(stepAmount(field('monthly_contract_value'), '2500000', 1)).toBe('2510000');
  });

  it('keeps values inside the allowed range', () => {
    expect(stepAmount(field('default_incident_severity_multiplier'), '5', 1)).toBe('5');
    expect(stepAmount(field('default_incident_severity_multiplier'), '', 1)).toBe('1');
    expect(stepAmount(field('days_per_month'), '28', -1)).toBe('28');
    expect(stepAmount(field('monthly_guard_cost'), '', -1)).toBe('');
  });
});
