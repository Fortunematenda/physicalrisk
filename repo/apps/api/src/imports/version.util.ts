interface ParsedVersion {
  raw: string;
  prefix: string;
  parts: number[];
}

/**
 * Normalise a version string for reliable comparison.
 *
 * Rules:
 * - Trim whitespace
 * - Strip optional leading "v" or "V"
 * - Split on periods or hyphens
 * - Treat each segment as an integer (non-numeric becomes 0)
 * - Preserve trailing zero-padding as numeric parts so 1.10 > 1.2
 */
export function parseVersion(value: string): ParsedVersion {
  const raw = String(value ?? '').trim();
  const prefix = raw.length > 0 && /^v/i.test(raw[0] ?? '') ? raw[0]! : '';
  const stripped = raw.replace(/^v/i, '');
  const parts = stripped.split(/[.-]/).map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  return { raw, prefix, parts };
}

/**
 * Compare two version strings.
 * Returns:
 * - 1 if left > right
 * - -1 if left < right
 * - 0 if equal
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left).parts;
  const b = parseVersion(right).parts;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Suggest the next patch/minor version for a list of existing versions.
 * Defaults to adding 1 to the last numeric segment.
 */
export function suggestNextVersion(existingVersions: string[]): string {
  if (!existingVersions.length) return '1.0';
  const parsed = existingVersions.map((v) => parseVersion(v));
  parsed.sort((left, right) => compareVersionParts(left.parts, right.parts));
  const latest = parsed[parsed.length - 1];
  const next = [...latest.parts];
  if (next.length === 0) next.push(1, 0);
  next[next.length - 1] += 1;
  return next.join('.');
}

function compareVersionParts(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

