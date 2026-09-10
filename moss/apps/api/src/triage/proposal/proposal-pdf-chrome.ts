import type PDFDocument from 'pdfkit';
import { defaultReportBrand, resolveReportLogoPath } from '../../reports/pdf-letterhead';
import { resolveProposalCoverLogoPath, resolveProposalSlideHeaderPath } from '../../reports/scl-report-branding';
import { dedupeRepeatedNarrative, normalizeNarrativeHtmlForPdf, parseProposalRichText, richFont, stripHtmlToPlain } from './proposal-rich-text';
import { drawSecurityReviewDiagram } from './security-review-diagram';

export const PROPOSAL_PAGE_WIDTH = 841.89;
export const PROPOSAL_PAGE_HEIGHT = 473.56;
export const PROPOSAL_MARGIN = 36;
/** PPT master header aspect ratio (12192000 × 1549400 EMU). */
const PPT_HEADER_ASPECT = 1549400 / 12192000;
export const PROPOSAL_HEADER_H = Math.round(PROPOSAL_PAGE_WIDTH * PPT_HEADER_ASPECT) + 6;
export const PROPOSAL_FOOTER_H = 34;
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

/** Temporary column clamp for PPT two-column slides (Approach text above diagram). */
let contentBottomClamp: number | null = null;

