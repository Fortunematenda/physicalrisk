import PDFDocument from 'pdfkit';
import {
  PDF_PAGE_MARGIN,
  beginBodyAfterLetterhead,
  drawPdfLetterhead,
  resolveReportLogoPath,
} from '../reports/pdf-letterhead';

export type AdvisoryPdfInput = {
  reference: string;
  title: string;
  organisation: string;
  productLabel: string;
  status: string;
  consultant?: string | null;
  modules: Array<{
    moduleName: string;
    principalQuestion: string;
    exposureRating?: number | null;
    finding?: string | null;
    evidenceSummary?: string | null;
    businessConsequence?: string | null;
    accountableExecutive?: string | null;
    requiredDecision?: string | null;
    recommendedProduct?: string | null;
  }>;
};

export function renderAdvisoryPdf(input: AdvisoryPdfInput): Promise<Buffer> {
  const logoPath = resolveReportLogoPath();
  const margin = PDF_PAGE_MARGIN;
  const pageW = 595.28 - margin * 2; // A4 width minus margins

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

    const red = '#c41230';
    const ink = '#111827';
    const muted = '#64748b';

    const header = (compact = false) => {
      const y = drawPdfLetterhead(doc, { logoPath, compact, margin });
      beginBodyAfterLetterhead(doc, y, margin);
    };

    header(false);
    doc.fillColor(red).font('Helvetica-Bold').fontSize(9).text(input.productLabel.toUpperCase(), { characterSpacing: 0.8 });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(24).text(input.title || input.productLabel);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).fillColor(muted).text(`Organisation: ${input.organisation}`);
    doc.text(`Reference: ${input.reference}`);
    doc.text(`Status: ${input.status}`);
    if (input.consultant) doc.text(`Consultant: ${input.consultant}`);
    doc.moveDown(1.2);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(15).text('Executive working paper');
    doc.fillColor(muted).font('Helvetica').fontSize(9).text(
      'Findings are evidence-led. Ratings are internal exposure indicators only and must not be presented as an audit opinion unless the approved methodology expressly provides for that conclusion.',
    );
    doc.moveDown(1);

    input.modules.forEach((m, i) => {
      if (doc.y > 680) {
        doc.addPage();
        header(true);
      }
      doc.fillColor(red).font('Helvetica-Bold').fontSize(9).text(`${i + 1}. ${m.moduleName.toUpperCase()}`);
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(m.principalQuestion);
      if (m.exposureRating != null) {
        doc.fillColor(muted).font('Helvetica').fontSize(9).text(`Internal exposure indicator: ${m.exposureRating}/100 (higher = greater exposure)`);
      }
      const fields: Array<[string, string | null | undefined]> = [
        ['Finding', m.finding],
        ['Evidence / limitation', m.evidenceSummary],
        ['Business consequence', m.businessConsequence],
        ['Accountable executive', m.accountableExecutive],
        ['Required decision', m.requiredDecision],
        ['Recommended next product', m.recommendedProduct],
      ];
      for (const [label, value] of fields) {
        doc.moveDown(0.35);
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(8).text(label.toUpperCase());
        doc.fillColor(value ? ink : muted).font('Helvetica').fontSize(9).text(value?.trim() || 'Not recorded');
      }
      doc.moveDown(0.8);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).strokeColor('#e5e7eb').lineWidth(0.7).stroke();
      doc.moveDown(0.8);
    });

    doc.addPage();
    header(true);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(17).text('Decision and assurance basis');
    doc.moveDown(0.8);
    doc.fillColor(muted).font('Helvetica').fontSize(10).text(
      'Every recommendation must be connected to a finding, supporting evidence, business consequence, accountable executive, required decision and an appropriate intervention. Unsupported financial or assurance conclusions must not be issued.',
    );
    doc.moveDown(1);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('Product journey');
    doc.fillColor(muted).font('Helvetica').fontSize(10).text(
      'Level 1 Executive Governance Triage → Level 2 Executive Advisory Diagnostic → Level 3 Focused Assurance → Shield 360 or other approved sustainable remediation where appropriate.',
    );
    doc.end();
  });
}
