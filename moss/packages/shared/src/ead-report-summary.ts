/**
 * Executive Advisory Diagnostic — deterministic report summary builders (Stage 6).
 *
 * All narrative is derived from saved assessment data. No invented findings.
 */

import {
  ASSURANCE_BAND_THRESHOLDS,
  clampScore,
  exposureToAssuranceScore,
  getAssuranceBand,
  resolveEgtAssuranceVisual,
  type AssuranceBand,
  type EgtAssuranceVisual,
} from './egt-assurance-scoring';
import {
  EAD_BUSINESS_CONSEQUENCE_OPTIONS,
  formatBusinessConsequenceLabels,
  parseBusinessConsequenceCodes,
  type EadBusinessConsequenceCode,
} from './ead-business-consequences';
import {
  EAD_LIKERT_OPTIONS,
  parseDiagnosticResponses,
  type EadDiagnosticResponseSnapshot,
} from './ead-diagnostic-scoring';
import { isLegacyShield360ProductCode, PRODUCT_LABELS } from './product-architecture';
import { richTextToPlainText } from './ead-rich-text';

/** Modules below this assurance score appear under priority executive attention. */
export const EAD_PRIORITY_ASSURANCE_THRESHOLD = ASSURANCE_BAND_THRESHOLDS.MODERATE_ASSURANCE;

export type EadReportModuleInput = {
  moduleCode: string;
  moduleName: string;
  principalQuestion: string;
  exposureRating?: number | null;
  diagnosticResponses?: unknown;
  finding?: string | null;
  evidenceSummary?: string | null;
  businessConsequence?: string | null;
  businessConsequences?: unknown;
  businessConsequenceDetail?: string | null;
  otherBusinessConsequence?: string | null;
  accountableExecutive?: string | null;
  requiredDecision?: string | null;
  recommendedProduct?: string | null;
  analystNote?: string | null;
};

export type EadReportEvidenceInput = {
  id: string;
  fileName: string;
  title?: string | null;
  moduleCode?: string | null;
};

export type EadReportQuestionInput = {
  moduleCode: string;
  questionCode: string;
  title: string;
  questionText: string;
  displayOrder: number;
  isActive: boolean;
  allowNa?: boolean;
};

export type EadReportRouteInput = {
  productCode: string;
  priority?: string | null;
  rationale?: string | null;
};

export type EadModuleScoreRow = {
  moduleCode: string;
  moduleName: string;
  assuranceScore: number | null;
  exposureIndicator: number | null;
  band: AssuranceBand | null;
  visual: EgtAssuranceVisual | null;
  findingPlain: string;
  requiredDecisionPlain: string;
  requiredDecisionHtml: string;
  evidenceSummaryPlain: string;
  accountableExecutive: string;
  recommendedProductCode: string | null;
  recommendedProductLabel: string | null;
  consequenceCodes: EadBusinessConsequenceCode[];
  consequenceLabels: string[];
  consequenceDetailPlain: string;
  diagnostic: EadDiagnosticResponseSnapshot | null;
};

export type EadPriorityArea = {
  moduleCode: string;
  moduleName: string;
  assuranceScore: number;
  band: AssuranceBand;
  visual: EgtAssuranceVisual;
  keyFinding: string;
};

export type EadConsequenceAggregate = {
  code: string;
  label: string;
  moduleCount: number;
};

export type EadRecommendedProduct = {
  productCode: string;
  label: string;
  source: 'confirmed_route' | 'module';
  rationale?: string | null;
};

export type EadEvidenceRef = {
  appendixLabel: string;
  title: string;
  fileName: string;
  moduleCode?: string | null;
};

export type EadExecutiveDecisionItem = {
  moduleName: string;
  decisionHtml: string;
  decisionPlain: string;
  assuranceScore: number | null;
};

