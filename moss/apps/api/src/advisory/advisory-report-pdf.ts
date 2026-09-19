import PDFDocument from 'pdfkit';
import {
  PDF_PAGE_MARGIN,
  beginBodyAfterLetterhead,
  defaultReportBrand,
  drawPdfLetterhead,
  resolveReportLogoPath,
} from '../reports/pdf-letterhead';
import {
  parseProposalRichText,
  richFont,
  stripHtmlToPlain,
  type RichBlock,
} from '../triage/proposal/proposal-rich-text';
import {
  buildEadReportSummary,
  formatDiagnosticAnswerLabel,
  formatRecommendationSourceModules,
  sanitizeRichText,
  type EadReportEvidenceInput,
  type EadReportModuleInput,
  type EadReportQuestionInput,
  type EadReportRouteInput,
  type EadReportSummary,
} from '@moss/shared';

export type AdvisoryPdfInput = {
  reference: string;
  title: string;
  organisation: string;
  productLabel: string;
  status: string;
  consultant?: string | null;
  reportVersion?: number | null;
  templateLabel?: string | null;
  generatedAt?: Date | string | null;
  salesEmail?: string | null;
  modules: EadReportModuleInput[];
  evidence?: EadReportEvidenceInput[];
  routes?: EadReportRouteInput[] | null;
  questions?: EadReportQuestionInput[];
  /**
   * Level 2 EAD uses scored diagnostic modules. Level 3 focused assurance is
   * evidence-led and must not render empty scorecards / “Not scored” tables.
   */
  scoredDiagnostic?: boolean;
};

function leftX(doc: PDFKit.PDFDocument) {
  return doc.page.margins.left;
}

/** PDFKit leaves doc.x at the end of absolute-positioned text — reset before flowing layout. */
function resetCursor(doc: PDFKit.PDFDocument, y?: number) {
  doc.x = leftX(doc);
  if (y != null) doc.y = y;
}

function drawAdvisoryRichText(
  doc: PDFKit.PDFDocument,
  value: string | null | undefined,
  opts: { width: number; ink: string; muted: string; fontSize?: number },
) {
  const fontSize = opts.fontSize ?? 9;
  const cleaned = sanitizeRichText(String(value || ''));
  const plainFallback = stripHtmlToPlain(String(value || '')).trim();
  resetCursor(doc);
  if (!cleaned && !plainFallback) {
    doc.fillColor(opts.muted).font('Helvetica').fontSize(fontSize).text('Not recorded', {
      width: opts.width,
    });
    resetCursor(doc);
    return;
  }

  const blocks: RichBlock[] = parseProposalRichText(cleaned || plainFallback);
  if (!blocks.length) {
    doc.fillColor(opts.ink).font('Helvetica').fontSize(fontSize).text(plainFallback || 'Not recorded', {
      width: opts.width,
      lineGap: 1.5,
    });
    resetCursor(doc);
    return;
  }

  for (const block of blocks) {
    resetCursor(doc);
    const indent = block.type === 'list-item' ? 12 : 0;
    const bullet =
      block.type === 'list-item' ? (block.ordered ? `${block.index}. ` : '• ') : '';
    const startX = leftX(doc);
    const textX = startX + indent;
    const runs = block.runs.length ? block.runs : [{ text: '', style: {} }];
    const line = `${bullet}${runs.map((r) => r.text || '').join('')}`;

    // Avoid PDFKit continued-text cursor bugs: draw each block as a single line with style on first run.
    const style = runs.find((r) => r.text)?.style || {};
    doc
      .fillColor(opts.ink)
      .font(richFont(style))
      .fontSize(fontSize)
      .text(line || ' ', textX, doc.y, {
        width: opts.width - indent,
        lineGap: 1.5,
        underline: Boolean(style.underline),
      });
    resetCursor(doc);
    doc.moveDown(block.type === 'list-item' ? 0.08 : 0.18);
  }
  resetCursor(doc);
}

