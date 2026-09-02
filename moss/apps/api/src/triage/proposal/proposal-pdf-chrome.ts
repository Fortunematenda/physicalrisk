import type PDFDocument from 'pdfkit';
import { defaultReportBrand, resolveReportLogoPath } from '../../reports/pdf-letterhead';
import { resolveProposalCoverLogoPath, resolveProposalSlideHeaderPath } from '../../reports/scl-report-branding';
import { parseProposalRichText, richFont, stripHtmlToPlain } from './proposal-rich-text';

export const PROPOSAL_PAGE_WIDTH = 841.89;
export const PROPOSAL_PAGE_HEIGHT = 473.56;
export const PROPOSAL_MARGIN = 36;
/** PPT master header aspect ratio (12192000 × 1549400 EMU). */
const PPT_HEADER_ASPECT = 1549400 / 12192000;
export const PROPOSAL_HEADER_H = Math.round(PROPOSAL_PAGE_WIDTH * PPT_HEADER_ASPECT) + 6;
export const PROPOSAL_FOOTER_H = 28;
export const PROPOSAL_TOP_BAR_H = 6;

const BLACK = '#111111';
const INK = '#1C2733';
const MUTED = '#677482';
const RULE = '#D9E1E7';
const HEADER_BG = '#E8EAED';
const HEADER_DARK = '#2D2D2D';
const TABLE_HEAD = '#2E75B6';
const TABLE_HEAD_TEXT = '#FFFFFF';
const RED = '#C41230';
const ROW_A = '#F4F6F8';
const ROW_B = '#FFFFFF';
const PHASE_COLORS = ['#2E75B6', '#548235', '#BF8F00'];

export const PROPOSAL_COLORS = {
  BLACK,
  INK,
  MUTED,
  RULE,
  HEADER_BG,
  HEADER_DARK,
  TABLE_HEAD,
  TABLE_HEAD_TEXT,
  RED,
  TEAL: '#00796B',
  GREEN: '#548235',
};

export type ProposalPdfChrome = {
  logoPath: string | null;
  coverLogoPath: string | null;
  headerPath: string | null;
  brandName: string;
  red: string;
};

export function createProposalChrome(): ProposalPdfChrome {
  const brand = defaultReportBrand();
  return {
    logoPath: resolveReportLogoPath(),
    coverLogoPath: resolveProposalCoverLogoPath(),
    headerPath: resolveProposalSlideHeaderPath(),
    brandName: brand.consultancyName,
    red: brand.brandColor || RED,
  };
}

export function contentBottom(): number {
  return PROPOSAL_PAGE_HEIGHT - PROPOSAL_FOOTER_H - PROPOSAL_MARGIN;
}

export function hasBodyContent(doc: PDFKit.PDFDocument): boolean {
  return doc.y > PROPOSAL_HEADER_H + 18;
}

export function currentPageIndex(doc: PDFKit.PDFDocument): number {
  const range = doc.bufferedPageRange();
  return range.start + range.count - 1;
}

/** Tracks the highest page index that received visible body/content markup. */
let lastContentPageIndex = 0;
/** Tracks the highest page with substantive body (excludes title-only / header-only pages). */
let lastBodyPageIndex = 0;
const pageMaxY: Record<number, number> = {};

export function resetProposalPageTracker(initialPage = 0) {
  lastContentPageIndex = initialPage;
  lastBodyPageIndex = initialPage;
  clearProposalHeaderTitle();
  for (const key of Object.keys(pageMaxY)) delete pageMaxY[Number(key)];
}

export function trackPageY(doc: PDFKit.PDFDocument) {
  const idx = currentPageIndex(doc);
  pageMaxY[idx] = Math.max(pageMaxY[idx] || 0, doc.y);
}

export function markProposalContent(doc: PDFKit.PDFDocument) {
  const idx = currentPageIndex(doc);
  trackPageY(doc);
  lastContentPageIndex = Math.max(lastContentPageIndex, idx);
}

export function markProposalBodyContent(doc: PDFKit.PDFDocument) {
  markProposalContent(doc);
  lastBodyPageIndex = Math.max(lastBodyPageIndex, currentPageIndex(doc));
}

type PdfKitInternal = PDFKit.PDFDocument & {
  _pageBuffer?: unknown[];
  _root?: { data: { Pages: { data: { Kids: unknown[]; Count: number } } } };
};

function pagesRoot(doc: PDFKit.PDFDocument) {
  return (doc as PdfKitInternal)._root?.data?.Pages?.data;
}

/** PDFKit only exposes _pageBuffer.pop() — must also remove from Pages.Kids or blank pages remain. */
function removeLastBufferedPage(doc: PDFKit.PDFDocument): boolean {
  const internal = doc as PdfKitInternal;
  if (!Array.isArray(internal._pageBuffer) || internal._pageBuffer.length === 0) return false;

  internal._pageBuffer.pop();
  const root = pagesRoot(doc);
  if (root?.Kids?.length) {
    root.Kids.pop();
    root.Count = Math.max(0, root.Count - 1);
  }
  return true;
}

