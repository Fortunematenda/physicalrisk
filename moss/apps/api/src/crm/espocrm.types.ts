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

export type EspoSyncHistoryItem = {
  id: string;
  at: string;
  recordType: string;
  reference: string;
  status: 'success' | 'failed' | 'pending' | 'processing' | 'skipped' | 'cancelled';
  attempts: number;
  nextRetryAt: string | null;
  errorSummary: string | null;
  crmUrl: string | null;
  canRetry: boolean;
};

export type EspoSyncHistoryPage = {
  items: EspoSyncHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
