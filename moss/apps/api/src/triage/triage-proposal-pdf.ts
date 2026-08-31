import PDFDocument from 'pdfkit';
import { resolveEgtAssuranceVisual } from '@moss/shared';
import {
  PDF_PAGE_MARGIN,
  beginBodyAfterLetterhead,
  defaultReportBrand,
  drawPdfLetterhead,
  resolveReportLogoPath,
} from '../reports/pdf-letterhead';

/**
 * Executive proposal palette:
 * - Letterhead: Physical Risk logo + brand red (pdf-letterhead)
 * - Body: black hierarchy (no navy/blue) + Physical Risk red accents
 */
const BLACK = '#111111';
const INK = '#1C2733';
const MUTED = '#677482';
const RULE = '#D9E1E7';
const HERO_BG = '#F5F7F9';
const BOX_BG = '#F5F7F9';
const LABEL_BG = '#F5F7F9';
const LIGHT_BLUE = '#EFF4F8';

export type ProposalPdfInput = {
  proposalNumber: string;
  organisationName: string;
  prospectName: string;
  prospectJobTitle?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  industry?: string | null;
  country?: string | null;
  sourceTriageReference?: string | null;
  assuranceScore?: number | null;
  assuranceBandLabel?: string | null;
  strongestIndicators?: string[];
  primaryConcern?: string | null;
  clientObjective?: string | null;
  sitesOrBusinessUnits?: string | null;
  indicativeScope?: string | null;
  timeline?: string | null;
  fee?: number | null;
  currency?: string | null;
  deliverables?: string | null;
  terms?: string | null;
  introduction?: string | null;
  preparedByName?: string | null;
  preparedByEmail?: string | null;
  validUntilLabel?: string | null;
  issuedDateLabel: string;
};

function money(fee: number | null | undefined, currency: string | null | undefined): string {
  if (fee == null || Number.isNaN(Number(fee))) return 'To be confirmed';
  const cur = (currency || 'ZAR').toUpperCase();
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: cur === 'R' ? 'ZAR' : cur,
      maximumFractionDigits: 0,
    }).format(Number(fee));
  } catch {
    return `${cur} ${Number(fee).toLocaleString('en-ZA')}`;
  }
}

function defaultIntroduction(input: ProposalPdfInput): string {
  const greeting = input.prospectName ? `Dear ${input.prospectName.split(' ')[0]},` : 'Dear Colleague,';
  return [
    greeting,
    '',
    `Thank you for completing the Executive Governance Triage for ${input.organisationName}. Based on the preliminary indication, we recommend progressing to an Executive Advisory Diagnostic — a structured Level 2 engagement that provides independent executive insight into assurance posture, provider accountability, and governance effectiveness.`,
    '',
    'This proposal sets out the recommended scope, professional fee, and next steps. It is prepared for executive consideration and does not constitute an audit opinion or assurance certificate.',
  ].join('\n');
}

function defaultDeliverables(): string {
  return [
    'Independent review of executive assurance arrangements across the agreed sites or business units',
    'Assessment of provider verification, reporting integrity, and governance accountability',
    'Identification of priority assurance gaps and decision-ready recommendations',
    'Executive briefing pack suitable for CFO / CRO / Board risk discussion',
    'Clear recommendation on whether a Focused Assurance (Level 3) engagement is warranted',
  ].join('\n');
}

function defaultTerms(input: ProposalPdfInput): string {
  const feeLine = money(input.fee, input.currency);
  return [
    `Professional fee: ${feeLine} (exclusive of VAT, unless otherwise stated).`,
    input.timeline ? `Indicative timeline: ${input.timeline}.` : 'Indicative timeline: to be confirmed on acceptance.',
    input.validUntilLabel
      ? `This proposal remains valid until ${input.validUntilLabel}, unless withdrawn earlier.`
      : 'This proposal remains valid for 30 days from the date of issue, unless withdrawn earlier.',
    'Work will commence on written acceptance of this proposal and confirmation of commercial terms.',
    'Findings are advisory and evidence-led. They do not constitute a statutory audit, regulatory filing, or certification.',
  ].join('\n');
}