function effectiveContentBottom(): number {
  const base = contentBottom();
  if (contentBottomClamp == null) return base;
  return Math.min(base, contentBottomClamp);
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
  opts: { cover?: boolean } = {},
) {
  clearPdfTextState(doc);

  const margin = PROPOSAL_MARGIN;
  const pageW = doc.page.width;
  const y = PROPOSAL_PAGE_HEIGHT - PROPOSAL_FOOTER_H;
  doc.save();
  doc.x = margin;
  doc.y = y;

  doc.moveTo(margin, y).lineTo(pageW - margin, y).lineWidth(0.5).strokeColor(PROPOSAL_COLORS.RULE).stroke();

  // Full wordmark on every page footer
  const footerLogo = chrome.coverLogoPath || chrome.logoPath;
  const logoH = 24;
  const logoW = 120;
  if (footerLogo) {
    try {
      doc.image(footerLogo, pageW - margin - logoW, y + 2, { height: logoH });
    } catch {
      /* skip */
    }
  }

  const leftLabel = opts.cover
    ? `${chrome.brandName}  ·  ${proposalNumber}`
    : `${chrome.brandName}  ·  ${proposalNumber}  ·  Page ${pageIndex} of ${pageCount}`;

  doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica').fontSize(7)
    .text(
      leftLabel,
      margin,
      y + 9,
      {
        width: pageW - margin * 2 - logoW - 12,
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

/**
 * How many characters of `text` fit in `maxHeight` at the current font.
 * Prefers breaking on a space so words are not split mid-glyph.
 */
function fitPlainTextLength(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  maxHeight: number,
  lineGap: number,
): number {
  const raw = String(text || '');
  if (!raw) return 0;
  if (maxHeight <= 0) return 0;
  if (doc.heightOfString(raw, { width, lineGap }) <= maxHeight) return raw.length;

  let lo = 0;
  let hi = raw.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.heightOfString(raw.slice(0, mid), { width, lineGap }) <= maxHeight) lo = mid;
    else hi = mid - 1;
  }

  let cut = Math.max(0, lo);
  if (cut >= raw.length) return raw.length;
  if (cut === 0) {
    // At least one character so we always make progress on a fresh page.
    return Math.min(1, raw.length);
  }

  const space = raw.lastIndexOf(' ', cut);
  const breakAt = raw.lastIndexOf('\n', cut);
  const soft = Math.max(space, breakAt);
  if (soft >= Math.floor(cut * 0.4)) cut = soft;
  return Math.max(1, cut);
}

function richBlockPlain(block: { runs: Array<{ text: string }> }): string {
  return block.runs.map((r) => r.text).join('');
}

function drawRichBlockOnce(
  doc: PDFKit.PDFDocument,
  block: {
    type: 'paragraph' | 'list-item';
    ordered?: boolean;
    index?: number;
    runs: Array<{ text: string; style: { bold?: boolean; italic?: boolean; underline?: boolean } }>;
  },
  startX: number,
  width: number,
  fontSize: number,
) {
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
}

export function bodyText(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  text: string,
  width: number,
  opts: { x?: number; fontSize?: number; narrative?: boolean; paginate?: boolean; skipDedupe?: boolean } = {},
): string {
  const startX = opts.x ?? PROPOSAL_MARGIN;
  const fontSize = opts.fontSize ?? 10;
  const lineGap = 2;
  const paginate = opts.paginate !== false;
  let source = String(text || '');
  if (opts.narrative) {
    const cleaned = normalizeNarrativeHtmlForPdf(source);
    const cleanedPlain = stripHtmlToPlain(cleaned).trim();
    const originalPlain = stripHtmlToPlain(source).trim();
    // Never blank out a section that still has readable source text.
    source = cleanedPlain ? cleaned : originalPlain ? source : '';
  } else if (!opts.skipDedupe) {
    source = dedupeRepeatedNarrative(source);
  }
  const blocks = parseProposalRichText(source);
  if (!blocks.length) {
    // Last resort: draw plain text so Understanding never disappears.
    const plain = stripHtmlToPlain(String(text || '')).trim();
    if (!plain) return '';
    if (paginate) ensureProposalSpace(doc, chrome, 16);
    if (!paginate && effectiveContentBottom() - doc.y < fontSize + lineGap + 2) {
      return plain;
    }
    doc.fillColor(PROPOSAL_COLORS.INK)
      .font('Helvetica')
      .fontSize(fontSize)
      .text(plain, startX, doc.y, { width, lineGap });
    markProposalBodyContent(doc);
    return '';
  }

  const minLine = fontSize + lineGap + 2;
  const usablePageH = () => effectiveContentBottom() - (PROPOSAL_HEADER_H + 14);
  const formatBlockPlain = (block: (typeof blocks)[number]) => {
    const plain = richBlockPlain(block).replace(/\s+$/g, '');
    if (!plain && block.type === 'paragraph') return '';
    if (block.type === 'list-item') {
      return block.ordered ? `${block.index}. ${plain}` : `• ${plain}`;
    }
    return plain;
  };
  const leftoverFrom = (startIdx: number, firstPartial = '') => {
    const parts: string[] = [];
    if (firstPartial.trim()) parts.push(firstPartial.trim());
    for (let j = startIdx; j < blocks.length; j += 1) {
      const p = formatBlockPlain(blocks[j]);
      if (p) parts.push(p);
    }
    return parts.join('\n').trim();
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const plain = richBlockPlain(block).replace(/\s+$/g, '');
    if (!plain && block.type === 'paragraph') {
      // Preserve blank paragraph gaps from the editor.
      if (paginate) ensureProposalSpace(doc, chrome, minLine);
      if (!paginate && effectiveContentBottom() - doc.y < minLine) {
        return leftoverFrom(i);
      }
      doc.y += fontSize * 0.7;
      markProposalBodyContent(doc);
      continue;
    }

    const prefix =
      block.type === 'list-item'
        ? block.ordered
          ? `${block.index}. `
          : '• '
        : '';
    const indent = block.type === 'list-item' ? 12 : 0;
    const usableW = Math.max(24, width - indent);

    doc.font('Helvetica').fontSize(fontSize);
    const measure = `${prefix}${plain || ' '}`;
    const fullH = doc.heightOfString(measure, { width: usableW, lineGap }) + 6;
    const room = effectiveContentBottom() - doc.y;

    // Whole block fits on this page — keep rich formatting.
    if (fullH <= room) {
      if (paginate) ensureProposalSpace(doc, chrome, Math.min(fullH, minLine));
      drawRichBlockOnce(doc, block, startX, width, fontSize);
      markProposalBodyContent(doc);
      continue;
    }

    if (!paginate) {
      // Fixed slide / column: fill remaining space on this page — never skip the block.
      let remaining = plain;
      let leadPrefix = prefix;
      let guard = 0;
      while (remaining.length && guard < 200) {
        guard += 1;
        const roomNow = effectiveContentBottom() - doc.y;
        if (roomNow < minLine * 2) break;
        const chunkBudget = Math.max(minLine, roomNow - 4);
        const prefixed = `${leadPrefix}${remaining}`;
        doc.font('Helvetica').fontSize(fontSize);
        const fit = fitPlainTextLength(doc, prefixed, usableW, chunkBudget, lineGap);
        if (fit <= leadPrefix.length) break;
        const chunk = prefixed.slice(0, fit);
        const consumed = fit - leadPrefix.length;
        const x = startX + indent;
        const y = doc.y;
        doc.fillColor(PROPOSAL_COLORS.INK)
          .font('Helvetica')
          .fontSize(fontSize)
          .text(chunk, x, y, { width: usableW, lineGap, continued: false });
        markProposalBodyContent(doc);
        remaining = remaining.slice(Math.max(1, consumed)).replace(/^\s+/, '');
        leadPrefix = '';
        if (effectiveContentBottom() - doc.y < minLine * 2) break;
      }
      doc.x = startX;
      if (remaining.length) {
        return leftoverFrom(i + 1, remaining);
      }
      doc.moveDown(block.type === 'list-item' ? 0.15 : 0.3);
      markProposalBodyContent(doc);
      continue;
    }

    // Too tall for remaining space (or the whole slide) — paginate as plain text
    // so content continues onto the next page instead of being clipped.
    let remaining = plain;
    let leadPrefix = prefix;
    let guard = 0;
    while (remaining.length && guard < 500) {
      guard += 1;
      let roomNow = effectiveContentBottom() - doc.y;
      if (roomNow < minLine * 2) {
        ensureProposalSpace(doc, chrome, Math.max(minLine * 6, Math.min(usablePageH(), 120)));
        roomNow = effectiveContentBottom() - doc.y;
      }

      const chunkBudget = Math.max(minLine, roomNow - 4);
      const prefixed = `${leadPrefix}${remaining}`;
      doc.font('Helvetica').fontSize(fontSize);
      const fit = fitPlainTextLength(doc, prefixed, usableW, chunkBudget, lineGap);

      if (fit <= leadPrefix.length) {
        // Not enough room even for one line — force a fresh page.
        ensureProposalSpace(doc, chrome, Math.max(minLine * 6, Math.min(usablePageH(), 120)));
        continue;
      }

      const chunk = prefixed.slice(0, fit);
      const consumed = fit - leadPrefix.length;
      const x = startX + indent;
      const y = doc.y;
      doc.fillColor(PROPOSAL_COLORS.INK)
        .font('Helvetica')
        .fontSize(fontSize)
        .text(chunk, x, y, { width: usableW, lineGap, continued: false });
      markProposalBodyContent(doc);

      remaining = remaining.slice(Math.max(1, consumed)).replace(/^\s+/, '');
      leadPrefix = ''; // continuation pages drop the list bullet/number

      if (remaining.length && effectiveContentBottom() - doc.y < minLine * 2) {
        ensureProposalSpace(doc, chrome, Math.max(minLine * 6, Math.min(usablePageH(), 120)));
      }
    }

    doc.x = startX;
    doc.moveDown(block.type === 'list-item' ? 0.15 : 0.3);
    markProposalBodyContent(doc);
  }
  return '';
}

/** Cover product headline — Wayne official Level 2 name: Executive Advisory Diagnostic. */
export function resolveCoverProductTitle(
  title: string,
  productCode?: string | null,
): string {
  const raw = String(title || '').trim();
  const code = String(productCode || '').trim();
  if (code === 'EXECUTIVE_ADVISORY_DIAGNOSTIC') {
    return 'Executive Advisory Diagnostic';
  }
  // Drop "Client — Product" prefixes so the headline stays product-only.
  const stripped = raw.replace(/^[^—–\n]+[—–]\s*/, '').trim();
  // Normalize any leftover outdated "Governance Diagnostic" wording.
  if (/executive\s+governance\s+diagnostic/i.test(stripped || raw)) {
    return 'Executive Advisory Diagnostic';
  }
  return stripped || raw;
}

export function drawCoverPage(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    proposalTitle: string;
    productCode?: string | null;
    proposalSubtitle?: string | null;
    clientCompany: string;
    clientContact?: string | null;
    clientPosition?: string | null;
    clientEmail?: string | null;
    clientPhone?: string | null;
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

  const productTitle = resolveCoverProductTitle(input.proposalTitle, input.productCode);
  const company = String(input.clientCompany || '').trim();
  const versionNum = Number(input.proposalVersion);
  const versionLabel = Number.isFinite(versionNum)
    ? (Number.isInteger(versionNum) ? `${versionNum}.0` : String(versionNum))
    : '1.0';

  // Title group — slightly above vertical centre for better balance
  const eyebrow = 'PROJECT PROPOSAL';
  const preparedLabel = 'Prepared for';
  const eyebrowSize = 26;
  const productSize = 40;
  const preparedLabelSize = 16;
  const companySize = 26;
  const metaSize = 11;
  const metaLineH = 16;
  const titleBlockW = textW * 0.86;
  const titleBlockX = textX + (textW - titleBlockW) / 2;

  doc.font('Helvetica').fontSize(productSize);
  const productH = doc.heightOfString(productTitle, {
    width: titleBlockW,
    align: 'center',
    lineGap: 2,
  });

  const contentTop = PROPOSAL_HEADER_H + 36;
  const availableH = pageH - contentTop - margin - 120;
  const titleY = contentTop + Math.max(8, availableH * 0.18);

  const savedMargins = { ...doc.page.margins };
  doc.page.margins = { top: 0, left: 0, right: 0, bottom: 0 };

  let y = titleY;
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica').fontSize(eyebrowSize)
    .text(eyebrow, titleBlockX, y, { width: titleBlockW, align: 'center', lineBreak: false });
  y += eyebrowSize + 14;

  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(productSize)
    .text(productTitle, titleBlockX, y, {
      width: titleBlockW,
      align: 'center',
      lineGap: 2,
    });
  y += productH + 22;

  doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica').fontSize(preparedLabelSize)
    .text(preparedLabel, titleBlockX, y, { width: titleBlockW, align: 'center', lineBreak: false });
  y += preparedLabelSize + 10;

  doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica-Bold').fontSize(companySize)
    .text(company || '—', titleBlockX, y, {
      width: titleBlockW,
      align: 'center',
      lineBreak: false,
    });
  y += companySize + 22;

  // Date / Version / Proposal Ref — centered under company name (no client contact block)
  const drawCenteredMeta = (label: string, value: string, atY: number) => {
    doc.font('Helvetica-Bold').fontSize(metaSize);
    const labelW = doc.widthOfString(label);
    doc.font('Helvetica').fontSize(metaSize);
    const valueW = doc.widthOfString(value);
    const totalW = labelW + valueW;
    const startX = textX + (textW - totalW) / 2;
    doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica-Bold').fontSize(metaSize)
      .text(label, startX, atY, { width: labelW + 1, lineBreak: false });
    doc.font('Helvetica').text(value, startX + labelW, atY, {
      width: valueW + 2,
      lineBreak: false,
    });
  };

  drawCenteredMeta('Date: ', String(input.proposalDate || '—'), y);
  y += metaLineH;
  drawCenteredMeta('Version: ', versionLabel, y);
  y += metaLineH;
  drawCenteredMeta('Proposal Ref: ', String(input.proposalNumber || '—'), y);

  drawProposalFooter(doc, chrome, 0, 0, input.proposalNumber, { cover: true });

  doc.page.margins = savedMargins;

  const internal = doc as PdfKitInternal;
  while (Array.isArray(internal._pageBuffer) && internal._pageBuffer.length > 1) {
    removeLastBufferedPage(doc);
  }
  try {
    doc.switchToPage(0);
  } catch {
    /* ignore */
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

  const topRowH = 20;

  for (const entry of entries) {
    const y = doc.y;
    if (y > contentBottom() - 16) break;

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

/** Scope slide uses the same brand header title strip as every other major section. */
export function beginScopeObjectivesSlide(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  title = 'Scope and Objectives',
) {
  beginMajorSection(doc, chrome, title, 0, { pageBreak: true });
}

function measureRichTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize: number,
): number {
  const source = dedupeRepeatedNarrative(String(text || ''));
  const blocks = parseProposalRichText(source);
  const lineGap = 2;
  let height = 0;
  doc.font('Helvetica').fontSize(fontSize);
  if (!blocks.length) {
    const plain = stripHtmlToPlain(source).trim();
    if (!plain) return 0;
    return doc.heightOfString(plain, { width, lineGap }) + 4;
  }
  for (const block of blocks) {
    const plain = richBlockPlain(block).replace(/\s+$/g, '');
    if (!plain && block.type === 'paragraph') {
      height += fontSize * 0.7;
      continue;
    }
    const prefix =
      block.type === 'list-item' ? (block.ordered ? `${block.index}. ` : '• ') : '';
    const indent = block.type === 'list-item' ? 12 : 0;
    const usableW = Math.max(24, width - indent);
    height +=
      doc.heightOfString(`${prefix}${plain || ' '}`, { width: usableW, lineGap }) + 6;
    height += fontSize * (block.type === 'list-item' ? 0.15 : 0.3);
  }
  return height;
}

function measureLabeledBlockHeight(
  doc: PDFKit.PDFDocument,
  label: string,
  body: string,
  width: number,
  fontSize: number,
): number {
  const text = String(body || '').trim();
  if (!text) return 0;
  doc.font('Helvetica-Bold').fontSize(9);
  const labelH = doc.heightOfString(label, { width, lineGap: 0 }) + 4;
  return labelH + measureRichTextHeight(doc, text, width, fontSize) + 10;
}

/**
 * Scope slide — PPT two-column layout on page 1:
 * left = Client objectives / Sites / Exclusions / Indicative scope;
 * right = Approach + fixed Security Review diagram at the bottom.
 * Overflow continues on the next page(s) still side-by-side (left scope / right Approach).
 * The diagram size/position is not shrunk to make room for Approach text.
 */
export function drawScopeAndObjectivesSlide(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    scopeObjectives: string;
    sitesOrBusinessUnits?: string | null;
    scopeBody: string;
    approach: string;
    /** Shown under Scope only when present (same field as Approach matrix exclusions). */
    exclusions?: string | null;
  },
  contentW: number,
) {
  const gutter = 28;
  const colW = Math.floor((contentW - gutter) / 2);
  const leftX = PROPOSAL_MARGIN;
  const rightX = PROPOSAL_MARGIN + colW + gutter;
  const footerGap = 18;
  const maxBottom = contentBottom() - footerGap;
  const fontSize = 8.5;
  const preferredDiagramH = 155;
  const minDiagramH = 128;
  const diagramTopGap = 12;

  const objectivesText = String(input.scopeObjectives || '').trim();
  const sitesText = String(input.sitesOrBusinessUnits || '').trim();
  const exclusionsRaw = String(input.exclusions || '').trim();
  const exclusionsPlain = stripHtmlToPlain(exclusionsRaw).trim();
  const hasExclusions = Boolean(exclusionsPlain);
  const scopeText = String(input.scopeBody || '').trim();
  const approachRaw = String(input.approach || '').trim();

  // Page title is already in the top brand header via beginScopeObjectivesSlide.
  const colTitleY = doc.y;
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(12)
    .text('Approach', rightX, colTitleY, { width: colW, lineGap: 0 });
  markProposalBodyContent(doc);
  const bodyTopY = colTitleY + 18;

  // Fixed diagram band at the bottom of the right column (do not shrink for long Approach).
  let diagramH = preferredDiagramH;
  let diagramY = maxBottom - diagramH;
  if (diagramY < bodyTopY + 48) {
    diagramH = Math.max(minDiagramH, maxBottom - (bodyTopY + 48));
    diagramY = maxBottom - diagramH;
  }
  const approachTextBottom = Math.max(bodyTopY + 24, diagramY - diagramTopGap);

  // Right column — Approach above the fixed diagram; leftover continues later.
  let approachLeftover = '';
  doc.y = bodyTopY;
  doc.x = rightX;
  if (approachRaw) {
    contentBottomClamp = approachTextBottom;
    try {
      approachLeftover = bodyText(doc, chrome, approachRaw, colW, {
        x: rightX,
        fontSize,
        paginate: false,
      });
    } finally {
      contentBottomClamp = null;
    }
  }
  const approachEndY = Math.min(doc.y, approachTextBottom);

  if (diagramH >= 80) {
    drawSecurityReviewDiagram(doc, chrome, rightX, diagramY, colW, diagramH);
    markProposalBodyContent(doc);
  }

  // Left column — always reserve room for Sites / Exclusions / Indicative scope
  // so long Client objectives cannot hide them on slide 1.
  doc.font('Helvetica').fontSize(fontSize);
  const sitesPlain = stripHtmlToPlain(sitesText).trim();
  const sitesReserve = sitesPlain
    ? Math.min(52, 16 + doc.heightOfString(sitesPlain, { width: colW, lineGap: 2 }) + 12)
    : 0;
  const exclusionsReserve = hasExclusions
    ? Math.min(64, 16 + doc.heightOfString(exclusionsPlain, { width: colW, lineGap: 2 }) + 12)
    : 0;
  // Keep a solid reserved band so Indicative scope always has room to paint.
  const scopeReserve = scopeText
    ? Math.min(
        88,
        Math.max(
          56,
          18 + Math.min(64, doc.heightOfString(stripHtmlToPlain(scopeText).slice(0, 280), { width: colW, lineGap: 2 })) + 14,
        ),
      )
    : 0;
  const objectivesBottom = Math.max(
    bodyTopY + 40,
    maxBottom - sitesReserve - exclusionsReserve - scopeReserve,
  );

  type PendingField = { label: string; text: string; continued?: boolean };
  const leftPending: PendingField[] = [];

  const paintLeftBlock = (
    label: string,
    body: string,
    stopAt: number,
    opts: { force?: boolean } = {},
  ): string => {
    const text = String(body || '').trim();
    if (!text) return '';
    if (!opts.force && doc.y > stopAt - 18) return text;
    // Forced blocks (Sites / Indicative) jump into their reserved band instead of skipping.
    if (opts.force && doc.y > stopAt - 18) {
      doc.y = Math.max(bodyTopY + 24, stopAt - Math.min(72, Math.max(36, stopAt - bodyTopY) * 0.35));
    }
    doc.x = leftX;
    doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(9)
      .text(label, leftX, doc.y, { width: colW, lineGap: 0 });
    markProposalBodyContent(doc);
    doc.moveDown(0.12);
    const before = doc.y;
    contentBottomClamp = stopAt;
    let leftover = '';
    try {
      leftover = bodyText(doc, chrome, text, colW, { x: leftX, fontSize, paginate: false });
    } finally {
      contentBottomClamp = null;
    }
    if (doc.y < before + 2) doc.y = before + fontSize + 2;
    doc.moveDown(0.2);
    return leftover.trim();
  };

  doc.y = bodyTopY;
  doc.x = leftX;

  if (objectivesText) {
    const leftover = paintLeftBlock('Client objectives', objectivesText, objectivesBottom);
    if (leftover) leftPending.push({ label: 'Client objectives', text: leftover, continued: true });
  }

  if (sitesText) {
    const sitesY = Math.max(doc.y, objectivesBottom - sitesReserve - exclusionsReserve - scopeReserve + 2);
    doc.y = Math.min(sitesY, maxBottom - Math.max(28, sitesReserve + exclusionsReserve + scopeReserve - 8));
    const leftover = paintLeftBlock(
      'Sites / business units',
      sitesText,
      maxBottom - exclusionsReserve - scopeReserve,
      { force: true },
    );
    if (leftover) leftPending.push({ label: 'Sites / business units', text: leftover, continued: true });
  }

  if (hasExclusions) {
    const exclY = Math.max(doc.y + 2, maxBottom - exclusionsReserve - scopeReserve + 2);
    doc.y = Math.min(exclY, maxBottom - Math.max(28, exclusionsReserve + scopeReserve - 4));
    const leftover = paintLeftBlock(
      'Exclusions',
      exclusionsRaw,
      maxBottom - (scopeText ? scopeReserve : 6),
      { force: true },
    );
    if (leftover) leftPending.push({ label: 'Exclusions', text: leftover, continued: true });
  }

  // Always pin Indicative scope into its reserved bottom band so it cannot disappear.
  if (scopeText) {
    const scopeBand = Math.max(36, scopeReserve);
    const scopeY = Math.max(doc.y + 2, maxBottom - scopeBand + 2);
    doc.y = Math.min(scopeY, maxBottom - Math.max(30, scopeBand - 8));
    const leftover = paintLeftBlock('Indicative scope', scopeText, maxBottom, { force: true });
    if (leftover) leftPending.push({ label: 'Indicative scope', text: leftover, continued: true });
  }
  const leftEndY = doc.y;

  // Keep first-slide geometry intact (diagram stays where it was drawn).
  doc.y = Math.max(leftEndY, approachEndY, diagramY + Math.max(diagramH, 0), maxBottom);
  doc.x = PROPOSAL_MARGIN;
  markProposalBodyContent(doc);

  const hasLeftPending = leftPending.some((p) => p.text.trim());
  const hasApproachPending = Boolean(approachLeftover.trim());
  if (!hasLeftPending && !hasApproachPending) return;

  // Continuation page(s): keep side-by-side Scope | Approach (no diagram — already shown).
  let leftQueue = leftPending.filter((p) => p.text.trim());
  let approachQueue = approachLeftover.trim();

  const startContinuationPage = () => {
    doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
    startProposalPage(doc, chrome);
    trackPageY(doc);
    doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica-Oblique').fontSize(8.5)
      .text('Scope and Objectives (continued)', PROPOSAL_MARGIN, doc.y, { width: contentW });
    markProposalBodyContent(doc);
    doc.moveDown(0.4);
  };

  while (leftQueue.length || approachQueue) {
    startContinuationPage();
    const contTop = doc.y;
    const contBottom = contentBottom() - footerGap;

    // Right column subtitle when Approach still has content.
    if (approachQueue) {
      doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(11)
        .text('Approach', rightX, contTop, { width: colW, lineGap: 0 });
      markProposalBodyContent(doc);
    }
    const colBodyTop = contTop + (approachQueue ? 16 : 0);

    // Paint Approach leftover in the right column for this page.
    let nextApproach = '';
    if (approachQueue) {
      doc.y = colBodyTop;
      doc.x = rightX;
      contentBottomClamp = contBottom;
      try {
        nextApproach = bodyText(doc, chrome, approachQueue, colW, {
          x: rightX,
          fontSize: 9,
          paginate: false,
        });
      } finally {
        contentBottomClamp = null;
      }
    }
    const rightEndY = doc.y;

    // Paint left leftovers for this page (in order).
    const nextLeft: PendingField[] = [];
    doc.y = colBodyTop;
    doc.x = leftX;
    for (let i = 0; i < leftQueue.length; i += 1) {
      const item = leftQueue[i];
      if (doc.y > contBottom - 22) {
        for (let j = i; j < leftQueue.length; j += 1) nextLeft.push(leftQueue[j]);
        break;
      }
      const heading = item.continued ? `${item.label} (continued)` : item.label;
      doc.x = leftX;
      doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(9)
        .text(heading, leftX, doc.y, { width: colW, lineGap: 0 });
      markProposalBodyContent(doc);
      doc.moveDown(0.12);
      contentBottomClamp = contBottom;
      let leftover = '';
      try {
        leftover = bodyText(doc, chrome, item.text, colW, {
          x: leftX,
          fontSize: 9,
          paginate: false,
        });
      } finally {
        contentBottomClamp = null;
      }
      doc.moveDown(0.25);
      if (leftover.trim()) {
        nextLeft.push({ label: item.label, text: leftover, continued: true });
        for (let j = i + 1; j < leftQueue.length; j += 1) nextLeft.push(leftQueue[j]);
        break;
      }
    }
    const leftContEnd = doc.y;

    doc.y = Math.max(leftContEnd, rightEndY, contBottom);
    doc.x = PROPOSAL_MARGIN;
    markProposalBodyContent(doc);

    leftQueue = nextLeft;
    approachQueue = nextApproach.trim();
  }
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

const PHASE_MATRIX = {
  labelBg: '#1A1A1A',
  phase1: { head: '#2E75B6', body: '#2E75B6' },
  phase2: { head: '#5B9BD5', body: '#5B9BD5' },
  phase3: { head: '#548235', body: '#548235' },
  exclusions: { head: '#1F4D2A', body: '#1F4D2A' },
  gutter: 2.5,
  white: '#FFFFFF',
} as const;

function phaseBulletLines(value: string): string[] {
  const plain = stripHtmlToPlain(value || '').trim();
  if (!plain) return [];
  return plain
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[•●▪◦\-\u2013\u2014*]\s*/, '').trim())
    .filter(Boolean);
}

function drawPhaseMatrixCellText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { bold?: boolean; fontSize?: number; bullets?: boolean; pad?: number } = {},
) {
  const pad = opts.pad ?? 5;
  const fontSize = opts.fontSize ?? 7;
  const maxH = h - pad * 2;
  if (maxH < fontSize) return;

  if (opts.bullets) {
    const lines = phaseBulletLines(text);
    if (!lines.length) return;
    let ty = y + pad;
    doc.fillColor(PHASE_MATRIX.white).font('Helvetica').fontSize(fontSize);
    for (const line of lines) {
      if (ty >= y + h - pad - fontSize) break;
      const block = `• ${line}`;
      const blockH = doc.heightOfString(block, { width: w - pad * 2, lineGap: 1 });
      doc.text(block, x + pad, ty, {
        width: w - pad * 2,
        lineGap: 1,
        height: Math.min(blockH + 2, y + h - pad - ty),
      });
      ty += blockH + 2;
    }
    return;
  }

  doc.fillColor(PHASE_MATRIX.white)
    .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(fontSize)
    .text(stripHtmlToPlain(text || ''), x + pad, y + pad, {
      width: w - pad * 2,
      height: maxH,
      align: 'left',
      lineGap: 1,
    });
}

