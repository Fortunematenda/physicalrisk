import { describe, expect, it } from 'vitest';
import {
  EAD_ROUTING_PRODUCT_CODES,
  legacySingularRecommendedProduct,
  moduleHasLegacyShield360Recommendation,
  orderRecommendedProductCodes,
  parseRecommendedProductCodes,
  resolveModuleRecommendedProducts,
  validateRecommendedProductCodes,
} from './ead-recommended-products';

describe('ead-recommended-products (Stage 9)', () => {
  it('parses and deduplicates a product array', () => {
    expect(
      parseRecommendedProductCodes([
        'SCLI_COST_LEAKAGE',
        'VENDOR_PERFORMANCE_ASSURANCE',
        'SCLI_COST_LEAKAGE',
        'SHIELD360',
        'NOPE',
        null,
      ]),
    ).toEqual(['SCLI_COST_LEAKAGE', 'VENDOR_PERFORMANCE_ASSURANCE']);
  });

  it('orders by catalogue display order', () => {
    expect(
      orderRecommendedProductCodes([
        'CYBER_PHYSICAL_DEPENDENCY',
        'SCLI_COST_LEAKAGE',
        'CONTRACT_SLA_ASSURANCE',
      ]),
    ).toEqual([
      'SCLI_COST_LEAKAGE',
      'CONTRACT_SLA_ASSURANCE',
      'CYBER_PHYSICAL_DEPENDENCY',
    ]);
  });

  it('migrates legacy singular recommendedProduct into a list', () => {
    expect(
      resolveModuleRecommendedProducts({
        recommendedProduct: 'CONTRACT_SLA_ASSURANCE',
      }),
    ).toEqual(['CONTRACT_SLA_ASSURANCE']);
  });

  it('prefers plural JSON over singular when both are present', () => {
    expect(
      resolveModuleRecommendedProducts({
        recommendedProducts: ['VENDOR_PERFORMANCE_ASSURANCE', 'SCLI_COST_LEAKAGE'],
        recommendedProduct: 'CONTRACT_SLA_ASSURANCE',
      }),
    ).toEqual(['SCLI_COST_LEAKAGE', 'VENDOR_PERFORMANCE_ASSURANCE']);
  });

  it('allows an empty recommendation list', () => {
    expect(resolveModuleRecommendedProducts({})).toEqual([]);
    expect(validateRecommendedProductCodes([])).toEqual({ ok: true, codes: [] });
  });

  it('rejects duplicates on write validation', () => {
    const result = validateRecommendedProductCodes([
      'SCLI_COST_LEAKAGE',
      'SCLI_COST_LEAKAGE',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Duplicate/i);
  });

  it('rejects Shield 360 on new recommendations', () => {
    const result = validateRecommendedProductCodes(['SHIELD360']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Shield 360|retired/i);
  });

  it('rejects unknown / inactive product codes', () => {
    const result = validateRecommendedProductCodes(['NOT_A_PRODUCT']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unsupported|inactive/i);
  });

  it('accepts multiple valid routing products', () => {
    const result = validateRecommendedProductCodes([
      'VENDOR_PERFORMANCE_ASSURANCE',
      'SCLI_COST_LEAKAGE',
    ]);
    expect(result).toEqual({
      ok: true,
      codes: ['SCLI_COST_LEAKAGE', 'VENDOR_PERFORMANCE_ASSURANCE'],
    });
  });

  it('keeps legacy singular sync as the first selected product', () => {
    expect(
      legacySingularRecommendedProduct([
        'CYBER_PHYSICAL_DEPENDENCY',
        'SCLI_COST_LEAKAGE',
      ]),
    ).toBe('CYBER_PHYSICAL_DEPENDENCY');
    expect(legacySingularRecommendedProduct([])).toBeNull();
  });

  it('detects historical Shield 360 on the module', () => {
    expect(
      moduleHasLegacyShield360Recommendation({ recommendedProduct: 'SHIELD360' }),
    ).toBe(true);
    expect(
      moduleHasLegacyShield360Recommendation({
        recommendedProducts: ['SHIELD360'],
      }),
    ).toBe(true);
    expect(
      moduleHasLegacyShield360Recommendation({
        recommendedProducts: ['SCLI_COST_LEAKAGE'],
      }),
    ).toBe(false);
  });

  it('exposes only active routing products as selectable options', () => {
    expect(EAD_ROUTING_PRODUCT_CODES).not.toContain('SHIELD360');
    expect(EAD_ROUTING_PRODUCT_CODES).toContain('SCLI_COST_LEAKAGE');
    expect(EAD_ROUTING_PRODUCT_CODES).toContain('CONTRACT_SLA_ASSURANCE');
    expect(EAD_ROUTING_PRODUCT_CODES).toContain('VENDOR_PERFORMANCE_ASSURANCE');
    expect(EAD_ROUTING_PRODUCT_CODES).toContain('GOVERNANCE_EXECUTIVE_ASSURANCE');
    expect(EAD_ROUTING_PRODUCT_CODES).toContain('CYBER_PHYSICAL_DEPENDENCY');
  });
});