export function buildProposalPdfDefaults(input: ProposalPdfInput) {
  return {
    introduction: (input.introduction || '').trim() || defaultIntroduction(input),
    deliverables: (input.deliverables || '').trim() || defaultDeliverables(),
    terms: (input.terms || '').trim() || defaultTerms(input),
  };
}

function startPage(
  doc: PDFKit.PDFDocument,
  logoPath: string | null,
  margin: number,
  compact = false,
) {
  const y = drawPdfLetterhead(doc, { logoPath, compact, margin });
  beginBodyAfterLetterhead(doc, y, margin);
}

function ensureSpace(
  doc: PDFKit.PDFDocument,
  needed: number,
  margin: number,
  logoPath: string | null,
) {
  if (doc.y + needed < doc.page.height - margin - 48) return;
  doc.addPage();
  startPage(doc, logoPath, margin, true);
}

/** Typography aligned to Executive Governance Indication (scl-report-pdf). */
const FS = {
  eyebrow: 9,
  title: 28,
  subtitle: 11,
  section: 15,
  body: 10,
  bodyLarge: 11,
  meta: 10,
  metaLabel: 8,
  tableLabel: 8,
  tableValue: 10,
  score: 16,
  scoreLabel: 8,
  small: 9,
  footer: 7,
  conf: 8,
} as const;

function sectionHeading(
  doc: PDFKit.PDFDocument,
  title: string,
  margin: number,
  contentW: number,
  red: string,
) {
  // Match SCL / letterhead PDFs: Helvetica-Bold. Place the rule from the known
  // text origin — do not use doc.y after lineBreak:false (it stays on the baseline
  // and the stroke cuts through the heading).
  const y = doc.y;
  const fontSize = FS.section;
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(fontSize)
    .text(title.toUpperCase(), margin, y, {
      width: contentW,
      characterSpacing: 0.5,
      lineBreak: false,
    });
  const ruleY = y + fontSize + 5;
  doc
    .moveTo(margin, ruleY)
    .lineTo(margin + contentW, ruleY)
    .lineWidth(1.25)
    .strokeColor(red)
    .stroke();
  doc.y = ruleY + 10;
  doc.x = margin;
}

function bullets(
  doc: PDFKit.PDFDocument,
  lines: string[],
  margin: number,
  contentW: number,
  red: string,
) {
  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {
    const y = doc.y;
    doc.circle(margin + 3.5, y + 5, 2.1).fill(red);
    doc.fillColor(INK).font('Helvetica').fontSize(FS.body)
      .text(line, margin + 14, y, { width: contentW - 14, lineGap: 2 });
    doc.moveDown(0.35);
  }
}

function drawEngagementTable(
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string]>,
  margin: number,
  contentW: number,
) {
  const labelW = Math.round(contentW * 0.31);
  const rowH = 24;
  rows.forEach(([label, value]) => {
    const y = doc.y;
    doc.rect(margin, y - 2, labelW, rowH).fill(LABEL_BG);
    doc.rect(margin + labelW, y - 2, contentW - labelW, rowH).fill('#FFFFFF');
    doc.moveTo(margin, y - 2 + rowH).lineTo(margin + contentW, y - 2 + rowH)
      .lineWidth(0.5).strokeColor(RULE).stroke();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(FS.tableLabel)
      .text(label.toUpperCase(), margin + 8, y + 6, { width: labelW - 12, lineBreak: false });
    const emphasize =
      label.toLowerCase().includes('fee')
      || label.toLowerCase().includes('product');
    doc.fillColor(emphasize ? BLACK : INK)
      .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(FS.tableValue)
      .text(value, margin + labelW + 8, y + 5, { width: contentW - labelW - 16 });
    doc.y = y - 2 + rowH;
    doc.x = margin;
  });
}