/**
 * PPT-style Approach matrix: Project phases | Phase 1–3 | PROJECT EXCLUSIONS
 * with Key activities + Deliverables rows (coloured cells, white text).
 */
export function drawPhaseMatrix(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  phases: Array<{ name: string; keyActivities: string; deliverables: string }>,
  contentW: number,
  opts: { exclusions?: string[] } = {},
) {
  const x0 = PROPOSAL_MARGIN;
  const gutter = PHASE_MATRIX.gutter;
  const labelW = 78;
  const exclW = Math.floor(contentW * 0.18);
  const phaseW = Math.floor((contentW - labelW - exclW - gutter * 4) / 3);
  const colWidths = [labelW, phaseW, phaseW, phaseW, exclW];
  const colXs: number[] = [];
  let cx = x0;
  for (let i = 0; i < colWidths.length; i += 1) {
    colXs.push(cx);
    cx += colWidths[i] + gutter;
  }

  const p = [
    phases[0] || { name: 'Phase 1', keyActivities: '', deliverables: '' },
    phases[1] || { name: 'Phase 2', keyActivities: '', deliverables: '' },
    phases[2] || { name: 'Phase 3', keyActivities: '', deliverables: '' },
  ];
  const exclusionLines = (opts.exclusions || [])
    .map((e) => stripHtmlToPlain(e).trim())
    .filter(Boolean);
  const exclusionsText = exclusionLines.length
    ? `The following will not form part of the project:\n${exclusionLines.join('\n')}`
    : 'The following will not form part of the project:\n—';

  const headerH = 48;
  const deliverH = 56;
  // Activities row fills remaining usable height on the page
  const usable = contentBottom() - doc.y - 8;
  const activitiesH = Math.max(120, usable - headerH - deliverH - gutter * 2);
  const totalH = headerH + gutter + activitiesH + gutter + deliverH;

  ensureProposalSpace(doc, chrome, Math.min(totalH, contentBottom() - (PROPOSAL_HEADER_H + 14)));
  const y0 = doc.y;

  const colColors = [
    { head: PHASE_MATRIX.labelBg, body: PHASE_MATRIX.labelBg },
    PHASE_MATRIX.phase1,
    PHASE_MATRIX.phase2,
    PHASE_MATRIX.phase3,
    PHASE_MATRIX.exclusions,
  ];

  const headerCells = [
    'Project phases',
    p[0].name || 'Phase 1',
    p[1].name || 'Phase 2',
    p[2].name || 'Phase 3',
    'PROJECT EXCLUSIONS',
  ];
  const activityCells = [
    'Key activities',
    p[0].keyActivities,
    p[1].keyActivities,
    p[2].keyActivities,
    exclusionsText,
  ];
  const deliverCells = [
    'Deliverables',
    p[0].deliverables,
    p[1].deliverables,
    p[2].deliverables,
    '',
  ];

  const drawRow = (
    cells: string[],
    rowY: number,
    rowH: number,
    mode: 'head' | 'body',
    rowOpts: { bulletsFrom?: number } = {},
  ) => {
    for (let i = 0; i < cells.length; i += 1) {
      const fill = i === 0
        ? PHASE_MATRIX.labelBg
        : mode === 'head'
          ? colColors[i].head
          : colColors[i].body;
      doc.rect(colXs[i], rowY, colWidths[i], rowH).fill(fill);

      if (i === 0) {
        drawPhaseMatrixCellText(doc, cells[i], colXs[i], rowY, colWidths[i], rowH, {
          bold: true,
          fontSize: 10,
        });
      } else if (mode === 'head') {
        drawPhaseMatrixCellText(doc, cells[i], colXs[i], rowY, colWidths[i], rowH, {
          bold: true,
          fontSize: 9,
        });
      } else if (rowOpts.bulletsFrom != null && i >= rowOpts.bulletsFrom) {
        drawPhaseMatrixCellText(doc, cells[i], colXs[i], rowY, colWidths[i], rowH, {
          bullets: true,
          fontSize: 8,
        });
      } else {
        drawPhaseMatrixCellText(doc, cells[i], colXs[i], rowY, colWidths[i], rowH, {
          bold: false,
          fontSize: 8.5,
        });
      }
    }
  };

  // Row 1 — phase headers
  drawRow(headerCells, y0, headerH, 'head');
  // Row 2 — key activities (+ exclusions body)
  const actY = y0 + headerH + gutter;
  drawRow(activityCells, actY, activitiesH, 'body', { bulletsFrom: 1 });
  // Row 3 — deliverables (exclusions cell empty / same dark fill)
  const delY = actY + activitiesH + gutter;
  for (let i = 0; i < deliverCells.length; i += 1) {
    const fill = i === 0 ? PHASE_MATRIX.labelBg : colColors[i].head;
    doc.rect(colXs[i], delY, colWidths[i], deliverH).fill(fill);
    if (i === 0 || deliverCells[i]) {
      drawPhaseMatrixCellText(doc, deliverCells[i], colXs[i], delY, colWidths[i], deliverH, {
        bold: i === 0,
        fontSize: i === 0 ? 10 : 8.5,
      });
    }
  }

  doc.y = delY + deliverH + 10;
  doc.x = x0;
  markProposalBodyContent(doc);
}