export function trimToTrackedContentPages(doc: PDFKit.PDFDocument) {
  const internal = doc as PdfKitInternal;
  if (!Array.isArray(internal._pageBuffer)) return;

  const minContentY = PROPOSAL_HEADER_H + 24;
  const minPages = 2; // cover + contents

  while (internal._pageBuffer.length > minPages) {
    const lastIdx = internal._pageBuffer.length - 1;

    // Drop pages beyond the last page that received real body content.
    if (lastIdx > lastBodyPageIndex) {
      removeLastBufferedPage(doc);
      continue;
    }

    const maxY = pageMaxY[lastIdx] ?? PROPOSAL_HEADER_H + 12;
    if (maxY > minContentY) break;
    removeLastBufferedPage(doc);
  }

  const lastValid = internal._pageBuffer.length - 1;
  if (lastValid >= 0) {
    doc.switchToPage(lastValid);
  }
}

/** Active slide title drawn in the brand header (PPTX title-in-header pattern). */
let currentHeaderTitle = '';

export function setProposalHeaderTitle(title: string) {
  currentHeaderTitle = title.trim();
}

export function clearProposalHeaderTitle() {
  currentHeaderTitle = '';
}

/** PPTX-style section title: bold black, left of header, logo stays on the right. */
function drawHeaderPageTitle(doc: PDFKit.PDFDocument, title: string) {
  if (!title) return;
  const pageW = doc.page.width;
  const headerH = PROPOSAL_HEADER_H;
  // Match PPT title band: ~20pt bold black, vertically centred in the light header strip.
  const fontSize = 20;
  const titleW = Math.round(pageW * 0.58);
  const titleY = Math.max(10, Math.round((headerH * 0.68 - fontSize) / 2) + 2);
  doc.fillColor(PROPOSAL_COLORS.BLACK)
    .font('Helvetica-Bold')
    .fontSize(fontSize)
    .text(title, PROPOSAL_MARGIN, titleY, {
      width: titleW,
      height: fontSize + 4,
      lineBreak: false,
      ellipsis: true,
    });
}

/** Draw Physical Risk proposal header — one PPT master image, full page width (no patch). */
export function drawProposalBrandHeader(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  opts: { pageTitle?: string; cover?: boolean } = {},
): number {
  const pageW = doc.page.width;
  const headerH = PROPOSAL_HEADER_H;
  const pageTitle = opts.cover ? '' : (opts.pageTitle ?? currentHeaderTitle);

  if (chrome.headerPath) {
    try {
      // Single continuous image: left stays at 0, width reaches the page wall.
      // Small bleed avoids a 1px hairline from PDF rounding — page clips overflow.
      // Do NOT draw any companion rectangle / filler beside the image.
      doc.save();
      doc.rect(0, 0, pageW, headerH).clip();
      doc.image(chrome.headerPath, 0, 0, { width: pageW + 1.5, height: headerH });
      doc.restore();
      drawHeaderPageTitle(doc, pageTitle);
      return PROPOSAL_HEADER_H;
    } catch {
      /* fall through to vector fallback */
    }
  }

  // Fallback if the PPTX header asset is missing
  const lineH = 1.5;
  const upperH = Math.round(headerH * 0.7);
  const tabH = headerH - upperH + 4;
  const tabX = Math.round(pageW * 0.44);
  const cornerR = 8;

  doc.rect(0, 0, pageW, lineH).fill('#4A4A4A');
  const grad = doc.linearGradient(0, lineH, 0, lineH + upperH);
  grad.stop(0, '#B0B7C0').stop(0.45, '#CDD2D8').stop(1, '#E9ECF0');
  doc.rect(0, lineH, pageW, upperH).fill(grad);
  doc.roundedRect(tabX, lineH + upperH - 6, pageW - tabX, tabH, cornerR).fill('#2D2D2D');

  const headerLogo = chrome.coverLogoPath || chrome.logoPath;
  if (headerLogo) {
    try {
      doc.image(headerLogo, pageW - 140, lineH + 6, { height: Math.round(upperH * 0.7) });
    } catch {
      doc.fillColor('#2D2D2D').font('Helvetica-Bold').fontSize(9)
        .text('physicalrisk', pageW - 132, lineH + 10, { width: 120, lineBreak: false });
    }
  }

  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8.5)
    .text('security matters', tabX + 12, lineH + upperH + 2, {
      width: pageW - tabX - 24,
      align: 'right',
      lineBreak: false,
    });

  drawHeaderPageTitle(doc, pageTitle);
  return PROPOSAL_HEADER_H;
}

export function startProposalPage(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  opts: { cover?: boolean; pageTitle?: string } = {},
) {
  const margin = PROPOSAL_MARGIN;
  const pageW = doc.page.width;

  if (opts.cover) {
    clearProposalHeaderTitle();
    doc.rect(0, 0, pageW, PROPOSAL_PAGE_HEIGHT).fill('#FFFFFF');
    drawProposalBrandHeader(doc, chrome, { cover: true });
    doc.y = PROPOSAL_HEADER_H + 10;
    doc.x = margin;
    return;
  }

  if (opts.pageTitle != null) setProposalHeaderTitle(opts.pageTitle);
  drawProposalBrandHeader(doc, chrome, { pageTitle: currentHeaderTitle });
  doc.y = PROPOSAL_HEADER_H + 14;
  doc.x = margin;
}

