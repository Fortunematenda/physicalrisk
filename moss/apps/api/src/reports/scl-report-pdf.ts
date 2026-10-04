import PDFDocument from 'pdfkit';
import {
  assuranceCategoryInterpretation,
  assuranceDimensionTierLabel,
  deriveEgtAssurancePresentation,
  formatClientEstimatedLosses,
  formatZar,
  getRiskBand,
  rankEgtWarningIndicators,
  resolveEgtAssuranceVisual,
  type RiskBand,
} from '@moss/shared';
import type { SclReportBrandConfig } from './scl-report-branding';
import { resolveSclClassificationVisual } from './scl-report-visual';

const INK = '#111111';
/** Secondary copy on white — darker charcoal for print legibility (was #666666). */
const MUTED = '#333333';
const CHAR = '#1f1f1f';
const PAGE_MARGIN = 48;
const TOP_BAR_H = 10;

const MATURITY_ROW = {
  best: { bg: '#e7f4ea', text: '#1b5e20', label: 'Best practice' },
  acceptable: { bg: '#fff3d9', text: '#9a3412', label: 'Acceptable' },
  weak: { bg: '#fde8e8', text: '#9f1239', label: 'Weak' },
  critical: { bg: '#f7dada', text: '#7f1d1d', label: 'Critical failure' },
} as const;

export type SclPdfScoringMatrixPanel = {
  title: string;
  code?: string;
  rows: Array<{
    maturityLabel: string;
    description: string;
    riskScore: number;
    tone: keyof typeof MATURITY_ROW;
    selected?: boolean;
  }>;
  hasSelection?: boolean;
};

export type SclPdfRenderInput = {
  brand: SclReportBrandConfig;
  logoPath?: string | null;
  /** Product that owns this PDF. Triage keeps the Level 1 indication layout. */
  productCode?: string | null;
  companyName: string;
  reference: string;
  assessmentTitle?: string | null;
  assessmentStatus?: string | null;
  assessmentDateLabel: string;
  reportTitle: string;
  isPreliminary: boolean;
  modelVersion: string;
  analystNote?: string | null;
  evidenceSummary?: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
  } | null;
  calibrationInputs?: Array<{ label: string; value: string; percent?: number }>;
  findings?: Array<{ title: string; category?: string | null; description?: string | null }>;
  overallRiskScore: number;
  maturityScore: number;
  riskBand: RiskBand | string;
  methodologyConfidence: number;
  evidenceConfidence: number;
  opportunityScore: number;
  prospectName?: string | null;
  selectedServices?: string | null;
  leakage: {
    estimatedLossesLow?: unknown;
    estimatedLossesHigh?: unknown;
    estimatedLossesLowBand?: unknown;
    estimatedLossesHighBand?: unknown;
    minimumLeakageValue: number;
    minimumLeakageRate: number;
    likelyLeakageValue: number;
    likelyLeakageRate: number;
    maximumExposureValue: number;
    maximumExposureRate: number;
    recoverableLow: number;
    recoverableHigh: number;
  };
  categoryScores: Array<{ category: string; score: number }>;
  recommendations: Array<{
    title: string;
    priority: string;
    summary: string;
    serviceOffering?: string | null;
    suggestedNextStep?: string | null;
    includeInReport?: boolean;
  }>;
  scoringMatrix?: SclPdfScoringMatrixPanel[];
};

function diagnosisLabel(band: RiskBand | string): string {
  switch (String(band)) {
    case 'Controlled':
      return 'Controlled cost leakage profile indicated';
    case 'Moderate':
      return 'Material cost leakage exposure indicated';
    case 'High':
      return 'Significant cost leakage exposure indicated';
    case 'Critical':
      return 'Critical cost leakage exposure indicated';
    default:
      return 'Cost leakage assessment result';
  }
}

type PdfScoreContext = {
  displayScore: number;
  displayBand: string;
  displayCategories: Array<{ category: string; score: number }>;
  accentHex: string;
  bandIndex: 0 | 1 | 2 | 3;
  diagnosis: string;
  scoreHeading: string;
  dimensionsTitle: string;
  prioritiesTitle: string;
  lampLabels: string[];
  lampColours: string[];
  categoryInterpretation: (category: string, score: number) => string;
  dimensionValueLabel: (score: number) => string;
  barColourForScore: (score: number) => string;
  priorityCategories: Array<{ category: string; score: number }>;
};

export function isCostLeakageReport(input: { productCode?: string | null }): boolean {
  return String(input.productCode || '') === 'SCLI_COST_LEAKAGE';
}

/** Next valid Cost Leakage states already implemented on the assessment workflow. */
export function costLeakageNextSteps(status: string | null | undefined, isPreliminary: boolean): string[] {
  if (!isPreliminary) {
    return [
      'Issue this approved report to the client when it has not yet been issued.',
      'Keep recommendations and evidence on this assessment record.',
    ];
  }
  const current = String(status || '').toUpperCase();
  if (current === 'REVIEWED') {
    return [
      'Approve the assessment once scoring and evidence review are accepted.',
      'Generate the final Security Cost Leakage report after approval.',
    ];
  }
  if (current === 'APPROVED' || current === 'REPORT_GENERATED' || current === 'REPORT_ISSUED') {
    return ['Generate or issue the final Security Cost Leakage report. This file is the preliminary indication only.'];
  }
  return [
    'Continue evidence validation and accept or reject outstanding evidence.',
    'Complete analyst review and mark the assessment reviewed.',
    'Approve the assessment when those review steps are complete.',
    'Generate the final Security Cost Leakage report after approval.',
  ];
}

export function costLeakageCategoryInterpretation(category: string, score: number): string {
  const name = String(category || 'This area').trim() || 'This area';
  const band = getRiskBand(Number(score) || 0);
  if (band === 'Controlled') return `${name} shows lower cost-leakage exposure on the recorded responses.`;
  if (band === 'Moderate') return `${name} shows moderate cost-leakage exposure and should be checked against evidence.`;
  if (band === 'High') return `${name} shows elevated cost-leakage exposure and should be prioritised in analyst review.`;
  return `${name} shows critical cost-leakage exposure and should be treated as a priority finding.`;
}

