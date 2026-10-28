import { AsyncLocalStorage } from 'node:async_hooks';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SyncStatus } from '@prisma/client';
import {
  operationalSitesLabelFromStored,
  securityExpenditureLabelFromStored,
} from '@moss/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { ADMIN_ROLES, INTERNAL_ROLES, hasRole } from '../common/roles';
import { EspoCrmClient, EspoCrmHttpError } from './espocrm.client';
import {
  assertEspoConfigured,
  applyEspoConnectionOverrides,
  ESPOCRM_SETTING_KEY,
  loadEspoCrmConfig,
  parseEspoStoredConnection,
  redactSecrets,
  validateEspoBaseUrl,
  type EspoCrmRuntimeConfig,
  type EspoCrmStoredConnection,
} from './espocrm.config';
import {
  ESPO_MAX_ATTEMPTS,
  addDaysIso,
  mapAssessmentStage,
  mapEspoIndustry,
  mapRiskPriority,
  nextRetryAt,
  normalizeEspoPhone,
  todayIso,
} from './espocrm.mapper';
import type {
  EspoAdminSettings,
  EspoHealthCheck,
  EspoIntegrationStatus,
  EspoJobType,
  EspoLogQuery,
  EspoPublicConnectionTest,
  EspoSyncAttemptItem,
  EspoSyncHistoryItem,
  EspoSyncHistoryPage,
  EspoSyncHistoryQuery,
  EspoSyncJobDetail,
} from './espocrm.types';
import {
  ESPO_WORKER_INTERVAL_MS,
  HISTORY_PAGE_SIZES,
  HISTORY_RECORD_TYPES,
  HISTORY_STATUS_FILTER,
  classifyConnectionTest,
  countUnresolvedFailures,
  crmRecordUrl,
  historyStatus,
  isRetryEligible,
  publicConnectionMessage,
  resolveConnectionState,
  resolveCrmAccess,
  resolveSyncState,
  resolveWorkerState,
  sanitizeErrorSummary,
  sastDayBounds,
  syncRecordKey,
  type EspoCheckState,
  type EspoCrmAccess,
  type EspoLastConnectionTest,
  type EspoWorkerHeartbeat,
} from './espocrm.health';

/** Persisted health evidence, kept apart from the `espocrm` row that holds the API key. */
export const ESPOCRM_CONNECTION_TEST_KEY = 'espocrm.connectionTest';
export const ESPOCRM_WORKER_HEARTBEAT_KEY = 'espocrm.workerHeartbeat';

const SYNC_DIRECTION = 'Outbound (MOSS → EspoCRM)';
const SUCCESS_STATUSES: SyncStatus[] = ['SUCCESS', 'SYNCED'];
/** A PROCESSING row older than this is treated as abandoned when checking for duplicate work. */
const PROCESSING_STALE_MS = 15 * 60_000;
/** Sync jobs are the rows with no parent; rows written while a job ran hang off it. */
const TOP_LEVEL = { parentId: null } satisfies Prisma.CrmSyncRecordWhereInput;
const MAX_SEARCH_LENGTH = 100;

type SyncTrigger = 'automatic' | 'manual';

type JobSpec = {
  jobType: EspoJobType;
  entityType: string;
  localEntityId: string;
  organisationId?: string | null;
  assessmentId?: string | null;
};

const REMOTE_ID_FIELD: Record<string, string> = {
  Lead: 'leadId',
  Account: 'accountId',
  Contact: 'contactId',
  Opportunity: 'opportunityId',
};

/** The EspoCRM id a job's handler reports for the job's own record type. */
function remoteIdOf(entityType: string, value: unknown): string | null {
  const field = REMOTE_ID_FIELD[entityType];
  if (!field || !value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>)[field];
  return typeof id === 'string' && id ? id : null;
}

function attemptOutcome(status: SyncStatus): 'failed' | 'retrying' | 'skipped' {
  if (status === 'SKIPPED') return 'skipped';
  return status === 'RETRYING' ? 'retrying' : 'failed';
}

function parseConnectionTest(value: unknown): EspoLastConnectionTest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const at = typeof raw.at === 'string' ? new Date(raw.at) : null;
  if (!at || Number.isNaN(at.getTime()) || typeof raw.success !== 'boolean') return null;
  const checks = (raw.checks && typeof raw.checks === 'object' ? raw.checks : {}) as Record<string, unknown>;
  const state = (v: unknown): EspoCheckState => (typeof v === 'boolean' ? v : null);
  return {
    at,
    success: raw.success,
    errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : null,
    message: typeof raw.message === 'string' ? raw.message : publicConnectionMessage({ success: raw.success }),
    responseTimeMs: typeof raw.responseTimeMs === 'number' ? raw.responseTimeMs : null,
    checks: {
      apiReachable: state(checks.apiReachable),
      authValid: state(checks.authValid),
      sslValid: state(checks.sslValid),
    },
  };
}

function parseWorkerHeartbeat(value: unknown): EspoWorkerHeartbeat | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.lastRunAt !== 'string') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { lastRunAt: raw.lastRunAt, processed: n(raw.processed), succeeded: n(raw.succeeded), failed: n(raw.failed) };
}

type HistoryRow = {
  id: string;
  entityType: string;
  localEntityId: string;
  remoteEntityId: string | null;
  jobType: string | null;
  status: SyncStatus;
  errorMessage: string | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastAttemptAt: Date | null;
  assessmentId: string | null;
  parentId: string | null;
  attemptsTracked: boolean;
  createdAt: Date;
  updatedAt: Date;
  organisation: { name: string } | null;
  assessment: { reference: string } | null;
};

const HISTORY_SELECT = {
  id: true,
  entityType: true,
  localEntityId: true,
  remoteEntityId: true,
  jobType: true,
  status: true,
  errorMessage: true,
  attemptCount: true,
  nextRetryAt: true,
  lastAttemptAt: true,
  assessmentId: true,
  parentId: true,
  attemptsTracked: true,
  createdAt: true,
  updatedAt: true,
  organisation: { select: { name: true } },
  assessment: { select: { reference: true } },
} satisfies Prisma.CrmSyncRecordSelect;

function historyReference(row: {
  entityType: string;
  localEntityId: string;
  organisation: { name: string } | null;
  assessment: { reference: string } | null;
}) {
  return row.assessment?.reference || row.organisation?.name || `${row.entityType} …${row.localEntityId.slice(-6)}`;
}

type LeakageResult = {
  minimumLeakageValue?: number;
  likelyLeakageValue?: number;
  maximumExposureValue?: number;
  recoverableLow?: number;
  recoverableHigh?: number;
};

type CategoryScore = { category: string; score: number | string };

