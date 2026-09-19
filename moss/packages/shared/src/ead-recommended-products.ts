/**
 * Executive Advisory — multi-select recommended next products (Stage 9).
 *
 * Selections are ProductCode values from the active Level 3 routing catalogue.
 * Empty list is valid (no focused product required).
 */

import {
  EAD_ROUTING_PRODUCT_CODES,
  type EadRoutingProductCode,
} from './ead-routing';
import {
  isLegacyShield360ProductCode,
  PRODUCT_LABELS,
  SHIELD360_RETIRED_MESSAGE,
} from './product-architecture';

export { EAD_ROUTING_PRODUCT_CODES, type EadRoutingProductCode };

const ROUTING_SET = new Set<string>(EAD_ROUTING_PRODUCT_CODES);

export const EAD_RECOMMENDED_PRODUCT_OPTIONS = EAD_ROUTING_PRODUCT_CODES.map((code) => ({
  code,
  label: PRODUCT_LABELS[code] || code.replaceAll('_', ' '),
}));

export function isEadRoutingProductCode(value: unknown): value is EadRoutingProductCode {
  return typeof value === 'string' && ROUTING_SET.has(value);
}

/** Catalogue display order for routing products. */
export function orderRecommendedProductCodes(
  codes: readonly string[],
): EadRoutingProductCode[] {
  const set = new Set(codes.filter(isEadRoutingProductCode));
  return EAD_ROUTING_PRODUCT_CODES.filter((code) => set.has(code));
}

/**
 * Parse a JSON array of product codes. Duplicates and unknown codes are dropped.
 * Shield 360 and other non-routing codes are excluded from the active list.
 */
export function parseRecommendedProductCodes(raw: unknown): EadRoutingProductCode[] {
  if (!Array.isArray(raw)) return [];
  const out: EadRoutingProductCode[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const code = item.trim();
    if (!code || seen.has(code)) continue;
    if (isLegacyShield360ProductCode(code) || !isEadRoutingProductCode(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return orderRecommendedProductCodes(out);
}

/**
 * Resolve module recommendations from plural JSON and/or legacy singular field.
 * Historical singular values are preserved as a one-element list.
 */
export function resolveModuleRecommendedProducts(input: {
  recommendedProducts?: unknown;
  recommendedProduct?: string | null;
}): EadRoutingProductCode[] {
  const fromPlural = parseRecommendedProductCodes(input.recommendedProducts);
  if (fromPlural.length) return fromPlural;

  const singular = String(input.recommendedProduct || '').trim();
  if (!singular) return [];
  if (isLegacyShield360ProductCode(singular) || !isEadRoutingProductCode(singular)) return [];
  return [singular];
}

export function recommendedProductLabel(code: string): string {
  return PRODUCT_LABELS[code] || code.replaceAll('_', ' ');
}

export function formatRecommendedProductLabels(codes: readonly string[]): string[] {
  return codes.map((code) => recommendedProductLabel(code));
}

/** Legacy singular column: first selected product, or null when empty. */
export function legacySingularRecommendedProduct(
  codes: readonly EadRoutingProductCode[],
): EadRoutingProductCode | null {
  return codes[0] || null;
}

export type RecommendedProductsValidation =
  | { ok: true; codes: EadRoutingProductCode[] }
  | { ok: false; error: string };

/**
 * Validate a submitted recommendation list for new writes.
 * Empty array is allowed. Duplicates and inactive/Shield codes are rejected.
 */
export function validateRecommendedProductCodes(raw: unknown): RecommendedProductsValidation {
  if (raw == null) {
    return { ok: true, codes: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'recommendedProducts must be an array of product codes.' };
  }

  const seen = new Set<string>();
  const codes: EadRoutingProductCode[] = [];

  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) {
      return {
        ok: false,
        error: `Invalid recommended product value: ${String(item)}`,
      };
    }
    const code = item.trim();
    if (isLegacyShield360ProductCode(code)) {
      return { ok: false, error: SHIELD360_RETIRED_MESSAGE };
    }
    if (!isEadRoutingProductCode(code)) {
      return {
        ok: false,
        error: `Unsupported or inactive Level 3 product: ${code}`,
      };
    }
    if (seen.has(code)) {
      return {
        ok: false,
        error: `Duplicate recommended product is not allowed: ${recommendedProductLabel(code)}`,
      };
    }
    seen.add(code);
    codes.push(code);
  }

  return { ok: true, codes: orderRecommendedProductCodes(codes) };
}

/** True when the module still holds a retired Shield 360 singular recommendation. */
export function moduleHasLegacyShield360Recommendation(input: {
  recommendedProducts?: unknown;
  recommendedProduct?: string | null;
}): boolean {
  if (isLegacyShield360ProductCode(input.recommendedProduct)) return true;
  if (!Array.isArray(input.recommendedProducts)) return false;
  return input.recommendedProducts.some((item) => isLegacyShield360ProductCode(String(item || '')));
}