function buildPdfScoreContext(input: SclPdfRenderInput): PdfScoreContext {
  if (isCostLeakageReport(input) || !input.isPreliminary) {
    const visual = resolveSclClassificationVisual(input.riskBand || input.overallRiskScore);
    const rows = (input.categoryScores || []).length
      ? input.categoryScores
      : [{ category: 'Overall', score: Number(input.overallRiskScore) || 0 }];
    return {
      displayScore: Number(input.overallRiskScore) || 0,
      displayBand: String(input.riskBand || visual.band),
      displayCategories: rows.map((row) => ({
        category: String(row.category || ''),
        score: Number(row.score) || 0,
      })),
      accentHex: visual.colourHex,
      bandIndex: visual.bandIndex,
      diagnosis: diagnosisLabel(input.riskBand || visual.band),
      scoreHeading: 'SECURITY COST LEAKAGE EXPOSURE',
      dimensionsTitle: 'Exposure dimensions',
      prioritiesTitle: 'Priority exposure indicators',
      lampLabels: ['CONTROLLED', 'MODERATE', 'HIGH', 'CRITICAL'],
      lampColours: [
        resolveSclClassificationVisual('Controlled').colourHex,
        resolveSclClassificationVisual('Moderate').colourHex,
        resolveSclClassificationVisual('High').colourHex,
        resolveSclClassificationVisual('Critical').colourHex,
      ],
      categoryInterpretation: costLeakageCategoryInterpretation,
      dimensionValueLabel: (score) => {
        const band = getRiskBand(score);
        if (band === 'Critical') return 'Priority';
        if (band === 'High') return 'Elevated';
        if (band === 'Moderate') return 'Watch';
        return 'Lower';
      },
      barColourForScore: (score) => resolveSclClassificationVisual(score).colourHex,
      priorityCategories: [...rows].sort((a, b) => Number(b.score) - Number(a.score)),
    };
  }

  const presentation =
    deriveEgtAssurancePresentation({
      overallRiskScore: input.overallRiskScore,
      maturityScore: input.maturityScore,
      categoryScores: input.categoryScores || [],
    }) ||
    deriveEgtAssurancePresentation({
      overallRiskScore: input.overallRiskScore,
      categoryScores: input.categoryScores || [],
    });

  const visual = presentation?.visual || resolveEgtAssuranceVisual(0);
  const displayCategories = (presentation?.categoryScores || []).map((row) => ({
    category: row.category,
    score: row.assuranceScore,
  }));
  const warningRows = presentation
    ? rankEgtWarningIndicators(presentation.categoryScores).map((row) => ({
        category: row.category,
        score: row.assuranceScore,
      }))
    : displayCategories;

  return {
    displayScore: presentation?.assuranceScore ?? Number(input.maturityScore) ?? 0,
    displayBand: presentation?.assuranceBand.displayLabel || '—',
    displayCategories,
    accentHex: visual.colourHex,
    bandIndex: visual.bandIndex,
    diagnosis: presentation?.diagnosis || 'Preliminary indication complete',
    scoreHeading: 'ASSURANCE SCORE',
    dimensionsTitle: 'Assurance dimensions',
    prioritiesTitle: 'Strongest warning indicators',
    lampLabels: ['PRIORITY', 'IMPROVE', 'MODERATE', 'STRONG'],
    lampColours: [
      resolveEgtAssuranceVisual(10).colourHex,
      resolveEgtAssuranceVisual(45).colourHex,
      resolveEgtAssuranceVisual(65).colourHex,
      resolveEgtAssuranceVisual(90).colourHex,
    ],
    categoryInterpretation: assuranceCategoryInterpretation,
    dimensionValueLabel: assuranceDimensionTierLabel,
    barColourForScore: (score) => resolveEgtAssuranceVisual(score).colourHex,
    priorityCategories: warningRows,
  };
}

/** Short executive copy for priority cards — presentation only; no scoring changes. */
export function categoryInterpretation(category: string, score: number): string {
  const band = getRiskBand(Number(score) || 0);
  if (band === 'Controlled') {
    return 'Responses indicate relatively stronger control indicators; independent validation remains decision-support only.';
  }
  if (band === 'Moderate') {
    return 'Assurance may not be consistently matched to independently verifiable delivery evidence.';
  }
  if (band === 'High') {
    return 'Elevated leakage or underperformance indicators warrant focused independent validation.';
  }
  return 'Critical exposure indicators require priority independent review.';
}

export function maturityToneForRiskScore(riskScore: number): keyof typeof MATURITY_ROW {
  const band = getRiskBand(riskScore);
  if (band === 'Controlled') return 'best';
  if (band === 'Moderate') return 'acceptable';
  if (band === 'High') return 'weak';
  return 'critical';
}

export function buildScoringMatrixPanels(
  questions: Array<{
    id?: string | null;
    text?: string | null;
    code?: string | null;
    options?: Array<{ id?: string | null; label: string; riskScore: number }>;
    selectedOptionId?: string | null;
  }>,
  opts?: { answeredOnly?: boolean },
): SclPdfScoringMatrixPanel[] {
  const answeredOnly = opts?.answeredOnly !== false;
  return (questions || [])
    .map((q) => {
      const options = [...(q.options || [])].sort((a, b) => Number(a.riskScore) - Number(b.riskScore));
      if (!options.length) return null;
      const selectedId = q.selectedOptionId ? String(q.selectedOptionId) : '';
      const rows = options.map((opt) => {
        const tone = maturityToneForRiskScore(Number(opt.riskScore));
        const selected = Boolean(selectedId && opt.id && String(opt.id) === selectedId);
        return {
          maturityLabel: MATURITY_ROW[tone].label,
          description: String(opt.label || '').trim(),
          riskScore: Number(opt.riskScore),
          tone,
          selected,
        };
      });
      const hasSelection = rows.some((r) => r.selected);
      if (answeredOnly && !hasSelection) return null;
      return {
        title: String(q.text || q.code || 'Question').trim(),
        code: q.code ? String(q.code) : undefined,
        rows: hasSelection ? rows.filter((r) => r.selected) : rows,
        hasSelection,
      };
    })
    .filter(Boolean) as SclPdfScoringMatrixPanel[];
}