function drawNextSteps(
  doc: PDFKit.PDFDocument,
  steps: string[],
  margin: number,
  contentW: number,
  red: string,
) {
  const numW = Math.round(contentW * 0.09);
  const rowH = 24;
  steps.forEach((step, i) => {
    const y = doc.y;
    if (i === 0) {
      doc.rect(margin, y, numW, rowH).fill(BLACK);
      doc.fillColor('#FFFFFF');
    } else {
      doc.rect(margin, y, numW, rowH).fill(LIGHT_BLUE);
      doc.fillColor(BLACK);
    }
    doc.font('Helvetica-Bold').fontSize(FS.meta)
      .text(String(i + 1), margin, y + 7, { width: numW, align: 'center', lineBreak: false });
    doc.rect(margin + numW, y, contentW - numW, rowH).fill('#FFFFFF');
    doc.moveTo(margin, y + rowH).lineTo(margin + contentW, y + rowH)
      .lineWidth(0.5).strokeColor(RULE).stroke();
    doc.fillColor(INK).font('Helvetica').fontSize(FS.body)
      .text(step, margin + numW + 10, y + 7, { width: contentW - numW - 16, lineBreak: false });
    doc.y = y + rowH;
    doc.x = margin;
  });
  void red;
}

export function renderExecutiveAdvisoryProposalPdf(input: ProposalPdfInput): Promise<Buffer> {
  const brand = defaultReportBrand();
  const logoPath = resolveReportLogoPath();
  const margin = PDF_PAGE_MARGIN;
  const red = brand.brandColor || '#d20a11';
  const defaults = buildProposalPdfDefaults(input);
  const pageW = 595.28;
  const contentW = pageW - margin * 2;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin,
      bufferPages: true,
      info: {
        Title: `Executive Advisory Proposal — ${input.organisationName}`,
        Author: brand.consultancyName,
        Subject: 'Executive Advisory Diagnostic Proposal',
        Keywords: `proposal,${input.proposalNumber},${input.sourceTriageReference || ''}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(Buffer.from(c)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    startPage(doc, logoPath, margin, false);

    // ——— Hero panel (measure first so wrapped title / labels never overlap) ———
    const heroTop = doc.y;
    const boxW = Math.round(contentW * 0.28);
    const leftW = contentW - boxW;
    const pad = 14;
    const titleText = 'Executive Advisory Diagnostic';
    const subtitleText = 'Professional proposal for Level 2 engagement';
    const bx = margin + leftW + 12;
    const bw = boxW - 24;

    doc.font('Helvetica-Bold').fontSize(FS.eyebrow);
    const eyebrowH = FS.eyebrow + 2;
    doc.font('Helvetica-Bold').fontSize(FS.title);
    const titleH = doc.heightOfString(titleText, { width: leftW - pad * 2, lineGap: 2 });
    doc.font('Helvetica').fontSize(FS.subtitle);
    const subtitleH = doc.heightOfString(subtitleText, { width: leftW - pad * 2 });
    doc.font('Helvetica-Bold').fontSize(7);
    const refLabelH = doc.heightOfString('PROPOSAL REFERENCE', { width: bw, lineGap: 1 });
    const dateLabelH = doc.heightOfString('DATE OF ISSUE', { width: bw, lineGap: 1 });
    doc.font('Helvetica-Bold').fontSize(FS.meta);
    const refValueH = doc.heightOfString(input.proposalNumber, { width: bw });
    const dateValueH = doc.heightOfString(input.issuedDateLabel, { width: bw });

    const leftStackH = 12 + eyebrowH + 8 + titleH + 8 + subtitleH + 14;
    const rightStackH = 14 + refLabelH + 6 + refValueH + 10 + 10 + dateLabelH + 6 + dateValueH + 14;
    const heroH = Math.max(leftStackH, rightStackH, 100);

    doc.rect(margin, heroTop, leftW, heroH).fill(HERO_BG);
    doc.rect(margin + leftW, heroTop, boxW, heroH).fill(BLACK);

    let ly = heroTop + 12;
    doc.fillColor(red).font('Helvetica-Bold').fontSize(FS.eyebrow)
      .text('CONFIDENTIAL PROPOSAL', margin + pad, ly, {
        characterSpacing: 1.1,
        lineBreak: false,
      });
    ly += eyebrowH + 8;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(FS.title)
      .text(titleText, margin + pad, ly, { width: leftW - pad * 2, lineGap: 2 });
    ly = doc.y + 8;
    doc.fillColor(MUTED).font('Helvetica').fontSize(FS.subtitle)
      .text(subtitleText, margin + pad, ly, { width: leftW - pad * 2 });

    let ry = heroTop + 14;
    doc.fillColor('#D1D5DB').font('Helvetica-Bold').fontSize(7)
      .text('PROPOSAL REFERENCE', bx, ry, { width: bw, lineGap: 1 });
    ry = doc.y + 6;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(FS.meta)
      .text(input.proposalNumber, bx, ry, { width: bw });
    ry = doc.y + 10;
    doc.moveTo(bx, ry).lineTo(margin + contentW - 12, ry)
      .lineWidth(0.5).strokeColor('#4B5563').stroke();
    ry += 10;
    doc.fillColor('#D1D5DB').font('Helvetica-Bold').fontSize(7)
      .text('DATE OF ISSUE', bx, ry, { width: bw, lineGap: 1 });
    ry = doc.y + 6;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(FS.meta)
      .text(input.issuedDateLabel, bx, ry, { width: bw });

    doc.y = heroTop + heroH + 14;
    doc.x = margin;

    // ——— Meta rows ———
    const metaLabelW = Math.round(contentW * 0.29);
    if (input.sourceTriageReference) {
      const y = doc.y;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(FS.metaLabel)
        .text('SOURCE TRIAGE', margin, y, { characterSpacing: 0.5 });
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(FS.meta)
        .text(input.sourceTriageReference, margin + metaLabelW, y);
      doc.y = y + 18;
      doc.moveTo(margin, doc.y).lineTo(margin + contentW, doc.y)
        .lineWidth(0.5).strokeColor(RULE).stroke();
      doc.moveDown(0.45);
    }

    {
      const y = doc.y;
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(FS.metaLabel)
        .text('PREPARED FOR', margin, y, { characterSpacing: 0.5 });
      let vy = y;
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(FS.meta)
        .text(input.organisationName, margin + metaLabelW, vy);
      vy = doc.y + 3;
      if (input.prospectName) {
        const titleBit = input.prospectJobTitle ? `, ${input.prospectJobTitle}` : '';
        doc.fillColor(INK).font('Helvetica').fontSize(FS.meta)
          .text(`${input.prospectName}${titleBit}`, margin + metaLabelW, vy);
        vy = doc.y + 2;
      }
      const contactBits = [input.prospectEmail, input.prospectPhone].filter(Boolean);
      if (contactBits.length) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(FS.small)
          .text(contactBits.join('  ·  '), margin + metaLabelW, vy);
        vy = doc.y + 2;
      }
      const orgMeta = [input.industry, input.country].filter(Boolean).join(' · ');
      if (orgMeta) {
        doc.fillColor(MUTED).font('Helvetica').fontSize(FS.small)
          .text(orgMeta, margin + metaLabelW, vy);
      }
      doc.y = Math.max(doc.y, y) + 10;
      doc.x = margin;
      doc.moveTo(margin, doc.y).lineTo(margin + contentW, doc.y)
        .lineWidth(0.5).strokeColor(RULE).stroke();
      doc.moveDown(0.7);
    }

    // Introduction
    sectionHeading(doc, 'Introduction', margin, contentW, red);
    for (const para of defaults.introduction.split(/\n+/)) {
      if (!para.trim()) {
        doc.moveDown(0.3);
        continue;
      }
      doc.fillColor(INK).font('Helvetica').fontSize(FS.body)
        .text(para.trim(), { align: 'left', lineGap: 2.5 });
      doc.moveDown(0.35);
    }
    doc.moveDown(0.3);

    // Triage indication
    const hasTriage =
      input.assuranceScore != null
      || input.assuranceBandLabel
      || (input.strongestIndicators && input.strongestIndicators.length)
      || input.primaryConcern;

    if (hasTriage) {
      ensureSpace(doc, 130, margin, logoPath);
      sectionHeading(doc, 'Triage indication (Level 1)', margin, contentW, red);

      const cardTop = doc.y;
      const cardH = 88;
      const leftPw = Math.round(contentW * 0.5);
      const rightPw = contentW - leftPw;
      const padX = 14;
      const scoreNum = Number(input.assuranceScore);
      const visual =
        Number.isFinite(scoreNum)
          ? resolveEgtAssuranceVisual(scoreNum)
          : null;
      const leftBg = visual?.panelHex || BOX_BG;

      // Half / half: tinted score panel | white concerns panel
      doc.rect(margin, cardTop, leftPw, cardH).fill(leftBg);
      doc.rect(margin + leftPw, cardTop, rightPw, cardH).fill('#FFFFFF');
      doc.rect(margin, cardTop, contentW, cardH).lineWidth(0.7).strokeColor(RULE).stroke();
      doc.moveTo(margin + leftPw, cardTop).lineTo(margin + leftPw, cardTop + cardH)
        .lineWidth(0.6).strokeColor(RULE).stroke();

      doc.fillColor(MUTED).font('Helvetica').fontSize(FS.scoreLabel)
        .text('Assurance score:', margin + padX, cardTop + 12, { width: leftPw - padX * 2 });
      const scoreText =
        input.assuranceScore != null
          ? `${input.assuranceScore} / 100${input.assuranceBandLabel ? ` — ${input.assuranceBandLabel}` : ''}`
          : input.assuranceBandLabel || '—';
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(FS.score)
        .text(scoreText, margin + padX, cardTop + 28, {
          width: leftPw - padX * 2,
          lineGap: 2,
        });

      const mid = margin + leftPw + padX;
      doc.fillColor(MUTED).font('Helvetica').fontSize(FS.scoreLabel)
        .text('Key assurance concerns:', mid, cardTop + 12, { width: rightPw - padX * 2 });
      const concerns = (input.strongestIndicators || []).slice(0, 3);
      concerns.forEach((c, i) => {
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(FS.body)
          .text(`•  ${i + 1}. ${c}`, mid, cardTop + 30 + i * 16, {
            width: rightPw - padX * 2,
          });
      });
      if (!concerns.length && input.primaryConcern) {
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(FS.body)
          .text(input.primaryConcern, mid, cardTop + 30, { width: rightPw - padX * 2 });
      }

      doc.y = cardTop + cardH + 8;
      doc.x = margin;
      doc.fillColor(MUTED).font('Helvetica').fontSize(FS.small)
        .text(
          'This Level 1 indication is preliminary and questionnaire-based. The Executive Advisory Diagnostic provides the structured Level 2 review recommended as the next step.',
          { width: contentW, lineGap: 1.8 },
        );
      doc.moveDown(0.7);
    }

    // Proposed engagement
    ensureSpace(doc, 160, margin, logoPath);
    sectionHeading(doc, 'Proposed engagement', margin, contentW, red);
    drawEngagementTable(
      doc,
      [
        ['Recommended product', 'Executive Advisory Diagnostic (Level 2)'],
        ['Client objective', input.clientObjective?.trim() || 'Strengthen executive assurance and provider accountability'],
        ['Sites / business units', input.sitesOrBusinessUnits?.trim() || 'To be confirmed'],
        ['Indicative scope', input.indicativeScope?.trim() || 'Executive governance and provider assurance review'],
        ['Timeline', input.timeline?.trim() || 'To be confirmed on acceptance'],
        ['Professional fee', money(input.fee, input.currency)],
      ],
      margin,
      contentW,
    );
    doc.moveDown(0.55);

    ensureSpace(doc, 180, margin, logoPath);
    sectionHeading(doc, 'Scope of work / deliverables', margin, contentW, red);
    const deliverableLines = defaults.deliverables
      .split(/\n+/)
      .map((l) => l.replace(/^[\s•\-\d.]+/, '').trim())
      .filter(Boolean);
    bullets(doc, deliverableLines, margin, contentW, red);
    doc.moveDown(0.5);

    ensureSpace(doc, 140, margin, logoPath);
    sectionHeading(doc, 'Commercial terms', margin, contentW, red);
    const termLines = defaults.terms.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    bullets(doc, termLines, margin, contentW, red);
    doc.moveDown(0.5);

    ensureSpace(doc, 160, margin, logoPath);
    sectionHeading(doc, 'Next steps', margin, contentW, red);
    drawNextSteps(
      doc,
      [
        'Confirm acceptance of this proposal in writing',
        'Agree final sites / business units and access arrangements',
        'Appoint a commercial owner and primary consultant contact',
        'Commence the Executive Advisory Diagnostic on the agreed start date',
      ],
      margin,
      contentW,
      red,
    );
    doc.moveDown(0.7);

    ensureSpace(doc, 140, margin, logoPath);
    doc.fillColor(INK).font('Helvetica').fontSize(FS.bodyLarge)
      .text(
        'We look forward to supporting your executive team. Please contact us should you wish to discuss scope, timing, or fee arrangements before acceptance.',
        { width: contentW, lineGap: 2.5 },
      );
    doc.moveDown(0.55);
    doc.fillColor(MUTED).font('Helvetica').fontSize(FS.body).text('Yours sincerely,');
    doc.moveDown(0.5);

    const sigTop = doc.y;
    const sigH = 52;
    const sigW = Math.min(250, contentW);
    doc.rect(margin, sigTop, sigW, sigH).fill(BOX_BG);
    doc.rect(margin, sigTop, sigW, sigH).lineWidth(1.1).strokeColor(red).stroke();
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(FS.meta)
      .text(input.preparedByName || brand.consultancyName, margin + 12, sigTop + 10);
    if (input.preparedByEmail) {
      doc.fillColor(red).font('Helvetica').fontSize(FS.small)
        .text(input.preparedByEmail, margin + 12, sigTop + 26);
    }
    doc.fillColor(INK).font('Helvetica').fontSize(FS.small)
      .text(brand.consultancyName, margin + 12, sigTop + (input.preparedByEmail ? 38 : 26));
    doc.y = sigTop + sigH + 14;
    doc.x = margin;

    // Confidentiality band
    const confH = 28;
    ensureSpace(doc, confH + 8, margin, logoPath);
    const confY = doc.y;
    doc.rect(margin, confY, contentW, confH).fill(BLACK);
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(FS.conf)
      .text(
        'This document is confidential and intended solely for the named organisation. It may not be distributed without the prior written consent of Physical Risk Consultancy (Pty) Ltd.',
        margin + 10,
        confY + 8,
        { width: contentW - 20, align: 'center', lineGap: 1 },
      );

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const bottom = Number(doc.page.margins?.bottom) || margin;
      const footerY = doc.page.height - bottom - 18;
      doc.save();
      doc.fillColor(MUTED).font('Helvetica').fontSize(FS.footer)
        .text(
          `${brand.consultancyName}  ·  ${input.proposalNumber}  ·  Page ${i + 1} of ${range.count}`,
          margin,
          footerY,
          { width: contentW, align: 'center', lineBreak: false },
        );
      doc.restore();
    }

    doc.end();
  });
}
