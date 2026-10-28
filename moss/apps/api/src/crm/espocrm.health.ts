import { redactSecrets } from './espocrm.config';
import type { EspoConnectionTestResult } from './espocrm.types';

/** true = check passed, false = check failed, null = not checked / cannot be determined. */
export type EspoCheckState = boolean | null;

export type EspoConnectionChecks = {
  apiReachable: EspoCheckState;
  authValid: EspoCheckState;
  sslValid: EspoCheckState;
};

export type EspoConnectionState = 'disabled' | 'not_configured' | 'untested' | 'connected' | 'failed';

export type EspoLastConnectionTest = {
  at: Date;
  success: boolean;
  errorCode: string | null;
  /** User-facing, sanitised message (never contains the integration user name or secrets). */
  message: string;
  responseTimeMs?: number | null;
  checks: EspoConnectionChecks;
};

const NETWORK_FAILURES = new Set(['TIMEOUT', 'DNS_FAILURE', 'NETWORK_ERROR', 'SSRF_BLOCKED', 'NOT_FOUND', 'REQUEST_FAILED']);
const AUTH_FAILURES = new Set(['AUTH_FAILED', 'FORBIDDEN']);

/**
 * Derive individual checks from one connection test. Only conclusions the test
 * actually supports are reported; everything else stays unknown (null).
 */
export function classifyConnectionTest(
  result: Pick<EspoConnectionTestResult, 'success' | 'errorCode'>,
  verifySsl: boolean,
): EspoConnectionChecks {
  const sslWhenReached: EspoCheckState = verifySsl ? true : null;
  if (result.success) {
    return { apiReachable: true, authValid: true, sslValid: sslWhenReached };
  }
  const code = result.errorCode || '';
  if (AUTH_FAILURES.has(code)) {
    return { apiReachable: true, authValid: false, sslValid: sslWhenReached };
  }
  if (code === 'SSL_FAILURE') {
    return { apiReachable: null, authValid: null, sslValid: false };
  }
  if (NETWORK_FAILURES.has(code)) {
    return { apiReachable: false, authValid: null, sslValid: null };
  }
  return { apiReachable: null, authValid: null, sslValid: null };
}

export function resolveConnectionState(input: {
  enabled: boolean;
  configured: boolean;
  lastTest: EspoLastConnectionTest | null;
}): EspoConnectionState {
  if (!input.enabled) return 'disabled';
  if (!input.configured) return 'not_configured';
  if (!input.lastTest) return 'untested';
  return input.lastTest.success ? 'connected' : 'failed';
}

const CONNECTION_FAILURE_COPY: Record<string, string> = {
  AUTH_FAILED: 'EspoCRM rejected the integration API key. Replace the key in Connection settings or check the API user in EspoCRM.',
  FORBIDDEN: 'The EspoCRM API user does not have permission for this request. Check its role in EspoCRM.',
  SSL_FAILURE: 'The EspoCRM TLS certificate could not be verified. Check the certificate on the CRM server.',
  TIMEOUT: 'EspoCRM did not respond in time. Check that the CRM server is running and reachable.',
  DNS_FAILURE: 'The CRM host name could not be resolved. Check the CRM base URL.',
  NETWORK_ERROR: 'MOSS could not reach EspoCRM. Check that the CRM server is running and reachable.',
  NOT_FOUND: 'No EspoCRM API was found at this base URL. Check the CRM base URL.',
  SSRF_BLOCKED: 'The request was blocked because it targeted a host other than the configured CRM.',
  RATE_LIMITED: 'EspoCRM is rate-limiting requests. Try again in a few minutes.',
  SERVER_ERROR: 'EspoCRM returned a server error. Try again later or check the CRM server logs.',
};

/** Sanitised, actionable message for a connection test. Never echoes the integration user or raw errors. */
export function publicConnectionMessage(result: Pick<EspoConnectionTestResult, 'success' | 'errorCode'>): string {
  if (result.success) return 'Connection test passed';
  return (
    CONNECTION_FAILURE_COPY[result.errorCode || '']
    || 'The connection test failed. Check the CRM base URL and API key in Connection settings.'
  );
}

export type EspoCrmAccessReason = 'not_configured' | 'invalid' | 'insecure' | 'credentials';

export type EspoCrmAccess = {
  available: boolean;
  url: string | null;
  reason: EspoCrmAccessReason | null;
  message: string | null;
};

