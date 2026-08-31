import { describe, expect, it } from 'vitest';

import { deriveEgtAssurancePresentation } from '@moss/shared';

import {
  isOperationalSitesSelectionComplete,
  isSecurityExpenditureComplete,
  resolveOperationalSitesBandValue,
  resolveSecurityExpenditureBandValue,
  SCL_SECURITY_EXPENDITURE_OPTIONS,
  SCL_SITE_COUNT_OPTIONS,
  securityExpenditureLabelFromStored,
} from './scl-assessment-types';

describe('EGT enterprise qualification options (web)', () => {
  it('Test A: new operational-site options are exactly 20–40 through 100+', () => {
    expect(SCL_SITE_COUNT_OPTIONS.map((o) => o.label)).toEqual([
      '20–40 sites',
      '41–60 sites',
      '61–80 sites',
      '81–100 sites',
      'More than 100 sites',
    ]);
  });

  it('Test B: old small-company options do not appear for new submissions', () => {
    const labels = SCL_SITE_COUNT_OPTIONS.map((o) => o.label);
    expect(labels).not.toContain('1 site');
    expect(labels).not.toContain('2–5 sites');
    expect(labels).not.toContain('More than 50 sites');
  });

  it('Test C: new expenditure options are exactly R10–R50m through Above R200m', () => {
    expect(SCL_SECURITY_EXPENDITURE_OPTIONS.map((o) => o.label)).toEqual([
      'R10–R50 million',
      'R51–R100 million',
      'R101–R150 million',
      'R151–R200 million',
      'Above R200 million',
    ]);
  });

  it('Test D: selecting Above R200m does not resolve to an assumed exact expenditure', () => {
    expect(resolveSecurityExpenditureBandValue('SECURITY_SPEND_200M_PLUS')).toBe(
      'SECURITY_SPEND_200M_PLUS',
    );
    expect(resolveSecurityExpenditureBandValue('Above R200 million')).toBe('SECURITY_SPEND_200M_PLUS');
  });

  it('Test E: qualification band selection does not alter Stage 1 assurance scoring', () => {
    const before = deriveEgtAssurancePresentation({ overallRiskScore: 68 });
    expect(resolveOperationalSitesBandValue('SITES_100_PLUS')).toBe('SITES_100_PLUS');
    expect(resolveSecurityExpenditureBandValue('SECURITY_SPEND_200M_PLUS')).toBe(
      'SECURITY_SPEND_200M_PLUS',
    );
    const after = deriveEgtAssurancePresentation({ overallRiskScore: 68 });
    expect(after?.assuranceScore).toBe(before?.assuranceScore);
    expect(after?.assuranceBand.code).toBe(before?.assuranceBand.code);
  });

  it('Test F: historical submission containing an old range remains readable', () => {
    expect(securityExpenditureLabelFromStored('Below R2 million')).toBe('Below R2 million');
    expect(securityExpenditureLabelFromStored(30_000_000)).toBe('R10–R50 million');
  });

  it('Test G: new selections are accepted as complete band codes', () => {
    expect(isOperationalSitesSelectionComplete('SITES_41_60')).toBe(true);
    expect(isSecurityExpenditureComplete('SECURITY_SPEND_51_100M')).toBe(true);
    expect(resolveOperationalSitesBandValue('SITES_41_60')).toBe('SITES_41_60');
    expect(resolveSecurityExpenditureBandValue('SECURITY_SPEND_51_100M')).toBe(
      'SECURITY_SPEND_51_100M',
    );
  });

  it('Test H: admin helpers show friendly labels rather than enum values', () => {
    expect(securityExpenditureLabelFromStored('SECURITY_SPEND_200M_PLUS')).toBe(
      'Above R200 million',
    );
  });
});
