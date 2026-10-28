/** Shapes returned by /integrations/espocrm/* and the copy used to present them. */

export type CrmCheckResult = 'passed' | 'failed' | 'not_checked';
export type CrmConnectionState = 'disabled' | 'not_configured' | 'untested' | 'connected' | 'failed';
export type CrmWorkerState = 'disabled' | 'not_scheduled' | 'not_recorded' | 'running' | 'stale';
export type CrmSyncState = 'disabled' | 'not_configured' | 'errors' | 'processing' | 'pending' | 'idle' | 'unknown';
export type CrmHistoryStatus = 'success' | 'failed' | 'retrying' | 'pending' | 'processing' | 'skipped' | 'cancelled';

export type CrmAccess = {
  available: boolean;
  url: string | null;
  reason: string | null;
  message: string | null;
};

export type CrmHealthCheck = {
  id: 'api' | 'auth' | 'tls' | 'worker';
  label: string;
  result: CrmCheckResult;
  statusLabel?: string;
  checkedAt: string | null;
  detail: string;
};

export type CrmIntegrationStatus = {
  enabled: boolean;
  configured: boolean;
  access: CrmAccess;
  connection: {
    state: CrmConnectionState;
    checkedAt: string | null;
    message: string | null;
    responseTimeMs: number | null;
  };
  checks: CrmHealthCheck[];
  worker: {
    state: CrmWorkerState;
    lastRunAt: string | null;
    lastProcessed: number | null;
    lastSucceeded: number | null;
    lastFailed: number | null;
    intervalMinutes: number;
  };
  sync: {
    state: CrmSyncState;
    direction: string;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureSummary: string | null;
    lastFailureJob: { recordType: string; reference: string; currentStatus: CrmHistoryStatus } | null;
    counts: {
      pending: number;
      processing: number;
      retrying: number;
      failedUnresolved: number;
      failedTotal: number;
      succeeded: number;
      skipped: number;
    };
    succeededByType: Array<{ recordType: string; count: number }>;
  };
};

export type CrmAdminSettings = {
  enabled: boolean;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  timeoutSeconds: number;
  syncDirection: string;
  autoSync: boolean;
  verifySsl: boolean;
};

export type CrmHistoryItem = {
  id: string;
  lastActivityAt: string;
  createdAt: string;
  lastAttemptAt: string | null;
  recordType: string;
  reference: string;
  status: CrmHistoryStatus;
  attempts: number;
  nextRetryAt: string | null;
  errorSummary: string | null;
  crmUrl: string | null;
  canRetry: boolean;
  retryNote: string | null;
  legacy: boolean;
  supersededAt: string | null;
};

export type CrmHistoryPage = {
  items: CrmHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
};

export type CrmAttemptOutcome = 'success' | 'failed' | 'retrying' | 'skipped' | 'running';

export type CrmSyncAttempt = {
  attemptNumber: number;
  trigger: 'automatic' | 'manual' | null;
  startedAt: string | null;
  completedAt: string | null;
  outcome: CrmAttemptOutcome | null;
  errorSummary: string | null;
  crmUrl: string | null;
};

export type CrmSyncJobDetail = {
  job: CrmHistoryItem;
  attempts: CrmSyncAttempt[];
  unrecordedAttempts: number;
  records: Array<{
    id: string;
    recordType: string;
    action: string | null;
    status: CrmHistoryStatus;
    at: string;
    errorSummary: string | null;
    crmUrl: string | null;
  }>;
};

export type CrmHistoryFilters = {
  status: string;
  recordType: string;
  dateFrom: string;
  dateTo: string;
  search: string;
};

export const EMPTY_HISTORY_FILTERS: CrmHistoryFilters = { status: '', recordType: '', dateFrom: '', dateTo: '', search: '' };

export const HISTORY_PAGE_SIZES = [10, 20, 50] as const;

export function historyQuery(filters: CrmHistoryFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  }
  return params.toString();
}

export function hasActiveFilters(filters: CrmHistoryFilters): boolean {
  return Object.values(filters).some((v) => v.trim() !== '');
}

/** Jobs whose state can still change on their own; the row is refreshed until it settles. */
export function isJobInFlight(status: CrmHistoryStatus): boolean {
  return status === 'pending' || status === 'processing';
}

export type CrmConnectionTestResult = {
  success: boolean;
  checkedAt: string;
  responseTimeMs: number;
  message: string;
  errorCode: string | null;
};