export function renderAdvisoryPdf(input: AdvisoryPdfInput): Promise<Buffer> {
  const logoPath = resolveReportLogoPath();
  const brand = defaultReportBrand();
  const margin = PDF_PAGE_MARGIN;
  const pageW = 595.28 - margin * 2;
  const salesEmail = String(input.salesEmail || brand.email || 'sales@physicalrisk.com').trim();
  const summary = buildEadReportSummary({
    modules: input.modules,
    evidence: input.evidence || [],
    routes: input.routes || [],
  });
  const questionsByModule = new Map<string, EadReportQuestionInput[]>();
  for (const q of input.questions || []) {
    if (!q.isActive) continue;
    const list = questionsByModule.get(q.moduleCode) || [];
    list.push(q);
    questionsByModule.set(q.moduleCode, list);
  }
  for (const list of questionsByModule.values()) {
    list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin,
      bufferPages: true,
      info: {
        Title: `${input.productLabel} — ${input.organisation}`,
        Author: 'Physical Risk Consultancy (Pty) Ltd',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(Buffer.from(c)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const red = brand.brandColor || '#c41230';
    const ink = '#111827';
    const muted = '#475569';
    const pageBottom = () => doc.page.height - margin - 36;

    const header = (compact = false) => {
      const y = drawPdfLetterhead(doc, { logoPath, brand, compact, margin });
      beginBodyAfterLetterhead(doc, y, margin);
      resetCursor(doc);
    };

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > pageBottom()) {
        doc.addPage();
        header(true);
      }
      resetCursor(doc);
    };

    const sectionTitle = (title: string) => {
      ensureSpace(64);
      resetCursor(doc);
      // Separate this stage from the block above.
      doc.moveDown(0.45);
      resetCursor(doc);
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(14).text(title, { width: pageW });
      resetCursor(doc);
      // Keep heading clear of the table / content that follows.
      doc.moveDown(0.7);
      resetCursor(doc);
    };

    const metaLine = (label: string, value: string) => {
      resetCursor(doc);
      doc.fillColor(muted).font('Helvetica').fontSize(9).text(`${label}: ${value}`, { width: pageW });
      resetCursor(doc);
    };

    // ── Cover / opening ──────────────────────────────────────────────
    header(false);
    doc.fillColor(red).font('Helvetica-Bold').fontSize(9).text(input.productLabel.toUpperCase(), {
      characterSpacing: 0.8,
    });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(22).text(input.title || input.productLabel, {
      width: pageW,
    });
    doc.moveDown(0.4);
    metaLine('Organisation', input.organisation);
    metaLine('Reference', input.reference);
    metaLine('Status', input.status);
    if (input.consultant) metaLine('Consultant', input.consultant);
    if (input.reportVersion != null) metaLine('Report version', String(input.reportVersion));
    if (input.templateLabel) metaLine('Diagnostic template', input.templateLabel);
    if (input.generatedAt) {
      const d = input.generatedAt instanceof Date ? input.generatedAt : new Date(input.generatedAt);
      if (!Number.isNaN(d.getTime())) metaLine('Generated', d.toISOString().slice(0, 10));
    }
    doc.moveDown(0.8);

    const hasAnyScore = summary.moduleScores.some((r) => r.assuranceScore != null);
    const useScores = input.scoredDiagnostic ?? hasAnyScore;

    // ── Executive summary ────────────────────────────────────────────
    if (useScores) {
      drawExecutiveSummary(doc, summary, { pageW, ink, muted, red, ensureSpace, sectionTitle });
    } else {
      sectionTitle('Executive summary');
      doc
        .fillColor(ink)
        .font('Helvetica')
        .fontSize(10)
        .text(
          'This Level 3 focused assurance report is evidence-led. It records findings, evidence limitations, business consequences and required executive decisions by working-paper module. It does not apply an overall diagnostic assurance score.',
          { width: pageW, lineGap: 2 },
        );
      doc.moveDown(0.8);
      resetCursor(doc);
    }

    // ── Module scorecard + chart (Level 2 diagnostic only) ───────────
    if (useScores) {
      drawModuleScorecard(doc, summary, { pageW, margin, ink, muted, red, ensureSpace, sectionTitle });
      drawHorizontalBarChart(doc, summary, { pageW, margin, ink, muted, ensureSpace, sectionTitle });
      drawPriorityAreas(doc, summary, { pageW, ink, muted, ensureSpace, sectionTitle });
    }

    // ── Key findings ─────────────────────────────────────────────────
    drawKeyFindings(doc, summary, {
      pageW,
      ink,
      muted,
      ensureSpace,
      sectionTitle,
      drawAdvisoryRichText,
      allModules: !useScores,
    });

    // ── Business consequences ────────────────────────────────────────
    drawConsequences(doc, summary, { pageW, ink, muted, ensureSpace, sectionTitle });

    // ── Executive decisions ──────────────────────────────────────────
    drawExecutiveDecisions(doc, summary, {
      pageW,
      ink,
      muted,
      ensureSpace,
      sectionTitle,
      drawAdvisoryRichText,
    });

    // ── Recommendations + CTA (diagnostic routing only) ──────────────
    if (useScores && summary.recommendations.length) {
      drawRecommendations(doc, summary, salesEmail, {
        pageW,
        ink,
        muted,
        red,
        ensureSpace,
        sectionTitle,
      });
    }

    // ── Assurance basis + scale (scored diagnostic only) ─────────────
    if (useScores) {
      drawAssuranceBasis(doc, summary, { pageW, ink, muted, ensureSpace, sectionTitle });
    }

    // ── Evidence ─────────────────────────────────────────────────────
    drawEvidence(doc, summary, { pageW, ink, muted, ensureSpace, sectionTitle });

    // ── Module detail pages ──────────────────────────────────────────
    drawModuleDetails(doc, input, summary, questionsByModule, {
      pageW,
      ink,
      muted,
      red,
      ensureSpace,
      sectionTitle,
      header,
      drawAdvisoryRichText,
      showScores: useScores,
    });

    // ── Conclusion ───────────────────────────────────────────────────
    ensureSpace(160);
    drawConclusion(doc, summary, salesEmail, {
      pageW,
      ink,
      muted,
      red,
      ensureSpace,
      sectionTitle,
      showScores: useScores,
    });

    doc.end();
  });
}

