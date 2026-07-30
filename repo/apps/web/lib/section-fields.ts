/** Shared helpers for linked repository section / module fields. */

export type SectionFields = {
  name: string;
  sectionKey: string;
  code: string;
  relativePath?: string;
  slug?: string;
  position?: number;
  active?: boolean;
};

export function toSectionKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function toSectionSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Short code from words / key segments.
 * - Letter words contribute their first letter (e.g. "Article Series" → "AS")
 * - Numbers in the name are kept (e.g. "Article Series 1" → "AS1")
 * - Leading order prefixes like "01" are ignored (e.g. "01 Governance" → "GOV")
 */
export function toSectionCode(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return '';

  const buildCode = (tokens: string[]) => {
    // Drop leading numeric-only order prefixes ("01", "02", …).
    let start = 0;
    while (start < tokens.length && /^\d+$/.test(tokens[start]!)) start += 1;
    const rest = tokens.slice(start);
    if (!rest.length) return '';

    const alphaTokens = rest.filter((token) => !/^\d+$/.test(token));
    const numberTokens = rest.filter((token) => /^\d+$/.test(token));
    const letters = alphaTokens
      .map((token) => (token.match(/[A-Za-z]/)?.[0] ?? ''))
      .join('')
      .toUpperCase();
    const numbers = numberTokens.join('');
    // Keep trailing digits glued to a word ("Series1" → "S" + "1").
    const gluedDigits = alphaTokens
      .map((token) => (token.match(/\d+$/)?.[0] ?? ''))
      .join('');
    const suffix = numbers || gluedDigits;

    if (alphaTokens.length >= 2 || suffix) {
      return `${letters}${suffix}`.slice(0, 8);
    }
    // Single word after dropping order prefix: use a short stem ("Governance" → "GOV").
    const stem = (alphaTokens[0] ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
    return stem.slice(0, 3);
  };

  const words = cleaned
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const fromWords = buildCode(words);
  if (fromWords) return fromWords;

  const key = toSectionKey(cleaned);
  const parts = key.split('_').filter(Boolean);
  const fromParts = buildCode(parts);
  if (fromParts) return fromParts;

  return key.replace(/_/g, '').slice(0, 6) || cleaned.slice(0, 3).toUpperCase();
}

export function deriveSectionFields(source: string): Pick<SectionFields, 'name' | 'sectionKey' | 'code' | 'relativePath' | 'slug'> {
  const name = source.trim();
  return {
    name,
    sectionKey: toSectionKey(name),
    code: toSectionCode(name),
    relativePath: name,
    slug: toSectionSlug(name),
  };
}

/**
 * When one linked field changes, recompute the rest from that value.
 * Order (`position`) is never overwritten here.
 */
export function syncLinkedSectionFields<T extends SectionFields>(
  row: T,
  field: 'name' | 'sectionKey' | 'code' | 'relativePath',
  value: string,
): T {
  const source =
    field === 'sectionKey'
      ? value.replace(/_/g, ' ')
      : field === 'code'
        ? value
        : value;
  const derived = deriveSectionFields(source || value);
  // Keep typed code casing when the user edits Code directly, but still sync others.
  if (field === 'code') {
    return {
      ...row,
      ...derived,
      code: value.trim().toUpperCase() || derived.code,
    };
  }
  if (field === 'sectionKey') {
    return {
      ...row,
      ...derived,
      sectionKey: toSectionKey(value) || derived.sectionKey,
    };
  }
  return { ...row, ...derived };
}

/** Active sections first (by position), inactive at the bottom (renumbered). */
export function orderSectionsActiveFirst<T extends { position: number; active?: boolean }>(sections: T[]): T[] {
  const active = sections
    .filter((item) => item.active !== false)
    .sort((a, b) => a.position - b.position);
  const inactive = sections
    .filter((item) => item.active === false)
    .sort((a, b) => a.position - b.position);
  return [...active, ...inactive].map((item, index) => ({ ...item, position: index + 1 }));
}