export type EadReportSummary = {
  moduleScores: EadModuleScoreRow[];
  overallAssuranceScore: number | null;
  overallBand: AssuranceBand | null;
  overallVisual: EgtAssuranceVisual | null;
  executiveNarrative: string;
  priorityAreas: EadPriorityArea[];
  consequences: EadConsequenceAggregate[];
  executiveDecisions: EadExecutiveDecisionItem[];
  recommendations: EadRecommendedProduct[];
  evidence: EadEvidenceRef[];
  assuranceScaleLegend: Array<{ range: string; label: string }>;
};

function likertLabel(value: string): string {
  const hit = EAD_LIKERT_OPTIONS.find((o) => o.value === value);
  return hit?.label || value;
}

export function resolveModuleAssuranceScore(module: EadReportModuleInput): {
  assuranceScore: number | null;
  exposureIndicator: number | null;
  diagnostic: EadDiagnosticResponseSnapshot | null;
} {
  const diagnostic = parseDiagnosticResponses(module.diagnosticResponses);
  if (diagnostic?.calculatedAssuranceScore != null && Number.isFinite(diagnostic.calculatedAssuranceScore)) {
    const assuranceScore = clampScore(Number(diagnostic.calculatedAssuranceScore));
    return {
      assuranceScore,
      exposureIndicator:
        diagnostic.calculatedExposureIndicator == null
          ? exposureToAssuranceScore(assuranceScore)
          : clampScore(Number(diagnostic.calculatedExposureIndicator)),
      diagnostic,
    };
  }
  if (module.exposureRating != null && Number.isFinite(Number(module.exposureRating))) {
    const exposureIndicator = clampScore(Number(module.exposureRating));
    return {
      assuranceScore: exposureToAssuranceScore(exposureIndicator),
      exposureIndicator,
      diagnostic,
    };
  }
  return { assuranceScore: null, exposureIndicator: null, diagnostic };
}

export function buildEadModuleScoreRows(modules: EadReportModuleInput[]): EadModuleScoreRow[] {
  return modules.map((m) => {
    const { assuranceScore, exposureIndicator, diagnostic } = resolveModuleAssuranceScore(m);
    const codes = parseBusinessConsequenceCodes(m.businessConsequences);
    const consequenceLabels = codes.length
      ? formatBusinessConsequenceLabels(codes, m.otherBusinessConsequence)
      : m.businessConsequence?.trim()
        ? [m.businessConsequence.trim()]
        : [];
    const productCode = String(m.recommendedProduct || '').trim() || null;
    const safeProduct =
      productCode && !isLegacyShield360ProductCode(productCode) ? productCode : null;
    return {
      moduleCode: m.moduleCode,
      moduleName: m.moduleName,
      assuranceScore,
      exposureIndicator,
      band: assuranceScore == null ? null : getAssuranceBand(assuranceScore),
      visual: assuranceScore == null ? null : resolveEgtAssuranceVisual(assuranceScore),
      findingPlain: richTextToPlainText(String(m.finding || '')).trim(),
      requiredDecisionPlain: richTextToPlainText(String(m.requiredDecision || '')).trim(),
      requiredDecisionHtml: String(m.requiredDecision || ''),
      evidenceSummaryPlain: richTextToPlainText(String(m.evidenceSummary || '')).trim(),
      accountableExecutive: String(m.accountableExecutive || '').trim(),
      recommendedProductCode: safeProduct,
      recommendedProductLabel: safeProduct
        ? PRODUCT_LABELS[safeProduct] || safeProduct.replaceAll('_', ' ')
        : null,
      consequenceCodes: codes,
      consequenceLabels,
      consequenceDetailPlain: richTextToPlainText(String(m.businessConsequenceDetail || '')).trim(),
      diagnostic,
    };
  });
}