type DrawCtx = {
  pageW: number;
  ink: string;
  muted: string;
  red?: string;
  margin?: number;
  ensureSpace: (n: number) => void;
  sectionTitle: (t: string) => void;
  drawAdvisoryRichText?: typeof drawAdvisoryRichText;
  header?: (compact?: boolean) => void;
};

const BAND_LEGEND = [
  { hex: '#d20a11', label: '0–39 Priority' },
  { hex: '#ea580c', label: '40–59 Improve' },
  { hex: '#ca8a04', label: '60–79 Moderate' },
  { hex: '#15803d', label: '80–100 Strong' },
] as const;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

type TableColumn = {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
};

type TableCell = {
  text: string;
  color?: string;
  bold?: boolean;
};

type TableRow = {
  cells: Record<string, TableCell | string>;
  fill?: string;
  accent?: string;
};

function cellText(value: TableCell | string | undefined): TableCell {
  if (value == null) return { text: '' };
  if (typeof value === 'string') return { text: value };
  return value;
}

/** Draw a bordered multi-column table with wrapped cells and page-break support. */
function drawTable(
  doc: PDFKit.PDFDocument,
  ctx: DrawCtx,
  columns: TableColumn[],
  rows: TableRow[],
  opts?: { headerFill?: string; fontSize?: number; padX?: number; padY?: number },
) {
  const startX = leftX(doc);
  const fontSize = opts?.fontSize ?? 8;
  const padX = opts?.padX ?? 6;
  const padY = opts?.padY ?? 7;
  const headerFill = opts?.headerFill ?? '#e2e8f0';
  const border = '#cbd5e1';
  const lineW = 0.6;

  const measureRowHeight = (row: TableRow, isHeader = false) => {
    let maxH = 12;
    for (const col of columns) {
      const cell = isHeader
        ? { text: col.header, bold: true }
        : cellText(row.cells[col.key]);
      doc.font(cell.bold || isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
      const h = doc.heightOfString(cell.text || ' ', {
        width: Math.max(8, col.width - padX * 2),
        lineGap: 1.2,
      });
      maxH = Math.max(maxH, h);
    }
    return maxH + padY * 2;
  };

  const drawRowBorder = (y: number, h: number, fill?: string, accent?: string) => {
    doc.save();
    if (fill) doc.rect(startX, y, ctx.pageW, h).fill(fill);
    if (accent) doc.rect(startX, y, 3.5, h).fill(accent);
    doc.rect(startX, y, ctx.pageW, h).strokeColor(border).lineWidth(lineW).stroke();
    let x = startX;
    for (let i = 0; i < columns.length - 1; i++) {
      x += columns[i].width;
      doc
        .moveTo(x, y)
        .lineTo(x, y + h)
        .strokeColor(border)
        .lineWidth(lineW)
        .stroke();
    }
    doc.restore();
  };

  const paintCells = (y: number, h: number, row: TableRow, isHeader = false) => {
    let x = startX;
    for (const col of columns) {
      const cell = isHeader
        ? ({ text: col.header, bold: true, color: ctx.muted } as TableCell)
        : cellText(row.cells[col.key]);
      const inset = !isHeader && row.accent && col === columns[0] ? 4 : 0;
      doc
        .fillColor(cell.color || (isHeader ? ctx.muted : ctx.ink))
        .font(cell.bold || isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isHeader ? Math.max(7, fontSize - 0.5) : fontSize)
        .text(cell.text || ' ', x + padX + inset, y + padY, {
          width: Math.max(8, col.width - padX * 2 - inset),
          align: col.align || 'left',
          lineGap: 1.2,
          height: h - padY * 2 + 1,
        });
      x += col.width;
    }
  };

  // Header
  const headerH = measureRowHeight({ cells: {} }, true);
  ctx.ensureSpace(headerH + 8);
  let y = doc.y;
  drawRowBorder(y, headerH, headerFill);
  paintCells(y, headerH, { cells: {} }, true);
  resetCursor(doc, y + headerH);

  for (const row of rows) {
    const h = measureRowHeight(row);
    ctx.ensureSpace(h + 4);
    y = doc.y;
    drawRowBorder(y, h, row.fill, row.accent);
    paintCells(y, h, row);
    resetCursor(doc, y + h);
  }
  doc.moveDown(0.55);
  resetCursor(doc);
}

function drawColourLegend(doc: PDFKit.PDFDocument, ctx: DrawCtx, y: number) {
  const startX = leftX(doc);
  const gap = 8;
  const chipW = (ctx.pageW - gap * (BAND_LEGEND.length - 1)) / BAND_LEGEND.length;
  BAND_LEGEND.forEach((band, i) => {
    const x = startX + i * (chipW + gap);
    doc.save();
    doc.rect(x, y, 10, 10).fill(band.hex);
    doc.restore();
    doc
      .fillColor(ctx.ink)
      .font('Helvetica')
      .fontSize(7)
      .text(band.label, x + 14, y + 1, { width: chipW - 14, lineBreak: false });
  });
  resetCursor(doc, y + 16);
  doc.moveDown(0.35);
  resetCursor(doc);
}

function drawCtaPanel(doc: PDFKit.PDFDocument, salesEmail: string, ctx: DrawCtx) {
  ctx.ensureSpace(58);
  const x = leftX(doc);
  const y = doc.y;
  const h = 48;
  doc.save();
  doc.rect(x, y, ctx.pageW, h).fill('#f8f4f4');
  doc.rect(x, y, 5, h).fill(ctx.red || '#c41230');
  doc.restore();
  doc
    .fillColor(ctx.ink)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Next step', x + 16, y + 10, { width: ctx.pageW - 28, lineBreak: false });
  doc
    .fillColor(ctx.muted)
    .font('Helvetica')
    .fontSize(8)
    .text('To discuss these findings or arrange a recommended assessment:', x + 16, y + 24, {
      width: ctx.pageW - 28,
      lineBreak: false,
    });
  doc
    .fillColor(ctx.red || '#c41230')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(salesEmail, x + 16, y + 34, { width: ctx.pageW - 28, lineBreak: false });
  resetCursor(doc, y + h + 10);
}

function drawExecutiveSummary(doc: PDFKit.PDFDocument, summary: EadReportSummary, ctx: DrawCtx) {
  ctx.sectionTitle('Executive summary');
  const startX = leftX(doc);

  if (summary.overallAssuranceScore != null && summary.overallBand && summary.overallVisual) {
    ctx.ensureSpace(118);
    const leftW = Math.round(ctx.pageW * 0.3);
    const panelH = 96;
    const accent = summary.overallVisual.colourHex;
    const y = doc.y;

    doc.save();
    doc.rect(startX, y, leftW, panelH).fill(accent);
    doc.rect(startX + leftW, y, ctx.pageW - leftW, panelH).fill('#1f1f1f');
    doc.restore();

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('OVERALL ASSURANCE', startX + 12, y + 14, {
        width: leftW - 22,
        characterSpacing: 0.6,
        lineBreak: false,
      });

    const scoreLabel = String(summary.overallAssuranceScore);
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(34)
      .text(scoreLabel, startX + 12, y + 32, { width: leftW - 50, lineBreak: false });
    const scoreWidth = doc.widthOfString(scoreLabel);
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('/100', startX + 12 + scoreWidth + 2, y + 50, { lineBreak: false });

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(summary.overallBand.displayLabel.toUpperCase(), startX + 12, y + 74, {
        width: leftW - 22,
        lineBreak: false,
      });

    const posX = startX + leftW + 16;
    const posW = ctx.pageW - leftW - 28;
    doc
      .fillColor('#d8d8d8')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('EXECUTIVE POSITION', posX, y + 14, { width: posW, characterSpacing: 0.7, lineBreak: false });
    doc
      .fillColor('#ffffff')
      .font('Helvetica')
      .fontSize(9)
      .text(summary.executiveNarrative, posX, y + 30, { width: posW, lineGap: 1.8 });
    resetCursor(doc, y + panelH + 14);

    // Band lamp row
    const lampGap = 6;
    const lampH = 10;
    const lampW = (ctx.pageW - lampGap * 3) / 4;
    const activeIdx = summary.overallVisual.bandIndex;
    BAND_LEGEND.forEach((band, i) => {
      const lx = startX + i * (lampW + lampGap);
      doc.save();
      doc.rect(lx, doc.y, lampW, lampH).fill(i === activeIdx ? band.hex : '#e8e8e8');
      doc.restore();
      doc
        .fillColor(i === activeIdx ? ctx.ink : ctx.muted)
        .font(i === activeIdx ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(6.5)
        .text(band.label, lx, doc.y + lampH + 4, { width: lampW, align: 'center', lineBreak: false });
    });
    resetCursor(doc, doc.y + lampH + 22);
  } else {
    doc.fillColor(ctx.muted).font('Helvetica').fontSize(10).text('Overall assurance score not available.');
    doc.moveDown(0.35);
    resetCursor(doc);
    doc
      .fillColor(ctx.ink)
      .font('Helvetica')
      .fontSize(10)
      .text(summary.executiveNarrative, { width: ctx.pageW, lineGap: 2 });
    doc.moveDown(0.8);
    resetCursor(doc);
  }
}

function drawModuleScorecard(
  doc: PDFKit.PDFDocument,
  summary: EadReportSummary,
  ctx: DrawCtx,
  opts?: { compact?: boolean; title?: string },
) {
  ctx.ensureSpace(90);
  ctx.sectionTitle(opts?.title || 'Diagnostic results — module scorecard');
  drawColourLegend(doc, ctx, doc.y);

  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'module', header: 'DIAGNOSTIC AREA', width: w * 0.42 },
      { key: 'score', header: 'SCORE', width: w * 0.16 },
      { key: 'status', header: 'STATUS', width: w * 0.42 },
    ],
    summary.moduleScores.map((row) => {
      const accent = row.visual?.colourHex || '#94a3b8';
      const textHex = row.visual?.textHex || ctx.ink;
      return {
        fill: row.visual?.panelHex || '#ffffff',
        accent,
        cells: {
          module: row.moduleName,
          score: {
            text: row.assuranceScore == null ? '—' : `${row.assuranceScore}/100`,
            color: accent,
            bold: true,
          },
          status: {
            text: row.band?.displayLabel || 'Not scored',
            color: textHex,
          },
        },
      };
    }),
    { fontSize: opts?.compact ? 7.5 : 8.5, padY: opts?.compact ? 6 : 7 },
  );
}