export function ensureProposalSpace(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  needed: number,
) {
  const bottom = contentBottom();
  if (doc.y + needed <= bottom) return;

  const contentStart = PROPOSAL_HEADER_H + 10;
  const usable = bottom - contentStart;
  const idx = currentPageIndex(doc);
  const maxY = pageMaxY[idx] ?? doc.y;

  if (needed <= usable && (!hasBodyContent(doc) || maxY <= PROPOSAL_HEADER_H + 28)) {
    doc.y = contentStart;
    doc.x = PROPOSAL_MARGIN;
    return;
  }

  doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
  startProposalPage(doc, chrome);
  trackPageY(doc);
}

/** Start a major section — title lives in the brand header (PPTX pattern), not the body. */
export function beginMajorSection(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  title: string,
  _contentW: number,
  opts: { pageBreak?: boolean | 'always' } = {},
): number {
  setProposalHeaderTitle(title);
  const forceBreak = opts.pageBreak === 'always' || opts.pageBreak === true;
  if (hasBodyContent(doc) || forceBreak) {
    doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
  }
  startProposalPage(doc, chrome, { pageTitle: title });
  trackPageY(doc);
  return currentPageIndex(doc);
}

/** Reserved contents slide — left blank until pagination is known. */
export function reserveContentsPage(doc: PDFKit.PDFDocument) {
  doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
}

/** Begin body content on a fresh page after the reserved contents slide. */
export function startBodyPages(doc: PDFKit.PDFDocument, chrome: ProposalPdfChrome) {
  doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
  startProposalPage(doc, chrome);
  trackPageY(doc);
}

export function paintContentsPageBackground(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, doc.page.width, PROPOSAL_PAGE_HEIGHT).fill('#FFFFFF');
}

export function clearPdfTextState(doc: PDFKit.PDFDocument) {
  type TextStateDoc = PDFKit.PDFDocument & {
    _wrapper?: unknown;
    _textOptions?: unknown;
    continuedX?: number;
  };
  const textState = doc as TextStateDoc;
  textState._wrapper = null;
  textState._textOptions = null;
  textState.continuedX = 0;
}

export function drawProposalFooter(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  pageIndex: number,
  pageCount: number,
  proposalNumber: string,
) {
  clearPdfTextState(doc);

  const margin = PROPOSAL_MARGIN;
  const pageW = doc.page.width;
  const y = PROPOSAL_PAGE_HEIGHT - PROPOSAL_FOOTER_H;
  doc.save();
  doc.x = margin;
  doc.y = y;

  doc.moveTo(margin, y).lineTo(pageW - margin, y).lineWidth(0.5).strokeColor(PROPOSAL_COLORS.RULE).stroke();

  if (chrome.logoPath) {
    try {
      doc.image(chrome.logoPath, pageW - margin - 44, y + 5, { height: 14 });
    } catch {
      /* skip */
    }
  }

  doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica').fontSize(7)
    .text(
      `${chrome.brandName}  ·  ${proposalNumber}  ·  Page ${pageIndex} of ${pageCount}`,
      margin,
      y + 9,
      {
        width: pageW - margin * 2 - 56,
        height: 12,
        align: 'left',
        lineBreak: false,
        continued: false,
      },
    );
  doc.restore();
  clearPdfTextState(doc);
}

/** In-body subheading (Scope, etc.) — bold black, smaller than the header slide title. */
export function sectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  _red: string,
  width: number,
) {
  const y = doc.y;
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(14)
    .text(title, PROPOSAL_MARGIN, y, { width, lineGap: 1 });
  doc.y = doc.y + 6;
  doc.x = PROPOSAL_MARGIN;
  trackPageY(doc);
  markProposalBodyContent(doc);
}

