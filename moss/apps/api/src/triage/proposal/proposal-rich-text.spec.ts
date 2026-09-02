import { describe, expect, it } from 'vitest';
import { parseProposalRichText, stripHtmlToPlain } from './proposal-rich-text';

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

  it('keeps plain text paragraphs', () => {
    const blocks = parseProposalRichText('Line one\n\nLine two');
    expect(blocks).toHaveLength(2);
  });
});