function drawHorizontalBarChart(
  doc: PDFKit.PDFDocument,
  summary: EadReportSummary,
  ctx: DrawCtx,
  opts?: { compact?: boolean; title?: string },
) {
  const labelW = 150;
  const scoreW = 30;
  const barMax = ctx.pageW - labelW - scoreW - 12;
  const startX = leftX(doc);
  const rowH = opts?.compact ? 18 : 22;
  const barH = opts?.compact ? 9 : 12;

  ctx.ensureSpace(40 + summary.moduleScores.length * (rowH + 4));
  ctx.sectionTitle(opts?.title || 'Assurance profile');

  for (const row of summary.moduleScores) {
    ctx.ensureSpace(rowH + 6);
    const score = row.assuranceScore;
    const y = doc.y;
    const textY = y + (rowH - 8) / 2;
    const barY = y + (rowH - barH) / 2;
    const accent = row.visual?.colourHex || '#64748b';

    doc
      .fillColor(ctx.ink)
      .font('Helvetica')
      .fontSize(8)
      .text(row.moduleName, startX, textY, { width: labelW - 6, lineBreak: false, ellipsis: true });

    doc.save();
    doc.rect(startX + labelW, barY, barMax, barH).fill('#ececec');
    if (score != null) {
      const fillW = Math.max(3, clamp01(score / 100) * barMax);
      doc.rect(startX + labelW, barY, fillW, barH).fill(accent);
    }
    doc.restore();

    doc
      .fillColor(score == null ? ctx.muted : accent)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(score == null ? '—' : String(Math.round(score)), startX + labelW + barMax + 6, textY, {
        width: scoreW,
        lineBreak: false,
      });
    resetCursor(doc, y + rowH + 4);
  }
  doc.moveDown(0.25);
  resetCursor(doc);
}

