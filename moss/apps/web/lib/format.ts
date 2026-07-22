import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';

export function formatZar(value: number | null | undefined) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(digits)}%`;
}

export function formatScore(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

export function formatDate(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) return '—';
  return format(date, 'dd MMM yyyy');
}

export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) return '—';
  return format(date, 'dd MMM yyyy, HH:mm');
}

export function formatRelative(value: string | Date | null | undefined) {
  const date = toDate(value);
  if (!date) return '—';
  return formatDistanceToNow(date, { addSuffix: true });
}
