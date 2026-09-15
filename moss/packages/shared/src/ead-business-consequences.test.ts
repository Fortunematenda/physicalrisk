import { describe, expect, it } from 'vitest';
import {
  formatBusinessConsequencesForLegacyReport,
  hasValidBusinessConsequences,
  isEadBusinessConsequenceCode,
  normalizeOtherBusinessConsequence,
  parseBusinessConsequenceCodes,
  validateBusinessConsequences,
} from './ead-business-consequences';

describe('ead-business-consequences', () => {
  it('accepts a single valid consequence code', () => {
    expect(isEadBusinessConsequenceCode('FINANCIAL_LOSS')).toBe(true);
    expect(parseBusinessConsequenceCodes(['FINANCIAL_LOSS'])).toEqual(['FINANCIAL_LOSS']);
    expect(hasValidBusinessConsequences(['FINANCIAL_LOSS'])).toBe(true);
  });

  it('accepts multiple consequence codes and dedupes', () => {
    const codes = parseBusinessConsequenceCodes([
      'FINANCIAL_LOSS',
      'REPUTATIONAL_DAMAGE',
      'FINANCIAL_LOSS',
      'BUSINESS_INTERRUPTION',
    ]);
    expect(codes).toEqual(['FINANCIAL_LOSS', 'REPUTATIONAL_DAMAGE', 'BUSINESS_INTERRUPTION']);
    expect(hasValidBusinessConsequences(codes)).toBe(true);
  });

  it('rejects empty selection', () => {
    const result = validateBusinessConsequences([]);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Select at least one business consequence.');
  });

  it('rejects invalid enum values', () => {
    expect(isEadBusinessConsequenceCode('NOT_A_REAL_CODE')).toBe(false);
    expect(parseBusinessConsequenceCodes(['FINANCIAL_LOSS', 'NOPE', 12, null])).toEqual([
      'FINANCIAL_LOSS',
    ]);
  });

  it('keeps Wayne interruption / disruption options distinct', () => {
    const codes = parseBusinessConsequenceCodes([
      'BUSINESS_INTERRUPTION',
      'PARTIAL_BUSINESS_INTERRUPTION',
      'BUSINESS_DISRUPTION',
    ]);
    expect(codes).toHaveLength(3);
    expect(
      formatBusinessConsequencesForLegacyReport(codes),
    ).toBe(
      'Business interruption; Partial business interruption; Business disruption',
    );
  });

  it('requires other text when OTHER is selected', () => {
    const missing = validateBusinessConsequences(['OTHER'], '  ');
    expect(missing.ok).toBe(false);
    expect(missing.requiresOtherText).toBe(true);
    expect(missing.error).toBe('Enter the other consequence.');

    const ok = validateBusinessConsequences(['OTHER', 'FINANCIAL_LOSS'], 'Supply chain delay');
    expect(ok.ok).toBe(true);
  });

  it('clears other text when OTHER is deselected', () => {
    expect(
      normalizeOtherBusinessConsequence(['FINANCIAL_LOSS'], 'leftover custom text'),
    ).toBeNull();
    expect(normalizeOtherBusinessConsequence(['OTHER'], '  Custom  ')).toBe('Custom');
  });

  it('formats legacy report string with other label', () => {
    expect(
      formatBusinessConsequencesForLegacyReport(
        ['REPUTATIONAL_DAMAGE', 'OTHER'],
        'Client trust erosion',
      ),
    ).toBe('Reputational damage; Other: Client trust erosion');
  });
});
