import { McpMarkdownOfficeService } from './mcp-markdown-office.service';

describe('McpMarkdownOfficeService', () => {
  const service = new McpMarkdownOfficeService();

  it('resolves Word/Excel/PowerPoint/TXT formats from filename and mime', () => {
    expect(McpMarkdownOfficeService.resolveFormat({ fileName: 'Report.doc' })).toBe('docx');
    expect(McpMarkdownOfficeService.resolveFormat({ fileName: 'Sheet.xls' })).toBe('xlsx');
    expect(McpMarkdownOfficeService.resolveFormat({ fileName: 'Deck.ppt' })).toBe('pptx');
    expect(McpMarkdownOfficeService.resolveFormat({ fileName: 'Notes.txt' })).toBe('txt');
    expect(McpMarkdownOfficeService.resolveFormat({ outputFormat: 'powerpoint' })).toBe('pptx');
    expect(McpMarkdownOfficeService.resolveFormat({ outputFormat: 'text' })).toBe('txt');
    expect(McpMarkdownOfficeService.resolveFormat({ mimeType: 'text/plain' })).toBe('txt');
    expect(McpMarkdownOfficeService.resolveFormat({ outputFormat: 'word' })).toBe('docx');
    expect(McpMarkdownOfficeService.resolveFormat({ mimeType: 'application/msword' })).toBe('docx');
    expect(McpMarkdownOfficeService.resolveFormat({})).toBe('pdf');
  });

  it('builds a readable DOCX zip from markdown', async () => {
    const buffer = await service.renderDocx('# Cats\n\nHello **world**\n\n- one\n- two', { title: 'Cats' });
    expect(buffer.length).toBeGreaterThan(100);
    // ZIP local file header
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('builds a readable XLSX zip from markdown tables', async () => {
    const buffer = await service.renderXlsx(
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      { title: 'Numbers' },
    );
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('builds a readable PPTX zip from markdown sections', async () => {
    const buffer = await service.renderPptx(
      '# Overview\n\n## Highlights\n- One\n- Two\n\n## Next steps\n- Ship it',
      { title: 'Briefing' },
    );
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('builds plain text from markdown', async () => {
    const buffer = await service.renderTxt('# Notes\n\nHello world', { title: 'Notes' });
    const text = buffer.toString('utf8');
    expect(text).toContain('Notes');
    expect(text).toContain('Hello world');
  });

  it('names files with the correct extension', () => {
    expect(McpMarkdownOfficeService.fileNameFor('My Report.pdf', 'docx')).toBe('My Report.docx');
    expect(McpMarkdownOfficeService.fileNameFor('Budget.xlsx', 'xlsx')).toBe('Budget.xlsx');
    expect(McpMarkdownOfficeService.fileNameFor('Deck.ppt', 'pptx')).toBe('Deck.pptx');
    expect(McpMarkdownOfficeService.fileNameFor('Notes.md', 'txt')).toBe('Notes.txt');
  });
});
