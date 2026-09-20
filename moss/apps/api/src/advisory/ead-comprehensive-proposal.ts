/**
 * Stage 12 helpers — Executive Advisory → comprehensive proposal request.
 */

import {
  EAD_ROUTING_PRODUCT_CODES,
  PRODUCT_LABELS,
  isLegacyShield360ProductCode,
  type EadRoutingProductCode,
} from '@moss/shared';

const ROUTING_SET = new Set<string>(EAD_ROUTING_PRODUCT_CODES);

export type EadProposalRecommendationOption = {
  productCode: EadRoutingProductCode;
  label: string;
  sourceModules: Array<{ moduleCode: string; moduleName: string }>;
};

export function validateEadProposalProductCodes(raw: unknown): {
  ok: true;
  codes: EadRoutingProductCode[];
} | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) {
    return { ok: false, error: 'Select at least one recommended engagement.' };
  }
  const seen = new Set<string>();
  const codes: EadRoutingProductCode[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) {
      return { ok: false, error: `Invalid product code: ${String(item)}` };
    }
    const code = item.trim();
    if (isLegacyShield360ProductCode(code)) {
      return { ok: false, error: 'Shield 360 cannot be included in a proposal.' };
    }
    if (!ROUTING_SET.has(code)) {
      return { ok: false, error: `Unsupported or inactive product: ${code}` };
    }
    if (seen.has(code)) {
      return { ok: false, error: `Duplicate product selection: ${PRODUCT_LABELS[code] || code}` };
    }
    seen.add(code);
    codes.push(code as EadRoutingProductCode);
  }
  // Catalogue order
  const ordered = EAD_ROUTING_PRODUCT_CODES.filter((c) => seen.has(c));
  return { ok: true, codes: ordered };
}

export function buildEadFollowOnUnderstanding(input: {
  organisationName: string;
  eadReference: string;
  selectedLabels: string[];
}): string {
  const list = input.selectedLabels.map((label) => `• ${label}`).join('\n');
  return [
    `<p>Our understanding is based on the Executive Advisory Diagnostic completed for <strong>${escapeHtml(input.organisationName)}</strong> (${escapeHtml(input.eadReference)}), which identified specific assurance gaps requiring further focused assessment.</p>`,
    `<p>The following engagements were selected for this comprehensive proposal:</p>`,
    `<p>${list.replaceAll('\n', '<br/>')}</p>`,
    `<p>Physical Risk will refine understanding, scope, methodology and commercial terms during proposal preparation.</p>`,
  ].join('\n');
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildEadFollowOnFeeLineItems(
  codes: readonly string[],
  analystHourlyRate = 985,
): Array<{
  id: string;
  phase: string;
  description: string;
  hours: null;
  rate: number;
  fee: number;
  sequence: number;
}> {
  const rate = Number(analystHourlyRate) > 0 ? Number(analystHourlyRate) : 985;
  return codes.map((code, index) => ({
    id: `ead-followon-${code}`,
    phase: String(index + 1),
    description: PRODUCT_LABELS[code] || code.replaceAll('_', ' '),
    hours: null,
    rate,
    fee: 0,
    sequence: index + 1,
  }));
}

export function buildEadFollowOnIndicativeScope(codes: readonly string[]): string {
  const items = codes
    .map((code) => `• ${PRODUCT_LABELS[code] || code.replaceAll('_', ' ')}`)
    .join('\n');
  return `This comprehensive proposal covers the following focused assurance engagements:\n${items}`;
}
