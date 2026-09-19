import { describe, expect, it } from 'vitest';
import {
  buildLevel3SourceContext,
  level3EngagementHref,
  validateLevel3DeliveryProductCodes,
} from './ead-level3-from-proposal';

describe('ead-level3-from-proposal (Stage 13)', () => {
  it('rejects empty selection', () => {
    expect(validateLevel3DeliveryProductCodes([]).ok).toBe(false);
  });

  it('rejects Shield 360', () => {
    const result = validateLevel3DeliveryProductCodes(['SHIELD360']);
    expect(result.ok).toBe(false);
  });

  it('accepts multiple Level 3 products in catalogue order', () => {
    const result = validateLevel3DeliveryProductCodes([
      'VENDOR_PERFORMANCE_ASSURANCE',
      'SCLI_COST_LEAKAGE',
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.codes[0]).toBe('SCLI_COST_LEAKAGE');
      expect(result.codes).toContain('VENDOR_PERFORMANCE_ASSURANCE');
    }
  });

  it('routes SCL to assessments and others to advisory', () => {
    expect(level3EngagementHref('SCLI_COST_LEAKAGE', 'a1')).toBe('/assessments/a1');
    expect(level3EngagementHref('VENDOR_PERFORMANCE_ASSURANCE', 'a2')).toBe('/advisory/a2');
  });

  it('builds source context without internal consultant notes', () => {
    const ctx = buildLevel3SourceContext({
      proposalId: 'p1',
      proposalNumber: 'PRP-2026-000006',
      productCode: 'SCLI_COST_LEAKAGE',
      ead: { id: 'ead1', reference: 'EAD-2026-000001' },
      findings: [
        {
          moduleCode: 'FINANCIAL_ASSURANCE',
          moduleName: 'Financial Assurance',
          finding: 'Gap identified',
          businessConsequences: 'Financial loss',
          requiredDecision: 'Approve SCL',
        },
      ],
    });
    const json = JSON.stringify(ctx);
    expect(json.includes('Internal Consultant')).toBe(false);
    expect(json.includes('analystNote')).toBe(false);
    expect(ctx.proposalNumber).toBe('PRP-2026-000006');
    expect(ctx.eadReference).toBe('EAD-2026-000001');
  });
});
