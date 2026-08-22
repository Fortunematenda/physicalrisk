import PDFDocument from 'pdfkit';
import { getRiskBand, type RiskBand } from '@moss/shared';
import type { SclReportBrandConfig } from './scl-report-branding';
import { resolveSclClassificationVisual } from './scl-report-visual';

const INK = '#111111';
const MUTED = '#666666';
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
  companyName: string;
  reference: string;
  assessmentDateLabel: string;
  reportTitle: string;
  isPreliminary: boolean;
  modelVersion: string;
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
  return 'Critical exposure indicators suggest priority independent review.';
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
  visual: ReturnType<typeof resolveSclClassificationVisual>,
  diagnosis: string,
  y: number,
): void {
  const pageW = doc.page.width;
  const contentW = pageW - PAGE_MARGIN * 2;
  const x = PAGE_MARGIN;
  const RED = brandRed(input.brand);
  const accent = visual.colourHex || RED;

  doc.fillColor(RED).font('Helvetica-Bold').fontSize(9)
    .text('COMPLIMENTARY PRELIMINARY INDICATION', x, y, {
      characterSpacing: 1.1,
      lineBreak: false,
    });
  y += 22;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(28)
    .text('Security Cost Leakage Report', x, y, { width: contentW });
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
  y += 48;

  // Score banner — solid classification colour left / charcoal right (EGT sample layout)
  const leftW = Math.round(contentW * 0.28);
  const panelH = 112;
  doc.rect(x, y, leftW, panelH).fill(accent);
  doc.rect(x + leftW, y, contentW - leftW, panelH).fill(CHAR);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
    .text('SECURITY COST LEAKAGE INDICATION', x + 16, y + 18, {
      width: leftW - 28,
      characterSpacing: 0.5,
    });

  const scoreValue = Number(input.overallRiskScore);
  const scoreLabel = Number.isFinite(scoreValue) ? Math.round(scoreValue).toString() : '—';
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(46)
    .text(scoreLabel, x + 16, y + 42, { width: leftW - 70, lineBreak: false });
  if (Number.isFinite(scoreValue)) {
    const scoreWidth = doc.widthOfString(scoreLabel);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
      .text('/100', x + 16 + scoreWidth + 3, y + 68, { lineBreak: false });
  }

  const posX = x + leftW + 20;
  const posW = contentW - leftW - 36;
  doc.fillColor('#bdbdbd').font('Helvetica-Bold').fontSize(8)
    .text('PRELIMINARY POSITION', posX, y + 18, { width: posW, characterSpacing: 0.8 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
    .text(diagnosis, posX, y + 36, { width: posW, lineGap: 2 });
  const afterTitle = doc.y + 8;
  doc.fillColor('#d0d0d0').font('Helvetica').fontSize(9)
    .text(
      'Your responses indicate where security cost leakage may require independent validation. ' +
        'The result does not confirm that controls operate as described.',
      posX,
      Math.max(afterTitle, y + 62),
      { width: posW, lineGap: 2 },
    );
  y += panelH + 18;

  // Four-segment risk lamp (executive scan)
  const lampGap = 8;
  const lampH = 12;
  const lampW = (contentW - lampGap * 3) / 4;
  const lampColours = [
    resolveSclClassificationVisual('Controlled').colourHex,
    resolveSclClassificationVisual('Moderate').colourHex,
    resolveSclClassificationVisual('High').colourHex,
    resolveSclClassificationVisual('Critical').colourHex,
  ];
  const lampLabels = ['CONTROLLED', 'MODERATE', 'HIGH', 'CRITICAL'];
  lampColours.forEach((c, i) => {
    const lx = x + i * (lampW + lampGap);
    const active = i === visual.bandIndex;
    doc.rect(lx, y, lampW, lampH).fill(active ? c : '#e8e8e8');
    doc.fillColor(active ? INK : MUTED).font(active ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
      .text(lampLabels[i], lx, y + lampH + 6, { width: lampW, align: 'center', lineBreak: false });
  });
  y += lampH + 28;

  // Dimension indications
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
    .text('Dimension indications', x, y);
  y = doc.y + 14;

  const labelW = 140;
  const valueW = 32;
  const barW = contentW - labelW - valueW - 12;
  const rows = (input.categoryScores || []).length
    ? input.categoryScores
    : [{ category: 'Overall', score: Number(input.overallRiskScore) || 0 }];

  rows.forEach((row) => {
    const score = Math.max(0, Math.min(100, Math.round(Number(row.score) || 0)));
    const fillW = (barW * score) / 100;
    const barColour = resolveSclClassificationVisual(score).colourHex;
    doc.fillColor(INK).font('Helvetica').fontSize(10)
      .text(row.category, x, y - 1, { width: labelW, lineBreak: false });
    doc.rect(x + labelW, y + 3, barW, 9).fill('#ececec');
    if (fillW > 0) {
      doc.rect(x + labelW, y + 3, Math.max(fillW, 3), 9).fill(barColour);
    }
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
      .text(String(score), x + labelW + barW + 6, y - 1, {
        width: valueW,
        align: 'right',
        lineBreak: false,
      });
    y += 26;
  });
  y += 18;

  // Priority exposure indicators
  const sorted = [...rows].sort((a, b) => Number(b.score) - Number(a.score));
  const priorities = sorted.slice(0, 3).map((c) => ({
    title: c.category,
    description: categoryInterpretation(c.category, Number(c.score)),
  }));
  while (priorities.length < 3) {
    priorities.push({
      title: 'Assurance',
      description: 'Further independent validation may be warranted across the security operating model.',
    });
  }

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
    .text('Priority exposure indicators', x, y);
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
    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(card.description, cx, titleBottom, { width: cardW, lineGap: 2 });
  });
}

/**
 * Page 2 — recommended next step + interpretation (exact sample structure).
 */
function drawPageTwo(doc: PDFKit.PDFDocument, input: SclPdfRenderInput): void {
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

  doc.fillColor(MUTED).font('Helvetica').fontSize(11)
    .text(
      'Commission a paid Executive Advisory Diagnostic to validate the highest-priority findings against contracts, ' +
        'expenditure, performance records and executive reporting.',
      x,
      y,
      { width: contentW, lineGap: 3 },
    );
  y = doc.y + 18;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
    .text(`Focused route indicated: ${input.brand.productLine}™`, x, y, { width: contentW });
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
  doc.fillColor(MUTED).font('Helvetica').fontSize(10)
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
  doc.fillColor(MUTED).font('Helvetica').fontSize(10)
    .text(
      'This complimentary report is generated from unverified responses supplied by the participant. ' +
        'It is a preliminary management indication and is not an audit, certification, legal opinion or independent ' +
        'assurance conclusion. Physical Risk has not tested the supporting evidence at this stage.',
      x,
      y,
      { width: contentW, lineGap: 2.5 },
    );
}

/**
 * Renders the SCL PDF to match the approved Executive Governance Triage visual sample.
 * Scoring values are governed inputs only — formulas are unchanged.
 */
export function renderSclExecutivePdf(input: SclPdfRenderInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
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

    const visual = resolveSclClassificationVisual(input.riskBand || input.overallRiskScore);
    const diagnosis = diagnosisLabel(input.riskBand || visual.band);

    // Page 1
    drawTopBar(doc, input.brand);
    let y = drawPageHeader(doc, input);
    drawPageOneBody(doc, input, visual, diagnosis, y);

    // Page 2
    doc.addPage();
    drawPageTwo(doc, input);

    doc.end();
  });
}