function drawPriorityAreas(doc: PDFKit.PDFDocument, summary: EadReportSummary, ctx: DrawCtx) {
  ctx.sectionTitle('Priority areas requiring executive attention');
  if (!summary.priorityAreas.length) {
    doc
      .fillColor(ctx.muted)
      .font('Helvetica')
      .fontSize(10)
      .text('No diagnostic areas currently fall within the high-concern threshold.', {
        width: ctx.pageW,
      });
    doc.moveDown(0.6);
    return;
  }

  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'rank', header: '#', width: w * 0.06 },
      { key: 'module', header: 'MODULE', width: w * 0.28 },
      { key: 'score', header: 'SCORE', width: w * 0.14 },
      { key: 'status', header: 'STATUS', width: w * 0.24 },
      { key: 'issue', header: 'KEY ISSUE', width: w * 0.28 },
    ],
    summary.priorityAreas.map((area, idx) => ({
      fill: area.visual.panelHex,
      accent: area.visual.colourHex,
      cells: {
        rank: { text: String(idx + 1), bold: true },
        module: { text: area.moduleName, bold: true },
        score: {
          text: `${area.assuranceScore}/100`,
          color: area.visual.colourHex,
          bold: true,
        },
        status: {
          text: area.band.displayLabel,
          color: area.visual.textHex,
        },
        issue: area.keyFinding || 'Not recorded',
      },
    })),
    { fontSize: 8 },
  );
}

function drawKeyFindings(
  doc: PDFKit.PDFDocument,
  summary: EadReportSummary,
  ctx: DrawCtx & { drawAdvisoryRichText: typeof drawAdvisoryRichText; allModules?: boolean },
) {
  const priorityCodes = new Set(summary.priorityAreas.map((p) => p.moduleCode));
  const rows = ctx.allModules
    ? summary.moduleScores.filter(
        (r) =>
          r.findingPlain ||
          r.consequenceLabels.length ||
          r.requiredDecisionPlain,
      )
    : summary.moduleScores.filter(
        (r) => priorityCodes.has(r.moduleCode) || (r.assuranceScore != null && r.assuranceScore < 60),
      );
  if (!rows.length) return;

  ctx.sectionTitle('Key findings summary');
  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'module', header: 'MODULE', width: w * 0.22 },
      { key: 'finding', header: 'FINDING', width: w * 0.3 },
      { key: 'consequences', header: 'CONSEQUENCES', width: w * 0.22 },
      { key: 'decision', header: 'REQUIRED DECISION', width: w * 0.26 },
    ],
    rows.slice(0, ctx.allModules ? 8 : 4).map((row) => ({
      fill: row.visual?.panelHex || '#ffffff',
      accent: row.visual?.colourHex,
      cells: {
        module: { text: row.moduleName, bold: true },
        finding: row.findingPlain || 'Not recorded',
        consequences: row.consequenceLabels.length
          ? row.consequenceLabels.join('; ')
          : 'Not recorded',
        decision: row.requiredDecisionPlain || 'Not recorded',
      },
    })),
    { fontSize: 7.5, padY: 8 },
  );
}

