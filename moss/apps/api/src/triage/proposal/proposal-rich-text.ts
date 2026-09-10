/**
 * Lightweight HTML helpers for proposal rich-text → PDF.
 * Supports TipTap output: p, br, strong/b, em/i, u, ul/ol/li.
 */

export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(String(value || ''));
}

/**
 * Collapse consecutive duplicate paragraphs/blocks (TipTap / template re-append).
 * Preserves blank paragraph spacers so editor line gaps survive save/PDF.
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
        kept.push('<p><br></p>');
        continue;
      }
      if (seen.length && seen[seen.length - 1] === key) continue;
      if (seen.includes(key) && key === seen[0]) continue;
      seen.push(key);
      kept.push(block);
    }
    return kept.length ? kept.join('') : raw;
  }

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
    const firstKey = collapsed[0]?.replace(/\s+/g, ' ').trim().toLowerCase();
    if (firstKey && key === firstKey && collapsed.some((p) => p.replace(/\s+/g, ' ').trim().toLowerCase() === key)) {
      continue;
    }
    collapsed.push(trimmed);
  }
  return collapsed.join('\n').replace(/\n{3,}/g, '\n\n');
}

function escapeHtmlText(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Strip TipTap tab-bleed junk that gets glued onto Understanding (and similar) narratives.
 * Examples: "…scope.vfProposed timelines", "…scope.invent new PDF sections", trailing "vf".
 */
export function scrubNarrativeBleedArtifacts(value: string): string {
  return String(value || '')
    .replace(/\s*invent\s+new\s+PDF\s+sections\.?/gi, '')
    .replace(/\s*vf\s*Proposed\s+timelines\b[\s\S]*$/gi, '')
    .replace(/\s*Proposed\s+timelines\b[\s\S]*$/gi, '')
    .replace(/\s*vf(?=[A-Z])/g, ' ')
    .replace(/\s*vf\s*$/gi, '')
    .replace(/\s+v\s*$/g, '') // truncated "vf" leftovers
    .replace(/\s*ffd\b/gi, '')
    .replace(/\.([A-Za-z])/g, '. $1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normalize + dedupe Understanding HTML for save and PDF so edits stick as one clean narrative.
 */
export function sanitizeProposalNarrativeHtml(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = normalizeNarrativeHtmlForPdf(raw);
  if (normalized) return normalized;
  const plain = scrubNarrativeBleedArtifacts(stripHtmlToPlain(raw));
  if (!plain) return '';
  return `<p>${escapeHtmlText(plain)}</p>`;
}

/**
 * Prepare Understanding-style narrative for PDF:
 * - Unwrap TipTap bullet/numbered lists into paragraphs
 * - Collapse exact duplicates and shorter fragments already covered by a longer block
 * - Strip tab-bleed artifacts ("vfProposed timelines", etc.)
 * - Fix glued sentence boundaries (".invent" → ". invent")
 * - Never return empty when source still has readable text
 */
export function normalizeNarrativeHtmlForPdf(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const plainFallback = scrubNarrativeBleedArtifacts(
    stripHtmlToPlain(raw)
      .replace(/\.([A-Za-z])/g, '. $1')
      .replace(/[ \t]+\n/g, '\n')
      .trim(),
  );

  try {
    const blocks = parseProposalRichText(raw);
    const plains: Array<string | null> = [];
    for (const b of blocks) {
      const text = scrubNarrativeBleedArtifacts(
        ('runs' in b ? b.runs.map((r) => r.text).join('') : '')
          .replace(/\s+/g, ' ')
          .replace(/\.([A-Za-z])/g, '. $1')
          .trim(),
      );
      // Keep intentional blank paragraph spacers (TipTap empty <p><br></p>).
      if (!text) {
        if (b.type === 'paragraph') plains.push(null);
        continue;
      }
      // Drop blocks that are only bleed leftovers / section titles.
      if (/^(proposed\s+timelines|vf)+$/i.test(text)) continue;
      const key = text.toLowerCase();
      if (plains.some((p) => p && p.toLowerCase() === key)) continue;
      plains.push(text);
    }

    // Drop shorter blocks already covered by a longer sibling (list + paragraph bleed),
    // but never remove blank spacers.
    const compact = plains.filter((p, i) => {
      if (p == null) return true;
      const key = p.toLowerCase();
      return !plains.some((other, j) => {
        if (i === j || other == null || other.length <= p.length) return false;
        return other.toLowerCase().includes(key);
      });
    });

    if (compact.some((p) => p != null)) {
      return compact
        .map((p) => (p == null ? '<p><br></p>' : `<p>${escapeHtmlText(p)}</p>`))
        .join('');
    }
  } catch {
    // fall through
  }

  if (!plainFallback) return '';
  // Preserve blank lines from plain-text source (double newlines).
  return plainFallback
    .split(/\n/)
    .map((p) => scrubNarrativeBleedArtifacts(p.trimEnd()))
    .filter((p, i, arr) => {
      if (!p.trim()) {
        // Keep a single blank between content lines; drop leading/trailing/extra blanks.
        const prev = arr.slice(0, i).reverse().find((x) => x.trim());
        const next = arr.slice(i + 1).find((x) => x.trim());
        return Boolean(prev && next);
      }
      return !/^(proposed\s+timelines|vf)+$/i.test(p);
    })
    .map((p) => (p.trim() ? `<p>${escapeHtmlText(p.trim())}</p>` : '<p><br></p>'))
    .join('');
}

/** True when HTML/plain field has user-visible text (not just empty TipTap shells). */
export function hasReadableProposalText(value: string | null | undefined): boolean {
  return stripHtmlToPlain(String(value || '')).replace(/\s+/g, ' ').trim().length > 0;
}

/**
 * Detect TipTap tab-bleed / copy-paste clones of the Understanding narrative into other fields.
 * Matching is on plain text: exact, shared opening (≥80 chars), candidate ⊆ narrative,
 * or narrative opening embedded anywhere in the candidate (appended bleed).
 */
export function isClonedFromNarrative(
  candidate: string | null | undefined,
  sourceNarrative: string | null | undefined,
): boolean {
  const a = stripHtmlToPlain(String(candidate || ''))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const b = stripHtmlToPlain(String(sourceNarrative || ''))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const prefixLen = Math.min(100, a.length, b.length);
  if (prefixLen >= 80 && a.slice(0, prefixLen) === b.slice(0, prefixLen)) return true;
  if (a.length >= 80 && b.includes(a)) return true;
  const undOpen = b.slice(0, Math.min(100, b.length));
  if (undOpen.length >= 80 && a.includes(undOpen)) return true;
  return false;
}

/** Drop cloned Understanding text; keep unrelated field content. */
export function rejectClonedNarrative(
  candidate: string | null | undefined,
  sourceNarrative: string | null | undefined,
): string {
  const raw = String(candidate || '').trim();
  if (!raw) return '';
  if (isClonedFromNarrative(raw, sourceNarrative)) return '';
  return raw;
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
      // Keep empty paragraphs — they are intentional visual spacers from the editor.
      blocks.push({ type: 'paragraph', runs });
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