export function drawTimelineIntro(
  doc: PDFKit.PDFDocument,
  _chrome: ProposalPdfChrome,
  minWeeks: number,
  contentW: number,
  narrative?: string | null,
  summary?: string | null,
) {
  clearPdfTextState(doc);

  const weeks = Math.max(1, Math.round(Number(minWeeks) || 1));
  const defaultParagraph =
    `We estimate the project to run for a minimum of ${weeks} weeks, including any updates required to the report. Interviews, workshops and walk-through activities will run concurrently where possible. Our timeline is highly dependent on key resources being available to attend the workshops or meetings and providing the information required to populate the assessments as and when scheduled by Physical Risk. Our proposed timeline is illustrated below:`;

  // TipTap stores HTML — never pass raw markup to PDFKit text().
  const customRaw = dedupeRepeatedNarrative(String(narrative || '').trim());
  const customPlain = stripHtmlToPlain(customRaw).replace(/\s+/g, ' ').trim();
  const summaryPlain = stripHtmlToPlain(String(summary || '').trim()).replace(/\s+/g, ' ').trim();
  // Full admin narrative replaces the PPT wording; short notes / Timeline summary
  // are shown above the standard intro so they still appear in the layout.
  const useCustom = customPlain.length >= 120 || /illustrated below/i.test(customPlain);

  if (useCustom) {
    bodyText(doc, _chrome, customRaw, contentW, { fontSize: 10 });
    doc.x = PROPOSAL_MARGIN;
    doc.moveDown(0.55);
    clearPdfTextState(doc);
    return;
  }

  const leadPlain = summaryPlain || (customPlain.length > 0 && customPlain.length < 120 ? customPlain : '');
  if (leadPlain) {
    bodyText(doc, _chrome, leadPlain, contentW, { fontSize: 10 });
    doc.x = PROPOSAL_MARGIN;
    doc.moveDown(0.35);
  }

  const paragraph = defaultParagraph;
  doc.font('Helvetica').fontSize(10);
  const textH = doc.heightOfString(paragraph, { width: contentW, lineGap: 2 });
  ensureProposalSpace(doc, _chrome, textH + 28);

  const x0 = PROPOSAL_MARGIN;
  const y0 = doc.y;

  doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(10);
  doc.text(paragraph, x0, y0, {
    width: contentW,
    align: 'left',
    lineGap: 2,
  });

  doc.x = x0;
  doc.y = y0 + textH + 14;
  markProposalBodyContent(doc);
  clearPdfTextState(doc);
}

