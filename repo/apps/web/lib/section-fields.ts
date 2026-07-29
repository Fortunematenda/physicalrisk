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

/** Short code from words / key segments (e.g. "01 Governance" → "GOV"). */
export function toSectionCode(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return '';
  const words = cleaned
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    const fromWords = words
      .filter((word) => !/^\d+$/.test(word))
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase();
    if (fromWords.length >= 2) return fromWords.slice(0, 6);
  }
  const key = toSectionKey(cleaned);
  const parts = key.split('_').filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .filter((part) => !/^\d+$/.test(part))
      .map((part) => part.slice(0, 1))
      .join('')
      .slice(0, 6) || key.slice(0, 3);
  }
  return key.slice(0, 6) || cleaned.slice(0, 3).toUpperCase();
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
