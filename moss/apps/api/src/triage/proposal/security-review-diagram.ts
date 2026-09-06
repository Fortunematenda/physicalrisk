/**
 * Security Review staircase — matches Physical Risk PPT reference artwork.
 * Tall spine, AS IS oval detached from the bar, labels above + below each tread.
 */
import type PDFDocument from 'pdfkit';

/**
 * Flat label list (bottom → top) for tests / docs.
 */
export const SECURITY_REVIEW_STAGES = [
  { title: 'Security Risk Assessment', place: 'above' as const },
  { title: 'Best practice', place: 'below' as const },
  { title: 'Policies & Procedures', place: 'above' as const },
  { title: 'Legislation', place: 'below' as const },
  { title: 'Intelligent', place: 'above' as const },
  { title: 'Contracts', place: 'below' as const },
  { title: 'Strategy', place: 'right' as const },
] as const;

/** Per stair tread (bottom → top): one label on top of the step, one under it. */
const STEP_LABELS = [
  { above: 'Security Risk\nAssessment', below: 'Best practice' },
  { above: 'Policies &\nProcedures', below: 'Legislation' },
  { above: 'Intelligent', below: 'Contracts' },
] as const;

const FINAL_RIGHT = 'Strategy';

const OLIVE = '#5F6B32';
const OLIVE_DARK = '#4A5428';
const TO_BE = '#9BC53D';
const NAVY = '#2C3A47';
const WHITE = '#FFFFFF';

export type SecurityReviewLogoPaths = {
  coverLogoPath?: string | null;
  logoPath?: string | null;
};

function drawLabel(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: { width: number; align?: 'left' | 'center' | 'right'; fontSize?: number },
) {
  doc.fillColor(NAVY).font('Helvetica').fontSize(opts.fontSize ?? 7);
  doc.text(text, x, y, {
    width: opts.width,
    align: opts.align ?? 'left',
    lineGap: 0.5,
    lineBreak: true,
  });
}

/**
 * Draw the reference-style Security Review diagram (Approach column).
 */
