import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import PDFKit from 'pdfkit';

export type MarkdownPdfOptions = {
  title?: string;
  author?: string;
};

// Nest compiles without esModuleInterop; pdfkit's CJS export shape varies.
const PDFDocument = (PDFKit as unknown as { default?: typeof PDFKit }).default ?? PDFKit;

/**
 * Lightweight Markdown → PDF for MCP same-chat submissions.
 * Supports headings, paragraphs, bullet/numbered lists, and basic **bold** / *italic*.
 */
@Injectable()
export class McpMarkdownPdfService {
  private readonly logger = new Logger(McpMarkdownPdfService.name);

  async render(markdown: string, options: MarkdownPdfOptions = {}): Promise<Buffer> {
    const title = (options.title || 'Approved Document').trim() || 'Approved Document';
    const author = (options.author || 'Physical Risk Repository').trim();

    try {
      return await this.renderPdf(markdown, title, author);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Markdown→PDF failed: ${message}`);
      throw new BadRequestException(`Could not convert document to PDF: ${message}`);
    }
  }

  private renderPdf(markdown: string, title: string, author: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 56,
          info: { Title: title, Author: author, Creator: 'Physical Risk Repo MCP' },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.rect(0, 0, doc.page.width, 72).fill('#0b1f33');
        doc.fillColor('#ffffff').font('Helvetica').fontSize(10).text('PHYSICAL RISK', 56, 22);
        doc.fontSize(16).text('Repository', 56, 38);
        doc.fillColor('#111111');

        doc.y = 96;
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
            const text = this.toPdfSafe(heading[2].trim());
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
            doc.text(`-  ${this.stripInlineMarkers(bullet[1])}`, {
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
      } catch (error) {
        reject(error);
      }
    });
  }

  private writeInline(doc: InstanceType<typeof PDFDocument>, text: string, size: number): void {
    doc.font('Helvetica').fontSize(size).fillColor('#222222')
      .text(this.stripInlineMarkers(text), { align: 'left', paragraphGap: 2, lineGap: 2 });
  }

  private stripInlineMarkers(text: string): string {
    return this.toPdfSafe(
      text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'),
    );
  }

  /** Helvetica is WinAnsi; strip/replace characters pdfkit cannot encode. */
  private toPdfSafe(text: string): string {
    return text
      .replace(/\u2022/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2013|\u2014/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
  }
}