function brandRed(brand: SclReportBrandConfig): string {
  return brand.brandColor || '#df0b12';
}

function formatDateTimeLabel(raw: string): string {
  const s = String(raw || '').trim();
  return s || '—';
}

function drawTopBar(doc: PDFKit.PDFDocument, brand: SclReportBrandConfig): void {
  const RED = brandRed(brand);
  doc.rect(0, 0, doc.page.width, TOP_BAR_H).fill(RED);
}

function drawPageHeader(doc: PDFKit.PDFDocument, input: SclPdfRenderInput): number {
  const pageW = doc.page.width;
  const x = PAGE_MARGIN;
  const RED = brandRed(input.brand);
  let y = TOP_BAR_H + 20;
  const logoH = 42;
  let logoBottom = y + logoH;

  if (input.logoPath) {
    try {
      // Full wordmark asset already includes "physicalrisk" + tagline — do not draw text over it.
      doc.image(input.logoPath, x, y, { height: logoH });
      logoBottom = y + logoH;
    } catch {
      doc.rect(x, y, logoH, logoH).fill(RED);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
        .text('PHYSICAL RISK', x + logoH + 10, y + 4, { lineBreak: false });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7)
        .text('INDEPENDENT EXECUTIVE SECURITY ADVISORY', x + logoH + 10, y + 22, {
          characterSpacing: 0.5,
          lineBreak: false,
        });
    }
  } else {
    doc.rect(x, y, logoH, logoH).fill(RED);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
      .text('PHYSICAL RISK', x + logoH + 10, y + 4, { lineBreak: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text('INDEPENDENT EXECUTIVE SECURITY ADVISORY', x + logoH + 10, y + 22, {
        characterSpacing: 0.5,
        lineBreak: false,
      });
  }

  const contact = [
    input.brand.websiteDisplay?.startsWith('www.')
      ? input.brand.websiteDisplay
      : `www.${(input.brand.websiteDisplay || 'physicalrisk.com').replace(/^www\./, '')}`,
    input.brand.email,
    input.brand.phone,
  ].join('  |  ');
  doc.fillColor(MUTED).font('Helvetica').fontSize(8)
    .text(contact, x, y + 6, {
      width: pageW - PAGE_MARGIN * 2,
      align: 'right',
      lineBreak: false,
    });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7)
    .text('Independent Executive Security Advisory', x, y + 20, {
      width: pageW - PAGE_MARGIN * 2,
      align: 'right',
      lineBreak: false,
    });

  const ruleY = logoBottom + 14;
  doc.moveTo(x, ruleY).lineTo(pageW - PAGE_MARGIN, ruleY).lineWidth(1.5).strokeColor(RED).stroke();
  return ruleY + 22;
}

/**
 * Page 1 body matching the supplied EGT visual sample (SCL data).
 */
