import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import AdmZip = require('adm-zip');

export type OfficeFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt';

export type MarkdownOfficeOptions = {
  title?: string;
  author?: string;
};

/**
 * Lightweight Markdown → DOCX / XLSX / PPTX / TXT for MCP same-chat submissions.
 * Uses OOXML + adm-zip (already a dependency) — no LibreOffice required.
 * Legacy .doc / .xls / .ppt requests are mapped to modern .docx / .xlsx / .pptx.
 * Plain text (.txt) stores the chat body as UTF-8 without PDF conversion.
 */
@Injectable()
export class McpMarkdownOfficeService {
  private readonly logger = new Logger(McpMarkdownOfficeService.name);

  async renderDocx(markdown: string, options: MarkdownOfficeOptions = {}): Promise<Buffer> {
    const title = (options.title || 'Approved Document').trim() || 'Approved Document';
    try {
      return this.buildDocx(markdown, title);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Markdown→DOCX failed: ${message}`);
      throw new BadRequestException(`Could not convert document to Word (.docx): ${message}`);
    }
  }

  async renderXlsx(markdown: string, options: MarkdownOfficeOptions = {}): Promise<Buffer> {
    const title = (options.title || 'Approved Document').trim() || 'Approved Document';
    try {
      return this.buildXlsx(markdown, title);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Markdown→XLSX failed: ${message}`);
      throw new BadRequestException(`Could not convert document to Excel (.xlsx): ${message}`);
    }
  }

  async renderPptx(markdown: string, options: MarkdownOfficeOptions = {}): Promise<Buffer> {
    const title = (options.title || 'Approved Document').trim() || 'Approved Document';
    try {
      return this.buildPptx(markdown, title);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Markdown→PPTX failed: ${message}`);
      throw new BadRequestException(`Could not convert document to PowerPoint (.pptx): ${message}`);
    }
  }

  async renderTxt(markdown: string, options: MarkdownOfficeOptions = {}): Promise<Buffer> {
    const title = (options.title || 'Approved Document').trim() || 'Approved Document';
    try {
      const body = this.stripDuplicateLeadingTitle(String(markdown || ''), title);
      const header = `${title}\n${'='.repeat(Math.min(title.length, 72))}\n\n`;
      const text = `${header}${body.replace(/\r\n/g, '\n').trim()}\n`;
      return Buffer.from(text, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Markdown→TXT failed: ${message}`);
      throw new BadRequestException(`Could not convert document to plain text (.txt): ${message}`);
    }
  }

  /** Resolve desired output format from filename / mime / optional outputFormat. Default: pdf. */
  static resolveFormat(input: {
    fileName?: string;
    mimeType?: string;
    outputFormat?: string;
  }): OfficeFormat {
    const explicit = String(input.outputFormat || '').trim().toLowerCase();
    if (['docx', 'doc', 'word'].includes(explicit)) return 'docx';
    if (['xlsx', 'xls', 'excel', 'spreadsheet'].includes(explicit)) return 'xlsx';
    if (['pptx', 'ppt', 'powerpoint', 'presentation', 'slides'].includes(explicit)) return 'pptx';
    if (['txt', 'text', 'plain', 'plaintext'].includes(explicit)) return 'txt';
    if (['pdf'].includes(explicit)) return 'pdf';

    const name = String(input.fileName || '').trim().toLowerCase();
    if (/\.(docx?)$/i.test(name)) return 'docx';
    if (/\.(xlsx?|csv)$/i.test(name)) return 'xlsx';
    if (/\.(pptx?)$/i.test(name)) return 'pptx';
    if (/\.txt$/i.test(name)) return 'txt';

    const mime = String(input.mimeType || '').trim().toLowerCase();
    // Ignore ChatGPT's habitual application/pdf default — only trust office/text MIME types.
    if (mime && mime !== 'application/pdf' && mime !== 'application/octet-stream') {
      if (
        mime.includes('wordprocessingml')
        || mime.includes('msword')
        || mime === 'application/doc'
        || mime === 'application/ms-word'
      ) {
        return 'docx';
      }
      if (
        mime.includes('spreadsheetml')
        || mime.includes('ms-excel')
        || mime.includes('excel')
        || mime === 'text/csv'
      ) {
        return 'xlsx';
      }
      if (
        mime.includes('presentationml')
        || mime.includes('ms-powerpoint')
        || mime.includes('powerpoint')
      ) {
        return 'pptx';
      }
      if (mime === 'text/plain') {
        return 'txt';
      }
    }
    return 'pdf';
  }

  static mimeFor(format: OfficeFormat): string {
    if (format === 'docx') {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (format === 'xlsx') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (format === 'pptx') {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (format === 'txt') {
      return 'text/plain';
    }
    return 'application/pdf';
  }

  static fileNameFor(titleOrName: string | undefined, format: OfficeFormat): string {
    const raw = String(titleOrName || 'document').trim();
    const withoutExt = raw.replace(/\.(md|markdown|txt|pdf|docx?|xlsx?|csv|pptx?)$/i, '');
    const base = withoutExt
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim() || 'document';
    if (format === 'docx') return `${base}.docx`;
    if (format === 'xlsx') return `${base}.xlsx`;
    if (format === 'pptx') return `${base}.pptx`;
    if (format === 'txt') return `${base}.txt`;
    return `${base}.pdf`;
  }

  private buildDocx(markdown: string, title: string): Buffer {
    const body = this.stripDuplicateLeadingTitle(markdown, title);
    const paragraphsXml = this.markdownToDocxParagraphs(body, title);
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'));
    zip.addFile('_rels/.rels', Buffer.from(rels, 'utf8'));
    zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
    return zip.toBuffer();
  }

  private buildXlsx(markdown: string, title: string): Buffer {
    const rows = this.markdownToSheetRows(markdown, title);
    const sheetXml = this.sheetXmlFromRows(rows);
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Document" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'));
    zip.addFile('_rels/.rels', Buffer.from(rootRels, 'utf8'));
    zip.addFile('xl/workbook.xml', Buffer.from(workbookXml, 'utf8'));
    zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(workbookRels, 'utf8'));
    zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml, 'utf8'));
    return zip.toBuffer();
  }

  private buildPptx(markdown: string, title: string): Buffer {
    const slides = this.markdownToSlides(markdown, title);
    const zip = new AdmZip();

    const slideOverrides = slides
      .map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
      .join('\n  ');

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

    const presentationRels = slides
      .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
      .concat([
        `<Relationship Id="rId${slides.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
      ])
      .join('\n  ');

    const sldIdLst = slides
      .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`)
      .join('\n    ');

    const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId${slides.length + 1}"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    ${sldIdLst}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

    zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'));
    zip.addFile('_rels/.rels', Buffer.from(rootRels, 'utf8'));
    zip.addFile('ppt/presentation.xml', Buffer.from(presentationXml, 'utf8'));
    zip.addFile('ppt/_rels/presentation.xml.rels', Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${presentationRels}
</Relationships>`,
      'utf8',
    ));

    slides.forEach((slide, index) => {
      const n = index + 1;
      zip.addFile(`ppt/slides/slide${n}.xml`, Buffer.from(this.slideXml(slide), 'utf8'));
      zip.addFile(`ppt/slides/_rels/slide${n}.xml.rels`, Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
        'utf8',
      ));
    });

    zip.addFile('ppt/slideLayouts/slideLayout1.xml', Buffer.from(this.slideLayoutXml(), 'utf8'));
    zip.addFile('ppt/slideLayouts/_rels/slideLayout1.xml.rels', Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
      'utf8',
    ));
    zip.addFile('ppt/slideMasters/slideMaster1.xml', Buffer.from(this.slideMasterXml(), 'utf8'));
    zip.addFile('ppt/slideMasters/_rels/slideMaster1.xml.rels', Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
      'utf8',
    ));
    zip.addFile('ppt/theme/theme1.xml', Buffer.from(this.themeXml(), 'utf8'));
    return zip.toBuffer();
  }

  private markdownToSlides(markdown: string, title: string): Array<{ title: string; bullets: string[] }> {
    const body = this.stripDuplicateLeadingTitle(markdown, title);
    const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
    const slides: Array<{ title: string; bullets: string[] }> = [{ title, bullets: [] }];
    let current = slides[0];

    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
      if (heading) {
        const headingText = this.stripInlineMarkers(heading[1]);
        if (current === slides[0] && current.bullets.length === 0 && current.title === title) {
          // Keep title slide; start content slides from first heading when different.
          if (headingText.toLowerCase() !== title.toLowerCase()) {
            current = { title: headingText, bullets: [] };
            slides.push(current);
          }
        } else {
          current = { title: headingText, bullets: [] };
          slides.push(current);
        }
        continue;
      }
      const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        current.bullets.push(this.stripInlineMarkers(bullet[1]));
        continue;
      }
      const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (numbered) {
        current.bullets.push(this.stripInlineMarkers(numbered[1]));
        continue;
      }
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (/^\|\s*[-:| ]+\|$/.test(trimmed)) continue;
        current.bullets.push(this.stripInlineMarkers(trimmed.replace(/\|/g, ' · ').replace(/^ · | · $/g, '')));
        continue;
      }
      current.bullets.push(this.stripInlineMarkers(trimmed));
    }

    if (slides.length === 1 && slides[0].bullets.length === 0) {
      slides[0].bullets.push('Approved presentation');
    }
    return slides.slice(0, 40).map((slide) => ({
      title: slide.title.slice(0, 200),
      bullets: slide.bullets.slice(0, 12),
    }));
  }

  private slideXml(slide: { title: string; bullets: string[] }): string {
    const titleShape = this.textShape(slide.title, {
      x: 457200, y: 274320, w: 11277600, h: 1143000, size: 3200, bold: true,
    });
    const bodyParagraphs = (slide.bullets.length ? slide.bullets : [' ']).map((line) => `
          <a:p>
            <a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>
            <a:r><a:rPr lang="en-US" sz="1800"/><a:t>${this.xmlEscape(line)}</a:t></a:r>
          </a:p>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${titleShape}
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1600200"/><a:ext cx="11277600" cy="4572000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
          ${bodyParagraphs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
  }

  private textShape(
    text: string,
    opts: { x: number; y: number; w: number; h: number; size: number; bold?: boolean },
  ): string {
    const bold = opts.bold ? ' b="1"' : '';
    return `<p:sp>
  <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${opts.x}" y="${opts.y}"/><a:ext cx="${opts.w}" cy="${opts.h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  </p:spPr>
  <p:txBody>
    <a:bodyPr/><a:lstStyle/>
    <a:p><a:r><a:rPr lang="en-US" sz="${opts.size}"${bold}/><a:t>${this.xmlEscape(text)}</a:t></a:r></a:p>
  </p:txBody>
</p:sp>`;
  }

  private slideLayoutXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
  }

  private slideMasterXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId2"/></p:sldLayoutIdLst>
</p:sldMaster>`;
  }

  private themeXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PhysicalRisk">
  <a:themeElements>
    <a:clrScheme name="PhysicalRisk">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="PhysicalRisk">
      <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="PhysicalRisk">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
  }

  private markdownToDocxParagraphs(markdown: string, title: string): string {
    const parts: string[] = [];
    parts.push(this.docxParagraph(title, { bold: true, size: 32 }));
    parts.push(this.docxParagraph(`Generated ${new Date().toISOString().slice(0, 10)} · Approved Document`, { size: 18, color: '666666' }));

    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    let paragraph: string[] = [];
    const flush = () => {
      if (!paragraph.length) return;
      const text = paragraph.join(' ').trim();
      paragraph = [];
      if (text) parts.push(this.docxParagraph(this.stripInlineMarkers(text), { size: 22 }));
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.replace(/\t/g, '    ').trim();
      if (!trimmed) {
        flush();
        continue;
      }
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flush();
        const level = heading[1].length;
        parts.push(this.docxParagraph(this.stripInlineMarkers(heading[2]), {
          bold: true,
          size: level === 1 ? 28 : level === 2 ? 24 : 22,
        }));
        continue;
      }
      const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      if (bullet) {
        flush();
        parts.push(this.docxParagraph(`• ${this.stripInlineMarkers(bullet[1])}`, { size: 22, indent: true }));
        continue;
      }
      const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      if (numbered) {
        flush();
        parts.push(this.docxParagraph(`${numbered[1]}. ${this.stripInlineMarkers(numbered[2])}`, { size: 22, indent: true }));
        continue;
      }
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        flush();
        parts.push(this.docxParagraph(this.stripInlineMarkers(trimmed.replace(/\|/g, ' · ').replace(/^ · | · $/g, '')), { size: 20 }));
        continue;
      }
      paragraph.push(trimmed);
    }
    flush();
    return parts.join('\n');
  }

  private docxParagraph(
    text: string,
    options: { bold?: boolean; size?: number; color?: string; indent?: boolean } = {},
  ): string {
    const size = options.size ?? 22;
    const color = options.color || '222222';
    const bold = options.bold ? '<w:b/>' : '';
    const indent = options.indent ? '<w:ind w:left="360"/>' : '';
    return `<w:p>
  <w:pPr>${indent}<w:spacing w:after="120"/></w:pPr>
  <w:r>
    <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:color w:val="${color}"/></w:rPr>
    <w:t xml:space="preserve">${this.xmlEscape(text)}</w:t>
  </w:r>
</w:p>`;
  }

  private markdownToSheetRows(markdown: string, title: string): string[][] {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const tableRows: string[][] = [];
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
      if (/^\|\s*[-:| ]+\|$/.test(trimmed)) continue;
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((cell) => this.stripInlineMarkers(cell.trim()));
      if (cells.length) tableRows.push(cells);
    }
    if (tableRows.length) {
      return [[title], [], ...tableRows];
    }

    const rows: string[][] = [[title], [`Generated ${new Date().toISOString().slice(0, 10)}`], []];
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed) {
        rows.push(['']);
        continue;
      }
      rows.push([this.stripInlineMarkers(trimmed.replace(/^#+\s*/, '').replace(/^[-*+]\s+/, ''))]);
    }
    return rows.length ? rows : [[title]];
  }

  private sheetXmlFromRows(rows: string[][]): string {
    const sheetRows = rows.map((row, rowIndex) => {
      const cells = row.map((value, colIndex) => {
        const ref = `${this.columnName(colIndex)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${this.xmlEscape(value)}</t></is></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
  }

  private columnName(index: number): string {
    let n = index;
    let name = '';
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
  }

  private stripDuplicateLeadingTitle(markdown: string, title: string): string {
    const normalizedTitle = title.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalizedTitle) return markdown;
    return String(markdown || '').replace(/^\s*#\s+([^\n]+)\n+/, (full, headingText: string) => {
      const normalizedHeading = String(headingText).trim().toLowerCase().replace(/\s+/g, ' ');
      return normalizedHeading === normalizedTitle ? '' : full;
    });
  }

  private stripInlineMarkers(text: string): string {
    return String(text || '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private xmlEscape(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