@Injectable()
export class EspoCrmService {
  private readonly logger = new Logger(EspoCrmService.name);
  private cfg: EspoCrmRuntimeConfig;
  private espoIndustryOptions: string[] | null = null;
  /** Set while a sync job runs, so every record written during it is attached to that job. */
  private readonly jobScope = new AsyncLocalStorage<{ jobId: string }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.cfg = loadEspoCrmConfig(config);
  }

  private async checkAssessmentAccess(assessmentId: string, user: AuthUser) {
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: { organisationId: true, productCode: true },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    if (assessment.productCode !== 'SCLI_COST_LEAKAGE') {
      throw new NotFoundException('Assessment not found.');
    }
    if (INTERNAL_ROLES.has(user.role)) return;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId: assessment.organisationId } },
    });
    if (!membership) throw new ForbiddenException('You do not have access to this assessment.');
  }

  private reloadConfig() {
    this.cfg = loadEspoCrmConfig(this.config);
    return this.cfg;
  }

  private async refreshConfig() {
    const env = loadEspoCrmConfig(this.config);
    const row = await this.prisma.systemSetting.findUnique({ where: { key: ESPOCRM_SETTING_KEY } });
    const stored = parseEspoStoredConnection(row?.value);
    this.cfg = applyEspoConnectionOverrides(env, stored);
    return this.cfg;
  }

  private async client() {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    return new EspoCrmClient(this.cfg);
  }

  /** Jobs the retry loop may run. Permanent failures have no nextRetryAt and stay out. */
  private dueSyncFilter(now = new Date()): Prisma.CrmSyncRecordWhereInput {
    return {
      ...TOP_LEVEL,
      OR: [
        { status: 'PENDING' },
        { status: 'RETRYING', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        { status: 'FAILED', nextRetryAt: { lte: now } },
      ],
    };
  }

  private async industryOptions(): Promise<string[]> {
    if (this.espoIndustryOptions) return this.espoIndustryOptions;
    try {
      const client = await this.client();
      const meta = await client.get<{
        entityDefs?: { Account?: { fields?: { industry?: { options?: unknown } } } };
      }>('/Metadata');
      const options = meta.data?.entityDefs?.Account?.fields?.industry?.options;
      this.espoIndustryOptions = Array.isArray(options)
        ? options.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    } catch {
      this.espoIndustryOptions = [];
    }
    return this.espoIndustryOptions;
  }

  private publicUrl() {
    return (this.config.get<string>('PUBLIC_URL') || this.config.get<string>('WEB_URL') || '').replace(
      /\/$/,
      '',
    );
  }

  private nodeEnv() {
    return this.config.get<string>('NODE_ENV') || 'development';
  }

  private async readSetting(key: string): Promise<unknown> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  private async writeSetting(key: string, value: Record<string, unknown>) {
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json },
    });
  }

  private async lastConnectionTest() {
    return parseConnectionTest(await this.readSetting(ESPOCRM_CONNECTION_TEST_KEY));
  }

  private async workerHeartbeat() {
    return parseWorkerHeartbeat(await this.readSetting(ESPOCRM_WORKER_HEARTBEAT_KEY));
  }

  /** Link to the EspoCRM interface for authorised users. Grants nothing in EspoCRM itself. */
  async access(): Promise<EspoCrmAccess> {
    await this.refreshConfig();
    return resolveCrmAccess(this.cfg.baseUrl, this.nodeEnv());
  }

  async getSettings(): Promise<EspoAdminSettings> {
    await this.refreshConfig();
    return {
      enabled: this.cfg.enabled,
      baseUrl: this.cfg.baseUrl || null,
      apiKeyConfigured: Boolean(this.cfg.apiKey),
      timeoutSeconds: Math.round(this.cfg.timeoutMs / 1000),
      syncDirection: SYNC_DIRECTION,
      autoSync: this.cfg.autoSync,
      verifySsl: this.cfg.verifySsl,
    };
  }

  async updateConnectionSettings(
    input: { enabled?: boolean; baseUrl?: string; apiKey?: string },
    user: AuthUser,
  ) {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: ESPOCRM_SETTING_KEY } });
    const existing = parseEspoStoredConnection(row?.value);
    const env = loadEspoCrmConfig(this.config);
    const nodeEnv = this.nodeEnv();
    const replacementKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';

    const next: EspoCrmStoredConnection = { ...existing };
    if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
    if (typeof input.baseUrl === 'string') {
      const trimmed = input.baseUrl.trim().replace(/\/+$/, '');
      if (trimmed) validateEspoBaseUrl(trimmed, nodeEnv);
      next.baseUrl = trimmed;
    }
    // A blank replacement keeps the current key.
    if (replacementKey) {
      next.apiKey = replacementKey;
    }

    const merged = applyEspoConnectionOverrides(env, next);
    if (merged.enabled && merged.baseUrl) {
      validateEspoBaseUrl(merged.baseUrl, nodeEnv);
    }

    await this.prisma.systemSetting.upsert({
      where: { key: ESPOCRM_SETTING_KEY },
      create: {
        key: ESPOCRM_SETTING_KEY,
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: user.id,
      },
      update: {
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: user.id,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPDATE_ESPOCRM',
      entityType: 'SystemSetting',
      entityId: ESPOCRM_SETTING_KEY,
      metadata: {
        enabled: next.enabled,
        baseUrl: next.baseUrl,
        apiKeyUpdated: Boolean(replacementKey),
      },
    });

    const connectionChanged =
      (typeof input.baseUrl === 'string' && next.baseUrl !== existing.baseUrl)
      || Boolean(replacementKey)
      || (typeof input.enabled === 'boolean' && next.enabled !== existing.enabled);
    if (connectionChanged) {
      // The previous result no longer describes this connection.
      await this.prisma.systemSetting.deleteMany({ where: { key: ESPOCRM_CONNECTION_TEST_KEY } });
    }

    return this.getSettings();
  }

  async getMapping() {
    await this.refreshConfig();
    const f = this.cfg.opportunityFields;
    return {
      direction: 'Outbound (MOSS → EspoCRM)',
      note: 'Sensitive questionnaire answers and evidence files are never synced.',
      entities: [
        {
          from: 'Organisation',
          to: 'Account',
          dedup: `${this.cfg.accountMossIdField}, then exact name`,
          fields: [
            'name',
            'website',
            'emailAddress',
            'industry',
            'description',
            this.cfg.accountMossIdField,
            ...(this.cfg.accountFields.numberOfSites ? [this.cfg.accountFields.numberOfSites] : []),
            ...(this.cfg.accountFields.annualSecurityContractValue
              ? [this.cfg.accountFields.annualSecurityContractValue]
              : []),
          ],
        },
        {
          from: 'Public Lead',
          to: 'Lead',
          dedup: `email + ${this.cfg.leadMossRefField}`,
          fields: ['firstName', 'lastName', 'emailAddress', 'phoneNumber', 'description', this.cfg.leadMossRefField],
        },
        {
          from: 'Primary Contact',
          to: 'Contact',
          dedup: `${this.cfg.contactMossIdField}, then email`,
          fields: ['firstName', 'lastName', 'emailAddress', 'phoneNumber', 'accountId', this.cfg.contactMossIdField],
        },
        {
          from: 'Assessment',
          to: 'Opportunity',
          dedup: this.cfg.opportunityMossIdField,
          fields: [
            'name',
            'stage',
            'amount',
            'closeDate',
            'probability',
            this.cfg.opportunityMossIdField,
            f.scliScore,
            f.riskRating,
            f.governanceScore,
            f.confidenceScore,
            f.opportunityScore,
            f.minLeakage,
            f.likelyLeakage,
            f.maxExposure,
            f.recoverableLow,
            f.recoverableHigh,
            f.highestRisk,
            f.recommendedService,
            f.status,
            f.reportUrl,
            f.assessmentReference,
          ],
        },
        {
          from: 'Follow-up',
          to: 'Task',
          dedup: 'Stored EspoCRM task id / prior SUCCESS Task log',
          fields: ['name', 'status', 'priority', 'dateEnd', 'description', 'parentType/parentId (Opportunity)'],
        },
      ],
      stages: Object.entries(this.cfg.stages).map(([status, stage]) => ({ status, stage })),
    };
  }

  async integrationStatus(now = new Date()): Promise<EspoIntegrationStatus> {
    await this.refreshConfig();
    const records = this.prisma.crmSyncRecord;
    const configured = Boolean(this.cfg.baseUrl && this.cfg.apiKey);

    const [
      lastTest,
      heartbeat,
      lastAttempt,
      lastSuccess,
      lastFailure,
      pending,
      processing,
      retrying,
      failedTotal,
      succeeded,
      skipped,
      failedRows,
    ] = await Promise.all([
      this.lastConnectionTest(),
      this.workerHeartbeat(),
      // A PENDING row's lastAttemptAt is its queue time, not an attempt.
      records.findFirst({
        where: { ...TOP_LEVEL, status: { not: 'PENDING' }, lastAttemptAt: { not: null } },
        orderBy: { lastAttemptAt: 'desc' },
        select: { lastAttemptAt: true },
      }),
      records.findFirst({
        where: { ...TOP_LEVEL, status: { in: SUCCESS_STATUSES } },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      // Attempts outlive a retry, which clears the job's own error, so the latest failure comes from them.
      this.prisma.crmSyncAttempt.findFirst({
        where: { outcome: { in: ['failed', 'retrying'] }, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: {
          completedAt: true,
          errorMessage: true,
          syncRecord: {
            select: {
              status: true,
              entityType: true,
              localEntityId: true,
              organisation: { select: { name: true } },
              assessment: { select: { reference: true } },
            },
          },
        },
      }),
      records.count({ where: { ...TOP_LEVEL, status: 'PENDING' } }),
      records.count({ where: { ...TOP_LEVEL, status: 'PROCESSING' } }),
      records.count({ where: { ...TOP_LEVEL, status: 'RETRYING' } }),
      records.count({ where: { ...TOP_LEVEL, status: 'FAILED' } }),
      records.count({ where: { ...TOP_LEVEL, status: { in: SUCCESS_STATUSES } } }),
      records.count({ where: { ...TOP_LEVEL, status: { in: ['SKIPPED', 'CANCELLED'] } } }),
      records.findMany({
        where: { ...TOP_LEVEL, status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 500,
        select: { jobType: true, entityType: true, localEntityId: true, updatedAt: true },
      }),
    ]);

    const failedIds = [...new Set(failedRows.map((row) => row.localEntityId))];
    const [laterSuccesses, byType] = await Promise.all([
      failedIds.length
        ? records.findMany({
            where: { ...TOP_LEVEL, status: { in: SUCCESS_STATUSES }, localEntityId: { in: failedIds } },
            select: { jobType: true, entityType: true, localEntityId: true, updatedAt: true },
          })
        : Promise.resolve([]),
      records.groupBy({
        by: ['entityType'],
        where: { status: { in: SUCCESS_STATUSES } },
        _count: { _all: true },
      }),
    ]);
    const failedUnresolved = countUnresolvedFailures(failedRows, laterSuccesses);

    const connectionState = resolveConnectionState({ enabled: this.cfg.enabled, configured, lastTest });
    const workerState = resolveWorkerState({
      enabled: this.cfg.enabled,
      autoSync: this.cfg.autoSync,
      heartbeat,
      now,
    });
    const syncState = resolveSyncState({
      enabled: this.cfg.enabled,
      configured,
      counts: { pending, processing, retrying, failedUnresolved },
      worker: workerState,
    });

    return {
      enabled: this.cfg.enabled,
      configured,
      access: resolveCrmAccess(this.cfg.baseUrl, this.nodeEnv()),
      connection: {
        state: connectionState,
        checkedAt: lastTest?.at.toISOString() ?? null,
        message: lastTest?.message ?? null,
        responseTimeMs: lastTest?.responseTimeMs ?? null,
      },
      checks: this.healthChecks(lastTest, workerState, heartbeat),
      worker: {
        state: workerState,
        lastRunAt: heartbeat?.lastRunAt ?? null,
        lastProcessed: heartbeat?.processed ?? null,
        lastSucceeded: heartbeat?.succeeded ?? null,
        lastFailed: heartbeat?.failed ?? null,
        intervalMinutes: ESPO_WORKER_INTERVAL_MS / 60_000,
      },
      sync: {
        state: syncState,
        direction: SYNC_DIRECTION,
        lastAttemptAt: lastAttempt?.lastAttemptAt?.toISOString() ?? null,
        lastSuccessAt: lastSuccess?.updatedAt.toISOString() ?? null,
        lastFailureAt: lastFailure?.completedAt?.toISOString() ?? null,
        lastFailureSummary: sanitizeErrorSummary(lastFailure?.errorMessage),
        lastFailureJob: lastFailure
          ? {
              recordType: lastFailure.syncRecord.entityType,
              reference: historyReference(lastFailure.syncRecord),
              currentStatus: historyStatus(lastFailure.syncRecord.status),
            }
          : null,
        counts: { pending, processing, retrying, failedUnresolved, failedTotal, succeeded, skipped },
        succeededByType: byType
          .map((row) => ({ recordType: row.entityType, count: row._count._all }))
          .sort((a, b) => b.count - a.count),
      },
    };
  }

  private healthChecks(
    lastTest: EspoLastConnectionTest | null,
    workerState: EspoIntegrationStatus['worker']['state'],
    heartbeat: EspoWorkerHeartbeat | null,
  ): EspoHealthCheck[] {
    const testedAt = lastTest?.at.toISOString() ?? null;
    const fromTest = (
      id: EspoHealthCheck['id'],
      label: string,
      state: EspoCheckState | undefined,
      passed: string,
      failed: string,
    ): EspoHealthCheck => {
      if (state === true) return { id, label, result: 'passed', checkedAt: testedAt, detail: passed };
      if (state === false) return { id, label, result: 'failed', checkedAt: testedAt, detail: failed };
      return {
        id,
        label,
        result: 'not_checked',
        checkedAt: null,
        detail: lastTest
          ? 'The last connection test could not determine this.'
          : 'No connection test has been recorded.',
      };
    };

    const tls: EspoHealthCheck = this.cfg.verifySsl
      ? fromTest(
          'tls',
          'TLS certificate',
          lastTest?.checks.sslValid,
          'The CRM certificate was verified.',
          'The CRM certificate could not be verified.',
        )
      : {
          id: 'tls',
          label: 'TLS certificate',
          result: 'not_checked',
          checkedAt: null,
          detail: 'Certificate verification is turned off in the deployment configuration.',
        };

    const lastRun = !heartbeat
      ? 'No run details recorded.'
      : heartbeat.processed === 0
        ? 'Last run processed 0 jobs. A run with no jobs does not confirm delivery to EspoCRM.'
        : `Last run processed ${heartbeat.processed} job(s): ${heartbeat.succeeded} succeeded, ${heartbeat.failed} failed.`;
    const workerCopy: Record<
      EspoIntegrationStatus['worker']['state'],
      Pick<EspoHealthCheck, 'result' | 'detail' | 'statusLabel'>
    > = {
      running: { result: 'passed', statusLabel: 'Running', detail: `Worker running — ${lastRun.charAt(0).toLowerCase()}${lastRun.slice(1)}` },
      stale: {
        result: 'failed',
        statusLabel: 'Not running',
        detail: `The sync worker has not run for over ${(3 * ESPO_WORKER_INTERVAL_MS) / 60_000} minutes.`,
      },
      not_recorded: { result: 'not_checked', detail: 'No sync worker run has been recorded yet.' },
      not_scheduled: { result: 'not_checked', detail: 'Automatic sync is turned off, so the worker does not run.' },
      disabled: { result: 'not_checked', detail: 'The integration is disabled.' },
    };

    return [
      fromTest(
        'api',
        'API reachable',
        lastTest?.checks.apiReachable,
        'MOSS reached the EspoCRM API.',
        'MOSS could not reach the EspoCRM API.',
      ),
      fromTest(
        'auth',
        'Integration key accepted',
        lastTest?.checks.authValid,
        'EspoCRM accepted the integration API key.',
        'EspoCRM rejected the integration API key.',
      ),
      tls,
      {
        id: 'worker',
        label: 'Sync worker',
        checkedAt: heartbeat?.lastRunAt ?? null,
        ...workerCopy[workerState],
      },
    ];
  }

  async testConnection(user?: AuthUser): Promise<EspoPublicConnectionTest> {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const client = new EspoCrmClient(this.cfg);
    const result = await client.testConnection();
    const checkedAt = new Date();
    const message = publicConnectionMessage(result);
    await this.writeSetting(ESPOCRM_CONNECTION_TEST_KEY, {
      at: checkedAt.toISOString(),
      success: result.success,
      errorCode: result.errorCode || null,
      message,
      responseTimeMs: result.responseTimeMs,
      checks: classifyConnectionTest(result, this.cfg.verifySsl),
    });
    await this.audit.record({
      userId: user?.id,
      action: 'ESPOCRM_CONNECTION_TEST',
      entityType: 'EspoCrmIntegration',
      entityId: 'espocrm',
      metadata: {
        success: result.success,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        errorCode: result.errorCode || null,
      },
    });
    if (!result.success) {
      throw new BadGatewayException(message);
    }
    return {
      success: true,
      checkedAt: checkedAt.toISOString(),
      responseTimeMs: result.responseTimeMs,
      message,
      errorCode: null,
    };
  }

  private async writeLog(input: {
    organisationId?: string | null;
    assessmentId?: string | null;
    entityType: string;
    localEntityId: string;
    remoteEntityId?: string | null;
    jobType?: EspoJobType | null;
    action?: string | null;
    payload: Record<string, unknown>;
    response?: unknown;
    status: SyncStatus;
    errorMessage?: string | null;
    errorCode?: string | null;
    attemptCount?: number;
    nextRetryAt?: Date | null;
  }) {
    const safePayload = redactSecrets(input.payload) as Prisma.InputJsonValue;
    const safeResponse = input.response
      ? (redactSecrets(input.response) as Prisma.InputJsonValue)
      : undefined;

    return this.prisma.crmSyncRecord.create({
      data: {
        organisationId: input.organisationId || undefined,
        assessmentId: input.assessmentId || undefined,
        entityType: input.entityType,
        localEntityId: input.localEntityId,
        remoteEntityId: input.remoteEntityId || null,
        jobType: input.jobType || null,
        action: input.action || null,
        payload: safePayload,
        response: safeResponse,
        status: input.status,
        errorMessage: input.errorMessage || null,
        errorCode: input.errorCode || null,
        attemptCount: input.attemptCount ?? 1,
        nextRetryAt: input.nextRetryAt ?? null,
        lastAttemptAt: new Date(),
        parentId: this.jobScope.getStore()?.jobId ?? null,
      },
    });
  }

  /**
   * Run one attempt of a claimed job: record the attempt, run the handler inside the
   * job scope, then store the outcome on both the attempt and the job.
   */
  private async runAttempt<T>(
    job: { id: string; attemptCount: number; entityType: string; localEntityId: string; jobType: string | null },
    trigger: SyncTrigger,
    userId: string | null,
    work: () => Promise<T>,
  ): Promise<{ status: SyncStatus; value?: T; error?: unknown }> {
    const attemptNumber = (job.attemptCount || 0) + 1;
    const attempt = await this.prisma.crmSyncAttempt
      .create({
        data: { syncRecordId: job.id, attemptNumber, trigger, triggeredById: userId, startedAt: new Date() },
      })
      .catch((err: unknown) => {
        this.logger.warn(`Could not record CRM sync attempt: ${(err as Error)?.message || err}`);
        return null;
      });
    const finishAttempt = async (data: Prisma.CrmSyncAttemptUpdateInput) => {
      if (!attempt) return;
      await this.prisma.crmSyncAttempt
        .update({ where: { id: attempt.id }, data: { completedAt: new Date(), ...data } })
        .catch(() => undefined);
    };

    try {
      const value = await this.jobScope.run({ jobId: job.id }, work);
      const remoteId = remoteIdOf(job.entityType, value);
      await this.prisma.crmSyncRecord.update({
        where: { id: job.id },
        data: {
          status: 'SUCCESS',
          errorMessage: null,
          errorCode: null,
          lastAttemptAt: new Date(),
          attemptCount: attemptNumber,
          nextRetryAt: null,
          ...(remoteId ? { remoteEntityId: remoteId } : {}),
        },
      });
      await finishAttempt({ outcome: 'success', remoteEntityId: remoteId });
      return { status: 'SUCCESS', value };
    } catch (error: unknown) {
      const safe = this.asError(error);
      const missing = error instanceof NotFoundException;
      const premature =
        error instanceof BadRequestException &&
        safe.message.startsWith('Evaluate the assessment before CRM synchronisation');
      const terminal = missing || premature;
      const retryable = !terminal && safe.retryable && attemptNumber < ESPO_MAX_ATTEMPTS;
      const finalStatus: SyncStatus = terminal ? 'SKIPPED' : retryable ? 'RETRYING' : 'FAILED';
      await this.prisma.crmSyncRecord.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          errorMessage: safe.message,
          errorCode: safe.code,
          lastAttemptAt: new Date(),
          attemptCount: attemptNumber,
          nextRetryAt: terminal ? null : nextRetryAt(attemptNumber, retryable),
        },
      });
      await finishAttempt({ outcome: attemptOutcome(finalStatus), errorCode: safe.code, errorMessage: safe.message });
      await this.audit.record({
        userId: userId ?? undefined,
        action: 'ESPOCRM_SYNC_FAILED',
        entityType: job.entityType,
        entityId: job.localEntityId,
        metadata: { syncId: job.id, code: safe.code, jobType: job.jobType, attempt: attemptNumber },
      });
      return { status: finalStatus, error };
    }
  }

  /**
   * A sync started directly (not from the queue) becomes its own job with one attempt.
   * Inside a running job it simply does the work, so nested calls never create jobs.
   */
  private async runDirectJob<T>(
    spec: JobSpec,
    trigger: SyncTrigger,
    user: AuthUser | undefined,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.jobScope.getStore()) return work();
    const job = await this.prisma.crmSyncRecord.create({
      data: {
        organisationId: spec.organisationId || undefined,
        assessmentId: spec.assessmentId || undefined,
        entityType: spec.entityType,
        localEntityId: spec.localEntityId,
        jobType: spec.jobType,
        action: 'sync',
        payload: { jobType: spec.jobType, trigger, requestedAt: new Date().toISOString() },
        status: 'PROCESSING',
        attemptCount: 0,
        lastAttemptAt: new Date(),
      },
    });
    const result = await this.runAttempt(job, trigger, user?.id ?? null, work);
    if (result.status === 'SUCCESS') return result.value as T;
    const error = result.error;
    throw error instanceof EspoCrmHttpError ? new BadGatewayException(this.asError(error).message) : error;
  }

  private asError(error: unknown): { message: string; code: string; retryable: boolean } {
    if (error instanceof EspoCrmHttpError) {
      return { message: error.message, code: error.code, retryable: error.retryable };
    }
    return {
      message: String((error as Error)?.message || error).slice(0, 500),
      code: 'UNKNOWN',
      retryable: false,
    };
  }

  async enqueueJob(input: {
    jobType: EspoJobType;
    entityType: string;
    localEntityId: string;
    organisationId?: string | null;
    assessmentId?: string | null;
    payload?: Record<string, unknown>;
  }) {
    await this.refreshConfig();
    if (!this.cfg.enabled || !this.cfg.autoSync) {
      return { queued: false, reason: 'disabled' as const };
    }

    const existing = await this.prisma.crmSyncRecord.findFirst({
      where: {
        ...TOP_LEVEL,
        jobType: input.jobType,
        localEntityId: input.localEntityId,
        status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
      },
    });
    if (existing) return { queued: true, id: existing.id };

    const row = await this.prisma.crmSyncRecord.create({
      data: {
        organisationId: input.organisationId || undefined,
        assessmentId: input.assessmentId || undefined,
        entityType: input.entityType,
        localEntityId: input.localEntityId,
        jobType: input.jobType,
        action: 'queue',
        payload: {
          jobType: input.jobType,
          queuedAt: new Date().toISOString(),
          ...(input.payload || {}),
        },
        status: 'PENDING',
        lastAttemptAt: new Date(),
      },
    });

    void this.processQueuedSync(row.id).catch((err) =>
      this.logger.warn(`Queued CRM sync failed: ${(err as Error)?.message || err}`),
    );
    return { queued: true, id: row.id };
  }

  /** @deprecated Prefer enqueueJob / queueOpportunitySync — kept for callers */
  async queueAssessmentSync(assessmentId: string) {
    return this.queueOpportunitySync(assessmentId);
  }

  async queueOpportunitySync(assessmentId: string) {
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: { id: true, organisationId: true },
    });
    if (!assessment) return { queued: false, reason: 'missing' as const };
    return this.enqueueJob({
      jobType: 'ESPO_SYNC_OPPORTUNITY',
      entityType: 'Opportunity',
      localEntityId: assessmentId,
      assessmentId,
      organisationId: assessment.organisationId,
    });
  }

  async queueLeadSync(leadId: string) {
    return this.enqueueJob({
      jobType: 'ESPO_SYNC_LEAD',
      entityType: 'Lead',
      localEntityId: leadId,
    });
  }

  /**
   * Contact-form path: create/update EspoCRM Lead immediately when enabled.
   * Does not require AUTO_SYNC. On failure, queues a retry so submission stays non-blocking.
   */
  async syncLeadFromContactForm(
    leadId: string,
    overrides?: { jobTitle?: string; attribution?: Record<string, unknown> },
  ) {
    await this.refreshConfig();
    if (!this.cfg.enabled) {
      this.logger.warn(`EspoCRM lead sync skipped for ${leadId}: integration disabled`);
      return { synced: false, reason: 'disabled' as const };
    }
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      this.logger.error(
        `EspoCRM lead sync skipped for ${leadId}: base URL or API key not configured (set ESPOCRM_API_KEY)`,
      );
      // Persist a visible failure so Settings / CRM sync list shows the gap.
      await this.prisma.crmSyncRecord.create({
        data: {
          entityType: 'Lead',
          localEntityId: leadId,
          jobType: 'ESPO_SYNC_LEAD',
          action: 'skip',
          payload: { reason: 'not_configured', queuedAt: new Date().toISOString() },
          status: 'FAILED',
          errorCode: 'NOT_CONFIGURED',
          errorMessage: 'EspoCRM base URL and API key must be configured.',
          lastAttemptAt: new Date(),
        },
      }).catch(() => undefined);
      return { synced: false, reason: 'not_configured' as const };
    }

    const existing = await this.prisma.crmSyncRecord.findFirst({
      where: {
        ...TOP_LEVEL,
        jobType: 'ESPO_SYNC_LEAD',
        localEntityId: leadId,
        status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
      },
      select: { id: true },
    });
    if (existing) return { synced: false, reason: 'queued_retry' as const };

    try {
      const result = await this.runDirectJob(
        { jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', localEntityId: leadId },
        'automatic',
        undefined,
        () => this.syncLead(leadId, overrides),
      );
      return { synced: true, leadId: result.leadId };
    } catch (error: unknown) {
      // The failed job itself is scheduled for retry when the error is retryable.
      this.logger.warn(`Immediate EspoCRM lead sync failed for ${leadId}: ${(error as Error)?.message || error}`);
      return { synced: false, reason: 'sync_failed' as const };
    }
  }

  async queueAccountSync(organisationId: string) {
    return this.enqueueJob({
      jobType: 'ESPO_SYNC_ACCOUNT',
      entityType: 'Account',
      localEntityId: organisationId,
      organisationId,
    });
  }

  async queueReportUpdate(assessmentId: string) {
    return this.enqueueJob({
      jobType: 'ESPO_UPDATE_REPORT',
      entityType: 'Opportunity',
      localEntityId: assessmentId,
      assessmentId,
    });
  }

  /**
   * Runs one queued job. Returns its final status, or null if it was missing or already
   * claimed. `claimed` is for callers that have already moved the job to PROCESSING.
   */
  async processQueuedSync(
    syncId: string,
    opts: { trigger?: SyncTrigger; userId?: string | null; claimed?: boolean } = {},
  ): Promise<SyncStatus | null> {
    const row = await this.prisma.crmSyncRecord.findUnique({ where: { id: syncId } });
    if (!row || row.parentId) return null;

    if (!opts.claimed) {
      // Conditional claim: only one caller (cron, retry or enqueue) can move a job into PROCESSING.
      const claimed = await this.prisma.crmSyncRecord.updateMany({
        where: { id: syncId, ...TOP_LEVEL, status: { in: ['PENDING', 'RETRYING', 'FAILED'] } },
        data: { status: 'PROCESSING', lastAttemptAt: new Date() },
      });
      if (claimed.count === 0) return null;
    }

    const systemUser = await this.prisma.user.findFirst({
      where: { systemRole: 'SUPER_ADMIN', isActive: true },
    });
    const authUser: AuthUser | null = systemUser
      ? { id: systemUser.id, email: systemUser.email, role: String(systemUser.systemRole) }
      : null;

    const result = await this.runAttempt(row, opts.trigger ?? 'automatic', opts.userId ?? null, () =>
      this.runJobHandler(row, authUser),
    );
    return result.status;
  }

  private async runJobHandler(
    row: { jobType: string | null; entityType: string; localEntityId: string; assessmentId: string | null },
    authUser: AuthUser | null,
  ): Promise<unknown> {
    const jobType = (row.jobType ||
      (row.entityType === 'Opportunity'
        ? 'ESPO_SYNC_OPPORTUNITY'
        : row.entityType === 'Lead'
          ? 'ESPO_SYNC_LEAD'
          : row.entityType === 'Account'
            ? 'ESPO_SYNC_ACCOUNT'
            : null)) as EspoJobType | null;

    if (jobType === 'ESPO_SYNC_LEAD') return this.syncLead(row.localEntityId, authUser || undefined);
    if (jobType === 'ESPO_SYNC_ACCOUNT') return this.syncOrganisation(row.localEntityId, authUser || undefined);
    if (jobType === 'ESPO_SYNC_CONTACT') return this.syncContactByLeadId(row.localEntityId, authUser || undefined);
    if (jobType === 'ESPO_UPDATE_REPORT' && row.assessmentId) {
      return this.updateReportOnOpportunity(row.assessmentId, authUser || undefined);
    }
    if (row.assessmentId || jobType === 'ESPO_SYNC_OPPORTUNITY') {
      if (!authUser) throw new BadRequestException('System user required for CRM sync.');
      return this.syncAssessment(row.assessmentId || row.localEntityId, authUser, { skipAccessCheck: true });
    }
    throw new BadRequestException(`Unsupported CRM job for ${row.entityType}`);
  }

  async syncOrganisation(organisationId: string, user?: AuthUser) {
    return this.runDirectJob(
      { jobType: 'ESPO_SYNC_ACCOUNT', entityType: 'Account', localEntityId: organisationId, organisationId },
      'manual',
      user,
      () => this.syncOrganisationNow(organisationId, user),
    );
  }

  private async syncOrganisationNow(organisationId: string, user?: AuthUser) {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const organisation = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) throw new NotFoundException('Organisation not found.');
    const accountId = await this.syncAccount(organisation);
    await this.audit.record({
      userId: user?.id,
      action: 'ESPOCRM_ACCOUNT_SYNCED',
      entityType: 'Organisation',
      entityId: organisationId,
      metadata: { accountId },
    });
    return { ok: true, accountId };
  }

  async syncContactByLeadId(leadId: string, user?: AuthUser) {
    return this.runDirectJob(
      { jobType: 'ESPO_SYNC_CONTACT', entityType: 'Contact', localEntityId: leadId },
      'manual',
      user,
      () => this.syncContactByLeadIdNow(leadId, user),
    );
  }

  private async syncContactByLeadIdNow(leadId: string, user?: AuthUser) {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Contact lead not found.');
    let accountId: string | null = null;
    if (lead.organisationId) {
      const org = await this.prisma.organisation.findUnique({ where: { id: lead.organisationId } });
      if (org) accountId = await this.syncAccount(org);
    }
    if (!accountId) throw new BadRequestException('Organisation Account must exist before Contact sync.');
    const contactId = await this.syncContact(lead, accountId, true);
    await this.audit.record({
      userId: user?.id,
      action: 'ESPOCRM_CONTACT_SYNCED',
      entityType: 'PublicLead',
      entityId: leadId,
      metadata: { contactId, accountId },
    });
    return { ok: true, contactId, accountId };
  }

  async upsertWebsiteContact(input: {
    submissionId: string;
    fullName: string;
    organisation: string;
    email: string;
    programmeInterest: string;
    description: string;
    source: string;
  }) {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const client = await this.client();
    const parts = input.fullName.trim().split(/\s+/);
    const firstName = parts.shift() || input.fullName;
    const lastName = parts.join(' ') || '-';
    const programmeField = this.config.get<string>('ESPO_LEAD_PROGRAMME_FIELD') || '';
    const sourceField = this.config.get<string>('ESPO_LEAD_SOURCE_FIELD') || 'source';
    const base: Record<string, unknown> = {
      firstName,
      lastName,
      name: input.fullName,
      accountName: input.organisation,
      emailAddress: input.email,
      status: 'New',
      [sourceField]: 'Web Site',
    };
    if (programmeField) base[programmeField] = input.programmeInterest;

    const normalizedEmail = input.email.trim().toLowerCase();
    let found: { id: string } | null = await client.findByEmail('Lead', normalizedEmail);
    let leadId: string;
    if (found?.id) {
      leadId = found.id;
      await client.put(`/Lead/${leadId}`, base);
    } else {
      try {
        const created = await client.post('/Lead', { ...base, emailAddress: normalizedEmail, description: input.description });
        leadId = created.data.id;
      } catch (error: unknown) {
        if (!(error instanceof EspoCrmHttpError) || !['DUPLICATE_EMAIL', 'CONFLICT'].includes(error.code)) throw error;
        // Espo's duplicate checker returns the conflicting Lead records in the
        // 409 body. The client retains IDs only when the returned email exactly
        // matches the submitted normalized email.
        let conflicting: { id: string } | null = null;
        for (const candidateId of [...error.duplicateRecordIds, ...error.conflictRecordIds]) {
          const candidate = await client.findOne<Record<string, unknown> & { id: string }>('Lead', candidateId);
          const candidateEmails = [
            candidate.emailAddress,
            ...(Array.isArray(candidate.emailAddressData)
              ? candidate.emailAddressData.map((item) => (item as { emailAddress?: unknown }).emailAddress)
              : []),
          ];
          if (candidateEmails.some((value) => String(value || '').trim().toLowerCase() === normalizedEmail)) {
            conflicting = { id: candidate.id };
            break;
          }
        }
        if (!conflicting) conflicting = await client.findByEmail<{ id: string }>('Lead', normalizedEmail);
        if (conflicting?.id) {
          leadId = conflicting.id;
          found = conflicting;
          await client.put(`/Lead/${leadId}`, { ...base, emailAddress: normalizedEmail });
        } else {
          // Espo can flag an unrelated same-name record as a duplicate. We have
          // already exhausted email matching, so create the distinct lead using
          // Espo's documented duplicate-check override.
          const created = await client.post(
            '/Lead',
            { ...base, emailAddress: normalizedEmail, description: input.description },
            { 'X-Skip-Duplicate-Check': 'true' },
          );
          leadId = created.data.id;
        }
      }
    }
    await client.post('/Note', {
      parentType: 'Lead',
      parentId: leadId,
      type: 'Post',
      post: `Website contact enquiry – Book a MOSS Assessment\n\n${input.description}`,
    });
    return { leadId, action: found?.id ? 'update' : 'create' };
  }

  async syncLead(
    leadId: string,
    userOrOverrides?: AuthUser | { jobTitle?: string; attribution?: Record<string, unknown> },
  ) {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const client = await this.client();
    const lead = await this.prisma.publicLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found.');

    const overrides =
      userOrOverrides && !('email' in userOrOverrides)
        ? (userOrOverrides as { jobTitle?: string; attribution?: Record<string, unknown> })
        : undefined;
    const user =
      userOrOverrides && 'email' in userOrOverrides ? (userOrOverrides as AuthUser) : undefined;
    const jobTitle = overrides?.jobTitle?.trim() || null;
    const attribution = overrides?.attribution || null;

    const assessment = lead.assessmentId
      ? await this.prisma.assessmentSession.findUnique({
          where: { id: lead.assessmentId },
          select: { reference: true },
        })
      : null;

    // EspoCRM Lead.source is usually a fixed enum (Web Site, Call, …).
    // "wordpress" / custom labels cause HTTP 400 validation failures.
    const sourceRaw = (lead.source || '').toLowerCase();
    const espSource =
      sourceRaw.includes('web') || sourceRaw.includes('word') || sourceRaw.includes('public') || !sourceRaw
        ? 'Web Site'
        : sourceRaw.includes('email')
          ? 'Email'
          : sourceRaw.includes('call') || sourceRaw.includes('phone')
            ? 'Call'
            : 'Other';

    // Never set status=Converted on create/update via API — Espo treats Converted as a conversion workflow.
    const espStatus = 'New';

    const espPhone = normalizeEspoPhone(lead.phone);
    const attr = (attribution || {}) as Record<string, unknown>;
    const country = typeof attr.country === 'string' ? attr.country.trim() : '';
    const primaryConcern = typeof attr.primaryConcern === 'string' ? attr.primaryConcern.trim() : '';
    const totalSitesRaw = typeof attr.totalSites === 'string' ? attr.totalSites.trim() : '';
    const securityExpenditureRaw =
      typeof attr.securityExpenditure === 'string' ? attr.securityExpenditure.trim() : '';
    const totalSites = totalSitesRaw ? operationalSitesLabelFromStored(totalSitesRaw) : '';
    const securityExpenditure = securityExpenditureRaw
      ? securityExpenditureLabelFromStored(securityExpenditureRaw)
      : '';
    const orgFromAttr =
      typeof attr.organisationName === 'string' ? attr.organisationName.trim() : '';
    const industryFromAttr = typeof attr.industry === 'string' ? attr.industry.trim() : '';

    const payload: Record<string, unknown> = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      name: `${lead.firstName} ${lead.lastName}`.trim(),
      emailAddress: lead.email,
      accountName: lead.organisationName || orgFromAttr || undefined,
      status: espStatus,
      source: espSource,
      description: [
        `MOSS lead ID: ${lead.id}`,
        assessment?.reference ? `Assessment reference: ${assessment.reference}` : null,
        (lead.industry || industryFromAttr) ? `Industry: ${lead.industry || industryFromAttr}` : null,
        jobTitle ? `Role: ${jobTitle}` : null,
        country ? `Country: ${country}` : null,
        totalSites ? `Operational sites: ${totalSites}` : null,
        securityExpenditure ? `Security expenditure: ${securityExpenditure}` : null,
        primaryConcern ? `Primary concern: ${primaryConcern}` : null,
        `Executive Governance Triage status: ${lead.status}`,
        lead.diagnosticRequestedAt ? `Executive Discussion requested: ${lead.diagnosticRequestedAt.toISOString()}` : null,
        lead.proposalRequestedAt
          ? `Commercial Intent: Proposal Requested (${lead.proposalStatus}) at ${lead.proposalRequestedAt.toISOString()}`
          : null,
        lead.proposalReference ? `Proposal Reference: ${lead.proposalReference}` : null,
        lead.proposalRequestedAt
          ? 'Physical Risk Product: Executive Advisory Diagnostic | Journey Level: Level 2 opportunity | Source: Executive Governance Triage'
          : null,
        lead.source ? `MOSS source: ${lead.source}` : null,
        attribution
          ? `Attribution: ${JSON.stringify({
              source: attr.source,
              medium: attr.medium,
              campaign: attr.campaign,
              content: attr.content,
              term: attr.term,
              series: attr.series,
              article: attr.article,
              cta: attr.cta,
              insightsOptIn: attr.insightsOptIn,
            })}`
          : null,
        lead.phone && !espPhone ? `Phone (raw): ${lead.phone}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    };
    if (espPhone) {
      payload.phoneNumber = espPhone;
    }
    if (jobTitle) {
      payload.title = jobTitle;
    }
    if (this.cfg.assignedUserId) {
      payload.assignedUserId = this.cfg.assignedUserId;
    }

    const withCustomField = () => {
      if (!this.cfg.leadMossRefField) return payload;
      return {
        ...payload,
        [this.cfg.leadMossRefField]: assessment?.reference || lead.id,
      };
    };

    const createLead = async (headers?: Record<string, string>) => {
      try {
        return await client.post('/Lead', payload, headers);
      } catch (error: unknown) {
        if (!(error instanceof EspoCrmHttpError) || error.code !== 'VALIDATION') throw error;
        // Phone still rejected → retry without phoneNumber
        if (payload.phoneNumber) {
          const withoutPhone = { ...payload };
          delete withoutPhone.phoneNumber;
          try {
            return await client.post('/Lead', withoutPhone);
          } catch {
            // fall through
          }
        }
        if (!this.cfg.leadMossRefField) throw error;
        try {
          return await client.post('/Lead', withCustomField());
        } catch {
          throw error;
        }
      }
    };

    const updateLead = async (id: string) => {
      try {
        await client.put(`/Lead/${id}`, payload);
        return id;
      } catch (error: unknown) {
        if (!(error instanceof EspoCrmHttpError)) throw error;

        // Stale remote id — recreate from email / new Lead.
        if (error.code === 'NOT_FOUND') {
          await this.prisma.publicLead.update({
            where: { id: lead.id },
            data: { espocrmLeadId: null },
          });
          const byEmail = await client.findByEmail<{ id: string }>('Lead', lead.email).catch(() => null);
          if (byEmail?.id) {
            await client.put(`/Lead/${byEmail.id}`, payload, { 'X-Skip-Duplicate-Check': 'true' });
            await this.prisma.publicLead.update({
              where: { id: lead.id },
              data: { espocrmLeadId: byEmail.id },
            });
            return byEmail.id;
          }
          const created = await createLead();
          await this.prisma.publicLead.update({
            where: { id: lead.id },
            data: { espocrmLeadId: created.data.id },
          });
          return String(created.data.id);
        }

        if (!['CONFLICT', 'DUPLICATE_EMAIL'].includes(error.code)) throw error;

        // Espo duplicate/conflict checker can 409 on update when email/name collide.
        // Prefer the matching email record, then retry with skip-duplicate.
        const normalizedEmail = lead.email.trim().toLowerCase();
        let conflictingId: string | null = null;
        for (const candidateId of [...error.duplicateRecordIds, ...error.conflictRecordIds]) {
          try {
            const candidate = await client.findOne<Record<string, unknown> & { id: string }>(
              'Lead',
              candidateId,
            );
            const candidateEmails = [
              candidate.emailAddress,
              ...(Array.isArray(candidate.emailAddressData)
                ? candidate.emailAddressData.map(
                    (item) => (item as { emailAddress?: unknown }).emailAddress,
                  )
                : []),
            ];
            if (
              candidateEmails.some(
                (value) => String(value || '').trim().toLowerCase() === normalizedEmail,
              )
            ) {
              conflictingId = candidate.id;
              break;
            }
          } catch {
            // ignore missing conflict candidates
          }
        }
        if (!conflictingId) {
          const byEmail = await client.findByEmail<{ id: string }>('Lead', lead.email).catch(() => null);
          conflictingId = byEmail?.id || null;
        }

        const targetId = conflictingId || id;
        try {
          await client.put(`/Lead/${targetId}`, payload, { 'X-Skip-Duplicate-Check': 'true' });
        } catch (retryError: unknown) {
          if (
            !(retryError instanceof EspoCrmHttpError)
            || !['CONFLICT', 'DUPLICATE_EMAIL'].includes(retryError.code)
          ) {
            throw retryError;
          }
          // The conflicting Espo lead belongs to someone else. Create this one anyway.
          const created = await createLead({ 'X-Skip-Duplicate-Check': 'true' });
          const newId = String(created.data.id);
          await this.prisma.publicLead.update({
            where: { id: lead.id },
            data: { espocrmLeadId: newId },
          });
          return newId;
        }
        if (targetId !== lead.espocrmLeadId) {
          await this.prisma.publicLead.update({
            where: { id: lead.id },
            data: { espocrmLeadId: targetId },
          });
        }
        return targetId;
      }
    };

    try {
      let remoteId = lead.espocrmLeadId;
      let action = 'update';

      if (remoteId) {
        remoteId = await updateLead(remoteId);
      } else {
        let byEmail: { id: string } | null = null;
        try {
          byEmail = await client.findByEmail('Lead', lead.email);
        } catch {
          byEmail = null;
        }
        if (byEmail?.id) {
          remoteId = await updateLead(byEmail.id);
        } else {
          action = 'create';
          try {
            const created = await createLead();
            remoteId = created.data.id;
          } catch (error: unknown) {
            if (
              !(error instanceof EspoCrmHttpError)
              || !['DUPLICATE_EMAIL', 'CONFLICT'].includes(error.code)
            ) {
              throw error;
            }
            const byConflict = await client.findByEmail<{ id: string }>('Lead', lead.email).catch(() => null);
            if (byConflict?.id) {
              remoteId = await updateLead(byConflict.id);
              action = 'update';
            } else {
              // Espo 409'd against a different person. Create this lead anyway.
              const created = await createLead({ 'X-Skip-Duplicate-Check': 'true' });
              remoteId = created.data.id;
            }
          }
        }
        await this.prisma.publicLead.update({
          where: { id: lead.id },
          data: { espocrmLeadId: remoteId },
        });
      }

      await this.writeLog({
        organisationId: lead.organisationId,
        assessmentId: lead.assessmentId,
        entityType: 'Lead',
        localEntityId: lead.id,
        remoteEntityId: remoteId,
        jobType: 'ESPO_SYNC_LEAD',
        action,
        payload,
        status: 'SUCCESS',
      });
      await this.audit.record({
        userId: user?.id,
        action: 'ESPOCRM_LEAD_SYNCED',
        entityType: 'PublicLead',
        entityId: lead.id,
        metadata: { leadId: remoteId },
      });
      return { ok: true, leadId: remoteId };
    } catch (error: unknown) {
      // The queue job row records the failure. A second log row stays failed forever
      // and is what the dashboard shows as "EspoCRM sync failed".
      throw error;
    }
  }

  private async syncAccount(organisation: {
    id: string;
    name: string;
    website?: string | null;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
    industry?: string | null;
    espocrmAccountId?: string | null;
  }) {
    const client = await this.client();
    const inputValues = await this.prisma.assessmentInputValue.findMany({
      where: { assessment: { organisationId: organisation.id } },
      include: { inputDefinition: true },
      take: 50,
    });
    const byCode = (code: string) => {
      const row = inputValues.find((v) => v.inputDefinition.code === code);
      return row?.value;
    };
    const sites = byCode('C1');
    const contractValue = byCode('C2');
    const industry = mapEspoIndustry(organisation.industry, await this.industryOptions());

    const payload: Record<string, unknown> = {
      name: organisation.name,
      website: organisation.website || null,
      emailAddress: organisation.primaryEmail || null,
      description: [
        `MOSS organisation ID: ${organisation.id}`,
        `Industry: ${organisation.industry || 'Not specified'}`,
        `Number of sites: ${sites ?? 'n/a'}`,
        `Annual security contract value: ${contractValue ?? 'n/a'}`,
      ].join('\n'),
      assignedUserId: this.cfg.assignedUserId,
      [this.cfg.accountMossIdField]: organisation.id,
    };
    if (industry) payload.industry = industry;
    if (this.cfg.accountFields.numberOfSites && sites != null) {
      payload[this.cfg.accountFields.numberOfSites] = sites;
    }
    if (this.cfg.accountFields.annualSecurityContractValue && contractValue != null) {
      payload[this.cfg.accountFields.annualSecurityContractValue] = contractValue;
    }

    let remoteId = organisation.espocrmAccountId;
    let action = 'update';

    if (!remoteId) {
      const byMossId = await client.findByExternalId('Account', this.cfg.accountMossIdField, organisation.id);
      const byName = byMossId || (await client.findByExactName('Account', organisation.name));
      if (byName?.id) {
        remoteId = byName.id;
      }
    }

    if (remoteId) {
      await client.put(`/Account/${remoteId}`, payload);
    } else {
      action = 'create';
      const created = await client.post('/Account', payload);
      remoteId = created.data.id;
    }

    if (organisation.espocrmAccountId !== remoteId) {
      await this.prisma.organisation.update({
        where: { id: organisation.id },
        data: { espocrmAccountId: remoteId },
      });
    }

    await this.writeLog({
      organisationId: organisation.id,
      entityType: 'Account',
      localEntityId: organisation.id,
      remoteEntityId: remoteId,
      jobType: 'ESPO_SYNC_ACCOUNT',
      action,
      payload,
      status: 'SUCCESS',
    });
    return remoteId as string;
  }

  private async syncContact(
    lead: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
      jobTitle?: string | null;
      organisationId?: string | null;
      assessmentId?: string | null;
      espocrmContactId?: string | null;
      espocrmLeadId?: string | null;
    },
    accountId: string,
    required = false,
  ) {
    const client = await this.client();
    // Legacy rows stored Contact id in espocrmLeadId before Lead sync existed.
    const legacyContactId = !lead.espocrmContactId && lead.espocrmLeadId ? lead.espocrmLeadId : null;
    const contactPhone = normalizeEspoPhone(lead.phone);
    const payload: Record<string, unknown> = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      emailAddress: lead.email,
      title: lead.jobTitle || null,
      accountId,
      description: [
        `MOSS contact ID: ${lead.id}`,
        lead.phone && !contactPhone ? `Phone (raw): ${lead.phone}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      [this.cfg.contactMossIdField]: lead.id,
    };
    if (contactPhone) {
      payload.phoneNumber = contactPhone;
    }
    if (this.cfg.assignedUserId) {
      payload.assignedUserId = this.cfg.assignedUserId;
    }

    try {
      let remoteId = lead.espocrmContactId || legacyContactId;
      let action = 'update';
      if (!remoteId) {
        const byMoss = await client.findByExternalId('Contact', this.cfg.contactMossIdField, lead.id);
        const byEmail = byMoss || (await client.findByEmail('Contact', lead.email));
        if (byEmail?.id) remoteId = byEmail.id;
      }

      if (remoteId) {
        await client.put(`/Contact/${remoteId}`, payload);
      } else {
        action = 'create';
        const created = await client.post('/Contact', payload);
        remoteId = created.data.id;
      }

      await this.prisma.publicLead.update({
        where: { id: lead.id },
        data: {
          espocrmContactId: remoteId,
          // Clear legacy misuse of espocrmLeadId if it pointed at a Contact
          ...(legacyContactId && legacyContactId === remoteId ? { espocrmLeadId: null } : {}),
        },
      });

      await this.writeLog({
        organisationId: lead.organisationId,
        assessmentId: lead.assessmentId,
        entityType: 'Contact',
        localEntityId: lead.id,
        remoteEntityId: remoteId,
        jobType: 'ESPO_SYNC_CONTACT',
        action,
        payload,
        status: 'SUCCESS',
      });
      return remoteId as string;
    } catch (error: unknown) {
      // Opportunity sync can continue without a contact; a Contact job itself must fail.
      if (required) throw error;
      return null;
    }
  }

  async syncAssessment(
    assessmentId: string,
    user: AuthUser,
    opts?: { skipAccessCheck?: boolean },
  ): Promise<{
    ok: boolean;
    accountId: string;
    contactId: string | null;
    opportunityId: string | null;
    taskId: string | null;
    syncRecordId: string;
  }> {
    if (!['SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES'].includes(user.role)) {
      throw new ForbiddenException('Internal sales or review permission required.');
    }
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    if (!opts?.skipAccessCheck) {
      await this.checkAssessmentAccess(assessmentId, user);
    }
    if (!this.jobScope.getStore()) {
      const owner = await this.prisma.assessmentSession.findUnique({
        where: { id: assessmentId },
        select: { organisationId: true },
      });
      return this.runDirectJob(
        {
          jobType: 'ESPO_SYNC_OPPORTUNITY',
          entityType: 'Opportunity',
          localEntityId: assessmentId,
          assessmentId,
          organisationId: owner?.organisationId,
        },
        'manual',
        user,
        () => this.syncAssessment(assessmentId, user, { skipAccessCheck: true }),
      );
    }

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: {
        organisation: true,
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        reports: {
          where: { status: { in: ['GENERATED', 'APPROVED', 'ISSUED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        recommendations: { where: { includeInReport: true }, orderBy: { priority: 'desc' }, take: 5 },
      },
    });
    if (!assessment) throw new BadRequestException('Assessment not found.');
    const snapshot = assessment.scoreSnapshots[0];
    if (!snapshot) throw new BadRequestException('Evaluate the assessment before CRM synchronisation.');

    const leakage = (snapshot.leakageResult || {}) as LeakageResult;
    const categories = ((snapshot.categoryScores as CategoryScore[]) || []).slice();
    const highest = categories.sort((a, b) => Number(b.score) - Number(a.score))[0];
    const accountId = await this.syncAccount(assessment.organisation);

    const lead = await this.prisma.publicLead.findFirst({
      where: { assessmentId },
      orderBy: { updatedAt: 'desc' },
    });
    const contactId = lead ? await this.syncContact(lead, accountId) : null;

    const fields = this.cfg.opportunityFields;
    const reportUrl = assessment.reports[0]
      ? `${this.publicUrl()}/reports/${assessment.reports[0].id}`
      : `${this.publicUrl()}/assessments/${assessment.id}`;
    const likely = Number(leakage.likelyLeakageValue || 0);
    const recommended =
      assessment.recommendations[0]?.serviceOffering ||
      assessment.recommendations[0]?.title ||
      'n/a';

    const opportunityPayload: Record<string, unknown> = {
      name: `${assessment.organisation.name} – ${assessment.reference}`,
      accountId,
      stage: mapAssessmentStage(assessment.status, this.cfg.stages),
      amount: likely || Number(leakage.recoverableHigh || 0),
      amountCurrency: 'ZAR',
      closeDate: addDaysIso(this.cfg.followUpDays),
      probability: Math.min(90, Math.max(10, Math.round(Number(snapshot.opportunityScore)))),
      description: [
        `MOSS assessment ID: ${assessment.id}`,
        `Reference: ${assessment.reference}`,
        `Status: ${assessment.status}`,
        `SCLI risk: ${Number(snapshot.overallRiskScore).toFixed(1)} (${snapshot.riskBand})`,
        `Likely leakage: R${likely.toFixed(2)}`,
        `Highest-risk category: ${highest?.category || 'n/a'}`,
        `Recommended service: ${recommended}`,
        `Report: ${reportUrl}`,
      ].join('\n'),
      assignedUserId: this.cfg.assignedUserId,
      [this.cfg.opportunityMossIdField]: assessment.id,
      [fields.assessmentReference]: assessment.reference,
      [fields.scliScore]: Number(snapshot.overallRiskScore),
      [fields.riskRating]: snapshot.riskBand,
      [fields.governanceScore]: Number(snapshot.maturityScore),
      [fields.confidenceScore]: Number(snapshot.methodologyConfidence),
      [fields.opportunityScore]: Number(snapshot.opportunityScore),
      [fields.minLeakage]: Number(leakage.minimumLeakageValue || 0),
      [fields.likelyLeakage]: likely,
      [fields.maxExposure]: Number(leakage.maximumExposureValue || 0),
      [fields.recoverableLow]: Number(leakage.recoverableLow || 0),
      [fields.recoverableHigh]: Number(leakage.recoverableHigh || 0),
      [fields.highestRisk]: highest?.category || null,
      [fields.recommendedService]: recommended,
      [fields.status]: assessment.status,
      [fields.reportUrl]: reportUrl,
    };
    if (contactId) {
      opportunityPayload.contactId = contactId;
    }

    const client = await this.client();
    let remoteId = assessment.espocrmOpportunityId;
    let action = 'update';

    if (!remoteId) {
      const previous = await this.prisma.crmSyncRecord.findFirst({
        where: {
          assessmentId,
          entityType: 'Opportunity',
          status: { in: ['SUCCESS', 'SYNCED'] },
          remoteEntityId: { not: null },
        },
        orderBy: { updatedAt: 'desc' },
      });
      const byMoss = await client.findByExternalId(
        'Opportunity',
        this.cfg.opportunityMossIdField,
        assessment.id,
      );
      remoteId = previous?.remoteEntityId || byMoss?.id || null;
    }

    const sync = await this.writeLog({
      organisationId: assessment.organisationId,
      assessmentId,
      entityType: 'Opportunity',
      localEntityId: assessmentId,
      remoteEntityId: remoteId,
      jobType: 'ESPO_SYNC_OPPORTUNITY',
      action: remoteId ? 'update' : 'create',
      payload: opportunityPayload,
      status: 'PROCESSING',
      attemptCount: 1,
    });

    try {
      if (remoteId) {
        await client.put(`/Opportunity/${remoteId}`, opportunityPayload);
      } else {
        action = 'create';
        const created = await client.post('/Opportunity', opportunityPayload);
        remoteId = created.data.id;
      }

      await this.prisma.assessmentSession.update({
        where: { id: assessmentId },
        data: { espocrmOpportunityId: remoteId },
      });
      await this.prisma.crmSyncRecord.update({
        where: { id: sync.id },
        data: {
          status: 'SUCCESS',
          remoteEntityId: remoteId,
          action,
          response: { id: remoteId } as Prisma.InputJsonValue,
        },
      });

      const taskId = await this.ensureFollowUpTask({
        assessmentId,
        organisationId: assessment.organisationId,
        reference: assessment.reference,
        opportunityId: remoteId as string,
        riskBand: snapshot.riskBand,
        likelyLeakage: likely,
        overallRiskScore: Number(snapshot.overallRiskScore),
        existingTaskId: assessment.espocrmTaskId,
      });

      await this.audit.record({
        userId: user.id,
        action: 'ESPOCRM_OPPORTUNITY_SYNCED',
        entityType: 'AssessmentSession',
        entityId: assessmentId,
        metadata: { opportunityId: remoteId, taskId, accountId, contactId },
      });

      return {
        ok: true,
        accountId,
        contactId,
        opportunityId: remoteId,
        taskId,
        syncRecordId: sync.id,
      };
    } catch (error: unknown) {
      // This row belongs to the running job; the job decides whether and when to retry.
      const safe = this.asError(error);
      await this.prisma.crmSyncRecord.update({
        where: { id: sync.id },
        data: { status: 'FAILED', errorMessage: safe.message, errorCode: safe.code, nextRetryAt: null },
      });
      throw error;
    }
  }

  private async ensureFollowUpTask(input: {
    assessmentId: string;
    organisationId: string;
    reference: string;
    opportunityId: string;
    riskBand: string;
    likelyLeakage: number;
    overallRiskScore: number;
    existingTaskId?: string | null;
  }) {
    if (input.existingTaskId) return input.existingTaskId;

    const openLocal = await this.prisma.actionItem.findFirst({
      where: {
        assessmentId: input.assessmentId,
        status: { in: ['NOT_STARTED', 'PLANNED', 'IN_PROGRESS', 'BLOCKED'] },
      },
    });
    if (openLocal) {
      return input.existingTaskId || null;
    }

    const existingTaskLog = await this.prisma.crmSyncRecord.findFirst({
      where: {
        assessmentId: input.assessmentId,
        entityType: 'Task',
        status: { in: ['SUCCESS', 'SYNCED'] },
        remoteEntityId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingTaskLog?.remoteEntityId) {
      await this.prisma.assessmentSession.update({
        where: { id: input.assessmentId },
        data: { espocrmTaskId: existingTaskLog.remoteEntityId },
      });
      return existingTaskLog.remoteEntityId;
    }

    const client = await this.client();
    const taskPayload: Record<string, unknown> = {
      name: `Follow up MOSS assessment ${input.reference}`,
      status: 'Not Started',
      priority: mapRiskPriority(input.riskBand),
      dateStart: todayIso(),
      dateEnd: addDaysIso(this.cfg.followUpDays),
      parentType: 'Opportunity',
      parentId: input.opportunityId,
      description: [
        `Assessment summary: SCLI ${input.overallRiskScore.toFixed(1)} (${input.riskBand}).`,
        `Likely leakage ${input.likelyLeakage.toFixed(2)}.`,
        `Opportunity: ${input.opportunityId}`,
        `MOSS assessment: ${this.publicUrl()}/assessments/${input.assessmentId}`,
      ].join('\n'),
      assignedUserId: this.cfg.assignedUserId,
    };

    const task = await client.post('/Task', taskPayload);
    await this.prisma.assessmentSession.update({
      where: { id: input.assessmentId },
      data: { espocrmTaskId: task.data.id },
    });
    await this.writeLog({
      organisationId: input.organisationId,
      assessmentId: input.assessmentId,
      entityType: 'Task',
      localEntityId: input.assessmentId,
      remoteEntityId: task.data.id,
      jobType: 'ESPO_SYNC_TASK',
      action: 'create',
      payload: taskPayload,
      status: 'SUCCESS',
    });
    await this.audit.record({
      action: 'ESPOCRM_TASK_CREATED',
      entityType: 'AssessmentSession',
      entityId: input.assessmentId,
      metadata: { taskId: task.data.id, opportunityId: input.opportunityId },
    });
    return task.data.id;
  }

  async updateReportOnOpportunity(assessmentId: string, user?: AuthUser) {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: {
        reports: {
          where: { status: { in: ['GENERATED', 'APPROVED', 'ISSUED'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');

    let opportunityId = assessment.espocrmOpportunityId;
    if (!opportunityId) {
      const previous = await this.prisma.crmSyncRecord.findFirst({
        where: {
          assessmentId,
          entityType: 'Opportunity',
          remoteEntityId: { not: null },
          status: { in: ['SUCCESS', 'SYNCED'] },
        },
        orderBy: { updatedAt: 'desc' },
      });
      opportunityId = previous?.remoteEntityId || null;
    }
    if (!opportunityId) {
      if (!user) {
        const systemUser = await this.prisma.user.findFirst({
          where: { systemRole: 'SUPER_ADMIN', isActive: true },
        });
        if (!systemUser) throw new BadRequestException('System user required.');
        user = {
          id: systemUser.id,
          email: systemUser.email,
          role: String(systemUser.systemRole),
        };
      }
      const synced = await this.syncAssessment(assessmentId, user, { skipAccessCheck: true });
      return synced;
    }

    const reportUrl = assessment.reports[0]
      ? `${this.publicUrl()}/reports/${assessment.reports[0].id}`
      : `${this.publicUrl()}/assessments/${assessmentId}`;
    const fields = this.cfg.opportunityFields;
    const payload: Record<string, unknown> = {
      stage: mapAssessmentStage(assessment.status, this.cfg.stages),
      [fields.status]: assessment.status,
      [fields.reportUrl]: reportUrl,
      description: `Report issued in MOSS. Secure report URL: ${reportUrl}`,
    };

    const client = await this.client();
    await client.put(`/Opportunity/${opportunityId}`, payload);
    await this.writeLog({
      organisationId: assessment.organisationId,
      assessmentId,
      entityType: 'Opportunity',
      localEntityId: assessmentId,
      remoteEntityId: opportunityId,
      jobType: 'ESPO_UPDATE_REPORT',
      action: 'update',
      payload,
      status: 'SUCCESS',
    });
    await this.audit.record({
      userId: user?.id,
      action: 'ESPOCRM_REPORT_SYNCED',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: { opportunityId, reportUrl },
    });
    return { ok: true, opportunityId, reportUrl };
  }

  async listLogs(query: EspoLogQuery = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 200));
    const where: Prisma.CrmSyncRecordWhereInput = {};

    if (query.status) where.status = query.status as SyncStatus;
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action;
    if (query.jobType) where.jobType = query.jobType;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { localEntityId: { contains: q, mode: 'insensitive' } },
        { remoteEntityId: { contains: q, mode: 'insensitive' } },
        { errorMessage: { contains: q, mode: 'insensitive' } },
        { organisation: { name: { contains: q, mode: 'insensitive' } } },
        { assessment: { reference: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.crmSyncRecord.count({ where }),
      this.prisma.crmSyncRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          organisation: { select: { id: true, name: true } },
          assessment: { select: { id: true, reference: true } },
        },
      }),
    ]);

    return {
      items: items.map((row) => ({
        ...row,
        // Never expose raw secrets if somehow present
        payload: row.payload,
        response: row.response,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async processPendingQueue() {
    await this.refreshConfig();
    if (!this.cfg.enabled) return { processed: 0, skipped: true };
    const due = await this.prisma.crmSyncRecord.findMany({
      where: this.dueSyncFilter(),
      take: 20,
      orderBy: { updatedAt: 'asc' },
    });
    let processed = 0;
    for (const row of due) {
      await this.processQueuedSync(row.id);
      processed += 1;
    }
    await this.audit.record({
      action: 'ESPOCRM_MANUAL_SYNC',
      entityType: 'EspoCrmIntegration',
      entityId: 'espocrm',
      metadata: { processed },
    });
    return { processed, skipped: false };
  }

  private toHistoryItem(
    row: HistoryRow,
    crmAppUrl: string | null,
    canManage: boolean,
    supersededAt: Date | null,
  ): EspoSyncHistoryItem {
    const status = historyStatus(row.status);
    const eligible = isRetryEligible(row);
    let retryNote: string | null = null;
    if (status === 'failed' || status === 'retrying') {
      if (!eligible) retryNote = 'This job type cannot be retried from here.';
      else if (supersededAt) retryNote = 'A newer sync of this record exists, so this job is not retried.';
      else if (!canManage) retryNote = 'Only administrators can retry jobs.';
    }
    return {
      id: row.id,
      lastActivityAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      lastAttemptAt: row.status === 'PENDING' ? null : row.lastAttemptAt?.toISOString() ?? null,
      recordType: row.entityType,
      reference: historyReference(row),
      status,
      attempts: row.attemptCount,
      nextRetryAt: row.status === 'RETRYING' ? row.nextRetryAt?.toISOString() ?? null : null,
      errorSummary: status === 'success' ? null : sanitizeErrorSummary(row.errorMessage),
      crmUrl: crmRecordUrl(crmAppUrl, row.entityType, row.remoteEntityId),
      canRetry: canManage && eligible && !supersededAt,
      retryNote,
      legacy: !row.attemptsTracked,
      supersededAt: supersededAt?.toISOString() ?? null,
    };
  }

  /** For each job, when a later job for the same record was created, if any. */
  private async supersededMap(rows: Array<Pick<HistoryRow, 'id' | 'jobType' | 'entityType' | 'localEntityId' | 'createdAt'>>) {
    const result = new Map<string, Date | null>();
    if (!rows.length) return result;
    const groups = await this.prisma.crmSyncRecord.groupBy({
      by: ['jobType', 'entityType', 'localEntityId'],
      where: { ...TOP_LEVEL, localEntityId: { in: [...new Set(rows.map((r) => r.localEntityId))] } },
      _max: { createdAt: true },
    });
    const newest = new Map<string, number>();
    for (const g of groups) {
      const key = syncRecordKey(g);
      const at = g._max.createdAt?.getTime() ?? 0;
      if ((newest.get(key) ?? 0) < at) newest.set(key, at);
    }
    for (const row of rows) {
      const latest = newest.get(syncRecordKey(row)) ?? 0;
      result.set(row.id, latest > row.createdAt.getTime() ? new Date(latest) : null);
    }
    return result;
  }

  /** Filters shared by the job count and the job page, so both always describe the same set. */
  private historyWhere(query: EspoSyncHistoryQuery): Prisma.CrmSyncRecordWhereInput {
    const where: Prisma.CrmSyncRecordWhereInput = { ...TOP_LEVEL };
    if (query.status) {
      const statuses = HISTORY_STATUS_FILTER[query.status];
      if (!statuses) throw new BadRequestException('Unknown status filter.');
      where.status = { in: statuses as SyncStatus[] };
    }
    if (query.recordType) {
      if (!(HISTORY_RECORD_TYPES as readonly string[]).includes(query.recordType)) {
        throw new BadRequestException('Unknown record type filter.');
      }
      where.entityType = query.recordType;
    }
    if (query.organisationId) where.organisationId = query.organisationId;

    const from = query.dateFrom ? sastDayBounds(query.dateFrom) : null;
    const to = query.dateTo ? sastDayBounds(query.dateTo) : null;
    if ((query.dateFrom && !from) || (query.dateTo && !to)) {
      throw new BadRequestException('Dates must be in YYYY-MM-DD format.');
    }
    if (from && to && from.start > to.end) {
      throw new BadRequestException('The start date must be on or before the end date.');
    }
    if (from || to) {
      where.updatedAt = { ...(from ? { gte: from.start } : {}), ...(to ? { lte: to.end } : {}) };
    }

    const search = query.search?.trim().slice(0, MAX_SEARCH_LENGTH);
    if (search) {
      where.OR = [
        { assessment: { reference: { contains: search, mode: 'insensitive' } } },
        { organisation: { name: { contains: search, mode: 'insensitive' } } },
        { localEntityId: { contains: search, mode: 'insensitive' } },
        { remoteEntityId: { contains: search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /**
   * One row per sync job (never per record written during a job), newest activity first.
   * Safe projection: no payloads, responses or raw errors.
   */
  async listHistory(query: EspoSyncHistoryQuery, user: AuthUser): Promise<EspoSyncHistoryPage> {
    await this.refreshConfig();
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const requestedSize = Math.floor(Number(query.pageSize) || 0);
    const pageSize = (HISTORY_PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : HISTORY_PAGE_SIZES[0];
    const where = this.historyWhere(query);
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.crmSyncRecord.count({ where }),
      this.prisma.crmSyncRecord.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: HISTORY_SELECT,
      }),
    ]);
    const superseded = await this.supersededMap(rows);
    const crmAppUrl = resolveCrmAccess(this.cfg.baseUrl, this.nodeEnv()).url;
    const canManage = hasRole(user, ADMIN_ROLES);
    return {
      items: rows.map((row) => this.toHistoryItem(row, crmAppUrl, canManage, superseded.get(row.id) ?? null)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      rangeStart: rows.length ? skip + 1 : 0,
      rangeEnd: skip + rows.length,
    };
  }

  private async historyItem(id: string, user: AuthUser) {
    const row = await this.prisma.crmSyncRecord.findUnique({ where: { id }, select: HISTORY_SELECT });
    if (!row || row.parentId) throw new NotFoundException('Sync job not found.');
    await this.refreshConfig();
    const crmAppUrl = resolveCrmAccess(this.cfg.baseUrl, this.nodeEnv()).url;
    const superseded = await this.supersededMap([row]);
    return { row, crmAppUrl, item: this.toHistoryItem(row, crmAppUrl, hasRole(user, ADMIN_ROLES), superseded.get(row.id) ?? null) };
  }

  /** One job with its recorded attempts and the CRM records written while it ran. */
  async getHistoryJob(id: string, user: AuthUser): Promise<EspoSyncJobDetail> {
    const { row, crmAppUrl, item } = await this.historyItem(id, user);
    const [attempts, children] = await Promise.all([
      this.prisma.crmSyncAttempt.findMany({ where: { syncRecordId: id }, orderBy: { attemptNumber: 'asc' } }),
      this.prisma.crmSyncRecord.findMany({
        where: { parentId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
        select: { id: true, entityType: true, action: true, status: true, updatedAt: true, errorMessage: true, remoteEntityId: true },
      }),
    ]);
    const latestNumber = attempts.reduce((max, a) => Math.max(max, a.attemptNumber), 0);
    const recorded = attempts.filter((a) => a.attemptNumber <= row.attemptCount).length;
    return {
      job: item,
      attempts: attempts.map((a): EspoSyncAttemptItem => {
        const running = !a.outcome && !a.completedAt && row.status === 'PROCESSING' && a.attemptNumber === latestNumber;
        return {
          attemptNumber: a.attemptNumber,
          trigger: a.trigger === 'automatic' || a.trigger === 'manual' ? a.trigger : null,
          startedAt: a.startedAt?.toISOString() ?? null,
          completedAt: a.completedAt?.toISOString() ?? null,
          outcome: running ? 'running' : (a.outcome as EspoSyncAttemptItem['outcome']),
          errorSummary: a.outcome === 'success' ? null : sanitizeErrorSummary(a.errorMessage),
          crmUrl: crmRecordUrl(crmAppUrl, row.entityType, a.remoteEntityId),
        };
      }),
      unrecordedAttempts: Math.max(0, row.attemptCount - recorded),
      records: children.map((c) => {
        const childStatus = historyStatus(c.status);
        return {
          id: c.id,
          recordType: c.entityType,
          action: c.action,
          status: childStatus,
          at: c.updatedAt.toISOString(),
          errorSummary: childStatus === 'success' ? null : sanitizeErrorSummary(c.errorMessage),
          crmUrl: crmRecordUrl(crmAppUrl, c.entityType, c.remoteEntityId),
        };
      }),
    };
  }

  /**
   * Re-run one failed job. Only retry-eligible jobs, never while another run of the
   * same record is queued or in flight, and the PENDING claim is conditional so
   * concurrent requests cannot both start it.
   */
  async retry(id: string, user: AuthUser, opts: { wait?: boolean } = {}): Promise<EspoSyncHistoryItem> {
    const row = await this.prisma.crmSyncRecord.findUnique({ where: { id } });
    if (!row || row.parentId) throw new NotFoundException('Sync job not found.');
    if (!isRetryEligible(row)) {
      throw new ConflictException('Only failed sync jobs can be retried.');
    }

    const sameRecord = {
      ...TOP_LEVEL,
      id: { not: id },
      localEntityId: row.localEntityId,
      ...(row.jobType ? { jobType: row.jobType } : { entityType: row.entityType }),
    } satisfies Prisma.CrmSyncRecordWhereInput;
    const [newer, inFlight] = await Promise.all([
      this.prisma.crmSyncRecord.findFirst({
        where: { ...sameRecord, createdAt: { gt: row.createdAt } },
        select: { id: true },
      }),
      this.prisma.crmSyncRecord.findFirst({
        where: {
          ...sameRecord,
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', updatedAt: { gte: new Date(Date.now() - PROCESSING_STALE_MS) } },
          ],
        },
        select: { id: true },
      }),
    ]);
    if (inFlight) {
      throw new ConflictException('A sync for this record is already queued or in progress.');
    }
    if (newer) {
      throw new ConflictException('A newer sync of this record exists. Retry that job instead.');
    }

    // Claiming straight into PROCESSING means neither a second request nor the worker can start it too.
    const claimed = await this.prisma.crmSyncRecord.updateMany({
      where: { id, ...TOP_LEVEL, status: { in: ['FAILED', 'RETRYING'] } },
      data: { status: 'PROCESSING', errorMessage: null, errorCode: null, nextRetryAt: null, lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This sync job is already being retried.');
    }

    await this.audit.record({
      userId: user.id,
      action: 'ESPOCRM_SYNC_RETRIED',
      entityType: row.entityType,
      entityId: row.localEntityId,
      metadata: { syncId: id },
    });
    const run = this.processQueuedSync(id, { trigger: 'manual', userId: user.id, claimed: true }).catch((err: unknown) => {
      this.logger.warn(`CRM retry ${id} did not complete: ${(err as Error)?.message || err}`);
      return null;
    });
    if (opts.wait) await run;

    return (await this.historyItem(id, user)).item;
  }

  async retryFailed(user: AuthUser) {
    const failed = await this.prisma.crmSyncRecord.findMany({
      where: { ...TOP_LEVEL, status: { in: ['FAILED', 'RETRYING'] } },
      take: 50,
      orderBy: { updatedAt: 'asc' },
    });
    let processed = 0;
    let skipped = 0;
    for (const row of failed) {
      if (!isRetryEligible(row)) {
        skipped += 1;
        continue;
      }
      try {
        await this.retry(row.id, user, { wait: true });
        processed += 1;
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        skipped += 1;
      }
    }
    return { processed, skipped };
  }

  /** The sync worker. Each run records a heartbeat so the UI can report real worker status. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedCron() {
    await this.refreshConfig();
    if (!this.cfg.enabled || !this.cfg.autoSync) return;
    const due = await this.prisma.crmSyncRecord.findMany({
      where: this.dueSyncFilter(),
      take: 10,
      orderBy: { updatedAt: 'asc' },
    });
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    for (const row of due) {
      const outcome = await this.processQueuedSync(row.id).catch(() => 'FAILED' as const);
      if (!outcome) continue;
      processed += 1;
      if (outcome === 'SUCCESS') succeeded += 1;
      else if (outcome === 'FAILED' || outcome === 'RETRYING') failed += 1;
    }
    await this.writeSetting(ESPOCRM_WORKER_HEARTBEAT_KEY, {
      lastRunAt: new Date().toISOString(),
      processed,
      succeeded,
      failed,
    }).catch((err) => this.logger.warn(`Could not record CRM worker heartbeat: ${(err as Error)?.message || err}`));
  }
}