function drawConsequences(doc: PDFKit.PDFDocument, summary: EadReportSummary, ctx: DrawCtx) {
  ctx.sectionTitle('Key business consequences identified');
  if (!summary.consequences.length) {
    doc.fillColor(ctx.muted).font('Helvetica').fontSize(10).text('No business consequences recorded.');
    doc.moveDown(0.5);
    return;
  }
  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'consequence', header: 'BUSINESS CONSEQUENCE', width: w * 0.72 },
      { key: 'modules', header: 'MODULES AFFECTED', width: w * 0.28, align: 'center' },
    ],
    summary.consequences.map((c) => ({
      cells: {
        consequence: c.label,
        modules: {
          text: `${c.moduleCount} module${c.moduleCount === 1 ? '' : 's'}`,
          bold: true,
        },
      },
    })),
  );
}

function drawExecutiveDecisions(
  doc: PDFKit.PDFDocument,
  summary: EadReportSummary,
  ctx: DrawCtx & { drawAdvisoryRichText: typeof drawAdvisoryRichText },
) {
  ctx.sectionTitle('Executive decisions required');
  if (!summary.executiveDecisions.length) {
    doc.fillColor(ctx.muted).font('Helvetica').fontSize(10).text('No executive decisions recorded.');
    doc.moveDown(0.5);
    return;
  }
  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'rank', header: '#', width: w * 0.06 },
      { key: 'module', header: 'MODULE', width: w * 0.28 },
      { key: 'decision', header: 'REQUIRED EXECUTIVE DECISION', width: w * 0.66 },
    ],
    summary.executiveDecisions.map((item, idx) => ({
      cells: {
        rank: { text: String(idx + 1), bold: true },
        module: { text: item.moduleName, bold: true },
        decision: item.decisionPlain || 'Not recorded',
      },
    })),
    { fontSize: 8, padY: 8 },
  );
}

function drawRecommendations(
  doc: PDFKit.PDFDocument,
  summary: EadReportSummary,
  salesEmail: string,
  ctx: DrawCtx,
) {
  ctx.sectionTitle('Recommended next engagements');
  if (!summary.recommendations.length) {
    doc
      .fillColor(ctx.muted)
      .font('Helvetica')
      .fontSize(10)
      .text(
        'No additional Physical Risk assessment has been recommended. Further advisory discussion may be appropriate.',
        { width: ctx.pageW },
      );
    doc.moveDown(0.35);
  } else {
    const w = ctx.pageW;
    drawTable(
      doc,
      ctx,
      [
        { key: 'rank', header: '#', width: w * 0.06 },
        { key: 'product', header: 'ENGAGEMENT', width: w * 0.42 },
        { key: 'from', header: 'RECOMMENDED FROM', width: w * 0.52 },
      ],
      summary.recommendations.map((rec, idx) => {
        const fromModules = formatRecommendationSourceModules(rec.sourceModules);
        const rationale = stripHtmlToPlain(rec.rationale || '').trim();
        const fromText =
          fromModules ||
          (rec.source === 'confirmed_route' || rec.source === 'both'
            ? rationale || 'Confirmed route'
            : '—');
        return {
          accent: ctx.red || '#c41230',
          fill: '#f8fafc',
          cells: {
            rank: { text: String(idx + 1), bold: true },
            product: { text: rec.label, bold: true },
            from: { text: fromText },
          },
        };
      }),
      { fontSize: 8, padY: 8 },
    );
  }

  drawCtaPanel(doc, salesEmail, ctx);
}

