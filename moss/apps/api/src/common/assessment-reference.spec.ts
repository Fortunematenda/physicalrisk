import { describe, expect, it } from 'vitest';
import { ProductCode } from '@prisma/client';
import { assessmentReferencePrefix } from './assessment-reference';

describe('assessmentReferencePrefix', () => {
  it('maps SCLI_COST_LEAKAGE to SCL (not MOSS, not SCLI)', () => {
    expect(assessmentReferencePrefix(ProductCode.SCLI_COST_LEAKAGE)).toBe('SCL');
    expect(assessmentReferencePrefix('SCLI_COST_LEAKAGE')).toBe('SCL');
  });

  it('maps MOSS to MOSS', () => {
    expect(assessmentReferencePrefix(ProductCode.MOSS)).toBe('MOSS');
    expect(assessmentReferencePrefix('MOSS')).toBe('MOSS');
  });
});