export function bodyText(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  text: string,
  width: number,
  opts: { x?: number; fontSize?: number } = {},
) {
  const startX = opts.x ?? PROPOSAL_MARGIN;
  const fontSize = opts.fontSize ?? 10;
  const blocks = parseProposalRichText(text);
  if (!blocks.length) {
    doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica-Oblique').fontSize(Math.max(8, fontSize - 1))
      .text('To be confirmed during proposal finalisation.', startX, doc.y, { width, lineGap: 2 });
    doc.moveDown(0.3);
    markProposalBodyContent(doc);
    return;
  }

  for (const block of blocks) {
    ensureProposalSpace(doc, chrome, 16);
    const prefix =
      block.type === 'list-item'
        ? block.ordered
          ? `${block.index}. `
          : '• '
        : '';
    const indent = block.type === 'list-item' ? 12 : 0;
    const x = startX + indent;
    const usableW = width - indent;
    const y = doc.y;

    doc.font('Helvetica').fontSize(fontSize);
    const prefixW = prefix ? doc.widthOfString(prefix) : 0;
    if (prefix) {
      doc.fillColor(PROPOSAL_COLORS.INK)
        .text(prefix, x, y, { lineBreak: false, continued: false });
    }

    const textX = x + prefixW;
    const textW = Math.max(24, usableW - prefixW);
    doc.x = textX;
    doc.y = y;

    const runs = block.runs.length ? block.runs : [{ text: ' ', style: {} }];
    runs.forEach((run, idx) => {
      const isLast = idx === runs.length - 1;
      doc.fillColor(PROPOSAL_COLORS.INK)
        .font(richFont(run.style))
        .fontSize(fontSize);
      const textOpts: PDFKit.Mixins.TextOptions = {
        width: textW,
        lineGap: 2,
        continued: !isLast,
        underline: Boolean(run.style.underline),
      };
      if (idx === 0) {
        doc.text(run.text, textX, y, textOpts);
      } else {
        doc.text(run.text, textOpts);
      }
    });

    doc.x = startX;
    doc.moveDown(block.type === 'list-item' ? 0.15 : 0.3);
    markProposalBodyContent(doc);
  }
}

export function drawCoverPage(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    proposalTitle: string;
    clientCompany: string;
    proposalNumber: string;
    proposalDate: string;
    proposalVersion: number;
  },
) {
  startProposalPage(doc, chrome, { cover: true });
  const pageW = PROPOSAL_PAGE_WIDTH;
  const pageH = PROPOSAL_PAGE_HEIGHT;
  const margin = PROPOSAL_MARGIN;
  const textW = pageW - margin * 2;
  const textX = margin;

  const coverTitle = `Project Proposal\nfor the ${input.proposalTitle}\nfor ${input.clientCompany}`;
  const titleFontSize = 30;
  const lineGap = 10;
  // PPTX cover/footer wordmark (image1.jpg, 830×185)
  const logoH = 40;
  const logoW = Math.round(logoH * (830 / 185));

  doc.font('Helvetica').fontSize(titleFontSize);
  const titleHeight = doc.heightOfString(coverTitle, { width: textW, lineGap });
  const contentTop = PROPOSAL_HEADER_H + 24;
  const contentBottom = pageH - margin - logoH - 16;
  const titleY = contentTop + Math.max(0, (contentBottom - contentTop - titleHeight) / 2);

  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica').fontSize(titleFontSize)
    .text(coverTitle, textX, titleY, { width: textW, align: 'center', lineGap });

  const logoPath = chrome.coverLogoPath || chrome.logoPath;
  if (logoPath) {
    try {
      doc.image(logoPath, pageW - margin - logoW, pageH - margin - logoH, { height: logoH });
    } catch {
      /* skip */
    }
  }

  doc.x = margin;
  doc.y = PROPOSAL_HEADER_H + 10;
  markProposalBodyContent(doc);
  clearPdfTextState(doc);
}

export function drawContentsPage(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  entries: Array<{ title: string; page: number; indent?: boolean }>,
  contentW: number,
) {
  startProposalPage(doc, chrome, { pageTitle: 'Contents' });

  // Pure white content area under the brand header
  doc.rect(0, PROPOSAL_HEADER_H, doc.page.width, PROPOSAL_PAGE_HEIGHT - PROPOSAL_HEADER_H).fill('#FFFFFF');

  const left = PROPOSAL_MARGIN;
  const right = left + contentW;
  const pageColW = 28;
  const pageColX = right - pageColW;

  doc.y = PROPOSAL_HEADER_H + 22;
  doc.x = left;

  const topRowH = 24;

  for (const entry of entries) {
    const y = doc.y;
    if (y > contentBottom() - 18) break;

    const indent = 0;
    const titleX = left + indent;
    const fontSize = 11;
    const titleFont = 'Helvetica-Bold';
    const titleColor = PROPOSAL_COLORS.INK;
    const pageLabel = String(entry.page + 1);

    doc.font(titleFont).fontSize(fontSize);
    const titleW = Math.min(doc.widthOfString(entry.title), pageColX - titleX - 48);

    doc.fillColor(titleColor)
      .text(entry.title, titleX, y, { width: titleW + 2, lineBreak: false });

    doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(fontSize)
      .text(pageLabel, pageColX, y, { width: pageColW, align: 'right', lineBreak: false });

    // Dotted leader between title and page number
    const dotsStart = titleX + titleW + 10;
    const dotsEnd = pageColX - 10;
    if (dotsEnd > dotsStart + 8) {
      doc.save();
      doc.strokeColor('#B8C0C8')
        .lineWidth(0.7)
        .dash(0.8, { space: 2.8 })
        .moveTo(dotsStart, y + fontSize * 0.62)
        .lineTo(dotsEnd, y + fontSize * 0.62)
        .stroke();
      doc.restore();
    }

    doc.y = y + topRowH;
    doc.x = left;
  }

  markProposalBodyContent(doc);
  clearPdfTextState(doc);
}

