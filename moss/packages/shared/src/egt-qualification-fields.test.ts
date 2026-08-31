import { describe, expect, it } from 'vitest';

import {
  EGT_LEGACY_OPERATIONAL_SITES_OPTIONS,
  EGT_LEGACY_SECURITY_EXPENDITURE_OPTIONS,
  EGT_OPERATIONAL_SITES_OPTIONS,
  EGT_SECURITY_EXPENDITURE_OPTIONS,
  isOperationalSitesSelectionComplete,
  isSecurityExpenditureBandCode,
  isSecurityExpenditureSelectionComplete,
  operationalSitesLabelFromStored,
  resolveSecurityExpenditureAmountForScoring,
  resolveSecurityExpenditureBandValue,
  securityExpenditureLabelFromStored,
} from './egt-qualification-fields';

describe('EGT operational sites (Stage 2)', () => {
  it('Test A: new operational-site options are exactly 20–40 through 100+', () => {
    expect(EGT_OPERATIONAL_SITES_OPTIONS.map((o) => o.label)).toEqual([
      '20–40 sites',
      '41–60 sites',
      '61–80 sites',
      '81–100 sites',
      'More than 100 sites',
    ]);
    expect(EGT_OPERATIONAL_SITES_OPTIONS.map((o) => o.value)).toEqual([
      'SITES_20_40',
      'SITES_41_60',
      'SITES_61_80',
      'SITES_81_100',
      'SITES_100_PLUS',
    ]);
  });

  it('Test B: old small-company options do not appear for new submissions', () => {
    const labels = EGT_OPERATIONAL_SITES_OPTIONS.map((o) => o.label);
    for (const legacy of EGT_LEGACY_OPERATIONAL_SITES_OPTIONS) {
      expect(labels).not.toContain(legacy.label);
    }
  });
});

describe('EGT security expenditure (Stage 2)', () => {
  it('Test C: new expenditure options are exactly R10–R50m through Above R200m', () => {
    expect(EGT_SECURITY_EXPENDITURE_OPTIONS.map((o) => o.label)).toEqual([
      'R10–R50 million',
      'R51–R100 million',
      'R101–R150 million',
      'R151–R200 million',
      'Above R200 million',
    ]);
    expect(EGT_SECURITY_EXPENDITURE_OPTIONS.map((o) => o.value)).toEqual([
      'SECURITY_SPEND_10_50M',
      'SECURITY_SPEND_51_100M',
      'SECURITY_SPEND_101_150M',
      'SECURITY_SPEND_151_200M',
      'SECURITY_SPEND_200M_PLUS',
    ]);
  });

  it('Test D: selecting Above R200m does not calculate or store an assumed exact expenditure', () => {
    expect(resolveSecurityExpenditureAmountForScoring('SECURITY_SPEND_200M_PLUS')).toBeUndefined();
    expect(resolveSecurityExpenditureAmountForScoring('Above R200 million')).toBeUndefined();
    expect(resolveSecurityExpenditureBandValue('SECURITY_SPEND_200M_PLUS')).toBe('SECURITY_SPEND_200M_PLUS');
    expect(isSecurityExpenditureBandCode('SECURITY_SPEND_200M_PLUS')).toBe(true);
  });

  it('requires a selected spend band before submit', () => {
    expect(isSecurityExpenditureSelectionComplete('')).toBe(false);
    expect(isSecurityExpenditureSelectionComplete('Prefer not to say')).toBe(false);
    expect(isSecurityExpenditureSelectionComplete('SECURITY_SPEND_10_50M')).toBe(true);
    expect(isSecurityExpenditureSelectionComplete('R10–R50 million')).toBe(true);
  });
});

describe('EGT qualification historical compatibility', () => {
  it('Test F: historical submission containing an old range remains readable', () => {
    expect(operationalSitesLabelFromStored('2–5 sites')).toBe('2–5 sites');
    expect(operationalSitesLabelFromStored(3)).toBe('2–5 sites');
    expect(operationalSitesLabelFromStored('SITES_2_5')).toBe('2–5 sites');
    expect(securityExpenditureLabelFromStored('Below R2 million')).toBe('Below R2 million');
    expect(securityExpenditureLabelFromStored(1_000_000)).toBe('Below R2 million');
    expect(securityExpenditureLabelFromStored('SECURITY_SPEND_BELOW_2M')).toBe('Below R2 million');
  });

  it('Test H: admin helpers show friendly labels rather than enum values', () => {
    expect(operationalSitesLabelFromStored('SITES_100_PLUS')).toBe('More than 100 sites');
    expect(securityExpenditureLabelFromStored('SECURITY_SPEND_200M_PLUS')).toBe('Above R200 million');
    expect(isOperationalSitesSelectionComplete('SITES_61_80')).toBe(true);
  });
});