const TIMELINE_HEADER = '#1F567D';
const TIMELINE_BAR_COLORS = ['#1F567D', '#5D9CEC', '#51A334'];
const TIMELINE_GRID_BG = '#E6E6E6';
const TIMELINE_LABEL_BG = '#D9D9D9';
const TIMELINE_GRID_LINE = '#FFFFFF';

/** Gantt-style phases/weeks table matching the Physical Risk proposal template slide. */
export function drawProposedTimelineTable(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  rows: Array<{ name: string; startWeek: number; endWeek: number; sequence: number; color?: string }>,
  maxWeeks: number,
  contentW: number,
) {
  clearPdfTextState(doc);
  doc.x = PROPOSAL_MARGIN;

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

  ensureProposalSpace(doc, chrome, tableH + 12);
  const topY = doc.y;

  // Header row
  doc.rect(x0, topY, labelW, headerH).fill(TIMELINE_HEADER);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
    .text('Phases / Weeks', x0 + 6, topY + 7, { width: labelW - 10, lineBreak: false });

  for (let w = 1; w <= maxWeeks; w += 1) {
    const cx = x0 + labelW + (w - 1) * weekW;
    doc.rect(cx, topY, weekW, headerH).fill(TIMELINE_HEADER);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      .text(String(w), cx, topY + 7, { width: weekW, align: 'center', lineBreak: false });
  }

  // Body rows
  let rowY = topY + headerH;
  rows.forEach((row, idx) => {
    const rowH = rowHeights[idx];
    const label = `${row.sequence} - ${row.name}`;
    const barColor = row.color || TIMELINE_BAR_COLORS[idx % TIMELINE_BAR_COLORS.length];

    // Label cell — text clipped to column width (wraps, does not spill onto bars)
    doc.rect(x0, rowY, labelW, rowH).fill(TIMELINE_LABEL_BG);
    doc.rect(x0, rowY, labelW, rowH).lineWidth(0.75).strokeColor(TIMELINE_GRID_LINE).stroke();
    doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(9)
      .text(label, x0 + 6, rowY + 6, {
        width: labelW - 12,
        height: rowH - 10,
        lineGap: 1,
      });

    // Week grid cells
    for (let w = 1; w <= maxWeeks; w += 1) {
      const cx = x0 + labelW + (w - 1) * weekW;
      doc.rect(cx, rowY, weekW, rowH).fill(TIMELINE_GRID_BG);
      doc.rect(cx, rowY, weekW, rowH).lineWidth(0.75).strokeColor(TIMELINE_GRID_LINE).stroke();
    }

    // Phase bar across week columns
    const start = Math.max(1, Number(row.startWeek) || 1);
    const end = Math.min(maxWeeks, Math.max(start, Number(row.endWeek) || start));
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
  clearPdfTextState(doc);
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
  input: {
    clientCompany: string;
    leadConsultant: string;
    projectSponsor?: string | null;
    projectChampion?: string | null;
  },
  contentW: number,
) {
  ensureProposalSpace(doc, chrome, 240);
  const y0 = doc.y + 10;
  const x0 = PROPOSAL_MARGIN;
  const totalW = contentW;

  // Exact palette sampled from the PPT "Proposed team structure" reference
  const GREEN = '#4EA72F';
  const CYAN = '#0F9ED6';
  const ORANGE = '#E97132';
  const NAVY = '#15607F';
  const DARK_GREEN = '#196B23';
  const ARROW = '#196B23';
  const WHITE = '#FFFFFF';

  const leftW = Math.floor(totalW * 0.26);
  const rightW = Math.floor(totalW * 0.26);
  const midGap = totalW - leftW - rightW;
  const leftX = x0;
  const rightX = x0 + leftW + midGap;
  const stackH = 210;
  const rowGap = 5;
  const rowH = (stackH - rowGap * 4) / 5;
  const leftBoxH = 62;
  // Align left hierarchy with top/bottom of right stack (PPT layout)
  const leftTopY = y0;
  const leftBotY = y0 + stackH - leftBoxH;

  const fillBox = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    color: string,
    lines: string[],
    opts?: { boldLast?: boolean; fontSize?: number },
  ) => {
    doc.rect(bx, by, bw, bh).fill(color);
    const fontSize = opts?.fontSize ?? 9;
    const lineH = fontSize + 3;
    const blockH = lines.length * lineH;
    let ty = by + (bh - blockH) / 2;
    for (let i = 0; i < lines.length; i += 1) {
      const bold = Boolean(opts?.boldLast && i === lines.length - 1);
      doc.fillColor(WHITE)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? fontSize + 1 : fontSize)
        .text(lines[i], bx + 4, ty, {
          width: bw - 8,
          align: 'center',
          lineBreak: false,
        });
      ty += lineH;
    }
  };

  const leadName = String(input.leadConsultant || '').trim();
  const leftLeadLines = leadName
    ? ['Project management', 'Subject Expert', leadName]
    : ['Project management', 'Subject Expert'];

  // Left hierarchy — Physical Risk team
  fillBox(leftX, leftTopY, leftW, leftBoxH, GREEN, leftLeadLines, {
    boldLast: Boolean(leadName),
    fontSize: 9,
  });

  fillBox(leftX, leftBotY, leftW, leftBoxH, CYAN, [
    'Project team',
    'Consultants',
  ], { fontSize: 10 });

  // Vertical connector between left boxes
  const midLeftX = leftX + leftW / 2;
  doc.moveTo(midLeftX, leftTopY + leftBoxH)
    .lineTo(midLeftX, leftBotY)
    .lineWidth(1.5)
    .strokeColor(GREEN)
    .stroke();

  // Right stakeholder stack — use admin sponsor / champion when provided
  const sponsor = String(input.projectSponsor || '').trim();
  const champion = String(input.projectChampion || '').trim();
  const rightRows: Array<{ color: string; lines: string[] }> = [
    { color: ORANGE, lines: [input.clientCompany || 'Client'] },
    {
      color: NAVY,
      lines: sponsor ? ['Project Sponsor', sponsor] : ['Project Sponsor'],
    },
    {
      color: GREEN,
      lines: champion ? ['Project Champion', champion] : ['Project management'],
    },
    { color: DARK_GREEN, lines: ['Subject experts'] },
    { color: CYAN, lines: ['Project team'] },
  ];
  for (let i = 0; i < rightRows.length; i += 1) {
    const by = y0 + i * (rowH + rowGap);
    const lines = rightRows[i].lines;
    const label = lines.join(' ');
    const long = label.length > 22 || lines.length > 1;
    if (long) {
      doc.rect(rightX, by, rightW, rowH).fill(rightRows[i].color);
      doc.fillColor(WHITE).font('Helvetica').fontSize(lines.length > 1 ? 7.5 : 8)
        .text(lines.join('\n'), rightX + 6, by + Math.max(4, (rowH - lines.length * 11) / 2), {
          width: rightW - 12,
          align: 'center',
          height: rowH - 8,
          ellipsis: true,
        });
    } else {
      fillBox(rightX, by, rightW, rowH, rightRows[i].color, lines, { fontSize: 10 });
    }
  }

  // Centre thick double-headed Liaison arrow
  const arrowH = 36;
  const arrowY = y0 + stackH / 2 - arrowH / 2;
  const arrowLeft = leftX + leftW + 16;
  const arrowRight = rightX - 16;
  const arrowW = arrowRight - arrowLeft;
  const head = 16;
  const bodyTop = arrowY + 7;
  const bodyBot = arrowY + arrowH - 7;
  const midY = arrowY + arrowH / 2;

  doc.save();
  doc
    .moveTo(arrowLeft, midY)
    .lineTo(arrowLeft + head, bodyTop)
    .lineTo(arrowLeft + head, bodyBot)
    .closePath()
    .fill(ARROW);
  doc
    .moveTo(arrowRight, midY)
    .lineTo(arrowRight - head, bodyTop)
    .lineTo(arrowRight - head, bodyBot)
    .closePath()
    .fill(ARROW);
  doc.rect(arrowLeft + head - 1, bodyTop, arrowW - head * 2 + 2, bodyBot - bodyTop).fill(ARROW);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(12)
    .text('Liaison', arrowLeft + head, midY - 7, {
      width: arrowW - head * 2,
      align: 'center',
      lineBreak: false,
    });
  doc.restore();

  doc.y = y0 + stackH + 28;
  doc.x = PROPOSAL_MARGIN;
  markProposalBodyContent(doc);
}