export type Tone = 'green' | 'red' | 'amber' | 'slate' | 'blue';

export const CONNECTION_COPY: Record<CrmConnectionState, { label: string; tone: Tone }> = {
  connected: { label: 'Verified', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  untested: { label: 'Not checked', tone: 'slate' },
  not_configured: { label: 'Not configured', tone: 'amber' },
  disabled: { label: 'Disabled', tone: 'slate' },
};

export const SYNC_COPY: Record<CrmSyncState, { label: string; tone: Tone }> = {
  idle: { label: 'Up to date', tone: 'green' },
  pending: { label: 'Pending work', tone: 'blue' },
  processing: { label: 'Processing', tone: 'blue' },
  errors: { label: 'Errors need attention', tone: 'red' },
  unknown: { label: 'Unknown', tone: 'slate' },
  not_configured: { label: 'Not configured', tone: 'amber' },
  disabled: { label: 'Disabled', tone: 'slate' },
};

export const CHECK_COPY: Record<CrmCheckResult, { label: string; tone: Tone }> = {
  passed: { label: 'Passed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  not_checked: { label: 'Not checked', tone: 'slate' },
};

export const HISTORY_COPY: Record<CrmHistoryStatus, { label: string; tone: Tone }> = {
  success: { label: 'Success', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  retrying: { label: 'Awaiting retry', tone: 'amber' },
  pending: { label: 'Queued', tone: 'blue' },
  processing: { label: 'Processing', tone: 'blue' },
  skipped: { label: 'Skipped', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const ATTEMPT_COPY: Record<CrmAttemptOutcome, { label: string; tone: Tone }> = {
  success: { label: 'Succeeded', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  retrying: { label: 'Failed, retry scheduled', tone: 'amber' },
  skipped: { label: 'Skipped', tone: 'slate' },
  running: { label: 'Running', tone: 'blue' },
};

export const HISTORY_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'failed', label: 'Failed' },
  { value: 'retrying', label: 'Awaiting retry' },
  { value: 'pending', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'success', label: 'Success' },
  { value: 'skipped', label: 'Skipped' },
];

export const HISTORY_RECORD_TYPE_OPTIONS = [
  { value: '', label: 'All record types' },
  { value: 'Lead', label: 'Lead' },
  { value: 'Account', label: 'Account' },
  { value: 'Contact', label: 'Contact' },
  { value: 'Opportunity', label: 'Opportunity' },
];

const TIME_ZONE = 'Africa/Johannesburg';

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Compact South African time, e.g. "28 Oct 2026, 12:59 SAST". Storage stays UTC. */
export function formatDateTime(iso?: string | null, fallback = 'Not recorded') {
  const date = parseDate(iso);
  if (!date) return fallback;
  const text = date.toLocaleString('en-ZA', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${text} SAST`;
}

/** Full timestamp for details and tooltips, with seconds and the UTC value. */
export function formatDateTimeFull(iso?: string | null, fallback = 'Not recorded') {
  const date = parseDate(iso);
  if (!date) return fallback;
  const text = date.toLocaleString('en-ZA', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return `${text} SAST (${date.toISOString().replace('.000Z', 'Z')} UTC)`;
}

export function triggerLabel(trigger: CrmSyncAttempt['trigger']): string {
  if (trigger === 'manual') return 'Manual';
  if (trigger === 'automatic') return 'Automatic';
  return 'Not recorded';
}

/** One-line explanation of the sync state, built only from the counts and timestamps provided. */
export function describeSync(status: CrmIntegrationStatus): string {
  const { counts } = status.sync;
  switch (status.sync.state) {
    case 'idle':
      return 'No pending work. The sync worker has run recently.';
    case 'pending':
      return `${counts.pending} queued, ${counts.retrying} awaiting automatic retry.`;
    case 'processing':
      return `${counts.processing} job(s) in progress.`;
    case 'errors':
      return `${counts.failedUnresolved} failed job(s) not yet resolved by a later sync.`;
    case 'not_configured':
      return 'The CRM base URL or API key is missing.';
    case 'disabled':
      return 'The integration is turned off.';
    default:
      return status.worker.state === 'stale'
        ? 'Nothing queued, but the sync worker has not run recently.'
        : 'Nothing queued, and no recent sync worker run is recorded.';
  }
}

export const TONE_CLASSES: Record<Tone, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
};
