import { describe, expect, it } from 'vitest';
import {
  buildEadFollowOnFeeLineItems,
  buildEadFollowOnIndicativeScope,
  buildEadFollowOnUnderstanding,
  validateEadProposalProductCodes,
} from './ead-comprehensive-proposal';

describe('ead-comprehensive-proposal (Stage 12)', () => {
  it('requires at least one product', () => {
    expect(validateEadProposalProductCodes([]).ok).toBe(false);
    expect(validateEadProposalProductCodes(null).ok).toBe(false);
  });

  it('rejects Shield 360', () => {
    const result = validateEadProposalProductCodes(['SHIELD360']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.includes('Shield 360')).toBe(true);
  });

  it('accepts one and multiple routing products', () => {
    const one = validateEadProposalProductCodes(['SCLI_COST_LEAKAGE']);
    expect(one.ok).toBe(true);
    if (one.ok) expect(one.codes).toEqual(['SCLI_COST_LEAKAGE']);

    const multi = validateEadProposalProductCodes([
      'VENDOR_PERFORMANCE_ASSURANCE',
      'SCLI_COST_LEAKAGE',
      'CONTRACT_SLA_ASSURANCE',
    ]);
    expect(multi.ok).toBe(true);
    if (multi.ok) {
      expect(multi.codes).toEqual([
        'SCLI_COST_LEAKAGE',
        'CONTRACT_SLA_ASSURANCE',
        'VENDOR_PERFORMANCE_ASSURANCE',
      ]);
    }
  });

  it('builds fee lines for each selected engagement', () => {
    const lines = buildEadFollowOnFeeLineItems(['SCLI_COST_LEAKAGE', 'CONTRACT_SLA_ASSURANCE']);
    expect(lines.length).toBe(2);
    expect(lines[0].fee).toBe(0);
    expect(lines[0].rate).toBe(985);
    expect(lines[1].rate).toBe(985);
    expect(lines[0].description.includes('Cost Leakage') || lines[0].description.includes('Leakage')).toBe(
      true,
    );
  });

  it('prepopulates fee line rate from analyst hourly rate', () => {
    const lines = buildEadFollowOnFeeLineItems(['VENDOR_PERFORMANCE_ASSURANCE'], 1200);
    expect(lines[0].rate).toBe(1200);
  });

  it('builds understanding without fabricating consultant narrative beyond deterministic facts', () => {
    const html = buildEadFollowOnUnderstanding({
      organisationName: 'Brisholiving',
      eadReference: 'EAD-2026-000001',
      selectedLabels: ['Security Cost Leakage Assessment™'],
    });
    expect(html).toContain('Brisholiving');
    expect(html).toContain('EAD-2026-000001');
    expect(html).toContain('Security Cost Leakage Assessment™');
    expect(html.toLowerCase().includes('internal consultant')).toBe(false);
  });

  it('builds indicative scope listing selected engagements', () => {
    const scope = buildEadFollowOnIndicativeScope([
      'SCLI_COST_LEAKAGE',
      'VENDOR_PERFORMANCE_ASSURANCE',
    ]);
    expect(scope.includes('Cost Leakage') || scope.includes('Leakage')).toBe(true);
    expect(scope.includes('Vendor Performance')).toBe(true);
  });
});
