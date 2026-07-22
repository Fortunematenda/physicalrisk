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
  authenticatedUserName?: string | null;
  message: string;
  errorCode?: string;
};

export type EspoIntegrationStatus = {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  baseUrl: string | null;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  verifySsl: boolean;
  timeoutSeconds: number;
  autoSync: boolean;
  syncDirection: string;
  mode: string;
  lastSuccessfulSync: Date | string | null;
  lastFailedSync: Date | string | null;
  lastFailedError: string | null;
  pendingCount: number;
  failedCount: number;
  retryingCount: number;
  successCount: number;
  accountsSynced: number;
  contactsSynced: number;
  opportunitiesSynced: number;
  tasksSynced: number;
  leadsSynced: number;
  healthScore: number;
  healthMessage: string;
  lastHealthCheck: Date | string | null;
  apiReachable: boolean | null;
  authValid: boolean | null;
  sslValid: boolean | null;
  queueWorkerRunning: boolean;
  recentAlerts: Array<{
    id: string;
    entityType: string;
    status: string;
    errorMessage: string | null;
    updatedAt: Date;
    localEntityId: string;
  }>;
  entityBreakdown: Array<{ name: string; value: number; pct: number }>;
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
