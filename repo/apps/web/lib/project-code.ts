/** Build a project code prefix from the project name. */
export function projectCodePrefix(name: string): string {
  const words = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 3) {
    // First letter of each word (e.g. "Marketing Campaign Repository" → "MCR")
    return words
      .map((word) => (word.match(/[A-Za-z]/)?.[0] ?? ''))
      .join('')
      .toUpperCase()
      .slice(0, 6) || 'PRJ';
  }

  // Fewer than 3 words: first 3 letters of the name
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'PRJ';
}

/**
 * Auto-generate a project code from the name plus a sequence number
 * based on how many projects already exist (count + 1), skipping collisions.
 */
export function nextProjectCode(
  name: string,
  existingCodes: string[] = [],
  projectCount = existingCodes.length,
): string {
  const prefix = projectCodePrefix(name);
  if (!name.trim()) return '';

  const taken = new Set(existingCodes.map((code) => code.trim().toUpperCase()).filter(Boolean));
  let sequence = Math.max(1, projectCount + 1);
  let candidate = `${prefix}${sequence}`;
  while (taken.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}${sequence}`;
  }
  return candidate;
}
