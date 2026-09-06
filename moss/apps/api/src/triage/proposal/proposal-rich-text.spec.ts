import { describe, expect, it } from 'vitest';
import { parseProposalRichText, stripHtmlToPlain, unescapeProposalHtml } from './proposal-rich-text';

describe('proposal rich text', () => {
  it('strips html to plain text', () => {
    expect(stripHtmlToPlain('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('parses bold/italic/underline runs', () => {
    const blocks = parseProposalRichText('<p>Hello <strong>bold</strong> and <em>italic</em></p>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    if (blocks[0].type !== 'paragraph') return;
    expect(blocks[0].runs.map((r) => r.text).join('')).toContain('bold');
    expect(blocks[0].runs.some((r) => r.style.bold && r.text === 'bold')).toBe(true);
    expect(blocks[0].runs.some((r) => r.style.italic && r.text === 'italic')).toBe(true);
  });

  it('parses bullet lists', () => {
    const blocks = parseProposalRichText('<ul><li><p>One</p></li><li><p>Two</p></li></ul>');
    expect(blocks.filter((b) => b.type === 'list-item')).toHaveLength(2);
  });

  it('parses bare list items without wrapping ul/ol', () => {
    const html =
      '<li>First assurance point for UPC.</li>'
      + '<li>Second recommendation for Level 2.</li>';
    const blocks = parseProposalRichText(html);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === 'list-item')).toBe(true);
    const text = blocks.map((b) => ('runs' in b ? b.runs.map((r) => r.text).join('') : '')).join('|');
    expect(text).not.toMatch(/<\/?li>/i);
    expect(text).toContain('First assurance');
    expect(text).toContain('Second recommendation');
  });

  it('never emits raw tags for mixed bare markup', () => {
    const blocks = parseProposalRichText('<li>UPC requires <strong>independent</strong> review</li>');
    const joined = blocks.flatMap((b) => ('runs' in b ? b.runs.map((r) => r.text) : [])).join('');
    expect(joined).toBe('UPC requires independent review');
    expect(joined).not.toMatch(/</);
  });

  it('unescapes entity-encoded html before parsing', () => {
    expect(unescapeProposalHtml('&lt;li&gt;Hello&lt;/li&gt;')).toBe('<li>Hello</li>');
    const blocks = parseProposalRichText('&lt;li&gt;Hello world&lt;/li&gt;');
    expect(blocks[0]?.type).toBe('list-item');
    expect(blocks[0] && 'runs' in blocks[0] ? blocks[0].runs.map((r) => r.text).join('') : '').toBe(
      'Hello world',
    );
  });

  it('keeps plain text paragraphs', () => {
    const blocks = parseProposalRichText('Line one\n\nLine two');
    expect(blocks).toHaveLength(2);
  });
});
