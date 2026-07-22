export function suggestNextVersion(existingVersions: string[]): string {
  if (!existingVersions.length) return '1.0';
  const parsed = existingVersions.map((v) =>
    v
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10) || 0),
  );
  parsed.sort((a, b) => {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
  const latest = parsed[parsed.length - 1];
  const next = [...latest];
  if (next.length === 0) next.push(1, 0);
  next[next.length - 1] += 1;
  return next.join('.');
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .replace(/^v/i, '')
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function formatBytes(value?: number) {
  if (!value && value !== 0) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