function drawPageOneBody(
  doc: PDFKit.PDFDocument,
  input: SclPdfRenderInput,
  scoreContext: PdfScoreContext,
  y: number,
): void {
  const pageW = doc.page.width;
  const contentW = pageW - PAGE_MARGIN * 2;
  const x = PAGE_MARGIN;
  const RED = brandRed(input.brand);
  const accent = scoreContext.accentHex || RED;

  const costLeakage = isCostLeakageReport(input);
  doc.fillColor(RED).font('Helvetica-Bold').fontSize(9)
    .text(
      costLeakage
        ? (input.isPreliminary ? 'PRELIMINARY SECURITY COST LEAKAGE INDICATION' : 'SECURITY COST LEAKAGE ASSESSMENT')
        : 'COMPLIMENTARY PRELIMINARY INDICATION',
      x,
      y,
      { characterSpacing: 1.1, lineBreak: false },
    );
  y += 22;

  const coverTitle = costLeakage
    ? (input.isPreliminary ? 'Security Cost Leakage Indication' : 'Security Cost Leakage Assessment Report')
    : (input.isPreliminary ? 'Executive Governance Indication' : 'Security Cost Leakage Assessment Report');
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(costLeakage ? 24 : 28)
    .text(coverTitle, x, y, { width: contentW });
  y = doc.y + 16;

  const half = contentW / 2;
  const dateLabel = formatDateTimeLabel(input.assessmentDateLabel);
  const leftMeta: Array<[string, string]> = [
    ['Prepared for', String(input.prospectName || 'Client executive').trim() || '—'],
    ['Organisation', input.companyName || '—'],
  ];
  const rightMeta: Array<[string, string]> = [
    ['Date', dateLabel],
    ['Reference', input.reference || '—'],
  ];
  if (costLeakage) {
    if (input.assessmentTitle) leftMeta.push(['Assessment', input.assessmentTitle]);
    rightMeta.push(['Methodology', input.modelVersion || '—']);
  }
  const metaRows = Math.max(leftMeta.length, rightMeta.length);
  leftMeta.forEach(([label, value], i) => {
    const rowY = y + i * 16;
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text(`${label}: `, x, rowY, { continued: true, lineBreak: false });
    doc.fillColor(INK).text(value, { lineBreak: false });
  });
  rightMeta.forEach(([label, value], i) => {
    const rowY = y + i * 16;
    doc.fillColor(MUTED).font('Helvetica').fontSize(10)
      .text(`${label}: `, x + half, rowY, { continued: true, lineBreak: false });
    doc.fillColor(INK).text(value, { lineBreak: false });
  });
  y += metaRows * 16 + 16;

  // Score banner — solid classification colour left / charcoal right (EGT sample layout)
  const leftW = Math.round(contentW * 0.28);
  const panelH = 112;
  doc.rect(x, y, leftW, panelH).fill(accent);
  doc.rect(x + leftW, y, contentW - leftW, panelH).fill(CHAR);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
    .text(input.isPreliminary ? scoreContext.scoreHeading : 'SECURITY COST LEAKAGE EXPOSURE', x + 16, y + 18, {
      width: leftW - 28,
      characterSpacing: 0.5,
    });

  const scoreValue = Number(scoreContext.displayScore);
  const scoreLabel = Number.isFinite(scoreValue) ? Math.round(scoreValue).toString() : '—';
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(46)
    .text(scoreLabel, x + 16, y + 42, { width: leftW - 70, lineBreak: false });
  if (Number.isFinite(scoreValue)) {
    const scoreWidth = doc.widthOfString(scoreLabel);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
      .text('/100', x + 16 + scoreWidth + 3, y + 68, { lineBreak: false });
  }
  const bandLabel = String(scoreContext.displayBand || '').trim();
  if (bandLabel) {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
      .text(bandLabel.toUpperCase(), x + 16, y + 92, { width: leftW - 28, lineBreak: false });
  }

  const posX = x + leftW + 20;
  const posW = contentW - leftW - 36;
  doc.fillColor('#d8d8d8').font('Helvetica-Bold').fontSize(8)
    .text('PRELIMINARY POSITION', posX, y + 18, { width: posW, characterSpacing: 0.8 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
    .text(scoreContext.diagnosis, posX, y + 36, { width: posW, lineGap: 2 });
  const afterTitle = doc.y + 8;
  doc.fillColor('#ececec').font('Helvetica').fontSize(9)
    .text(
      costLeakage
        ? (input.isPreliminary
          ? 'This preliminary Security Cost Leakage indication uses this assessment’s scores and leakage result. It is not the final approved report.'
          : 'This approved Security Cost Leakage report uses this assessment’s scores, leakage result and recorded evidence.')
        : (input.isPreliminary
          ? 'This Level 1 questionnaire indicates where governance, assurance or expenditure concerns may warrant a paid Executive Advisory Diagnostic. It is not an assessment or audit conclusion.'
          : 'This Level 3 assessment indicates where security cost leakage requires evidence-led validation. Financial conclusions must be supported by the recorded evidence and confidence basis.'),
      posX,
      Math.max(afterTitle, y + 62),
      { width: posW, lineGap: 2 },
    );
  y += panelH + 18;

  // Four-segment risk lamp (executive scan)
  const lampGap = 8;
  const lampH = 12;
  const lampW = (contentW - lampGap * 3) / 4;
  const lampColours = scoreContext.lampColours;
  const lampLabels = scoreContext.lampLabels;
  lampColours.forEach((c, i) => {
    const lx = x + i * (lampW + lampGap);
    const active = i === scoreContext.bandIndex;
    doc.rect(lx, y, lampW, lampH).fill(active ? c : '#e8e8e8');
    doc.fillColor(active ? INK : MUTED).font(active ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
      .text(lampLabels[i], lx, y + lampH + 6, { width: lampW, align: 'center', lineBreak: false });
  });
  y += lampH + 28;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
    .text(scoreContext.dimensionsTitle, x, y);
  y = doc.y + 14;

  const labelW = 172;
  const labelGap = 16;
  const valueW = 28;
  const valueGap = 10;
  const barW = Math.max(80, contentW - labelW - labelGap - valueW - valueGap);
  const rowH = 22;
  const barH = 10;
  const fontSize = 10;
  const allRows = scoreContext.displayCategories.length
    ? scoreContext.displayCategories
    : [{ category: 'Overall', score: Number(scoreContext.displayScore) || 0 }];
  const rows = costLeakage ? allRows.slice(0, 6) : allRows;

  rows.forEach((row) => {
    const score = Math.max(0, Math.min(100, Math.round(Number(row.score) || 0)));
    const fillW = (barW * score) / 100;
    const barColour = scoreContext.barColourForScore(score);
    const barX = x + labelW + labelGap;
    const barY = y + (rowH - barH) / 2;
    // PDFKit y is text baseline — nudge so label/value sit on the same visual row as the bar.
    const textY = y + (rowH - fontSize) / 2 + 1;

    doc.fillColor(INK).font('Helvetica').fontSize(fontSize)
      .text(String(row.category || ''), x, textY, {
        width: labelW,
        lineBreak: false,
        ellipsis: true,
      });
    doc.rect(barX, barY, barW, barH).fill('#ececec');
    if (fillW > 0) {
      doc.rect(barX, barY, Math.max(fillW, 3), barH).fill(barColour);
    }
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(fontSize)
      .text(String(score), barX + barW + valueGap, textY, {
        width: valueW,
        align: 'right',
        lineBreak: false,
      });
    y += rowH + 8;
  });
  y += 18;

  const priorities = scoreContext.priorityCategories.slice(0, 3).map((c) => ({
    title: c.category,
    description: scoreContext.categoryInterpretation(c.category, Number(c.score)),
  }));
  if (!costLeakage) {
    while (priorities.length < 3) {
      priorities.push({
        title: 'Assurance',
        description: 'Further independent validation may be warranted across the security operating model.',
      });
    }
  }
  if (!priorities.length) return;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
    .text(scoreContext.prioritiesTitle, x, y);
  y = doc.y + 14;

  const gap = 18;
  const cardW = (contentW - gap * 2) / 3;
  const cardH = 120;
  priorities.forEach((card, i) => {
    const cx = x + i * (cardW + gap);
    doc.moveTo(cx, y).lineTo(cx + cardW, y).lineWidth(3).strokeColor(accent).stroke();
    doc.fillColor(accent).font('Helvetica-Bold').fontSize(13)
      .text(String(i + 1), cx, y + 12, { lineBreak: false });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11)
      .text(card.title, cx, y + 34, { width: cardW, lineGap: 1 });
    const titleBottom = doc.y + 8;
    doc.fillColor(CHAR).font('Helvetica').fontSize(9)
      .text(card.description, cx, titleBottom, { width: cardW, lineGap: 2 });
  });
}

/**
 * Page 2 — recommended next step + interpretation (exact sample structure).
 */
function drawPageTwo(doc: PDFKit.PDFDocument, input: SclPdfRenderInput): void {
  if (isCostLeakageReport(input)) {
    drawCostLeakageNextStep(doc, input);
    return;
  }
  drawTopBar(doc, input.brand);
  const pageW = doc.page.width;
  const contentW = pageW - PAGE_MARGIN * 2;
  const x = PAGE_MARGIN;
  const RED = brandRed(input.brand);
  let y = TOP_BAR_H + 48;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16)
    .text('Recommended next step', x, y);
  y = doc.y + 12;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22)
    .text('Convert the indication into defensible evidence.', x, y, { width: contentW });
  y = doc.y + 14;

  doc.fillColor(CHAR).font('Helvetica').fontSize(11)
    .text(
      'Commission a paid Executive Advisory Diagnostic to validate the highest-priority findings against contracts, ' +
        'expenditure, performance records and executive reporting.',
      x,
      y,
      { width: contentW, lineGap: 3 },
    );
  y = doc.y + 18;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
    .text(input.isPreliminary ? 'Recommended entry product: Executive Advisory Diagnostic' : `Focused assurance product: ${input.brand.productLine}™`, x, y, { width: contentW });
  y = doc.y + 22;

  // Prominent remedial CTA panel
  const label = input.brand.ctaLabel || 'REQUEST AN EXECUTIVE ADVISORY DIAGNOSTIC';
  const url = input.brand.ctaUrl || 'https://test.physicalrisk.com/#contact';
  const panelPad = 18;
  const btnH = 40;
  const panelH = panelPad + 36 + btnH + panelPad;
  doc.rect(x, y, contentW, panelH).fill('#f8f4f4');
  doc.moveTo(x, y).lineTo(x + 6, y).lineTo(x + 6, y + panelH).lineTo(x, y + panelH).fill(RED);

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
    .text('What we propose next', x + 20, y + panelPad, { width: contentW - 40 });
  doc.fillColor(CHAR).font('Helvetica').fontSize(10)
    .text(
      'Request a proposal for a paid Executive Advisory Diagnostic to validate the highest-priority findings.',
      x + 20,
      y + panelPad + 18,
      { width: contentW - 40 },
    );

  doc.font('Helvetica-Bold').fontSize(11);
  const textW = doc.widthOfString(label.toUpperCase());
  const btnW = Math.min(contentW - 40, Math.max(280, textW + 48));
  const btnY = y + panelPad + 36;
  doc.rect(x + 20, btnY, btnW, btnH).fill(RED);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
    .text(label.toUpperCase(), x + 20, btnY + 14, { width: btnW, align: 'center', lineBreak: false });
  doc.link(x + 20, btnY, btnW, btnH, url);
  y += panelH + 28;

  doc.moveTo(x, y).lineTo(x + contentW, y).lineWidth(1).strokeColor('#dddddd').stroke();
  y += 28;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14)
    .text('Important basis of interpretation', x, y);
  y = doc.y + 10;
  doc.fillColor(CHAR).font('Helvetica').fontSize(10)
    .text(
      input.isPreliminary
        ? 'This complimentary Level 1 output is generated from questionnaire responses supplied by the participant. It is triage and decision-support only: not an assessment, Security Cost Leakage Assessment™, diagnostic, audit, certification, legal opinion or independent assurance conclusion. Physical Risk has not tested supporting evidence at this stage.'
        : 'This report is an evidence-led Level 3 focused assurance output. Conclusions and financial values must be read together with the recorded evidence basis, limitations and confidence assessment.',
      x,
      y,
      { width: contentW, lineGap: 2.5 },
    );
}

