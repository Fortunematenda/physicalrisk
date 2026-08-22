import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MONEY_RANGE_MAPPING,
  SCL_MONEY_RANGES,
  buildMoneyRangeValue,
  formatClientEstimatedLosses,
  formatMoneyRangeLabel,
  formatMoneyRangeSelection,
  resolveMoneyForScoring,
} from './scl-money-ranges';

describe('SCL monetary loss ranges', () => {
  it('exposes provisional bands with ZAR-formatted labels only', () => {
    expect(SCL_MONEY_RANGES.length).toBeGreaterThanOrEqual(5);
    for (const band of SCL_MONEY_RANGES) {
      expect(band.label).toMatch(/R[\d,]+/);
      expect(band.label).not.toBe(String(band.min));
      expect(band.label).not.toMatch(/^\d+$/);
    }
    expect(SCL_MONEY_RANGES.find((b) => b.code === 'R1M_R2M')?.label).toBe(
      'R1,000,000 – R2,000,000',
    );
    expect(SCL_MONEY_RANGES.find((b) => b.code === 'R250K_R500K')?.label).toBe(
      'R250,000 – R500,000',
    );
    expect(SCL_MONEY_RANGES.find((b) => b.code === 'R5M_R10M')?.label).toBe(
      'R5,000,000 – R10,000,000',
    );
  });

  it('builds structured storage values', () => {
    expect(buildMoneyRangeValue('R1M_R2M')).toEqual({
      code: 'R1M_R2M',
      min: 1_000_000,
      max: 2_000_000,
      label: 'R1,000,000 – R2,000,000',
      unit: 'ZAR',
    });
  });

  it('formats selection captions with ZAR labels', () => {
    expect(formatMoneyRangeSelection(buildMoneyRangeValue('R250K_R500K'))).toBe(
      'Estimated losses: R250,000 – R500,000',
    );
    expect(formatMoneyRangeLabel(1_200_000)).toBe('R1,200,000');
  });

  it('does not invent midpoint/min/max while mapping is pending', () => {
    const result = resolveMoneyForScoring(buildMoneyRangeValue('R1M_R2M'), DEFAULT_MONEY_RANGE_MAPPING);
    expect(result).toEqual({ ok: false, reason: 'pending-mapping', code: 'R1M_R2M' });
  });

  it('accepts legacy exact amounts', () => {
    expect(resolveMoneyForScoring(1_200_000)).toEqual({
      ok: true,
      amount: 1_200_000,
      source: 'legacy-number',
    });
    expect(resolveMoneyForScoring('R250,000')).toEqual({
      ok: true,
      amount: 250_000,
      source: 'legacy-number',
    });
  });

  it('uses configured amounts only when status is CONFIGURED', () => {
    const configured = {
      status: 'CONFIGURED' as const,
      amountsByCode: { R1M_R2M: 1_500_000 },
      notes: 'Client-approved example only',
      bandCatalogueStatus: 'CLIENT_APPROVED' as const,
    };
    expect(resolveMoneyForScoring(buildMoneyRangeValue('R1M_R2M'), configured)).toEqual({
      ok: true,
      amount: 1_500_000,
      source: 'configured-mapping',
    });
  });

  it('formats report client-estimated line from bands without inventing R0', () => {
    const low = buildMoneyRangeValue('R250K_R500K');
    const high = buildMoneyRangeValue('R1M_R2M');
    expect(formatClientEstimatedLosses(0, 0, low, high)).toBe(
      'R250,000 – R500,000 to R1,000,000 – R2,000,000',
    );
    expect(formatClientEstimatedLosses(250_000, 1_200_000, null, null)).toBe(
      'R250,000 – R1,200,000',
    );
  });
});
