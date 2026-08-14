export function somodApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function formatSomodStatus(status?: string): string {
  if (!status) return '—';
  return status
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** User-facing labels for scenario calculation states (no internal codes). */
export function formatSomodCalculationStatus(status?: string): string {
  const s = String(status || '').toUpperCase();
  if (s === 'CALCULATED') return 'Calculated';
  if (s === 'METHODOLOGY_REQUIRED') return 'Not available';
  if (s === 'INCOMPLETE') return 'Incomplete';
  if (s === 'STALE') return 'Needs recalculation';
  if (s === 'LEGACY_PLACEHOLDER' || s === 'UNVERIFIED') return 'Superseded';
  if (!s) return '—';
  return formatSomodStatus(s);
}

