export type EspoHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type EspoJobType =
  | 'ESPO_SYNC_LEAD'
  | 'ESPO_SYNC_ACCOUNT'
  | 'ESPO_SYNC_CONTACT'
  | 'ESPO_SYNC_OPPORTUNITY'
  | 'ESPO_SYNC_TASK'
  | 'ESPO_UPDATE_REPORT';

export type EspoEntityType = 'Lead' | 'Account' | 'Contact' | 'Opportunity' | 'Task';

export type EspoRecord = {
  id: string;
  [key: string]: unknown;
};

export type EspoListResponse<T = EspoRecord> = {
  total: number;
  list: T[];
};

export type EspoSafeError = {
  retryable: boolean;
  statusCode?: number;
  code: string;
  message: string;
};

export type EspoRequestResult<T = EspoRecord> = {
  data: T;
  statusCode: number;
  durationMs: number;
};

export type EspoConnectionTestResult = {
  success: boolean;
  statusCode?: number;
  responseTimeMs: number;
  /** Internal only: never returned to the browser. */
  authenticatedUserName?: string | null;
  message: string;
  errorCode?: string;
};

/** What the browser receives after a connection test. */
export type EspoPublicConnectionTest = {
  success: boolean;
  checkedAt: string;
  responseTimeMs: number;
  message: string;
  errorCode: string | null;
};

export type EspoCheckResult = 'passed' | 'failed' | 'not_checked';

export type EspoHealthCheck = {
  id: 'api' | 'auth' | 'tls' | 'worker';
  label: string;
  result: EspoCheckResult;
  /** Factual label replacing the generic result label, e.g. "Running" for the worker. */
  statusLabel?: string;
  checkedAt: string | null;
  detail: string;
};

/** Health and sync evidence. Safe for every role allowed to read status: no settings or secrets. */
export type EspoIntegrationStatus = {
  enabled: boolean;
  configured: boolean;
  access: {
    available: boolean;
    url: string | null;
    reason: string | null;
    message: string | null;
  };
  connection: {
    state: 'disabled' | 'not_configured' | 'untested' | 'connected' | 'failed';
    checkedAt: string | null;
    message: string | null;
    responseTimeMs: number | null;
  };
  checks: EspoHealthCheck[];
  worker: {
    state: 'disabled' | 'not_scheduled' | 'not_recorded' | 'running' | 'stale';
    lastRunAt: string | null;
    lastProcessed: number | null;
    lastSucceeded: number | null;
    lastFailed: number | null;
    intervalMinutes: number;
  };
  sync: {
    state: 'disabled' | 'not_configured' | 'errors' | 'processing' | 'pending' | 'idle' | 'unknown';
    direction: string;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    /** Most recent failed attempt of any job. Historical: says nothing about the current connection. */
    lastFailureAt: string | null;
    lastFailureSummary: string | null;
    lastFailureJob: {
      recordType: string;
      reference: string;
      /** That job's status now; 'success' only if a later attempt of the same job succeeded. */
      currentStatus: EspoSyncJobStatus;
    } | null;
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

/** Technical connection settings. Administrator-only; never contains the API key itself. */
export type EspoAdminSettings = {
  enabled: boolean;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  timeoutSeconds: number;
  syncDirection: string;
  autoSync: boolean;
  verifySsl: boolean;
};

export type EspoSyncJobStatus =
  | 'success'
  | 'failed'
  | 'retrying'
  | 'pending'
  | 'processing'
  | 'skipped'
  | 'cancelled';

/** One logical sync job. Rows written while the job ran are reported under it, not beside it. */
export type EspoSyncHistoryItem = {
  id: string;
  /** Latest activity on the job (UTC ISO). */
  lastActivityAt: string;
  createdAt: string;
  lastAttemptAt: string | null;
  recordType: string;
  reference: string;
  status: EspoSyncJobStatus;
  /** The job's own attempt counter. */
  attempts: number;
  nextRetryAt: string | null;
  errorSummary: string | null;
  crmUrl: string | null;
  canRetry: boolean;
  /** Why a failed job offers no retry; null when retry is offered or not relevant. */
  retryNote: string | null;
  /** Recorded before job tracking: its parent job, if any, is unknown. */
  legacy: boolean;
  /** A later job for the same record exists. This job's own status is unchanged. */
  supersededAt: string | null;
};

export type EspoSyncHistoryPage = {
  items: EspoSyncHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 1-based range shown on this page; 0 when there are no matches. */
  rangeStart: number;
  rangeEnd: number;
};

export type EspoSyncHistoryQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  recordType?: string;
  /** YYYY-MM-DD, interpreted in Africa/Johannesburg time. */
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  organisationId?: string;
};

export type EspoSyncAttemptItem = {
  attemptNumber: number;
  trigger: 'automatic' | 'manual' | null;
  startedAt: string | null;
  completedAt: string | null;
  outcome: 'success' | 'failed' | 'retrying' | 'skipped' | 'running' | null;
  errorSummary: string | null;
  crmUrl: string | null;
};

export type EspoSyncChildRecord = {
  id: string;
  recordType: string;
  action: string | null;
  status: EspoSyncJobStatus;
  at: string;
  errorSummary: string | null;
  crmUrl: string | null;
};

export type EspoSyncJobDetail = {
  job: EspoSyncHistoryItem;
  attempts: EspoSyncAttemptItem[];
  /** Attempts the job counted but that were never stored individually. */
  unrecordedAttempts: number;
  /** CRM records written while this job ran. */
  records: EspoSyncChildRecord[];
};

export type EspoLogQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  entityType?: string;
  action?: string;
  jobType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};
