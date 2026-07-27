import { McpMarkdownPdfService } from './mcp-markdown-pdf.service';

describe('McpMarkdownPdfService', () => {
  const service = new McpMarkdownPdfService();

  it('renders markdown to a PDF buffer', async () => {
    const buffer = await service.render('# Cow\n\nA cow is a domesticated mammal.\n\n- Milk\n- Beef', {
      title: 'Cow',
      author: 'Wayne',
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