function drawCostLeakageNextStep(doc: PDFKit.PDFDocument, input: SclPdfRenderInput): void {
  drawTopBar(doc, input.brand);
  const pageW = doc.page.width;
  const contentW = pageW - PAGE_MARGIN * 2;
  const x = PAGE_MARGIN;
  let y = TOP_BAR_H + 48;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text('Next step', x, y);
  y = doc.y + 12;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20)
    .text(
      input.isPreliminary
        ? 'Complete review before the final Cost Leakage report.'
        : 'This is the approved Security Cost Leakage report.',
      x,
      y,
      { width: contentW },
    );
  y = doc.y + 14;
  doc.fillColor(CHAR).font('Helvetica').fontSize(11)
    .text(
      input.isPreliminary
        ? 'This page stays on the Security Cost Leakage assessment. The preliminary indication does not commission another product.'
        : 'Financial conclusions must be read with the recorded evidence, calibration inputs and confidence basis on this assessment.',
      x,
      y,
      { width: contentW, lineGap: 3 },
    );
  y = doc.y + 16;

  for (const step of costLeakageNextSteps(input.assessmentStatus, input.isPreliminary)) {
    doc.fillColor(INK).font('Helvetica').fontSize(11).text(`•  ${step}`, x, y, { width: contentW, lineGap: 2 });
    y = doc.y + 8;
  }

  y += 12;
  doc.moveTo(x, y).lineTo(x + contentW, y).lineWidth(1).strokeColor('#dddddd').stroke();
  y += 20;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text('Basis of this report', x, y);
  y = doc.y + 10;
  doc.fillColor(CHAR).font('Helvetica').fontSize(10).text(
    input.isPreliminary
      ? 'This preliminary Security Cost Leakage output is generated from the questionnaire responses, calibration inputs and scoring snapshot for this assessment. It is not an Executive Advisory Diagnostic and it is not the final approved Cost Leakage report. Evidence that is still pending has not been independently accepted.'
      : 'This report is the approved Security Cost Leakage assessment output for the organisation and reference shown on the cover. It is distinct from the preliminary indication and from Executive Advisory or Executive Governance documents.',
    x,
    y,
    { width: contentW, lineGap: 2.5 },
  );
}