const CRM_ACCESS_COPY: Record<EspoCrmAccessReason, string> = {
  not_configured: 'No CRM base URL is configured. An administrator can set it in Connection settings.',
  invalid: 'The configured CRM base URL is not a valid web address. An administrator needs to correct it.',
  insecure: 'The configured CRM base URL does not use HTTPS, so MOSS will not link to it.',
  credentials: 'The configured CRM base URL contains embedded credentials, so MOSS will not link to it.',
};

function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

function denyAccess(reason: EspoCrmAccessReason): EspoCrmAccess {
  return { available: false, url: null, reason, message: CRM_ACCESS_COPY[reason] };
}

/**
 * Browser link to the separately hosted EspoCRM interface, derived from the
 * validated integration base URL. HTTPS only; plain HTTP is accepted solely for
 * loopback hosts outside production. URLs with credentials are refused, and the
 * query string and fragment are dropped so nothing sensitive is carried over.
 */
export function resolveCrmAccess(baseUrl: string | null | undefined, nodeEnv: string): EspoCrmAccess {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return denyAccess('not_configured');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return denyAccess('invalid');
  }
  if (!parsed.hostname) return denyAccess('invalid');
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return denyAccess('insecure');
  if (parsed.username || parsed.password) return denyAccess('credentials');
  if (
    parsed.protocol === 'http:'
    && (nodeEnv === 'production' || !isLoopbackHost(parsed.hostname))
  ) {
    return denyAccess('insecure');
  }
  const path = parsed.pathname.replace(/\/api\/v1\/?$/i, '').replace(/\/+$/, '');
  return { available: true, url: `${parsed.protocol}//${parsed.host}${path}/`, reason: null, message: null };
}

export function resolveCrmAppUrl(baseUrl: string | null | undefined, nodeEnv: string): string | null {
  return resolveCrmAccess(baseUrl, nodeEnv).url;
}

const CRM_RECORD_ENTITIES = new Set(['Lead', 'Account', 'Contact', 'Opportunity', 'Task']);

/** Deep link to one EspoCRM record, or null when the type or id is not safe to link. */
export function crmRecordUrl(crmAppUrl: string | null, entityType: string, remoteId: string | null | undefined) {
  if (!crmAppUrl || !remoteId || !CRM_RECORD_ENTITIES.has(entityType)) return null;
  if (!/^[A-Za-z0-9]{1,64}$/.test(remoteId)) return null;
  return `${crmAppUrl}#${entityType}/view/${remoteId}`;
}

/** The sync worker is the 10-minute retry cron in EspoCrmService. */
export const ESPO_WORKER_INTERVAL_MS = 10 * 60_000;
/** Missing three consecutive runs counts as stale. */
export const ESPO_WORKER_STALE_AFTER_MS = 3 * ESPO_WORKER_INTERVAL_MS;

export type EspoWorkerHeartbeat = {
  lastRunAt: string;
  processed: number;
  succeeded: number;
  failed: number;
};

export type EspoWorkerState = 'disabled' | 'not_scheduled' | 'not_recorded' | 'running' | 'stale';

export function resolveWorkerState(input: {
  enabled: boolean;
  autoSync: boolean;
  heartbeat: EspoWorkerHeartbeat | null;
  now?: Date;
}): EspoWorkerState {
  if (!input.enabled) return 'disabled';
  if (!input.autoSync) return 'not_scheduled';
  if (!input.heartbeat) return 'not_recorded';
  const last = new Date(input.heartbeat.lastRunAt).getTime();
  if (!Number.isFinite(last)) return 'not_recorded';
  const age = (input.now ?? new Date()).getTime() - last;
  return age > ESPO_WORKER_STALE_AFTER_MS ? 'stale' : 'running';
}

export type EspoSyncCounts = {
  pending: number;
  processing: number;
  retrying: number;
  failedUnresolved: number;
};

/**
 * - errors: failed jobs with no later success for the same record
 * - processing / pending: work in flight or queued
 * - idle: nothing queued and the worker has run recently (no new eligible activity)
 * - unknown: nothing queued but there is no recent worker evidence to confirm it
 */
export type EspoSyncState = 'disabled' | 'not_configured' | 'errors' | 'processing' | 'pending' | 'idle' | 'unknown';

export function resolveSyncState(input: {
  enabled: boolean;
  configured: boolean;
  counts: EspoSyncCounts;
  worker: EspoWorkerState;
}): EspoSyncState {
  if (!input.enabled) return 'disabled';
  if (!input.configured) return 'not_configured';
  if (input.counts.failedUnresolved > 0) return 'errors';
  if (input.counts.processing > 0) return 'processing';
  if (input.counts.pending + input.counts.retrying > 0) return 'pending';
  return input.worker === 'running' ? 'idle' : 'unknown';
}

