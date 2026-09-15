/**
 * Executive Advisory narrative rich-text helpers (Stage 3).
 * TipTap-compatible HTML: p, br, strong/b, em/i, u, ul, ol, li.
 */

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
]);

export function looksLikeRichHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

/** Strip tags to plain text (validation, audit, search). */
export function richTextToPlainText(value: string): string {
  const raw = String(value || '');
  if (!looksLikeRichHtml(raw)) return raw.trim();
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\/\s*(ul|ol)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
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

/** True when editor markup has no meaningful text (e.g. <p><br></p>). */
export function isRichTextEmpty(value: unknown): boolean {
  return !richTextToPlainText(String(value ?? '')).trim();
}

export function isRichTextFilled(value: unknown): boolean {
  return !isRichTextEmpty(value);
}

/** Wrap legacy plain text as simple paragraphs for the editor. */
export function plainTextToRichHtml(value: string): string {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  if (looksLikeRichHtml(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((para) => {
      const escaped = para
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      return `<p>${escaped}</p>`;
    })
    .join('');
}

/**
 * Whitelist sanitiser for advisory narrative HTML.
 * Strips scripts, styles, attributes, and unsupported tags.
 */
export function sanitizeRichText(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!looksLikeRichHtml(raw)) {
    return plainTextToRichHtml(raw);
  }

  const withoutDangerous = raw
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '');

  const cleaned = withoutDangerous.replace(
    /<\s*\/?\s*([a-z0-9]+)(\s[^>]*)?>/gi,
    (full, tagName: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (tag === 'br') return '<br>';
      if (full.startsWith('</')) return `</${tag}>`;
      return `<${tag}>`;
    },
  );

  if (isRichTextEmpty(cleaned)) return '';
  return cleaned
    .replace(/<p>\s*<\/p>/gi, '<p><br></p>')
    .trim();
}
