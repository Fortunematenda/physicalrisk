/** Shapes returned by /integrations/espocrm/* and the copy used to present them. */

export type CrmCheckResult = 'passed' | 'failed' | 'not_checked';
export type CrmConnectionState = 'disabled' | 'not_configured' | 'untested' | 'connected' | 'failed';
export type CrmWorkerState = 'disabled' | 'not_scheduled' | 'not_recorded' | 'running' | 'stale';
export type CrmSyncState = 'disabled' | 'not_configured' | 'errors' | 'processing' | 'pending' | 'idle' | 'unknown';
export type CrmHistoryStatus = 'success' | 'failed' | 'pending' | 'processing' | 'skipped' | 'cancelled';

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
  at: string;
  recordType: string;
  reference: string;
  status: CrmHistoryStatus;
  attempts: number;
  nextRetryAt: string | null;
  errorSummary: string | null;
  crmUrl: string | null;
  canRetry: boolean;
};

export type CrmHistoryPage = {
  items: CrmHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CrmConnectionTestResult = {
  success: boolean;
  checkedAt: string;
  responseTimeMs: number;
  message: string;
  errorCode: string | null;
};

export type Tone = 'green' | 'red' | 'amber' | 'slate' | 'blue';

export const CRM_PAGE_INTRO =
  'This page manages the connection between MOSS and EspoCRM. Open EspoCRM to manage contacts, leads and opportunities. Separate sign-in may be required.';

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
  pending: { label: 'Pending', tone: 'blue' },
  processing: { label: 'Processing', tone: 'blue' },
  skipped: { label: 'Skipped', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export function formatDateTime(iso?: string | null, fallback = 'Not recorded') {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
