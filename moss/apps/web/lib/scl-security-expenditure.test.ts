import { describe, expect, it } from 'vitest';

import {
  isSecurityExpenditureComplete,
  resolveSecurityExpenditureForScoring,
  SCL_PUBLIC_TRIAGE_QUESTION_CODES,
  SCL_SECURITY_EXPENDITURE_OPTIONS,
  securityExpenditureLabelFromStored,
} from './scl-assessment-types';

describe('SCL security expenditure bands', () => {
  it('does not offer Prefer not to say or Not known', () => {
    const labels = SCL_SECURITY_EXPENDITURE_OPTIONS.map((o) => o.label);
    expect(labels).not.toContain('Prefer not to say');
    expect(labels).not.toContain('Not known');
    expect(labels.length).toBe(5);
  });

  it('requires a selected spend band before submit', () => {
    expect(isSecurityExpenditureComplete('')).toBe(false);
    expect(isSecurityExpenditureComplete('Prefer not to say')).toBe(false);
    expect(isSecurityExpenditureComplete('R10–R50 million')).toBe(true);
    expect(resolveSecurityExpenditureForScoring('R10–R50 million')).toBe(30_000_000);
  });

  it('maps legacy non-disclosure labels to empty for resume', () => {
    expect(securityExpenditureLabelFromStored('Prefer not to say')).toBe('');
    expect(securityExpenditureLabelFromStored('Not known')).toBe('');
  });
});

describe('SCL public triage question set', () => {
  it('shows 15 questions including cyber-physical technology coverage', () => {
    expect(SCL_PUBLIC_TRIAGE_QUESTION_CODES).toHaveLength(15);
    expect(SCL_PUBLIC_TRIAGE_QUESTION_CODES).toContain('Q9');
    expect(SCL_PUBLIC_TRIAGE_QUESTION_CODES).toContain('Q10');
    expect(SCL_PUBLIC_TRIAGE_QUESTION_CODES).not.toContain('Q7');
    expect(SCL_PUBLIC_TRIAGE_QUESTION_CODES).not.toContain('Q16');
  });
});