const TEAM_TABLE_GREEN = '#196B23';

export const DEFAULT_PROPOSED_TEAM_INTRO =
  ''; // Kept for callers; PDF no longer injects canned team intro copy.

function teamBulletLines(value: string | null | undefined): string[] {
  const plain = stripHtmlToPlain(value || '').trim();
  if (!plain) return [];
  return plain
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[•●▪◦\-\u2013\u2014*]\s*/, '').trim())
    .filter(Boolean);
}

function measureBulletBlock(
  doc: PDFKit.PDFDocument,
  lines: string[],
  width: number,
  fontSize: number,
): number {
  if (!lines.length) return fontSize + 4;
  doc.font('Helvetica').fontSize(fontSize);
  const textW = Math.max(20, width - 14);
  let h = 0;
  for (const line of lines) {
    h += doc.heightOfString(`• ${line}`, { width: textW, lineGap: 1 }) + 2;
  }
  return Math.max(fontSize + 4, h);
}

function drawBulletBlock(
  doc: PDFKit.PDFDocument,
  lines: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
) {
  if (!lines.length) {
    doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica').fontSize(fontSize)
      .text('—', x, y, { width, height, lineBreak: false });
    return;
  }
  const textW = Math.max(20, width - 14);
  let ty = y;
  const bottom = y + height;
  doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(fontSize);
  for (const line of lines) {
    if (ty >= bottom - fontSize) break;
    const block = `• ${line}`;
    const h = doc.heightOfString(block, { width: textW, lineGap: 1 });
    doc.text(block, x, ty, { width: textW, lineGap: 1, height: Math.min(h + 2, bottom - ty) });
    ty += h + 2;
  }
}

