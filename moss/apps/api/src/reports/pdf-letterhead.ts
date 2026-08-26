import type PDFDocument from 'pdfkit';
import {
  DEFAULT_SCL_REPORT_BRANDING,
  resolveSclReportLogoPath,
  type SclReportBrandConfig,
} from './scl-report-branding';

export const PDF_PAGE_MARGIN = 48;
export const PDF_TOP_BAR_H = 10;
export const PDF_LETTERHEAD_LOGO_H = 52;
export const PDF_LETTERHEAD_LOGO_H_COMPACT = 34;

const INK = '#111111';
const MUTED = '#666666';

export type PdfLetterheadOptions = {
  logoPath?: string | null;
  brand?: Partial<SclReportBrandConfig>;
  /** Smaller header for continuation pages */
  compact?: boolean;
  margin?: number;
};

export function resolveReportLogoPath(): string | null {
  return resolveSclReportLogoPath();
}

export function defaultReportBrand(): SclReportBrandConfig {
  return DEFAULT_SCL_REPORT_BRANDING;
}

function brandColor(brand: SclReportBrandConfig): string {
  return brand.brandColor || '#df0b12';
}

export function drawPdfTopBar(doc: PDFKit.PDFDocument, color: string): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, PDF_TOP_BAR_H).fill(color);
  doc.restore();
}

function drawLogoFallback(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  logoBox: number,
  red: string,
): number {
  doc.rect(x, y, logoBox, logoBox).fill(red);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12)
    .text('PHYSICAL RISK', x + logoBox + 10, y + 4, { lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7)
    .text('INDEPENDENT EXECUTIVE SECURITY ADVISORY', x + logoBox + 10, y + 22, {
      characterSpacing: 0.5,
      lineBreak: false,
    });
  return y + logoBox;
}

/** Draw Physical Risk letterhead (top bar, wordmark logo, contact line, rule).
 * Returns the Y coordinate where body content should begin.
 */
export function drawPdfLetterhead(doc: PDFKit.PDFDocument, options: PdfLetterheadOptions = {}): number {
  const brand = { ...DEFAULT_SCL_REPORT_BRANDING, ...(options.brand || {}) };
  const margin = options.margin ?? PDF_PAGE_MARGIN;
  const compact = Boolean(options.compact);
  const pageW = doc.page.width;
  const x = margin;
  const RED = brandColor(brand);
  const logoH = compact ? PDF_LETTERHEAD_LOGO_H_COMPACT : PDF_LETTERHEAD_LOGO_H;
  const logoPath = options.logoPath ?? resolveReportLogoPath();

  drawPdfTopBar(doc, RED);

  let y = PDF_TOP_BAR_H + (compact ? 12 : 20);
  let logoBottom = y + logoH;

  const logoCandidates = [
    logoPath,
    resolveReportLogoPath(),
    resolveSclReportLogoPath(brand),
  ].filter(Boolean) as string[];

  let logoDrawn = false;
  for (const candidate of logoCandidates) {
    try {
      doc.image(candidate, x, y, { height: logoH });
      logoBottom = y + logoH;
      logoDrawn = true;
      break;
    } catch {
      // Try the next bundled asset path.
    }
  }
  if (!logoDrawn) {
    logoBottom = drawLogoFallback(doc, x, y, logoH, RED);
  }

  const website = brand.websiteDisplay?.startsWith('www.')
    ? brand.websiteDisplay
    : `www.${(brand.websiteDisplay || 'physicalrisk.com').replace(/^www\./, '')}`;
  const contact = [website, brand.email, brand.phone].filter(Boolean).join('  |  ');

  doc.fillColor(MUTED).font('Helvetica').fontSize(compact ? 7 : 8)
    .text(contact, x, y + (compact ? 2 : 6), {
      width: pageW - margin * 2,
      align: 'right',
      lineBreak: false,
    });
  if (!compact) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text('Independent Executive Security Advisory', x, y + 20, {
        width: pageW - margin * 2,
        align: 'right',
        lineBreak: false,
      });
  }

  const ruleY = logoBottom + (compact ? 8 : 14);
  doc.moveTo(x, ruleY).lineTo(pageW - margin, ruleY).lineWidth(compact ? 1 : 1.5).strokeColor(RED).stroke();

  doc.fillOpacity(1).strokeOpacity(1);
  return ruleY + (compact ? 14 : 22);
}

/** Position the PDF cursor below the letterhead. */
export function beginBodyAfterLetterhead(doc: PDFKit.PDFDocument, y: number, margin = PDF_PAGE_MARGIN): void {
  doc.x = margin;
  doc.y = y;
}
