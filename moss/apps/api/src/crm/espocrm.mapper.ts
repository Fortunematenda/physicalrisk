import type { EspoCrmRuntimeConfig } from './espocrm.config';

export function mapAssessmentStage(status: string, stages: EspoCrmRuntimeConfig['stages']): string {
  const key = (status || '').toUpperCase();
  return stages[key] || stages.IN_PROGRESS || 'Prospecting';
}

export function mapRiskPriority(riskBand?: string | null): 'Urgent' | 'High' | 'Normal' | 'Low' {
  const value = (riskBand || '').toLowerCase();
  if (value === 'critical') return 'Urgent';
  if (value === 'high') return 'High';
  if (value === 'moderate') return 'Normal';
  return 'Low';
}

/** Exponential retry delays: immediate, 1m, 5m, 15m, 1h */
export const ESPO_RETRY_DELAYS_MS = [
  0,
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
] as const;

export const ESPO_MAX_ATTEMPTS = ESPO_RETRY_DELAYS_MS.length;

export function nextRetryAt(attemptCount: number, retryable: boolean): Date | null {
  if (!retryable) return null;
  if (attemptCount >= ESPO_MAX_ATTEMPTS) return null;
  const delay = ESPO_RETRY_DELAYS_MS[Math.min(attemptCount, ESPO_RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay);
}

export function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * EspoCRM validates phoneNumber strictly. Local SA numbers like 0612685933 fail.
 * Convert common ZA mobile/landline forms to E.164 (+27…); otherwise return null
 * so the field can be omitted (raw value can still go in description).
 */
/** MOSS catalogue labels that are not EspoCRM Account industry enum values. */
const MOSS_INDUSTRY_TO_ESPO: Record<string, string> = {
  'energy / utilities': 'Energy',
  'ports and logistics': 'Transportation',
  'financial services': 'Finance',
  'enterprise management systems providers': 'Software',
  'data centres': 'Technology',
  'data centers': 'Technology',
};

/**
 * EspoCRM rejects Account.industry unless it is one of the enum options.
 * Return a matching option, or null so the caller omits the field.
 * The original MOSS label stays in the account description.
 */
export function mapEspoIndustry(value?: string | null, options: string[] = []): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'other') return null;

  const pool = options.map((item) => item.trim()).filter(Boolean);
  const exact = pool.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  const mapped = MOSS_INDUSTRY_TO_ESPO[trimmed.toLowerCase()];
  if (mapped) {
    if (!pool.length) return mapped;
    return pool.find((item) => item.toLowerCase() === mapped.toLowerCase()) || null;
  }

  const head = trimmed.split('/')[0]?.trim();
  if (head && head.toLowerCase() !== trimmed.toLowerCase()) {
    return pool.find((item) => item.toLowerCase() === head.toLowerCase()) || null;
  }
  return null;
}

export function normalizeEspoPhone(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/[^\d+]/g, '');
  if (!digits) return null;

  // Already international
  if (digits.startsWith('+')) {
    const intl = `+${digits.slice(1).replace(/\D/g, '')}`;
    return intl.length >= 10 && intl.length <= 16 ? intl : null;
  }

  const onlyDigits = digits.replace(/\D/g, '');

  // 00 international prefix
  if (onlyDigits.startsWith('00') && onlyDigits.length >= 11) {
    return `+${onlyDigits.slice(2)}`;
  }

  // South Africa: 0XXXXXXXXX → +27XXXXXXXXX
  if (onlyDigits.startsWith('0') && onlyDigits.length === 10) {
    return `+27${onlyDigits.slice(1)}`;
  }

  // Already country code without +
  if (onlyDigits.startsWith('27') && onlyDigits.length === 11) {
    return `+${onlyDigits}`;
  }

  // Generic: if looks like full international without +
  if (onlyDigits.length >= 10 && onlyDigits.length <= 15 && !onlyDigits.startsWith('0')) {
    return `+${onlyDigits}`;
  }

  return null;
}

