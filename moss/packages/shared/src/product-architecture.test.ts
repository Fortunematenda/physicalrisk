import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PHYSICAL_RISK_PRODUCT_CODES,
  EAD_ROUTING_PRODUCT_CODES,
  FOCUSED_ASSURANCE_MODULES,
  FOCUSED_ASSURANCE_PRODUCTS,
  LEGACY_SHIELD360_PRODUCT_CODE,
  PHYSICAL_RISK_PRODUCTS,
  SHIELD360_RETIRED_MESSAGE,
  getActivePhysicalRiskProducts,
  isActivePhysicalRiskProductCode,
  isLegacyShield360ProductCode,
} from './index';

describe('Shield 360 retirement (Stage 5)', () => {
  it('keeps SHIELD360 in the catalogue as inactive/legacy only', () => {
    expect(PHYSICAL_RISK_PRODUCTS.SHIELD360.active).toBe(false);
    expect(PHYSICAL_RISK_PRODUCTS.SHIELD360.legacy).toBe(true);
    expect(PHYSICAL_RISK_PRODUCTS.SHIELD360.name).toBe('Shield 360');
  });

  it('excludes Shield 360 from active product lists', () => {
    expect(ACTIVE_PHYSICAL_RISK_PRODUCT_CODES).not.toContain('SHIELD360');
    expect(getActivePhysicalRiskProducts().map((p) => p.code)).not.toContain('SHIELD360');
    expect(isActivePhysicalRiskProductCode('SHIELD360')).toBe(false);
    expect(isActivePhysicalRiskProductCode('SCLI_COST_LEAKAGE')).toBe(true);
  });

  it('excludes Shield 360 from EAD Level 3 routing options', () => {
    expect(EAD_ROUTING_PRODUCT_CODES).not.toContain('SHIELD360');
    expect(FOCUSED_ASSURANCE_PRODUCTS.map((p) => p.code)).not.toContain('SHIELD360');
    expect(FOCUSED_ASSURANCE_MODULES.SHIELD360).toBeUndefined();
  });

  it('identifies legacy Shield 360 codes for draft correction messaging', () => {
    expect(isLegacyShield360ProductCode(LEGACY_SHIELD360_PRODUCT_CODE)).toBe(true);
    expect(isLegacyShield360ProductCode('SCLI_COST_LEAKAGE')).toBe(false);
    expect(SHIELD360_RETIRED_MESSAGE).toMatch(/not an active Physical Risk product/i);
  });
});