export function drawTableHeader(
  doc: PDFKit.PDFDocument,
  cols: Array<{ label: string; width: number }>,
  x: number,
) {
  const y = doc.y;
  const h = 22;
  let cx = x;
  cols.forEach((col) => {
    doc.rect(cx, y, col.width, h).fill(PROPOSAL_COLORS.TABLE_HEAD);
    doc.fillColor(PROPOSAL_COLORS.TABLE_HEAD_TEXT).font('Helvetica-Bold').fontSize(7.5)
      .text(col.label.toUpperCase(), cx + 6, y + 7, { width: col.width - 10, lineBreak: false });
    cx += col.width;
  });
  doc.y = y + h;
  doc.x = x;
  markProposalBodyContent(doc);
}

function measureCellHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize: number,
  bold: boolean,
): number {
  const safeWidth = Math.max(24, width - 12);
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
  const maxRow = contentBottom() - PROPOSAL_HEADER_H - 28;
  const plain = stripHtmlToPlain(text || ' ');
  return Math.min(maxRow, Math.max(22, doc.heightOfString(plain || ' ', { width: safeWidth }) + 10));
}

export function drawTableRow(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  cells: string[],
  colWidths: number[],
  x: number,
  opts: { boldFirst?: boolean; minH?: number; fill?: string } = {},
) {
  const fontSize = 9;
  const rowH = Math.max(
    opts.minH || 22,
    ...cells.map((cell, i) => measureCellHeight(doc, cell, colWidths[i], fontSize, Boolean(opts.boldFirst && i === 0))),
  );
  ensureProposalSpace(doc, chrome, rowH + 2);

  const y = doc.y;
  let cx = x;
  cells.forEach((cell, i) => {
    const bg = opts.fill || (i % 2 === 0 ? ROW_A : ROW_B);
    doc.rect(cx, y, colWidths[i], rowH).fill(bg);
    doc.rect(cx, y, colWidths[i], rowH).lineWidth(0.5).strokeColor(PROPOSAL_COLORS.RULE).stroke();
    doc.fillColor(PROPOSAL_COLORS.INK)
      .font(i === 0 && opts.boldFirst ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fontSize)
      .text(stripHtmlToPlain(cell || '—') || '—', cx + 6, y + 5, {
        width: colWidths[i] - 12,
        lineGap: 1,
        height: rowH - 8,
      });
    cx += colWidths[i];
  });
  doc.y = y + rowH;
  doc.x = x;
  markProposalBodyContent(doc);
}

export function beginScopeObjectivesSlide(doc: PDFKit.PDFDocument, _chrome: ProposalPdfChrome) {
  doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
  clearProposalHeaderTitle();
  doc.rect(0, 0, PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT).fill('#FFFFFF');
  doc.y = PROPOSAL_MARGIN + 6;
  doc.x = PROPOSAL_MARGIN;
  markProposalBodyContent(doc);
  trackPageY(doc);
}

const SECURITY_REVIEW_STEPS = [
  'Best practice',
  'Legislation',
  'Policies & Procedures',
  'Contracts',
  'Intelligent',
  'Strategy',
];