function ensureRoom(doc: PDFKit.PDFDocument, brand: SclReportBrandConfig, y: number, needed: number): number {
  if (y + needed <= doc.page.height - 42) return y;
  doc.addPage();
  drawTopBar(doc, brand);
  return TOP_BAR_H + 36;
}

function drawWrapped(
  doc: PDFKit.PDFDocument,
  brand: SclReportBrandConfig,
  text: string,
  x: number,
  y: number,
  width: number,
  size = 10,
): number {
  const next = ensureRoom(doc, brand, y, 36);
  doc.fillColor(CHAR).font('Helvetica').fontSize(size).text(text, x, next, { width, lineGap: 2 });
  return doc.y + 8;
}

function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  brand: SclReportBrandConfig,
  title: string,
  x: number,
  y: number,
): number {
  const next = ensureRoom(doc, brand, y, 28);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(title, x, next);
  return doc.y + 8;
}

function leakageTheme(category: string): string {
  const value = category.toLowerCase();
  if (value.includes('contract') || value.includes('sla')) return 'Contractual and SLA';
  if (value.includes('labour') || value.includes('deploy')) return 'Labour deployment';
  if (value.includes('technolog') || value.includes('verif')) return 'Technology';
  if (value.includes('expend') || value.includes('report') || value.includes('value') || value.includes('loss')) {
    return 'Expenditure, reporting and value';
  }
  return 'Other recorded areas';
}

function priorityTone(priority: string): { fill: string; ink: string } {
  const value = priority.toUpperCase();
  if (value === 'CRITICAL') return { fill: '#fde8e8', ink: '#9f1239' };
  if (value === 'HIGH') return { fill: '#fff3d9', ink: '#9a3412' };
  if (value === 'MEDIUM') return { fill: '#fff7ed', ink: '#c2410c' };
  return { fill: '#e7f4ea', ink: '#1b5e20' };
}

function drawPanel(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
): void {
  doc.roundedRect(x, y, w, h, 4).fill(fill);
}