export function drawSecurityReviewDiagram(
  doc: PDFKit.PDFDocument,
  _chrome: SecurityReviewLogoPaths,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const barW = 18;
  const barGap = 8; // clear space — oval must NOT touch the Security Review bar
  const compact = h < 170;

  doc.save();
  doc.rect(x, y, w, h).fill(WHITE);

  // —— Olive spine (full height, standalone) ——
  doc.rect(x, y, barW, h).fill(OLIVE);
  doc.save();
  doc.translate(x + barW / 2, y + h / 2);
  doc.rotate(-90);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(compact ? 7.5 : 8.5)
    .text('Security Review', -h / 2 + 6, -4, {
      width: h - 12,
      align: 'center',
      lineBreak: false,
    });
  doc.restore();

  const innerLeft = x + barW + barGap;
  const innerRight = x + w - 4;
  const innerW = Math.max(120, innerRight - innerLeft);

  // —— TO BE box (top-right) ——
  const toBeW = Math.min(compact ? 118 : 132, Math.floor(innerW * 0.5));
  const toBeH = compact ? 24 : 28;
  const toBeX = innerRight - toBeW;
  const toBeY = y + 2;
  doc.rect(toBeX, toBeY, toBeW, toBeH).fill(TO_BE);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(compact ? 7 : 8)
    .text('Security Blueprint', toBeX + 4, toBeY + (compact ? 3 : 4), {
      width: toBeW - 8,
      align: 'center',
      lineBreak: false,
    });
  doc.font('Helvetica').fontSize(compact ? 5.5 : 6.5)
    .text('TO BE / Desired state', toBeX + 4, toBeY + (compact ? 13 : 16), {
      width: toBeW - 8,
      align: 'center',
      lineBreak: false,
    });

  // —— AS IS oval: to the RIGHT of the bar with a visible gap (not attached) ——
  const asIsRx = Math.min(compact ? 40 : 46, Math.floor(innerW * 0.26));
  const asIsRy = compact ? 15 : 18;
  const asIsCx = innerLeft + asIsRx; // left edge of oval = innerLeft (barGap clear of spine)
  const asIsCy = y + h - asIsRy - (compact ? 8 : 12);
  doc.ellipse(asIsCx, asIsCy, asIsRx, asIsRy).fill(OLIVE_DARK);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(compact ? 7 : 7.5)
    .text('AS IS', asIsCx - asIsRx, asIsCy - (compact ? 9 : 11), {
      width: asIsRx * 2,
      align: 'center',
      lineBreak: false,
    });
  doc.font('Helvetica-Bold').fontSize(compact ? 5.5 : 6)
    .text('Current', asIsCx - asIsRx, asIsCy - 1, {
      width: asIsRx * 2,
      align: 'center',
      lineBreak: false,
    });
  doc.font('Helvetica-Bold').fontSize(compact ? 5.5 : 6)
    .text('State', asIsCx - asIsRx, asIsCy + (compact ? 6 : 7), {
      width: asIsRx * 2,
      align: 'center',
      lineBreak: false,
    });

  // —— Staircase: rises from top-centre of oval ——
  const stairsLeft = asIsCx;
  const stairsRight = Math.min(toBeX + toBeW * 0.3, innerRight - 52);
  const stairsBottom = asIsCy - asIsRy;
  const stairsTop = toBeY + toBeH + (compact ? 16 : 22);

  const treadCount = 3;
  const span = Math.max(1, stairsRight - stairsLeft);
  const treadW = Math.min(compact ? 46 : 52, Math.max(32, span / treadCount));
  const riseCount = treadCount + 1;
  const rise = Math.max(compact ? 20 : 24, Math.min(compact ? 28 : 34, (stairsBottom - stairsTop) / riseCount));

  let sx = stairsLeft;
  let sy = stairsBottom;
  doc.lineWidth(1.35).strokeColor(NAVY);

  type StepGeom = {
    treadX0: number;
    treadX1: number;
    treadY: number;
  };
  const steps: StepGeom[] = [];

  for (let i = 0; i < treadCount; i += 1) {
    const nextY = sy - rise;
    const nextX = sx + treadW;
    doc.moveTo(sx, sy).lineTo(sx, nextY).stroke();
    doc.moveTo(sx, nextY).lineTo(nextX, nextY).stroke();
    steps.push({
      treadX0: sx,
      treadX1: nextX,
      treadY: nextY,
    });
    sx = nextX;
    sy = nextY;
  }

  const finalRiserY0 = sy;
  const arrowX = Math.min(Math.max(sx, toBeX + toBeW * 0.45), toBeX + toBeW * 0.7);
  if (Math.abs(arrowX - sx) > 0.5) {
    doc.moveTo(sx, sy).lineTo(arrowX, sy).stroke();
  }
  const tipY = toBeY + toBeH;
  doc.moveTo(arrowX, sy).lineTo(arrowX, tipY).stroke();
  doc.moveTo(arrowX, tipY).lineTo(arrowX - 4.5, tipY + 8).stroke();
  doc.moveTo(arrowX, tipY).lineTo(arrowX + 4.5, tipY + 8).stroke();

  // —— Labels sit ON the horizontal step: above + below, inset from the riser ——
  const inset = compact ? 6 : 8; // keep text off the vertical corner
  const labelFs = compact ? 6 : 7;
  for (let i = 0; i < STEP_LABELS.length; i += 1) {
    const s = steps[i];
    const labels = STEP_LABELS[i];
    const labelX = s.treadX0 + inset;
    const labelW = Math.max(40, s.treadX1 - s.treadX0 - inset - 2);

    // On top of the step
    const aboveMulti = labels.above.includes('\n');
    drawLabel(doc, labels.above, labelX, s.treadY - (aboveMulti ? (compact ? 14 : 17) : (compact ? 9 : 11)), {
      width: Math.max(labelW, aboveMulti ? 72 : labelW),
      align: 'left',
      fontSize: aboveMulti ? labelFs - 0.5 : labelFs,
    });

    // At the bottom of the step
    drawLabel(doc, labels.below, labelX, s.treadY + 2, {
      width: Math.max(labelW, 56),
      align: 'left',
      fontSize: labelFs,
    });
  }

  // Strategy to the right of the final arrow
  {
    const midY = (finalRiserY0 + tipY) / 2;
    const rightX = arrowX + 6;
    const rightW = Math.min(52, toBeX - rightX - 4);
    if (rightW >= 24) {
      drawLabel(doc, FINAL_RIGHT, rightX, midY - 4, {
        width: rightW,
        align: 'left',
        fontSize: 7,
      });
    }
  }

  doc.restore();
}