/** PPTX-style staircase from AS IS current state to Security Blueprint TO BE. */
export function drawSecurityReviewDiagram(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const barW = 26;
  const olive = '#6D7A3A';
  const oliveDark = '#4F5A2C';
  const toBeGreen = '#A4C45A';
  const ink = PROPOSAL_COLORS.INK;

  doc.save();

  // "Security Review" spine
  doc.rect(x, y, barW, h).fill(olive);
  doc.save();
  doc.translate(x + barW / 2, y + h / 2);
  doc.rotate(-90);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
    .text('Security Review', -h / 2 + 8, -4, { width: h - 16, align: 'center', lineBreak: false });
  doc.restore();

  const innerX = x + barW + 10;
  const innerW = w - barW - 12;
  const baseY = y + h - 30;

  // AS IS oval
  const asIsCx = innerX + 58;
  const asIsCy = baseY + 6;
  doc.ellipse(asIsCx, asIsCy, 54, 17).fill(oliveDark);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
    .text('AS IS', asIsCx - 54, asIsCy - 12, { width: 108, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(6.5)
    .text('Current State', asIsCx - 54, asIsCy - 2, { width: 108, align: 'center', lineBreak: false });

  // Staircase treads
  const stepCount = SECURITY_REVIEW_STEPS.length;
  const stepW = Math.min(72, Math.floor((innerW - 70) / stepCount));
  let sx = innerX + 4;
  const sy = baseY - 8;
  for (let i = 0; i < stepCount; i += 1) {
    const rise = 14 + i * 11;
    const treadX = sx + i * (stepW * 0.55);
    const treadY = sy - rise;
    doc.moveTo(treadX, sy).lineTo(treadX, treadY).lineWidth(1).strokeColor(ink).stroke();
    doc.moveTo(treadX, treadY).lineTo(treadX + stepW, treadY).lineWidth(1).strokeColor(ink).stroke();
    doc.fillColor(ink).font('Helvetica').fontSize(6.5)
      .text(SECURITY_REVIEW_STEPS[i], treadX + 2, treadY - 11, {
        width: stepW + 16,
        lineBreak: false,
      });
  }

  // Arrow to TO BE
  const arrowX = innerX + innerW - 36;
  const arrowTop = y + 42;
  doc.moveTo(arrowX, baseY - 20).lineTo(arrowX, arrowTop + 18).lineWidth(1.2).strokeColor(ink).stroke();
  doc.moveTo(arrowX, arrowTop + 18).lineTo(arrowX - 4, arrowTop + 24).lineWidth(1.2).strokeColor(ink).stroke();
  doc.moveTo(arrowX, arrowTop + 18).lineTo(arrowX + 4, arrowTop + 24).lineWidth(1.2).strokeColor(ink).stroke();

  // TO BE banner
  const toBeW = Math.min(118, innerW - 20);
  const toBeX = innerX + innerW - toBeW;
  doc.rect(toBeX, y + 8, toBeW, 34).fill(toBeGreen);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
    .text('Security Blueprint', toBeX + 4, y + 13, { width: toBeW - 8, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(7)
    .text('TO BE / Desired state', toBeX + 4, y + 24, { width: toBeW - 8, align: 'center', lineBreak: false });

  doc.restore();
  markProposalBodyContent(doc);
}

/** Scope slide — two-column PPTX layout with Security Review diagram (not the AS IS/TO BE strip). */
export function drawScopeAndObjectivesSlide(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    scopeObjectives: string;
    scopeBody: string;
    approach: string;
  },
  contentW: number,
) {
  const gutter = 28;
  const colW = Math.floor((contentW - gutter) / 2);
  const leftX = PROPOSAL_MARGIN;
  const rightX = PROPOSAL_MARGIN + colW + gutter;
  const topY = doc.y;
  const diagramH = 172;
  const diagramY = PROPOSAL_PAGE_HEIGHT - PROPOSAL_MARGIN - diagramH - 10;
  const logoH = 30;

  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(20)
    .text('Scope and Objectives', leftX, topY, { width: colW, lineGap: 0 });
  doc.text('Approach', rightX, topY, { width: colW, lineGap: 0 });
  markProposalBodyContent(doc);

  const bodyTopY = topY + 30;
  const leftContent = [input.scopeObjectives, input.scopeBody].filter((v) => v?.trim()).join('\n\n');

  doc.y = bodyTopY;
  doc.x = leftX;
  bodyText(doc, chrome, leftContent, colW, { x: leftX, fontSize: 8.5 });

  doc.y = bodyTopY;
  doc.x = rightX;
  bodyText(doc, chrome, input.approach, colW, {
    x: rightX,
    fontSize: 8.5,
  });

  drawSecurityReviewDiagram(doc, rightX, diagramY, colW, diagramH);

  const logo = chrome.coverLogoPath || chrome.logoPath;
  if (logo) {
    try {
      doc.image(logo, PROPOSAL_MARGIN + contentW - 118, diagramY + diagramH - logoH + 4, { height: logoH });
    } catch {
      /* skip */
    }
  }

  doc.y = contentBottom();
  doc.x = PROPOSAL_MARGIN;
  markProposalBodyContent(doc);
}

export function drawTwoColumnSection(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  left: { title: string; body: string },
  right: { title: string; body: string },
  contentW: number,
) {
  ensureProposalSpace(doc, chrome, 80);
  const colW = Math.floor(contentW / 2) - 10;
  const leftX = PROPOSAL_MARGIN;
  const rightX = PROPOSAL_MARGIN + colW + 20;
  const topY = doc.y;

  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(11)
    .text(left.title, leftX, topY, { width: colW });
  doc.y = topY + 16;
  doc.x = leftX;
  bodyText(doc, chrome, left.body, colW, { x: leftX, fontSize: 9 });
  const leftEnd = doc.y;

  doc.y = topY;
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(11)
    .text(right.title, rightX, topY, { width: colW });
  doc.y = topY + 16;
  doc.x = rightX;
  bodyText(doc, chrome, right.body, colW, { x: rightX, fontSize: 9 });
  doc.y = Math.max(leftEnd, doc.y) + 10;
  doc.x = PROPOSAL_MARGIN;
  markProposalBodyContent(doc);
}

export function drawAsIsToBeStrip(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  contentW: number,
) {
  ensureProposalSpace(doc, chrome, 36);
  const y = doc.y;
  const boxW = Math.floor((contentW - 40) / 2);
  doc.rect(PROPOSAL_MARGIN, y, boxW, 28).fill('#E8F0FE');
  doc.rect(PROPOSAL_MARGIN + boxW + 40, y, boxW, 28).fill('#E8F5E9');
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(9)
    .text('AS IS — Current State', PROPOSAL_MARGIN + 8, y + 9, { width: boxW - 16, lineBreak: false });
  doc.text('TO BE — Desired State', PROPOSAL_MARGIN + boxW + 48, y + 9, { width: boxW - 16, lineBreak: false });
  doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica-Bold').fontSize(14)
    .text('→', PROPOSAL_MARGIN + boxW + 14, y + 6, { lineBreak: false });
  doc.y = y + 36;
  markProposalBodyContent(doc);
}

export function drawPhaseMatrix(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  phases: Array<{ name: string; keyActivities: string; deliverables: string }>,
  contentW: number,
) {
  const phaseColW = Math.floor((contentW - 110) / 3);
  const cols = [
    { label: 'Project phases', width: 110 },
    { label: 'Phase 1', width: phaseColW },
    { label: 'Phase 2', width: phaseColW },
    { label: 'Phase 3', width: phaseColW },
  ];
  drawTableHeader(doc, cols, PROPOSAL_MARGIN);
  drawTableRow(doc, chrome, ['Name', ...phases.map((p) => p.name)], cols.map((c) => c.width), PROPOSAL_MARGIN, { boldFirst: true, minH: 24 });
  drawTableRow(doc, chrome, ['Key activities', ...phases.map((p) => p.keyActivities)], cols.map((c) => c.width), PROPOSAL_MARGIN, { minH: 36 });
  drawTableRow(doc, chrome, ['Deliverables', ...phases.map((p) => p.deliverables)], cols.map((c) => c.width), PROPOSAL_MARGIN, { minH: 36 });
}

export function drawTimelineIntro(
  doc: PDFKit.PDFDocument,
  _chrome: ProposalPdfChrome,
  minWeeks: number,
  contentW: number,
) {
  ensureProposalSpace(doc, _chrome, 48);
  const y = doc.y;
  const prefix = 'We estimate the project to run for a minimum of ';
  const suffix =
    ' weeks, including any updates required to the report. Interviews, workshops and walk-through activities will run concurrently where possible. Our timeline is highly dependent on key resources being available to attend the workshops or meetings and providing the information required to populate the assessments as and when scheduled by Physical Risk. Our proposed timeline is illustrated below:';

  doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(10);
  doc.text(prefix, PROPOSAL_MARGIN, y, { continued: true, lineBreak: false });
  doc.font('Helvetica-Bold').text(String(minWeeks), { continued: true, lineBreak: false });
  doc.font('Helvetica').text(suffix, { width: contentW, lineGap: 2 });
  doc.moveDown(0.5);
  markProposalBodyContent(doc);
  clearPdfTextState(doc);
}

const TIMELINE_BAR_COLORS = ['#00796B', '#5B9BD5', '#70AD47'];
const TIMELINE_GRID_BG = '#F2F2F2';
const TIMELINE_GRID_LINE = '#FFFFFF';

/** Gantt-style phases/weeks table matching the Physical Risk proposal template slide. */
export function drawProposedTimelineTable(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  rows: Array<{ name: string; startWeek: number; endWeek: number; sequence: number; color?: string }>,
  maxWeeks: number,
  contentW: number,
) {
  const labelW = Math.floor(contentW * 0.28);
  const weekW = Math.floor((contentW - labelW) / maxWeeks);
  const tableW = labelW + weekW * maxWeeks;
  const headerH = 22;
  const x0 = PROPOSAL_MARGIN;

  const rowHeights = rows.map((row) => {
    const label = `${row.sequence} - ${row.name}`;
    doc.font('Helvetica').fontSize(9);
    return Math.max(44, Math.min(72, doc.heightOfString(label, { width: labelW - 12 }) + 16));
  });
  const tableH = headerH + rowHeights.reduce((sum, h) => sum + h, 0);

  ensureProposalSpace(doc, chrome, tableH + 8);
  const topY = doc.y;

  // Header row
  doc.rect(x0, topY, labelW, headerH).fill(PROPOSAL_COLORS.TABLE_HEAD);
  doc.fillColor(PROPOSAL_COLORS.TABLE_HEAD_TEXT).font('Helvetica-Bold').fontSize(8)
    .text('Phases / Weeks', x0 + 6, topY + 7, { width: labelW - 10, lineBreak: false });

  for (let w = 1; w <= maxWeeks; w += 1) {
    const cx = x0 + labelW + (w - 1) * weekW;
    doc.rect(cx, topY, weekW, headerH).fill(PROPOSAL_COLORS.TABLE_HEAD);
    doc.fillColor(PROPOSAL_COLORS.TABLE_HEAD_TEXT).font('Helvetica-Bold').fontSize(8)
      .text(String(w), cx, topY + 7, { width: weekW, align: 'center', lineBreak: false });
  }

  // Body rows
  let rowY = topY + headerH;
  rows.forEach((row, idx) => {
    const rowH = rowHeights[idx];
    const label = `${row.sequence} - ${row.name}`;
    const barColor = row.color || TIMELINE_BAR_COLORS[idx % TIMELINE_BAR_COLORS.length];

    // Label cell
    doc.rect(x0, rowY, labelW, rowH).fill(TIMELINE_GRID_BG);
    doc.rect(x0, rowY, labelW, rowH).lineWidth(0.75).strokeColor(TIMELINE_GRID_LINE).stroke();
    doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(9)
      .text(label, x0 + 6, rowY + 6, { width: labelW - 12, lineGap: 1 });

    // Week grid cells
    for (let w = 1; w <= maxWeeks; w += 1) {
      const cx = x0 + labelW + (w - 1) * weekW;
      doc.rect(cx, rowY, weekW, rowH).fill(TIMELINE_GRID_BG);
      doc.rect(cx, rowY, weekW, rowH).lineWidth(0.75).strokeColor(TIMELINE_GRID_LINE).stroke();
    }

    // Phase bar across week columns
    const start = Math.max(1, row.startWeek);
    const end = Math.min(maxWeeks, row.endWeek);
    if (end >= start) {
      const barX = x0 + labelW + (start - 1) * weekW + 2;
      const barW = (end - start + 1) * weekW - 4;
      const barH = Math.max(14, Math.round(rowH * 0.38));
      const barY = rowY + Math.round((rowH - barH) / 2);
      doc.rect(barX, barY, barW, barH).fill(barColor);
    }

    rowY += rowH;
  });

  // Outer table border
  doc.rect(x0, topY, tableW, tableH).lineWidth(0.75).strokeColor(PROPOSAL_COLORS.RULE).stroke();

  doc.y = topY + tableH + 10;
  doc.x = x0;
  markProposalBodyContent(doc);
}

/** @deprecated Use drawProposedTimelineTable */
export function drawGanttTimeline(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  rows: Array<{ name: string; startWeek: number; endWeek: number; color?: string }>,
  maxWeek: number,
  contentW: number,
) {
  drawProposedTimelineTable(
    doc,
    chrome,
    rows.map((row, idx) => ({ ...row, sequence: idx + 1 })),
    maxWeek,
    contentW,
  );
}

export function drawTeamStructure(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: { clientCompany: string; leadConsultant: string },
  contentW: number,
) {
  ensureProposalSpace(doc, chrome, 130);
  const y = doc.y;
  const colW = Math.floor((contentW - 60) / 2);
  const leftX = PROPOSAL_MARGIN;
  const rightX = PROPOSAL_MARGIN + colW + 60;
  const boxH = 108;

  doc.rect(leftX, y, colW, boxH).lineWidth(1).strokeColor(PROPOSAL_COLORS.TABLE_HEAD).stroke();
  doc.rect(rightX, y, colW, boxH).lineWidth(1).strokeColor(PROPOSAL_COLORS.GREEN).stroke();

  doc.fillColor(PROPOSAL_COLORS.TABLE_HEAD).font('Helvetica-Bold').fontSize(9)
    .text('Physical Risk', leftX + 8, y + 8, { width: colW - 16 });
  doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(8)
    .text('Project management', leftX + 8, y + 24, { width: colW - 16 })
    .text('Subject expert', leftX + 8, y + 36, { width: colW - 16 })
    .text(input.leadConsultant || 'Lead consultant', leftX + 8, y + 48, { width: colW - 16, lineBreak: false })
    .text('Project team / Consultants', leftX + 8, y + 64, { width: colW - 16 });

  doc.fillColor(PROPOSAL_COLORS.GREEN).font('Helvetica-Bold').fontSize(9)
    .text(input.clientCompany, rightX + 8, y + 8, { width: colW - 16 });
  doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(8)
    .text('Project sponsor', rightX + 8, y + 24, { width: colW - 16 })
    .text('Project management', rightX + 8, y + 36, { width: colW - 16 })
    .text('Subject experts', rightX + 8, y + 48, { width: colW - 16 })
    .text('Project team', rightX + 8, y + 60, { width: colW - 16 });

  doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica-Bold').fontSize(8)
    .text('↔ Liaison ↔', leftX + colW + 8, y + 48, { width: 44, align: 'center', lineBreak: false });

  doc.y = y + boxH + 12;
  markProposalBodyContent(doc);
}

export function drawAcceptanceBlock(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    clientCompany: string;
    accept?: {
      acceptedPlace?: string | null;
      acceptedDate?: string | null;
      acceptedByName?: string | null;
      clientVatNumber?: string | null;
    } | null;
  },
  contentW: number,
) {
  doc.moveDown(0.6);
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(11)
    .text('ACCEPTANCE OF PROPOSAL', { width: contentW });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor(PROPOSAL_COLORS.INK)
    .text(`Client company: ${input.clientCompany}`, { width: contentW });

  const accept = input.accept;
  const fields: Array<[string, string]> = [
    ['Signed at (PLACE):', accept?.acceptedPlace || '______________________'],
    ['Date:', accept?.acceptedDate || '______________________'],
    ['Full Name:', accept?.acceptedByName || '______________________'],
    ['Signature:', accept?.acceptedByName ? 'Electronically accepted' : '______________________'],
    ['VAT reference number:', accept?.clientVatNumber || '______________________'],
  ];
  for (const [label, value] of fields) {
    ensureProposalSpace(doc, chrome, 16);
    doc.moveDown(0.35);
    doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica-Bold').fontSize(9).text(label, { continued: true });
    doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(10).text(` ${value}`);
    markProposalBodyContent(doc);
  }
}

export { PROPOSAL_COLORS as COLORS };