type FailureRow = { jobType: string | null; entityType: string; localEntityId: string; updatedAt: Date };

/** Failed rows that no later successful sync of the same record has superseded. */
export function countUnresolvedFailures(failed: FailureRow[], successes: FailureRow[]): number {
  const latestSuccess = new Map<string, number>();
  for (const row of successes) {
    const key = syncRecordKey(row);
    const at = row.updatedAt.getTime();
    if ((latestSuccess.get(key) ?? 0) < at) latestSuccess.set(key, at);
  }
  return failed.filter((row) => (latestSuccess.get(syncRecordKey(row)) ?? 0) < row.updatedAt.getTime()).length;
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Short error text that is safe to show in the UI: no secrets, no email addresses, bounded length. */
export function sanitizeErrorSummary(message: string | null | undefined, maxLength = 200): string | null {
  if (!message) return null;
  const redacted = String(redactSecrets(message))
    .replace(/https?:\/\/[^\s]*[?#][^\s]*/gi, '[url]')
    .replace(EMAIL_PATTERN, '[email]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!redacted) return null;
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}…` : redacted;
}

export type EspoHistoryStatus = 'success' | 'failed' | 'retrying' | 'pending' | 'processing' | 'skipped' | 'cancelled';

export function historyStatus(status: string): EspoHistoryStatus {
  switch (status) {
    case 'SUCCESS':
    case 'SYNCED':
      return 'success';
    case 'FAILED':
      return 'failed';
    case 'RETRYING':
      return 'retrying';
    case 'PROCESSING':
      return 'processing';
    case 'SKIPPED':
      return 'skipped';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export const HISTORY_STATUS_FILTER: Record<string, string[]> = {
  success: ['SUCCESS', 'SYNCED'],
  failed: ['FAILED'],
  retrying: ['RETRYING'],
  pending: ['PENDING'],
  processing: ['PROCESSING'],
  skipped: ['SKIPPED', 'CANCELLED'],
};

export const HISTORY_RECORD_TYPES = ['Lead', 'Account', 'Contact', 'Opportunity', 'Task'] as const;
export const HISTORY_PAGE_SIZES = [10, 20, 50] as const;

/** South Africa has no daylight saving, so SAST is a fixed UTC+02:00. */
const SAST_OFFSET = '+02:00';

/**
 * UTC bounds for a YYYY-MM-DD date in Africa/Johannesburg time. Returns null for
 * anything that is not a real calendar date.
 */
export function sastDayBounds(value: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00.000${SAST_OFFSET}`);
  const end = new Date(`${value}T23:59:59.999${SAST_OFFSET}`);
  if (Number.isNaN(start.getTime())) return null;
  // Rejects dates such as 2026-02-30, which Date silently rolls over.
  if (new Date(start.getTime() + 2 * 3_600_000).toISOString().slice(0, 10) !== value) return null;
  return { start, end };
}

/** Records are the same logical target when they share job type (or entity type) and MOSS id. */
export function syncRecordKey(row: { jobType: string | null; entityType: string; localEntityId: string }) {
  return `${row.jobType || row.entityType}:${row.localEntityId}`;
}

const RETRYABLE_JOB_TYPES = new Set([
  'ESPO_SYNC_LEAD',
  'ESPO_SYNC_ACCOUNT',
  'ESPO_SYNC_CONTACT',
  'ESPO_SYNC_OPPORTUNITY',
]);

/**
 * Only failed (or scheduled-for-retry) jobs whose handler can safely re-run
 * them. Every handler upserts by MOSS id, so a re-run updates rather than duplicates.
 */
export function isRetryEligible(row: {
  status: string;
  jobType: string | null;
  entityType: string;
  assessmentId: string | null;
  parentId?: string | null;
}): boolean {
  if (row.status !== 'FAILED' && row.status !== 'RETRYING') return false;
  // Records written inside a job are re-sent by retrying that job, never on their own.
  if (row.parentId) return false;
  if (row.jobType) {
    if (row.jobType === 'ESPO_UPDATE_REPORT') return Boolean(row.assessmentId);
    return RETRYABLE_JOB_TYPES.has(row.jobType);
  }
  if (row.entityType === 'Opportunity') return Boolean(row.assessmentId);
  return row.entityType === 'Lead' || row.entityType === 'Account';
}
