import { describe, expect, it } from 'vitest';

import {
  isIndustryValueComplete,
  isOtherIndustryLabel,
  resolveIndustrySelectState,
} from './scl-industry-other';

const OPTIONS = ['Mining', 'Retail', 'Other'];

describe('scl-industry-other', () => {
  it('detects Other labels', () => {
    expect(isOtherIndustryLabel('Other')).toBe(true);
    expect(isOtherIndustryLabel('other')).toBe(true);
    expect(isOtherIndustryLabel('Mining')).toBe(false);
  });

  it('treats bare Other as incomplete', () => {
    expect(isIndustryValueComplete('Other')).toBe(false);
    expect(isIndustryValueComplete('')).toBe(false);
    expect(isIndustryValueComplete('Logistics')).toBe(true);
  });

  it('maps catalogue values to the select', () => {
    expect(resolveIndustrySelectState('Mining', OPTIONS)).toEqual({
      selectValue: 'Mining',
      otherText: '',
      showOther: false,
    });
  });

  it('maps custom values onto Other + text', () => {
    expect(resolveIndustrySelectState('Specialty Chemicals', OPTIONS)).toEqual({
      selectValue: 'Other',
      otherText: 'Specialty Chemicals',
      showOther: true,
    });
  });

  it('maps bare Other to empty specify field', () => {
    expect(resolveIndustrySelectState('Other', OPTIONS)).toEqual({
      selectValue: 'Other',
      otherText: '',
      showOther: true,
    });
  });
});