/** Equal-weight average of modules that have an assurance score. */
export function calculateOverallEadAssuranceScore(rows: EadModuleScoreRow[]): number | null {
  const scores = rows
    .map((r) => r.assuranceScore)
    .filter((n): n is number => n != null && Number.isFinite(n));
  if (!scores.length) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

export function buildEadExecutiveNarrative(rows: EadModuleScoreRow[], overall: number | null): string {
  if (overall == null || !rows.length) {
    return 'Insufficient diagnostic scores were available to form an overall assurance conclusion.';
  }
  const band = getAssuranceBand(overall);
  const scored = rows
    .filter((r) => r.assuranceScore != null)
    .sort((a, b) => (a.assuranceScore as number) - (b.assuranceScore as number));
  const weaker = scored.filter((r) => (r.assuranceScore as number) < EAD_PRIORITY_ASSURANCE_THRESHOLD);
  const stronger = scored.filter((r) => (r.assuranceScore as number) >= ASSURANCE_BAND_THRESHOLDS.MODERATE_ASSURANCE);

  const weakNames = weaker.slice(0, 3).map((r) => r.moduleName);
  const strongNames = [...stronger]
    .sort((a, b) => (b.assuranceScore as number) - (a.assuranceScore as number))
    .slice(0, 3)
    .map((r) => r.moduleName);

  let text = `The diagnostic identified ${band.displayLabel.toLowerCase()} overall (assurance score ${overall}/100)`;
  if (weakNames.length) {
    text += `, with notable weaknesses in ${joinNames(weakNames)}`;
  }
  if (strongNames.length) {
    text += weakNames.length
      ? `. ${joinNames(strongNames)} showed comparatively stronger control maturity`
      : `, with comparatively stronger control maturity in ${joinNames(strongNames)}`;
  }
  text += '.';
  return text;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Priority areas: modules below the moderate assurance threshold, lowest first, max 3.
 */
export function selectEadPriorityAreas(rows: EadModuleScoreRow[], limit = 3): EadPriorityArea[] {
  return rows
    .filter(
      (r): r is EadModuleScoreRow & { assuranceScore: number; band: AssuranceBand; visual: EgtAssuranceVisual } =>
        r.assuranceScore != null &&
        r.band != null &&
        r.visual != null &&
        r.assuranceScore < EAD_PRIORITY_ASSURANCE_THRESHOLD,
    )
    .sort((a, b) => a.assuranceScore - b.assuranceScore)
    .slice(0, limit)
    .map((r) => ({
      moduleCode: r.moduleCode,
      moduleName: r.moduleName,
      assuranceScore: r.assuranceScore,
      band: r.band,
      visual: r.visual,
      keyFinding: r.findingPlain || 'No finding narrative recorded for this module.',
    }));
}

export function aggregateEadBusinessConsequences(rows: EadModuleScoreRow[]): EadConsequenceAggregate[] {
  const counts = new Map<string, { label: string; moduleCount: number }>();
  for (const row of rows) {
    if (row.consequenceCodes.length) {
      for (const code of row.consequenceCodes) {
        const label =
          EAD_BUSINESS_CONSEQUENCE_OPTIONS.find((o) => o.code === code)?.label || code;
        const prev = counts.get(code);
        counts.set(code, { label, moduleCount: (prev?.moduleCount || 0) + 1 });
      }
    } else {
      for (const label of row.consequenceLabels) {
        const key = `LEGACY:${label}`;
        const prev = counts.get(key);
        counts.set(key, { label, moduleCount: (prev?.moduleCount || 0) + 1 });
      }
    }
  }
  return [...counts.entries()]
    .map(([code, v]) => ({ code, label: v.label, moduleCount: v.moduleCount }))
    .sort((a, b) => b.moduleCount - a.moduleCount || a.label.localeCompare(b.label));
}

export function collectEadExecutiveDecisions(rows: EadModuleScoreRow[]): EadExecutiveDecisionItem[] {
  const priorityCodes = new Set(
    selectEadPriorityAreas(rows, 6).map((p) => p.moduleCode),
  );
  const withDecisions = rows.filter((r) => r.requiredDecisionPlain);
  const preferred = withDecisions.filter(
    (r) =>
      priorityCodes.has(r.moduleCode) ||
      (r.assuranceScore != null && r.assuranceScore < EAD_PRIORITY_ASSURANCE_THRESHOLD),
  );
  const source = preferred.length ? preferred : withDecisions;
  return source.map((r) => ({
    moduleName: r.moduleName,
    decisionHtml: r.requiredDecisionHtml,
    decisionPlain: r.requiredDecisionPlain,
    assuranceScore: r.assuranceScore,
  }));
}

export function collectEadRecommendations(
  rows: EadModuleScoreRow[],
  routes?: EadReportRouteInput[] | null,
): EadRecommendedProduct[] {
  const out: EadRecommendedProduct[] = [];
  const seen = new Set<string>();

  for (const route of routes || []) {
    const code = String(route.productCode || '').trim();
    if (!code || isLegacyShield360ProductCode(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({
      productCode: code,
      label: PRODUCT_LABELS[code] || code.replaceAll('_', ' '),
      source: 'confirmed_route',
      rationale: route.rationale || null,
    });
  }

  for (const row of rows) {
    const code = row.recommendedProductCode;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      productCode: code,
      label: row.recommendedProductLabel || PRODUCT_LABELS[code] || code,
      source: 'module',
      rationale: null,
    });
  }

  return out;
}

export function buildEadEvidenceReferences(evidence: EadReportEvidenceInput[]): EadEvidenceRef[] {
  return evidence.map((e, index) => {
    const letter = String.fromCharCode(65 + (index % 26));
    const suffix = index >= 26 ? String(Math.floor(index / 26)) : '';
    return {
      appendixLabel: `Appendix ${letter}${suffix}`,
      title: String(e.title || e.fileName || 'Supporting document').trim(),
      fileName: e.fileName,
      moduleCode: e.moduleCode || null,
    };
  });
}

export function eadAssuranceScaleLegend(): Array<{ range: string; label: string }> {
  return [
    { range: `0–${ASSURANCE_BAND_THRESHOLDS.SIGNIFICANT_IMPROVEMENT - 1}`, label: 'Requires priority intervention' },
    {
      range: `${ASSURANCE_BAND_THRESHOLDS.SIGNIFICANT_IMPROVEMENT}–${ASSURANCE_BAND_THRESHOLDS.MODERATE_ASSURANCE - 1}`,
      label: 'Significant improvement required',
    },
    {
      range: `${ASSURANCE_BAND_THRESHOLDS.MODERATE_ASSURANCE}–${ASSURANCE_BAND_THRESHOLDS.STRONG_ASSURANCE - 1}`,
      label: 'Moderate assurance',
    },
    { range: `${ASSURANCE_BAND_THRESHOLDS.STRONG_ASSURANCE}–100`, label: 'Strong assurance' },
  ];
}

export function formatDiagnosticAnswerLabel(value: string | null | undefined): string {
  if (!value) return 'Not answered';
  return likertLabel(value);
}

export function buildEadReportSummary(input: {
  modules: EadReportModuleInput[];
  evidence?: EadReportEvidenceInput[];
  routes?: EadReportRouteInput[] | null;
}): EadReportSummary {
  const moduleScores = buildEadModuleScoreRows(input.modules);
  const overallAssuranceScore = calculateOverallEadAssuranceScore(moduleScores);
  return {
    moduleScores,
    overallAssuranceScore,
    overallBand: overallAssuranceScore == null ? null : getAssuranceBand(overallAssuranceScore),
    overallVisual:
      overallAssuranceScore == null ? null : resolveEgtAssuranceVisual(overallAssuranceScore),
    executiveNarrative: buildEadExecutiveNarrative(moduleScores, overallAssuranceScore),
    priorityAreas: selectEadPriorityAreas(moduleScores),
    consequences: aggregateEadBusinessConsequences(moduleScores),
    executiveDecisions: collectEadExecutiveDecisions(moduleScores),
    recommendations: collectEadRecommendations(moduleScores, input.routes),
    evidence: buildEadEvidenceReferences(input.evidence || []),
    assuranceScaleLegend: eadAssuranceScaleLegend(),
  };
}
