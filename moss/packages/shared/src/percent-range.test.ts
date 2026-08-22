import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PERCENT_RANGE_MAPPING,
  SCL_PERCENT_RANGES,
  buildPercentRangeValue,
  formatPercentRangeSelection,
  midpointFractionForBand,
  resolvePercentForScoring,
} from './percent-range';

describe('SCL percent ranges', () => {
  it('defines the required 10 bands', () => {
    expect(SCL_PERCENT_RANGES).toHaveLength(10);
    expect(SCL_PERCENT_RANGES.map((r) => r.label)).toEqual([
      '0–10%',
      '11–20%',
      '21–30%',
      '31–40%',
      '41–50%',
      '51–60%',
      '61–70%',
      '71–80%',
      '81–90%',
      '91–100%',
    ]);
  });

  it('builds structured storage values', () => {
    expect(buildPercentRangeValue('21_30')).toEqual({
      rangeCode: '21_30',
      min: 21,
      max: 30,
      unit: 'percent',
    });
  });

  it('formats the selected band for UI', () => {
    expect(formatPercentRangeSelection(buildPercentRangeValue('21_30'))).toBe(
      'Estimated percentage: 21–30%',
    );
  });

  it('default mapping uses provisional midpoints for scoring', () => {
    expect(DEFAULT_PERCENT_RANGE_MAPPING.status).toBe('PROVISIONAL_MIDPOINT');
    expect(resolvePercentForScoring(buildPercentRangeValue('21_30'))).toEqual({
      ok: true,
      fraction: 0.255,
      source: 'provisional-midpoint',
    });
    expect(resolvePercentForScoring(buildPercentRangeValue('0_10'))).toEqual({
      ok: true,
      fraction: 0.05,
      source: 'provisional-midpoint',
    });
    expect(resolvePercentForScoring(buildPercentRangeValue('91_100'))).toEqual({
      ok: true,
      fraction: 0.955,
      source: 'provisional-midpoint',
    });
  });

  it('still blocks when mapping status is explicitly pending', () => {
    const pending = {
      status: 'PENDING_CLIENT_CONFIRMATION' as const,
      fractionsByRangeCode: {},
      notes: 'blocked',
    };
    expect(resolvePercentForScoring(buildPercentRangeValue('21_30'), pending)).toEqual({
      ok: false,
      reason: 'pending-mapping',
      rangeCode: '21_30',
    });
  });

  it('accepts legacy numeric fractions and 0–100 values', () => {
    expect(resolvePercentForScoring(0.25)).toEqual({
      ok: true,
      fraction: 0.25,
      source: 'legacy-number',
    });
    expect(resolvePercentForScoring(40)).toEqual({
      ok: true,
      fraction: 0.4,
      source: 'legacy-number',
    });
  });

  it('uses configured mapping when status is CONFIGURED', () => {
    const configured = {
      status: 'CONFIGURED' as const,
      fractionsByRangeCode: { '21_30': 0.25 },
      notes: 'Client-approved example',
    };
    expect(resolvePercentForScoring(buildPercentRangeValue('21_30'), configured)).toEqual({
      ok: true,
      fraction: 0.25,
      source: 'configured-mapping',
    });
  });

  it('midpoint helper matches inclusive band average', () => {
    const band = SCL_PERCENT_RANGES.find((r) => r.rangeCode === '21_30')!;
    expect(midpointFractionForBand(band)).toBe(0.255);
  });
});