function projectPositionLines(member: {
  role: string;
  projectPosition?: string | null;
}): string {
  const pos = stripHtmlToPlain(member.projectPosition || '').trim();
  if (pos) return pos.replace(/\s*\/\s*/g, '\n');
  return stripHtmlToPlain(member.role || '').trim() || '—';
}

/**
 * PPT-style Proposed team section: intro + green-header table
 * (Project position | Name | Summary | Relevant areas of knowledge)
 * with a full-width Client experience block underneath.
 */
export function drawProposedTeamSection(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    intro?: string | null;
    teamMembers: Array<{
      name: string;
      role: string;
      projectPosition?: string | null;
      biography?: string | null;
      summary?: string | null;
      relevantAreasOfKnowledge?: string | null;
      qualifications?: string | null;
    }>;
    experienceItems: Array<{
      clientName: string;
      description: string;
      engagementTitle?: string | null;
    }>;
  },
  contentW: number,
) {
  const intro = (input.intro || '').trim();
  if (intro) {
    ensureProposalSpace(doc, chrome, 48);
    doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(9.5)
      .text(stripHtmlToPlain(intro), {
        width: contentW,
        align: 'justify',
        lineGap: 1.5,
      });
    markProposalBodyContent(doc);
    doc.moveDown(0.55);
  }

  const cols = [
    { label: 'Project position', width: Math.floor(contentW * 0.14) },
    { label: 'Name', width: Math.floor(contentW * 0.13) },
    { label: 'Summary', width: Math.floor(contentW * 0.36) },
    { label: 'Relevant areas of knowledge', width: 0 },
  ];
  cols[3].width = contentW - cols[0].width - cols[1].width - cols[2].width;
  const colWidths = cols.map((c) => c.width);
  const x0 = PROPOSAL_MARGIN;
  const headerH = 22;
  const fontSize = 8;
  const pad = 5;
  const border = '#4A4A4A';

  const drawHeader = () => {
    ensureProposalSpace(doc, chrome, headerH + 4);
    const y = doc.y;
    let cx = x0;
    for (const col of cols) {
      doc.rect(cx, y, col.width, headerH).fill(TEAM_TABLE_GREEN);
      doc.rect(cx, y, col.width, headerH).lineWidth(0.6).strokeColor(border).stroke();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
        .text(col.label, cx + pad, y + 7, {
          width: col.width - pad * 2,
          align: 'left',
          lineBreak: false,
        });
      cx += col.width;
    }
    doc.y = y + headerH;
    doc.x = x0;
    markProposalBodyContent(doc);
  };

  drawHeader();

  const members = input.teamMembers.filter((m) => m.name?.trim() || m.role?.trim());
  if (!members.length) {
    ensureProposalSpace(doc, chrome, 28);
    doc.fillColor(PROPOSAL_COLORS.MUTED).font('Helvetica-Oblique').fontSize(9)
      .text('No team members have been added for this proposal.', x0, doc.y + 6, {
        width: contentW,
      });
    markProposalBodyContent(doc);
    doc.moveDown(0.8);
  }

  for (const member of members) {
    const position = projectPositionLines(member);
    const name = stripHtmlToPlain(member.name || '').trim() || '—';
    const summary = stripHtmlToPlain(member.biography || member.summary || '').trim() || '—';
    const knowledgeLines = teamBulletLines(
      member.relevantAreasOfKnowledge || member.qualifications || '',
    );

    doc.font('Helvetica').fontSize(fontSize);
    const posH = doc.heightOfString(position, { width: colWidths[0] - pad * 2, lineGap: 1 }) + pad * 2;
    const nameH = doc.heightOfString(name, { width: colWidths[1] - pad * 2, lineGap: 1 }) + pad * 2;
    const sumH = doc.heightOfString(summary, { width: colWidths[2] - pad * 2, lineGap: 1.2 }) + pad * 2;
    const knowH = measureBulletBlock(doc, knowledgeLines, colWidths[3], fontSize) + pad * 2;
    const rowH = Math.max(36, posH, nameH, sumH, knowH);

    const pageBefore = currentPageIndex(doc);
    ensureProposalSpace(doc, chrome, Math.min(rowH + 4, contentBottom() - (PROPOSAL_HEADER_H + 14) - 8));
    if (currentPageIndex(doc) !== pageBefore) {
      drawHeader();
    }

    const y = doc.y;
    const cells = [position, name, summary];
    let cx = x0;
    for (let i = 0; i < 3; i += 1) {
      doc.rect(cx, y, colWidths[i], rowH).fill('#FFFFFF');
      doc.rect(cx, y, colWidths[i], rowH).lineWidth(0.6).strokeColor(border).stroke();
      doc.fillColor(PROPOSAL_COLORS.INK).font('Helvetica').fontSize(fontSize)
        .text(cells[i], cx + pad, y + pad, {
          width: colWidths[i] - pad * 2,
          lineGap: i === 2 ? 1.2 : 1,
          height: rowH - pad * 2,
        });
      cx += colWidths[i];
    }
    doc.rect(cx, y, colWidths[3], rowH).fill('#FFFFFF');
    doc.rect(cx, y, colWidths[3], rowH).lineWidth(0.6).strokeColor(border).stroke();
    drawBulletBlock(doc, knowledgeLines, cx + pad, y + pad, colWidths[3] - pad, rowH - pad * 2, fontSize);

    doc.y = y + rowH;
    doc.x = x0;
    markProposalBodyContent(doc);
  }

  // Client experience — full-width block under the team table
  const expLines = input.experienceItems
    .map((exp) => {
      const desc = stripHtmlToPlain(exp.description || '').trim();
      const title = stripHtmlToPlain(exp.engagementTitle || '').trim();
      const client = stripHtmlToPlain(exp.clientName || '').trim();
      if (desc) return desc;
      if (title && client) return `${title} — ${client}`;
      return client || title || '';
    })
    .filter(Boolean);

  // Client experience — only when admin added experience items
  if (!expLines.length) {
    return;
  }

  const labelH = 14;
  const bulletsH = measureBulletBlock(doc, expLines, contentW - pad * 2, fontSize);
  const expH = labelH + bulletsH + pad * 2 + 4;

  const expPageBefore = currentPageIndex(doc);
  ensureProposalSpace(doc, chrome, Math.min(expH + 4, contentBottom() - (PROPOSAL_HEADER_H + 14) - 8));
  if (currentPageIndex(doc) !== expPageBefore) {
    drawHeader();
  }

  const ey = doc.y;
  const drawH = Math.min(expH, Math.max(48, contentBottom() - ey));
  doc.rect(x0, ey, contentW, drawH).fill('#FFFFFF');
  doc.rect(x0, ey, contentW, drawH).lineWidth(0.6).strokeColor(border).stroke();
  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(9)
    .text('Client experience', x0 + pad, ey + pad, { width: contentW - pad * 2, lineBreak: false });
  drawBulletBlock(
    doc,
    expLines,
    x0 + pad,
    ey + pad + labelH,
    contentW - pad * 2,
    drawH - pad * 2 - labelH,
    fontSize,
  );

  doc.y = ey + drawH + 10;
  doc.x = x0;
  markProposalBodyContent(doc);
}

