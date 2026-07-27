import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export type MarkdownPdfOptions = {
  title?: string;
  author?: string;
};

/**
 * Lightweight Markdown → PDF for MCP same-chat submissions.
 * Supports headings, paragraphs, bullet/numbered lists, and basic **bold** / *italic*.
 */
@Injectable()
export class McpMarkdownPdfService {
  async render(markdown: string, options: MarkdownPdfOptions = {}): Promise<Buffer> {
    const title = (options.title || 'Approved Document').trim() || 'Approved Document';
    const author = (options.author || 'Physical Risk Repository').trim();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 56,
        info: { Title: title, Author: author, Creator: 'Physical Risk Repo MCP' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header band
      doc.rect(0, 0, doc.page.width, 72).fill('#0b1f33');
      doc.fillColor('#ffffff').fontSize(10).text('PHYSICAL RISK', 56, 22);
      doc.fontSize(16).text('Repository', 56, 38);
      doc.fillColor('#111111');

      doc.moveDown(3);
      doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'left' });
      doc.moveDown(0.4);
      doc.fontSize(9).font('Helvetica').fillColor('#555555')
        .text(`Generated ${new Date().toISOString().slice(0, 10)} · Approved Document`);
      doc.moveDown(1.2).fillColor('#111111');

      const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
      let paragraph: string[] = [];

      const flushParagraph = () => {
        if (!paragraph.length) return;
        const text = paragraph.join(' ').trim();
        paragraph = [];
        if (!text) return;
        this.writeInline(doc, text, 11);
        doc.moveDown(0.6);
      };

      for (const rawLine of lines) {
        const line = rawLine.replace(/\t/g, '    ');
        const trimmed = line.trim();

        if (!trimmed) {
          flushParagraph();
          continue;
        }

        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          flushParagraph();
          const level = heading[1].length;
          const text = heading[2].trim();
          doc.moveDown(level === 1 ? 0.6 : 0.35);
          doc.font('Helvetica-Bold').fontSize(level === 1 ? 16 : level === 2 ? 13 : 12)
            .fillColor('#111111')
            .text(text, { paragraphGap: 4 });
          doc.font('Helvetica').fontSize(11);
          doc.moveDown(0.35);
          continue;
        }

        const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
        if (bullet) {
          flushParagraph();
          doc.font('Helvetica').fontSize(11);
          doc.text(`•  ${this.stripInlineMarkers(bullet[1])}`, {
            indent: 12,
            paragraphGap: 2,
          });
          continue;
        }

        const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (numbered) {
          flushParagraph();
          doc.font('Helvetica').fontSize(11);
          doc.text(`${trimmed.match(/^\d+/)?.[0]}.  ${this.stripInlineMarkers(numbered[1])}`, {
            indent: 12,
            paragraphGap: 2,
          });
          continue;
        }

        paragraph.push(trimmed);
      }

      flushParagraph();
      doc.end();
    });
  }

  private writeInline(doc: InstanceType<typeof PDFDocument>, text: string, size: number): void {
    // pdfkit doesn't parse markdown; render cleaned text with Helvetica.
    doc.font('Helvetica').fontSize(size).fillColor('#222222')
      .text(this.stripInlineMarkers(text), { align: 'left', paragraphGap: 2, lineGap: 2 });
  }

  private stripInlineMarkers(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
  }
}
