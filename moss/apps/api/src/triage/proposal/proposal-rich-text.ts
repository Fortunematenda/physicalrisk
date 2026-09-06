/**
 * Lightweight HTML helpers for proposal rich-text → PDF.
 * Supports TipTap output: p, br, strong/b, em/i, u, ul/ol/li.
 */

export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

/**
 * Collapse consecutive duplicate paragraphs/blocks (TipTap / template re-append).
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
      if (!key) continue;
      if (seen.length && seen[seen.length - 1] === key) continue;
      if (seen.includes(key) && key === seen[0]) continue;
      seen.push(key);
      kept.push(block);
    }
    return kept.length ? kept.join('') : raw;
  }

  const parts = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return raw;
  const out: string[] = [];
  for (const part of parts) {
    const key = part.replace(/\s+/g, ' ').trim().toLowerCase();
    const firstKey = out[0]?.replace(/\s+/g, ' ').trim().toLowerCase();
    if (out.length && out[out.length - 1].replace(/\s+/g, ' ').trim().toLowerCase() === key) continue;
    if (firstKey && key === firstKey && out.some((p) => p.replace(/\s+/g, ' ').trim().toLowerCase() === key)) {
      continue;
    }
    out.push(part);
  }
  return out.join('\n\n');
}

/** Strip tags to plain text (for table cells / validation emptiness). */
export function stripHtmlToPlain(value: string): string {
  const raw = unescapeProposalHtml(String(value || ''));
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

export type RichInlineStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type RichInlineRun = {
  text: string;
  style: RichInlineStyle;
};

export type RichBlock =
  | { type: 'paragraph'; runs: RichInlineRun[] }
  | { type: 'list-item'; ordered: boolean; index: number; runs: RichInlineRun[] };

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** TipTap sometimes stores escaped markup (&lt;li&gt;...) — decode once so parsers see real tags. */
export function unescapeProposalHtml(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (looksLikeHtml(raw)) return raw;
  if (/&lt;\/?[a-z]/i.test(raw)) {
    const decoded = decodeEntities(raw);
    if (looksLikeHtml(decoded)) return decoded;
  }
  return raw;
}

function parseInline(html: string, base: RichInlineStyle = {}): RichInlineRun[] {
  const runs: RichInlineRun[] = [];
  // Match any tag so unknown markup (li, span, etc.) is never printed literally.
  const tokenRe = /<\/?[a-z][a-z0-9]*(?:\s[^>]*)?\s*\/?>/gi;
  let last = 0;
  let style: RichInlineStyle = { ...base };
  let match: RegExpExecArray | null;
  const pushText = (chunk: string) => {
    const text = decodeEntities(chunk);
    if (!text) return;
    const prev = runs[runs.length - 1];
    if (
      prev &&
      prev.style.bold === style.bold &&
      prev.style.italic === style.italic &&
      prev.style.underline === style.underline
    ) {
      prev.text += text;
    } else {
      runs.push({ text, style: { ...style } });
    }
  };

  while ((match = tokenRe.exec(html))) {
    if (match.index > last) pushText(html.slice(last, match.index));
    const tag = match[0].toLowerCase();
    const name = tag.replace(/^<\/?/, '').replace(/[\s/>].*$/, '');
    if (name === 'br') {
      pushText('\n');
    } else if (tag.startsWith('</')) {
      if (name === 'strong' || name === 'b') style = { ...style, bold: base.bold };
      else if (name === 'em' || name === 'i') style = { ...style, italic: base.italic };
      else if (name === 'u') style = { ...style, underline: base.underline };
    } else if (name === 'strong' || name === 'b') {
      style = { ...style, bold: true };
    } else if (name === 'em' || name === 'i') {
      style = { ...style, italic: true };
    } else if (name === 'u') {
      style = { ...style, underline: true };
    }
    // All other tags (li, p, span, ul, …) are consumed and not emitted as text.
    last = match.index + match[0].length;
  }
  if (last < html.length) pushText(html.slice(last));
  return runs.filter((r) => r.text.length > 0);
}

function extractInner(html: string, openTag: string): { inner: string; rest: string } | null {
  const openRe = new RegExp(`<${openTag}(?:\\s[^>]*)?>`, 'i');
  const open = openRe.exec(html);
  if (!open || open.index !== 0) return null;
  const afterOpen = open[0].length;
  const closeTag = `</${openTag}>`;
  let depth = 1;
  let i = afterOpen;
  const openFinder = new RegExp(`<${openTag}(?:\\s[^>]*)?>`, 'ig');
  const closeFinder = new RegExp(`</${openTag}>`, 'ig');
  while (i < html.length && depth > 0) {
    openFinder.lastIndex = i;
    closeFinder.lastIndex = i;
    const nextOpen = openFinder.exec(html);
    const nextClose = closeFinder.exec(html);
    if (!nextClose) {
      return { inner: html.slice(afterOpen), rest: '' };
    }
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return {
          inner: html.slice(afterOpen, nextClose.index),
          rest: html.slice(nextClose.index + closeTag.length),
        };
      }
      i = nextClose.index + nextClose[0].length;
    }
  }
  return { inner: html.slice(afterOpen), rest: '' };
}