function drawCostLeakageAnnex(doc: PDFKit.PDFDocument, input: SclPdfRenderInput): void {
  doc.addPage();
  drawTopBar(doc, input.brand);
  const contentW = doc.page.width - PAGE_MARGIN * 2;
  const x = PAGE_MARGIN;
  let y = TOP_BAR_H + 36;
  const gap = 8;
  const leakage = input.leakage;
  const likelyPct = Math.round(Number(leakage.likelyLeakageRate || 0) * 1000) / 10;

  y = drawSectionTitle(doc, input.brand, 'Cost leakage result', x, y);
  const heroH = 58;
  y = ensureRoom(doc, input.brand, y, heroH + 8);
  drawPanel(doc, x, y, contentW, heroH, '#fff5f6');
  doc.rect(x, y, 4, heroH).fill(brandRed(input.brand));
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('LIKELY LEAKAGE', x + 16, y + 10, { lineBreak: false });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(formatZar(leakage.likelyLeakageValue), x + 16, y + 24, { lineBreak: false });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
    .text(`${likelyPct}% of annual security spend`, x + 190, y + 28, { width: contentW - 210, align: 'right', lineBreak: false });
  y += heroH + gap;

  const halfW = (contentW - gap) / 2;
  const statH = 48;
  y = ensureRoom(doc, input.brand, y, statH);
  const stats = [
    { label: 'MINIMUM LEAKAGE', value: formatZar(leakage.minimumLeakageValue) },
    { label: 'MAXIMUM EXPOSURE', value: formatZar(leakage.maximumExposureValue) },
  ];
  stats.forEach((stat, index) => {
    const sx = x + index * (halfW + gap);
    drawPanel(doc, sx, y, halfW, statH, '#f6f7f8');
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(stat.label, sx + 12, y + 8, { width: halfW - 20, lineBreak: false });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(stat.value, sx + 12, y + 24, { width: halfW - 20, lineBreak: false });
  });
  y += statH + gap;

  y = ensureRoom(doc, input.brand, y, statH);
  drawPanel(doc, x, y, contentW, statH, '#f6f7f8');
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('RECOVERABLE RANGE', x + 12, y + 8, { lineBreak: false });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13)
    .text(`${formatZar(leakage.recoverableLow)}  –  ${formatZar(leakage.recoverableHigh)}`, x + 12, y + 24, { width: contentW - 24, lineBreak: false });
  y += statH + 14;

  const confidences = [
    { label: 'Methodology confidence', pct: Math.round(Number(input.methodologyConfidence || 0) * 100) },
    { label: 'Evidence confidence', pct: Math.round(Number(input.evidenceConfidence || 0) * 100) },
  ];
  for (const row of confidences) {
    y = ensureRoom(doc, input.brand, y, 28);
    const pct = Math.max(0, Math.min(100, row.pct));
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(row.label, x, y, { width: contentW - 40, lineBreak: false });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(`${pct}%`, x + contentW - 36, y, { width: 36, align: 'right', lineBreak: false });
    const barY = y + 14;
    doc.roundedRect(x, barY, contentW, 8, 2).fill('#ececec');
    if (pct > 0) doc.roundedRect(x, barY, Math.max(6, (contentW * pct) / 100), 8, 2).fill(resolveSclClassificationVisual(pct).colourHex);
    y = barY + 16;
  }

  const clientLosses = formatClientEstimatedLosses(
    leakage.estimatedLossesLow,
    leakage.estimatedLossesHigh,
    leakage.estimatedLossesLowBand as never,
    leakage.estimatedLossesHighBand as never,
  );
  y = ensureRoom(doc, input.brand, y, 40);
  drawPanel(doc, x, y, contentW, 36, '#f6f7f8');
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('CLIENT-ESTIMATED LOSSES', x + 12, y + 6, { lineBreak: false });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(clientLosses, x + 12, y + 18, { width: contentW - 24, lineBreak: false, ellipsis: true });
  y += 48;

  y = drawSectionTitle(doc, input.brand, 'Assessment areas', x, y);
  const areas = input.categoryScores?.length
    ? input.categoryScores
    : [{ category: 'Overall', score: input.overallRiskScore }];
  for (const area of areas) {
    const rowH = 36;
    y = ensureRoom(doc, input.brand, y, rowH + 6);
    const score = Math.max(0, Math.min(100, Math.round(Number(area.score) || 0)));
    const band = getRiskBand(score);
    const colour = resolveSclClassificationVisual(score).colourHex;
    doc.fillColor(INK).font('Helvetica').fontSize(9)
      .text(String(area.category || 'Area'), x, y, { width: contentW - 78, lineBreak: false, ellipsis: true });
    doc.fillColor(colour).font('Helvetica-Bold').fontSize(9)
      .text(`${band}  ${score}`, x + contentW - 74, y, { width: 74, align: 'right', lineBreak: false });
    const barY = y + 14;
    doc.roundedRect(x, barY, contentW, 8, 2).fill('#ececec');
    if (score > 0) doc.roundedRect(x, barY, Math.max(6, (contentW * score) / 100), 8, 2).fill(colour);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(leakageTheme(String(area.category)), x, barY + 12, { width: contentW, lineBreak: false, ellipsis: true });
    y += rowH + 8;
  }

  const findings = (input.findings || []).filter((item) => item.title);
  y = drawSectionTitle(doc, input.brand, 'Recorded findings', x, y);
  if (!findings.length) {
    y = ensureRoom(doc, input.brand, y, 36);
    drawPanel(doc, x, y, contentW, 32, '#f6f7f8');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('No separate finding records are stored on this assessment.', x + 12, y + 10, { width: contentW - 24, lineBreak: false });
    y += 44;
  } else {
    for (const finding of findings) {
      doc.font('Helvetica').fontSize(9);
      const body = String(finding.description || '').trim();
      const bodyH = body ? doc.heightOfString(body, { width: contentW - 24, lineGap: 1 }) : 0;
      const cardH = 28 + bodyH;
      y = ensureRoom(doc, input.brand, y, cardH + 8);
      drawPanel(doc, x, y, contentW, cardH, '#f6f7f8');
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
        .text(finding.category ? `${finding.title}  ·  ${finding.category}` : finding.title, x + 12, y + 8, { width: contentW - 24 });
      if (body) doc.fillColor(CHAR).font('Helvetica').fontSize(9).text(body, x + 12, y + 24, { width: contentW - 24, lineGap: 1 });
      y += cardH + 8;
    }
  }

  y = drawSectionTitle(doc, input.brand, 'Recommendations', x, y);
  const recommendations = (input.recommendations || []).filter((item) => item.title);
  if (!recommendations.length) {
    y = ensureRoom(doc, input.brand, y, 36);
    drawPanel(doc, x, y, contentW, 32, '#f6f7f8');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('No recommendations are stored on this assessment yet.', x + 12, y + 10, { width: contentW - 24, lineBreak: false });
    y += 44;
  } else {
    for (const item of recommendations) {
      const tone = priorityTone(item.priority);
      const summary = [item.summary, item.suggestedNextStep ? `Next step: ${item.suggestedNextStep}` : '']
        .filter(Boolean)
        .join(' ');
      doc.font('Helvetica').fontSize(9);
      const summaryH = summary ? doc.heightOfString(summary, { width: contentW - 28, lineGap: 1 }) : 0;
      const cardH = 32 + summaryH;
      y = ensureRoom(doc, input.brand, y, cardH + 8);
      doc.font('Helvetica-Bold').fontSize(8);
      const pillW = Math.min(84, doc.widthOfString(item.priority.toUpperCase()) + 16);
      drawPanel(doc, x, y, contentW, cardH, '#ffffff');
      doc.rect(x, y, 4, cardH).fill(tone.ink);
      doc.roundedRect(x + 14, y + 8, pillW, 14, 3).fill(tone.fill);
      doc.fillColor(tone.ink).font('Helvetica-Bold').fontSize(8)
        .text(item.priority.toUpperCase(), x + 14, y + 11, { width: pillW, align: 'center', lineBreak: false });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
        .text(item.title, x + 14 + pillW + 8, y + 9, { width: contentW - pillW - 40, lineBreak: false, ellipsis: true });
      if (summary) {
        doc.fillColor(CHAR).font('Helvetica').fontSize(9).text(summary, x + 14, y + 28, { width: contentW - 28, lineGap: 1 });
      }
      y += cardH + 8;
    }
  }

  y = drawSectionTitle(doc, input.brand, 'Answered assessment areas', x, y);
  const matrix = input.scoringMatrix || [];
  if (!matrix.length) {
    y = ensureRoom(doc, input.brand, y, 36);
    drawPanel(doc, x, y, contentW, 32, '#f6f7f8');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('No answered questions were available for this report.', x + 12, y + 10, { width: contentW - 24, lineBreak: false });
    y += 44;
  } else {
    const colW = (contentW - gap) / 2;
    const cardH = 46;
    for (let index = 0; index < matrix.length; index += 2) {
      y = ensureRoom(doc, input.brand, y, cardH + gap);
      [matrix[index], matrix[index + 1]].forEach((panel, column) => {
        if (!panel) return;
        const sx = x + column * (colW + gap);
        const selected = panel.rows.find((row) => row.selected) || panel.rows[0];
        const tone = (selected && MATURITY_ROW[selected.tone]) || MATURITY_ROW.acceptable;
        drawPanel(doc, sx, y, colW, cardH, '#f6f7f8');
        doc.roundedRect(sx + 8, y + 8, 28, 14, 3).fill(tone.bg);
        doc.fillColor(tone.text).font('Helvetica-Bold').fontSize(8)
          .text(panel.code || 'Q', sx + 8, y + 11, { width: 28, align: 'center', lineBreak: false });
        doc.fillColor(INK).font('Helvetica').fontSize(8)
          .text(panel.title, sx + 42, y + 10, { width: colW - 52, height: 12, ellipsis: true });
        doc.fillColor(CHAR).font('Helvetica-Bold').fontSize(8)
          .text(selected?.description || 'No selection recorded', sx + 8, y + 28, { width: colW - 16, lineBreak: false, ellipsis: true });
      });
      y += cardH + gap;
    }
  }

  y = drawSectionTitle(doc, input.brand, 'Evidence status', x, y);
  const evidence = input.evidenceSummary;
  const evidenceTiles = [
    { label: 'FILES', value: String(evidence?.total ?? 0), fill: '#f6f7f8' },
    { label: 'ACCEPTED', value: String(evidence?.accepted ?? 0), fill: '#e7f4ea' },
    { label: 'REJECTED', value: String(evidence?.rejected ?? 0), fill: '#fde8e8' },
    { label: 'PENDING', value: String(evidence?.pending ?? 0), fill: '#fff3d9' },
  ];
  const tileW = (contentW - gap * 3) / 4;
  const tileH = 46;
  y = ensureRoom(doc, input.brand, y, tileH + 8);
  evidenceTiles.forEach((tile, index) => {
    const sx = x + index * (tileW + gap);
    drawPanel(doc, sx, y, tileW, tileH, tile.fill);
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(tile.label, sx + 8, y + 8, { width: tileW - 12, lineBreak: false });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(tile.value, sx + 8, y + 20, { width: tileW - 12, lineBreak: false });
  });
  y += tileH + 16;

  y = drawSectionTitle(doc, input.brand, 'Calibration inputs', x, y);
  const calibration = input.calibrationInputs || [];
  if (!calibration.length) {
    y = ensureRoom(doc, input.brand, y, 36);
    drawPanel(doc, x, y, contentW, 32, '#f6f7f8');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text('No calibration inputs are stored on this assessment.', x + 12, y + 10, { width: contentW - 24, lineBreak: false });
    y += 44;
  } else {
    const calW = (contentW - gap) / 2;
    for (let index = 0; index < calibration.length; index += 2) {
      const rowItems = [calibration[index], calibration[index + 1]].filter(Boolean);
      const hasBar = rowItems.some((item) => typeof item.percent === 'number');
      const cardH = hasBar ? 52 : 40;
      y = ensureRoom(doc, input.brand, y, cardH + gap);
      rowItems.forEach((item, column) => {
        const sx = x + column * (calW + gap);
        const yesNo = /^(yes|no)$/i.test(item.value.trim());
        drawPanel(doc, sx, y, calW, cardH, '#f6f7f8');
        doc.fillColor(MUTED).font('Helvetica').fontSize(7)
          .text(item.label, sx + 8, y + 6, { width: calW - 16, lineBreak: false, ellipsis: true });
        if (yesNo) {
          const on = /^yes$/i.test(item.value.trim());
          doc.roundedRect(sx + 8, y + 20, 36, 14, 3).fill(on ? '#e7f4ea' : '#f3f4f6');
          doc.fillColor(on ? '#1b5e20' : MUTED).font('Helvetica-Bold').fontSize(8)
            .text(on ? 'YES' : 'NO', sx + 8, y + 23, { width: 36, align: 'center', lineBreak: false });
        } else {
          doc.fillColor(INK).font('Helvetica-Bold').fontSize(9)
            .text(item.value || '—', sx + 8, y + 20, { width: calW - 16, lineBreak: false, ellipsis: true });
        }
        if (typeof item.percent === 'number') {
          const pct = Math.max(0, Math.min(100, item.percent));
          const barY = y + cardH - 12;
          doc.roundedRect(sx + 8, barY, calW - 16, 5, 2).fill('#e5e7eb');
          if (pct > 0) doc.roundedRect(sx + 8, barY, Math.max(4, ((calW - 16) * pct) / 100), 5, 2).fill('#9f1239');
        }
      });
      y += cardH + gap;
    }
  }

  y = drawSectionTitle(doc, input.brand, 'Analyst comments', x, y);
  const note = input.analystNote?.trim() || 'No analyst comment has been recorded.';
  doc.font('Helvetica').fontSize(10);
  const noteH = doc.heightOfString(note, { width: contentW - 24, lineGap: 2 });
  const noteCardH = Math.max(40, noteH + 20);
  y = ensureRoom(doc, input.brand, y, noteCardH);
  drawPanel(doc, x, y, contentW, noteCardH, '#f6f7f8');
  doc.fillColor(CHAR).font('Helvetica').fontSize(10).text(note, x + 12, y + 10, { width: contentW - 24, lineGap: 2 });
}

/**
 * Renders either the Executive Governance Triage indication or the Security Cost Leakage report.
 * Scoring values are governed inputs only — formulas are unchanged.
 */
export function renderSclExecutivePdf(input: SclPdfRenderInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      compress: false,
      info: {
        Title: `${input.reportTitle} — ${input.companyName}`,
        Author: input.brand.consultancyName,
        Subject: input.brand.productLine,
      },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillOpacity(1).strokeOpacity(1).opacity(1).font('Helvetica');

    const scoreContext = buildPdfScoreContext(input);

    // Page 1
    drawTopBar(doc, input.brand);
    let y = drawPageHeader(doc, input);
    drawPageOneBody(doc, input, scoreContext, y);

    // Page 2
    doc.addPage();
    drawPageTwo(doc, input);
    if (isCostLeakageReport(input)) drawCostLeakageAnnex(doc, input);

    doc.end();
  });
}