function drawAssuranceBasis(doc: PDFKit.PDFDocument, summary: EadReportSummary, ctx: DrawCtx) {
  ctx.sectionTitle('Assurance basis');
  doc
    .fillColor(ctx.ink)
    .font('Helvetica')
    .fontSize(9)
    .text(
      'This diagnostic conclusion is based on structured consultant responses across the six assurance modules, supporting documentation supplied during the engagement, management input where recorded, and assessment evidence uploaded to the diagnostic. Findings and decisions are those recorded by the assigned consultant. This report is not an audit opinion.',
      { width: ctx.pageW, lineGap: 1.5 },
    );
  doc.moveDown(0.45);
  doc.fillColor(ctx.ink).font('Helvetica-Bold').fontSize(9).text('Assurance scale');
  doc.moveDown(0.45);

  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'range', header: 'SCORE RANGE', width: w * 0.22 },
      { key: 'label', header: 'STATUS', width: w * 0.58 },
      { key: 'band', header: 'BAND', width: w * 0.2 },
    ],
    summary.assuranceScaleLegend.map((row, i) => ({
      accent: BAND_LEGEND[i]?.hex,
      cells: {
        range: { text: row.range, bold: true },
        label: row.label,
        band: {
          text: BAND_LEGEND[i]?.label.split(' ').slice(1).join(' ') || '—',
          color: BAND_LEGEND[i]?.hex,
          bold: true,
        },
      },
    })),
    { fontSize: 8 },
  );

  doc
    .fillColor(ctx.muted)
    .font('Helvetica')
    .fontSize(8)
    .text(
      'Assurance score: higher is better. Exposure indicators (where shown) are derived as 100 − assurance and are for internal routing context only.',
      { width: ctx.pageW },
    );
  doc.moveDown(0.45);

  if (summary.responseScaleLegend?.length) {
    doc.fillColor(ctx.ink).font('Helvetica-Bold').fontSize(9).text('Response scale notes');
    doc.moveDown(0.3);
    for (const row of summary.responseScaleLegend) {
      doc
        .fillColor(ctx.ink)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(`${row.label}: `, { continued: true, width: ctx.pageW });
      doc.font('Helvetica').fillColor(ctx.muted).text(row.note, { width: ctx.pageW });
      doc.moveDown(0.2);
    }
  }

  if (summary.notAwareCount > 0) {
    doc.moveDown(0.2);
    doc
      .fillColor(ctx.ink)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Knowledge gaps identified: ${summary.notAwareCount} criterion${summary.notAwareCount === 1 ? '' : 'ia'} marked “Not aware”.`,
        { width: ctx.pageW },
      );
  }
  doc.moveDown(0.55);
}

function drawEvidence(doc: PDFKit.PDFDocument, summary: EadReportSummary, ctx: DrawCtx) {
  ctx.sectionTitle('Evidence referenced');
  if (!summary.evidence.length) {
    doc
      .fillColor(ctx.muted)
      .font('Helvetica')
      .fontSize(10)
      .text('No supporting documentation was attached to this assessment.');
    doc.moveDown(0.5);
    return;
  }
  doc
    .fillColor(ctx.muted)
    .font('Helvetica')
    .fontSize(8)
    .text('Source documents are retained with the engagement record and are referenced below (not embedded).');
  doc.moveDown(0.45);

  const w = ctx.pageW;
  drawTable(
    doc,
    ctx,
    [
      { key: 'appendix', header: 'APPENDIX', width: w * 0.18 },
      { key: 'title', header: 'DOCUMENT TITLE', width: w * 0.5 },
      { key: 'file', header: 'FILE NAME', width: w * 0.32 },
    ],
    summary.evidence.map((e) => ({
      cells: {
        appendix: { text: e.appendixLabel, bold: true },
        title: e.title,
        file: e.fileName || '—',
      },
    })),
  );
}

function drawModuleDetails(
  doc: PDFKit.PDFDocument,
  input: AdvisoryPdfInput,
  summary: EadReportSummary,
  questionsByModule: Map<string, EadReportQuestionInput[]>,
  ctx: DrawCtx & {
    header: (compact?: boolean) => void;
    drawAdvisoryRichText: typeof drawAdvisoryRichText;
    showScores?: boolean;
  },
) {
  summary.moduleScores.forEach((row, i) => {
    const source = input.modules[i];
    ctx.ensureSpace(110);
    resetCursor(doc);

    doc
      .fillColor(ctx.red || '#c41230')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`${i + 1}. ${row.moduleName.toUpperCase()}`, { width: ctx.pageW });
    resetCursor(doc);
    doc
      .fillColor(ctx.ink)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(source?.principalQuestion || row.moduleName, { width: ctx.pageW });
    resetCursor(doc);
    doc.moveDown(0.25);
    if (ctx.showScores !== false) {
      if (row.assuranceScore != null && row.band) {
        doc
          .fillColor(row.visual?.colourHex || ctx.ink)
          .font('Helvetica')
          .fontSize(9)
          .text(`Assurance score: ${row.assuranceScore}/100 — ${row.band.displayLabel}`, {
            width: ctx.pageW,
          });
      } else {
        doc.fillColor(ctx.muted).font('Helvetica').fontSize(9).text('Assurance score: Not scored');
      }
      resetCursor(doc);
      doc.moveDown(0.65);
    } else {
      doc.moveDown(0.35);
    }

    const questions = questionsByModule.get(row.moduleCode) || [];
    const answers = row.diagnostic?.answers || {};
    if (questions.length) {
      doc.fillColor(ctx.ink).font('Helvetica-Bold').fontSize(8).text('DIAGNOSTIC RESPONSES');
      resetCursor(doc);
      doc.moveDown(0.5);
      resetCursor(doc);
      const qw = ctx.pageW;
      drawTable(
        doc,
        ctx,
        [
          { key: 'title', header: 'CRITERION', width: qw * 0.22 },
          { key: 'question', header: 'QUESTION', width: qw * 0.52 },
          { key: 'response', header: 'RESPONSE', width: qw * 0.26 },
        ],
        questions.map((q) => {
          const ans = answers[q.questionCode];
          return {
            cells: {
              title: { text: q.title, bold: true },
              question: q.questionText,
              response: formatDiagnosticAnswerLabel(ans == null ? null : String(ans)),
            },
          };
        }),
        { fontSize: 7.5, padY: 7 },
      );
    }

    const fields: Array<[string, string]> = [
      ['Finding', stripHtmlToPlain(String(source?.finding || '')).trim() || 'Not recorded'],
      [
        'Evidence / limitation',
        stripHtmlToPlain(String(source?.evidenceSummary || '')).trim() || 'Not recorded',
      ],
      [
        'Business consequences',
        row.consequenceLabels.join('; ') ||
          stripHtmlToPlain(String(source?.businessConsequence || '')).trim() ||
          'Not recorded',
      ],
      [
        'Consequence context',
        stripHtmlToPlain(String(source?.businessConsequenceDetail || '')).trim() || 'Not recorded',
      ],
      [
        'Accountable executive',
        stripHtmlToPlain(String(source?.accountableExecutive || '')).trim() || 'Not recorded',
      ],
      [
        'Required decision',
        stripHtmlToPlain(String(source?.requiredDecision || '')).trim() || 'Not recorded',
      ],
      [
        'Recommended next products',
        row.recommendedProductLabels.length
          ? row.recommendedProductLabels.map((label) => `• ${label}`).join('\n')
          : 'None selected',
      ],
      [
        'Consultant note',
        stripHtmlToPlain(String(source?.analystNote || '')).trim() || 'Not recorded',
      ],
    ];

    doc.moveDown(0.45);
    doc.fillColor(ctx.ink).font('Helvetica-Bold').fontSize(8).text('MODULE RECORD');
    resetCursor(doc);
    doc.moveDown(0.5);
    resetCursor(doc);
    const mw = ctx.pageW;
    drawTable(
      doc,
      ctx,
      [
        { key: 'field', header: 'FIELD', width: mw * 0.28 },
        { key: 'value', header: 'DETAIL', width: mw * 0.72 },
      ],
      fields.map(([field, value]) => ({
        cells: {
          field: { text: field, bold: true },
          value,
        },
      })),
      { fontSize: 7.5, padY: 7 },
    );
    doc.moveDown(0.55);
    resetCursor(doc);
  });
}

function drawConclusion(
  doc: PDFKit.PDFDocument,
  summary: EadReportSummary,
  salesEmail: string,
  ctx: DrawCtx & { showScores?: boolean },
) {
  ctx.ensureSpace(220);
  ctx.sectionTitle('Executive assurance conclusion');

  if (ctx.showScores === false) {
    doc
      .fillColor(ctx.ink)
      .font('Helvetica')
      .fontSize(10)
      .text(
        'This focused assurance review concludes on an evidence-led basis. Module findings, limitations and required decisions above should be read together with the referenced evidence. No overall diagnostic assurance score is assigned for this product.',
        { width: ctx.pageW, lineGap: 2 },
      );
    doc.moveDown(0.8);
    resetCursor(doc);
    doc
      .fillColor(ctx.muted)
      .font('Helvetica')
      .fontSize(9)
      .text(
        `For clarification of findings or next steps, contact ${salesEmail}.`,
        { width: ctx.pageW },
      );
    return;
  }

  if (summary.overallAssuranceScore != null && summary.overallBand) {
    doc
      .fillColor(summary.overallVisual?.colourHex || ctx.ink)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(
        `Overall assurance: ${summary.overallAssuranceScore}/100 — ${summary.overallBand.displayLabel}`,
      );
    doc.moveDown(0.25);
  }

  drawModuleScorecard(doc, summary, ctx, {
    compact: true,
    title: 'Module summary',
  });
  drawHorizontalBarChart(doc, summary, ctx, {
    compact: true,
    title: 'Assurance profile (summary)',
  });

  const w = ctx.pageW;
  if (summary.priorityAreas.length) {
    doc.fillColor(ctx.ink).font('Helvetica-Bold').fontSize(9).text('Priority concerns');
    resetCursor(doc);
    doc.moveDown(0.5);
    resetCursor(doc);
    drawTable(
      doc,
      ctx,
      [
        { key: 'module', header: 'MODULE', width: w * 0.45 },
        { key: 'score', header: 'SCORE', width: w * 0.2 },
        { key: 'status', header: 'STATUS', width: w * 0.35 },
      ],
      summary.priorityAreas.map((p) => ({
        fill: p.visual.panelHex,
        accent: p.visual.colourHex,
        cells: {
          module: { text: p.moduleName, bold: true },
          score: { text: `${p.assuranceScore}/100`, color: p.visual.colourHex, bold: true },
          status: { text: p.band.displayLabel, color: p.visual.textHex },
        },
      })),
      { fontSize: 8 },
    );
  }

  if (summary.recommendations.length) {
    doc.fillColor(ctx.ink).font('Helvetica-Bold').fontSize(9).text('Recommended next engagements');
    resetCursor(doc);
    doc.moveDown(0.5);
    resetCursor(doc);
    drawTable(
      doc,
      ctx,
      [
        { key: 'rank', header: '#', width: w * 0.08 },
        { key: 'product', header: 'ENGAGEMENT', width: w * 0.52 },
        { key: 'from', header: 'FROM', width: w * 0.4 },
      ],
      summary.recommendations.map((r, idx) => ({
        accent: ctx.red || '#c41230',
        cells: {
          rank: { text: String(idx + 1), bold: true },
          product: { text: r.label, bold: true },
          from: {
            text: formatRecommendationSourceModules(r.sourceModules) || '—',
          },
        },
      })),
      { fontSize: 8 },
    );
  } else {
    doc
      .fillColor(ctx.muted)
      .font('Helvetica')
      .fontSize(9)
      .text('No further Physical Risk product is currently recommended.');
    doc.moveDown(0.35);
  }

  drawCtaPanel(doc, salesEmail, ctx);
}
