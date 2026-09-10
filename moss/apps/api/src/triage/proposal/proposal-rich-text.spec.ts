import { describe, expect, it } from 'vitest';
import {
  dedupeRepeatedNarrative,
  isClonedFromNarrative,
  normalizeNarrativeHtmlForPdf,
  parseProposalRichText,
  rejectClonedNarrative,
  sanitizeProposalNarrativeHtml,
  stripHtmlToPlain,
  unescapeProposalHtml,
} from './proposal-rich-text';

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

  it('preserves blank paragraph spacers between text', () => {
    const html =
      '<p>First paragraph.</p><p></p><p>Second paragraph.</p><p><br></p><p>Third.</p>';
    const blocks = parseProposalRichText(html);
    expect(blocks.filter((b) => b.type === 'paragraph')).toHaveLength(5);
    const emptyCount = blocks.filter(
      (b) => b.type === 'paragraph' && (!b.runs.length || b.runs.every((r) => !r.text.trim())),
    ).length;
    expect(emptyCount).toBeGreaterThanOrEqual(2);
  });

  it('dedupe keeps blank paragraph gaps', () => {
    const html =
      '<p>Physical Risk requires an independent review.</p>'
      + '<p></p>'
      + '<p>Physical Risk will assess the following:</p>';
    const result = dedupeRepeatedNarrative(html);
    expect(result).toContain('<p><br></p>');
    expect(result).toContain('independent review');
    expect(result).toContain('will assess the following');
  });

  it('strips timeline html duplicates to a single plain paragraph', () => {
    const html =
      '<p>Bretune Technologies requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000008). Physical Risk will assess governance effectiveness, provider accountability and decision-useful reporting across the agreed scope.</p>'
      + '<p>Bretune Technologies requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000008). Physical Risk will assess governance effectiveness, provider accountability and decision-useful reporting across the agreed scope.</p>';
    const cleaned = dedupeRepeatedNarrative(html);
    const plain = stripHtmlToPlain(cleaned);
    expect(plain).not.toMatch(/<\/?p>/i);
    expect(plain.toLowerCase().split('bretune technologies').length - 1).toBe(1);
  });

  it('normalizes Understanding narrative lists into clean paragraphs', () => {
    const html =
      '<ul>'
      + '<li><p>Brisholiving requires an independent review of executive assurance arrangements. Physical Risk will assess governance effectiveness across the agreed scope.</p></li>'
      + '<li><p>Brisholiving requires an independent review of executive assurance arrangements.</p></li>'
      + '<li><p>Brisholiving requires an independent review of executive assurance arrangements. Physical Risk will assess governance effectiveness across the agreed scope.invent new PDF sections.</p></li>'
      + '</ul>'
      + '<p>Physical Risk will assess governance effectiveness across the agreed scope.invent new PDF sections.</p>';
    const cleaned = normalizeNarrativeHtmlForPdf(html);
    expect(cleaned).not.toMatch(/<li/i);
    expect(cleaned).not.toMatch(/invent new PDF sections/i);
    const blocks = parseProposalRichText(cleaned);
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    expect(stripHtmlToPlain(cleaned).toLowerCase()).toContain('brisholiving requires');
    expect(stripHtmlToPlain(cleaned).toLowerCase()).not.toContain('invent new pdf sections');
    // Must not collapse away most of the source text.
    expect(stripHtmlToPlain(cleaned).length).toBeGreaterThan(80);
  });

  it('never blanks narrative that still has readable text', () => {
    const html = '<p>Brisholiving requires an independent evidence-led review.</p>';
    expect(stripHtmlToPlain(normalizeNarrativeHtmlForPdf(html))).toContain('Brisholiving');
    expect(stripHtmlToPlain(normalizeNarrativeHtmlForPdf('Plain understanding text.'))).toContain(
      'Plain understanding',
    );
  });

  it('detects Understanding clones pasted into other fields', () => {
    const und =
      'Brisholiving requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000009). Physical Risk will assess governance effectiveness.';
    expect(isClonedFromNarrative(und, und)).toBe(true);
    expect(isClonedFromNarrative(`<p>${und}</p>`, und)).toBe(true);
    expect(isClonedFromNarrative(und.slice(0, 200), und)).toBe(true);
    expect(rejectClonedNarrative(und, und)).toBe('');
    expect(rejectClonedNarrative('Client wants clearer reporting and accountability.', und)).toContain(
      'clearer reporting',
    );
    expect(
      isClonedFromNarrative(
        `Current-state assessment findings. ${und}`,
        und,
      ),
    ).toBe(true);
  });

  it('preserves blank paragraph spacers for Understanding', () => {
    const html = '<p>First paragraph.</p><p></p><p><br></p><p>Second paragraph.</p>';
    const cleaned = normalizeNarrativeHtmlForPdf(html);
    expect(cleaned).toContain('<p><br></p>');
    expect(cleaned).toContain('First paragraph.');
    expect(cleaned).toContain('Second paragraph.');
  });

  it('strips vfProposed timelines bleed from Understanding narrative', () => {
    const html =
      '<p>Bretune Technologies requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000008). Physical Risk will assess governance effectiveness, provider accountability and decision-useful reporting across the agreed scope.vfProposed timelines</p>'
      + '<p>Bretune Technologies requires an independent, evidence-led review of executive assurance arrangements following completion of the Executive Governance Triage (EGT-2026-000008). Physical Risk will assess governance effectiveness, provider accountability and decision-useful reporting across the agreed scope.vf</p>';
    const cleaned = sanitizeProposalNarrativeHtml(html);
    const plain = stripHtmlToPlain(cleaned);
    expect(plain.toLowerCase()).toContain('bretune technologies requires');
    expect(plain.toLowerCase()).not.toContain('proposed timelines');
    expect(plain.toLowerCase()).not.toMatch(/\bvf\b/);
    expect(plain.toLowerCase().split('bretune technologies').length - 1).toBe(1);
  });
});
