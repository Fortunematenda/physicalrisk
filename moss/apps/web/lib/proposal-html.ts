const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'div',
  'span',
]);

/** True when the string looks like HTML markup. */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

/** Strip tags to plain text for previews / emptiness checks. */
export function stripHtmlToPlain(value: string): string {
  const raw = String(value || '');
  if (!looksLikeHtml(raw)) return raw;
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Collapse consecutive duplicate paragraphs/blocks (common TipTap / template paste issue).
 * Works on HTML or plain text. Does not remove intentional distinct paragraphs,
 * and preserves blank paragraph spacers (`<p></p>` / `<p><br></p>`).
 */
export function dedupeRepeatedNarrative(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (looksLikeHtml(raw)) {
    const blocks = raw.match(/<(p|li|div)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
    if (blocks.length < 2) return raw;
    const seen: string[] = [];
    const kept: string[] = [];
    for (const block of blocks) {
      const key = stripHtmlToPlain(block).replace(/\s+/g, ' ').trim().toLowerCase();
      if (!key) {
        // Keep intentional blank lines between paragraphs (TipTap empty <p>).
        kept.push('<p><br></p>');
        continue;
      }
      if (seen.length && seen[seen.length - 1] === key) continue;
      // Also drop non-consecutive exact duplicates of the opening block (template re-appended).
      if (seen.includes(key) && key === seen[0]) continue;
      seen.push(key);
      kept.push(block);
    }
    return kept.length ? kept.join('') : raw;
  }

  // Preserve blank lines: split on single newlines and keep empty rows between paragraphs.
  const lines = raw.split(/\n/);
  const collapsed: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    const key = trimmed.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key) {
      if (collapsed.length && collapsed[collapsed.length - 1] !== '') collapsed.push('');
      continue;
    }
    const prevKey = collapsed[collapsed.length - 1]?.replace(/\s+/g, ' ').trim().toLowerCase();
    if (prevKey === key) continue;
    if (key === collapsed[0]?.replace(/\s+/g, ' ').trim().toLowerCase() && collapsed.includes(trimmed)) {
      continue;
    }
    collapsed.push(trimmed);
  }
  return collapsed.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Allow only simple TipTap tags; drop attributes and disallowed elements.
 * Safe enough for trusted proposal-editor content rendered via dangerouslySetInnerHTML.
 */
export function sanitizeProposalHtml(value: string): string {
  const raw = String(value || '');
  if (!looksLikeHtml(raw)) return raw;
  return raw
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*([a-z0-9]+)(\s[^>]*)?>/gi, (full, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (tag === 'br') return '<br>';
      if (full.startsWith('</')) return `</${tag}>`;
      return `<${tag}>`;
    });
}