/** Parse TipTap/simple HTML into PDF-friendly blocks. Falls back to plain paragraphs. */
export function parseProposalRichText(value: string): RichBlock[] {
  const raw = unescapeProposalHtml(String(value || '').trim());
  if (!raw) return [];
  if (!looksLikeHtml(raw)) {
    return raw
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: 'paragraph' as const, runs: [{ text: p, style: {} }] }));
  }

  const blocks: RichBlock[] = [];
  let remaining = raw.replace(/\r\n/g, '\n');

  while (remaining.trim()) {
    remaining = remaining.replace(/^\s+/, '');
    if (!remaining) break;

    if (/^<(ul|ol)(?:\s[^>]*)?>/i.test(remaining)) {
      const ordered = /^<ol/i.test(remaining);
      const listTag = ordered ? 'ol' : 'ul';
      const extracted = extractInner(remaining, listTag);
      if (!extracted) break;
      remaining = extracted.rest;
      let listInner = extracted.inner.trim();
      let itemIndex = 1;
      while (listInner.trim()) {
        listInner = listInner.replace(/^\s+/, '');
        if (!/^<li(?:\s[^>]*)?>/i.test(listInner)) {
          // stray text inside list
          const stray = listInner.replace(/<[^>]+>/g, '').trim();
          if (stray) {
            blocks.push({
              type: 'list-item',
              ordered,
              index: itemIndex++,
              runs: [{ text: decodeEntities(stray), style: {} }],
            });
          }
          break;
        }
        const item = extractInner(listInner, 'li');
        if (!item) break;
        listInner = item.rest;
        const runs = parseInline(item.inner.replace(/<\/?p(?:\s[^>]*)?>/gi, ''));
        if (runs.length) {
          blocks.push({ type: 'list-item', ordered, index: itemIndex++, runs });
        }
      }
      continue;
    }

    // Bare <li> (TipTap fragment / template join without wrapping <ul>)
    if (/^<li(?:\s[^>]*)?>/i.test(remaining)) {
      let itemIndex = 1;
      while (/^<li(?:\s[^>]*)?>/i.test(remaining.trim())) {
        remaining = remaining.replace(/^\s+/, '');
        const item = extractInner(remaining, 'li');
        if (!item) {
          // Unclosed <li> — strip tags and emit once
          const runs = parseInline(remaining);
          if (runs.length) {
            blocks.push({ type: 'list-item', ordered: false, index: itemIndex++, runs });
          }
          remaining = '';
          break;
        }
        remaining = item.rest;
        const runs = parseInline(item.inner.replace(/<\/?p(?:\s[^>]*)?>/gi, ''));
        if (runs.length) {
          blocks.push({ type: 'list-item', ordered: false, index: itemIndex++, runs });
        }
      }
      continue;
    }

    if (/^<p(?:\s[^>]*)?>/i.test(remaining)) {
      const para = extractInner(remaining, 'p');
      if (!para) break;
      remaining = para.rest;
      const runs = parseInline(para.inner);
      if (runs.length) blocks.push({ type: 'paragraph', runs });
      continue;
    }

    if (/^<div(?:\s[^>]*)?>/i.test(remaining)) {
      const div = extractInner(remaining, 'div');
      if (!div) break;
      remaining = div.rest;
      // Recurse into div content
      blocks.push(...parseProposalRichText(div.inner));
      continue;
    }

    // Unknown / bare text until next block tag
    const nextBlock = remaining.search(/<(?:p|ul|ol|div|li)(?:\s[^>]*)?>/i);
    const chunk = nextBlock === -1 ? remaining : remaining.slice(0, nextBlock);
    remaining = nextBlock === -1 ? '' : remaining.slice(nextBlock);
    const runs = parseInline(chunk);
    if (runs.length) blocks.push({ type: 'paragraph', runs });
  }

  return blocks;
}

export function richFont(style: RichInlineStyle): string {
  if (style.bold && style.italic) return 'Helvetica-BoldOblique';
  if (style.bold) return 'Helvetica-Bold';
  if (style.italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}
