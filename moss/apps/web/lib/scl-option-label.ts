/**
 * Strip unintended leading list-marker dashes from SCL option labels.
 * Preserves mid-string hyphens (evidence-based) and range en-dashes (0–20%).
 */
export function stripUnintendedLeadingDash(label: string): string {
  if (!label) return label;
  // Only markdown/list-style prefixes: "- text", "– text", "— text", "• text"
  return String(label).replace(/^[\s\u00A0\u200B\uFEFF]*[-–—•·]\s+/, '');
}

/**
 * Split option labels into title + supporting description for the triage UI.
 * e.g. "Yes – independently validated" → { title: "Yes", description: "independently validated" }
 * Ranges like "0–20%" stay as a single title (no spaced dash separator).
 */
export function splitOptionPresentation(label: string): { title: string; description: string } {
  const cleaned = stripUnintendedLeadingDash(label).trim();
  if (!cleaned) return { title: '', description: '' };
  const spacedDash = cleaned.match(/^(.{1,48}?)\s+[–—-]\s+(.+)$/);
  if (spacedDash) {
    return { title: spacedDash[1].trim(), description: spacedDash[2].trim() };
  }
  return { title: cleaned, description: '' };
}

/**
 * Use the 2-column calibration-style option grid for assessment choices.
 * Stacked single-column is reserved only when every option is a long paragraph
 * (unusual in published SCLI — most responses are compact titles).
 */
export function shouldUseSclOptionsGrid(labels: string[]): boolean {
  if (!labels.length) return false;
  const longParagraphs = labels.filter((label) => {
    const cleaned = stripUnintendedLeadingDash(label).trim();
    return cleaned.length > 90;
  }).length;
  // Prefer grid unless most options are long prose blocks.
  return longParagraphs < Math.ceil(labels.length * 0.6);
}
