import { describe, expect, it } from 'vitest';
import {
  isRichTextEmpty,
  plainTextToRichHtml,
  richTextToPlainText,
  sanitizeRichText,
} from './ead-rich-text';

describe('ead-rich-text', () => {
  it('treats empty editor shells as empty', () => {
    expect(isRichTextEmpty('')).toBe(true);
    expect(isRichTextEmpty('<p></p>')).toBe(true);
    expect(isRichTextEmpty('<p><br></p>')).toBe(true);
    expect(isRichTextEmpty('<p><br/></p>')).toBe(true);
    expect(isRichTextEmpty('   ')).toBe(true);
  });

  it('detects filled rich text', () => {
    expect(isRichTextEmpty('<p>Finding</p>')).toBe(false);
    expect(isRichTextEmpty('<p><strong>Risk</strong></p>')).toBe(false);
  });

  it('loads legacy plain text as paragraphs', () => {
    expect(plainTextToRichHtml('Line one\n\nLine two')).toBe(
      '<p>Line one</p><p>Line two</p>',
    );
  });

  it('strips unsafe tags and attributes', () => {
    const cleaned = sanitizeRichText(
      '<p onclick="alert(1)">Safe <strong>bold</strong></p><script>evil()</script><iframe src="x"></iframe>',
    );
    expect(cleaned).toContain('<p>');
    expect(cleaned).toContain('<strong>bold</strong>');
    expect(cleaned).not.toContain('script');
    expect(cleaned).not.toContain('iframe');
    expect(cleaned).not.toContain('onclick');
  });

  it('preserves lists and emphasis', () => {
    const cleaned = sanitizeRichText(
      '<p><em>Note</em></p><ul><li><u>One</u></li><li>Two</li></ul>',
    );
    expect(cleaned).toContain('<em>Note</em>');
    expect(cleaned).toContain('<ul>');
    expect(cleaned).toContain('<li>');
    expect(cleaned).toContain('<u>One</u>');
  });

  it('converts rich text to readable plain text', () => {
    const plain = richTextToPlainText(
      '<p><strong>Financial risk</strong></p><ul><li>Unverified expenditure</li><li>Incomplete records</li></ul>',
    );
    expect(plain).toContain('Financial risk');
    expect(plain).toContain('Unverified expenditure');
    expect(plain).toContain('Incomplete records');
  });

  it('counts meaningful characters without markup for emptiness', () => {
    expect(richTextToPlainText('<strong>Risk</strong>')).toBe('Risk');
    expect(isRichTextEmpty('<strong></strong>')).toBe(true);
  });
});
