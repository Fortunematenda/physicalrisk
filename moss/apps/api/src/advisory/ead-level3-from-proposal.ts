/**
 * Stage 13 — Accepted proposal → Level 3 engagement helpers.
 */

import {
  EAD_ROUTING_PRODUCT_CODES,
  PRODUCT_LABELS,
  isLegacyShield360ProductCode,
  type EadRoutingProductCode,
} from '@moss/shared';

const ROUTING_SET = new Set<string>(EAD_ROUTING_PRODUCT_CODES);

export type Level3DeliveryProductCode = EadRoutingProductCode;

export function validateLevel3DeliveryProductCodes(raw: unknown): {
  ok: true;
  codes: Level3DeliveryProductCode[];
} | { ok: false; error: string } {
  if (!Array.isArray(raw) || !raw.length) {
    return { ok: false, error: 'Select at least one Level 3 engagement to create.' };
  }
  const seen = new Set<string>();
  const codes: Level3DeliveryProductCode[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) {
      return { ok: false, error: `Invalid product code: ${String(item)}` };
    }
    const code = item.trim();
    if (isLegacyShield360ProductCode(code)) {
      return { ok: false, error: 'Shield 360 cannot be created as a Level 3 engagement.' };
    }
    if (!ROUTING_SET.has(code)) {
      return { ok: false, error: `Unsupported or inactive Level 3 product: ${code}` };
    }
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code as Level3DeliveryProductCode);
  }
  return {
    ok: true,
    codes: EAD_ROUTING_PRODUCT_CODES.filter((c) => seen.has(c)),
  };
}

export function level3EngagementHref(productCode: string, assessmentId: string): string {
  if (productCode === 'SCLI_COST_LEAKAGE') return `/assessments/${assessmentId}`;
  return `/advisory/${assessmentId}`;
}

/** EAD comprehensive proposal workspace — stays under Diagnostics & assurance, not triage. */
export function eadProposalWorkspaceHref(
  eadAssessmentId: string,
  proposalId: string,
  publicLeadId: string,
): string {
  const q = new URLSearchParams({
    proposalId,
    leadId: publicLeadId,
  });
  return `/advisory/${eadAssessmentId}/proposal?${q.toString()}`;
}

export function level3ProductLabel(code: string): string {
  return PRODUCT_LABELS[code] || code.replaceAll('_', ' ');
}

export type Level3SourceFinding = {
  moduleCode: string;
  moduleName: string;
  finding: string | null;
  businessConsequences: string | null;
  requiredDecision: string | null;
  // Explicitly never include analystNote / Internal Consultant Note.
};

export function buildLevel3SourceContext(input: {
  proposalId: string;
  proposalNumber: string;
  productCode: string;
  ead: { id: string; reference: string };
  triageReference?: string | null;
  report?: { id: string; version: number } | null;
  sourceModules?: Array<{ moduleCode?: string; moduleName?: string }>;
  findings?: Level3SourceFinding[];
}): Record<string, unknown> {
  return {
    capturedAt: new Date().toISOString(),
    proposalId: input.proposalId,
    proposalNumber: input.proposalNumber,
    productCode: input.productCode,
    productLabel: level3ProductLabel(input.productCode),
    eadAssessmentId: input.ead.id,
    eadReference: input.ead.reference,
    triageReference: input.triageReference || null,
    reportId: input.report?.id || null,
    reportVersion: input.report?.version ?? null,
    sourceModules: input.sourceModules || [],
    findings: (input.findings || []).map((f) => ({
      moduleCode: f.moduleCode,
      moduleName: f.moduleName,
      finding: f.finding,
      businessConsequences: f.businessConsequences,
      requiredDecision: f.requiredDecision,
    })),
  };
}

/** Human status for delivery list (DRAFT ≈ not started). */
export function level3DeliveryStatusLabel(status: string): string {
  if (status === 'DRAFT') return 'Not started';
  if (status === 'IN_PROGRESS') return 'In progress';
  return status.replaceAll('_', ' ');
}