export function drawAcceptanceBlock(
  doc: PDFKit.PDFDocument,
  chrome: ProposalPdfChrome,
  input: {
    clientCompany: string;
    preparedByName?: string | null;
    preparedByEmail?: string | null;
    acceptanceTerms?: string | null;
    accept?: {
      acceptedPlace?: string | null;
      acceptedDate?: string | null;
      acceptedByName?: string | null;
      clientVatNumber?: string | null;
    } | null;
  },
  contentW: number,
) {
  const x0 = PROPOSAL_MARGIN;
  const ink = PROPOSAL_COLORS.INK;
  const contactName = String(input.preparedByName || '').trim() || 'Physical Risk Consultancy';
  const contactEmail = String(input.preparedByEmail || '').trim();
  const client = (input.clientCompany || 'Client').trim();
  const accept = input.accept;
  const customTerms = String(input.acceptanceTerms || '').trim();

  doc.x = x0;
  doc.y += 2;

  // Instructional paragraph — only link mailto when admin provided an email
  doc.fillColor(ink).font('Helvetica').fontSize(9.5);
  const introLead =
    'Should Physical Risk Consultancy be the selected as the service provider, please indicate acceptance of this proposal through signature of the proposal acceptance below. Return signed acceptance to ';
  if (contactEmail) {
    doc.text(`${introLead}${contactName} (`, x0, doc.y, {
      width: contentW,
      continued: true,
      lineGap: 1.5,
    });
    doc.fillColor('#0563C1').text(contactEmail, {
      link: `mailto:${contactEmail}`,
      underline: true,
      continued: true,
    });
    doc.fillColor(ink).text(').', { underline: false });
  } else {
    doc.text(`${introLead}${contactName}.`, x0, doc.y, {
      width: contentW,
      lineGap: 1.5,
    });
  }
  markProposalBodyContent(doc);
  doc.moveDown(0.7);

  // Terms-tab acceptance copy (when provided) sits above the signature page.
  // Keep full admin text — legal wording often repeats clauses intentionally.
  if (customTerms) {
    bodyText(doc, chrome, customTerms, contentW, { fontSize: 9.5, skipDedupe: true });
    doc.x = x0;
    doc.moveDown(0.5);
  }

  // Dedicated page: warrant text + all signatory fields stay together (never split).
  doc.addPage({ size: [PROPOSAL_PAGE_WIDTH, PROPOSAL_PAGE_HEIGHT], margin: PROPOSAL_MARGIN });
  startProposalPage(doc, chrome);
  trackPageY(doc);
  doc.x = x0;

  const fontSize = 9.5;
  const lineGap = 1.5;

  doc.fillColor(PROPOSAL_COLORS.BLACK).font('Helvetica-Bold').fontSize(12)
    .text('ACCEPTANCE OF PROPOSAL', x0, doc.y, {
      width: contentW,
      align: 'center',
    });
  markProposalBodyContent(doc);
  doc.moveDown(0.55);

  doc.fillColor(ink).font('Helvetica').fontSize(fontSize)
    .text(
      'I warrant that, if this Agreement was received from Physical Risk Consultancy in electronic format, the version hereof signed by me is as received. This approval authorises Physical Risk to conduct the work as outlined in this proposal.',
      { width: contentW, align: 'left', lineGap },
    );
  markProposalBodyContent(doc);
  doc.moveDown(0.45);

  doc.fillColor(ink).font('Helvetica').fontSize(fontSize)
    .text('On behalf of ', { width: contentW, continued: true, lineGap });
  doc.font('Helvetica-Bold').text(client, { continued: true });
  doc.font('Helvetica').text(
    ' I hereby certify that I am duly authorised to enter into this Agreement, and I confirm our understanding, consent and authorisation of the terms of appointment, the Physical Risk Terms and Conditions as set out in Appendix A, scope of Engagement and Fees and Expenses set out in this Agreement.',
  );
  markProposalBodyContent(doc);
  doc.moveDown(0.7);

  const drawFieldLine = (
    label: string,
    value: string | null | undefined,
    lineWidth: number,
  ) => {
    const fy = doc.y;
    doc.fillColor(ink).font('Helvetica').fontSize(fontSize);
    const labelW = doc.widthOfString(label);
    doc.text(label, x0, fy, { lineBreak: false });
    const lineStart = x0 + labelW + 6;
    const lineEnd = lineStart + lineWidth;
    const baseline = fy + 10;
    doc.moveTo(lineStart, baseline)
      .lineTo(lineEnd, baseline)
      .lineWidth(0.75)
      .strokeColor('#111111')
      .stroke();
    const filled = String(value || '').trim();
    if (filled) {
      doc.fillColor(ink).font('Helvetica').fontSize(fontSize)
        .text(filled, lineStart + 2, fy, {
          width: Math.max(20, lineWidth - 4),
          lineBreak: false,
        });
    }
    return fy + 20;
  };

  // Signed at (PLACE) …… on (DATE): …… — keep on same page as other signatory lines
  {
    const y = doc.y;
    const placeLabel = 'Signed at (PLACE) ';
    const onDateLabel = ' on (DATE): ';
    doc.fillColor(ink).font('Helvetica').fontSize(fontSize);
    const placeLabelW = doc.widthOfString(placeLabel);
    const onDateLabelW = doc.widthOfString(onDateLabel);
    const placeLineW = 150;
    const dateLineW = 200;
    const gap = 14;

    doc.text(placeLabel, x0, y, { lineBreak: false });
    const placeLineStart = x0 + placeLabelW;
    const placeLineEnd = placeLineStart + placeLineW;
    const baseline = y + 10;
    doc.moveTo(placeLineStart, baseline).lineTo(placeLineEnd, baseline)
      .lineWidth(0.75).strokeColor('#111111').stroke();
    if (accept?.acceptedPlace) {
      doc.text(String(accept.acceptedPlace), placeLineStart + 2, y, {
        width: placeLineW - 4,
        lineBreak: false,
      });
    }

    const dateLabelX = placeLineEnd + gap;
    doc.text(onDateLabel, dateLabelX, y, { lineBreak: false });
    const dateLineStart = dateLabelX + onDateLabelW;
    const dateLineEnd = dateLineStart + dateLineW;
    doc.moveTo(dateLineStart, baseline).lineTo(dateLineEnd, baseline)
      .lineWidth(0.75).strokeColor('#111111').stroke();
    if (accept?.acceptedDate) {
      doc.text(String(accept.acceptedDate), dateLineStart + 2, y, {
        width: dateLineW - 4,
        lineBreak: false,
      });
    }

    doc.y = y + 22;
    doc.x = x0;
    markProposalBodyContent(doc);
  }

  const shortLineW = 220;
  const vatLineW = 280;

  doc.y = drawFieldLine('Full Name: ', accept?.acceptedByName, shortLineW);
  doc.x = x0;
  markProposalBodyContent(doc);

  const signatureValue = accept?.acceptedByName ? 'Electronically accepted' : null;
  doc.y = drawFieldLine('Signature: ', signatureValue, shortLineW);
  doc.x = x0;
  markProposalBodyContent(doc);

  doc.y = drawFieldLine('VAT reference number: ', accept?.clientVatNumber, vatLineW);
  doc.x = x0;
  markProposalBodyContent(doc);
}

export { PROPOSAL_COLORS as COLORS };
