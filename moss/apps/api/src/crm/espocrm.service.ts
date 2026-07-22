import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { INTERNAL_ROLES } from '../common/roles';
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
  mapRiskPriority,
  nextRetryAt,
  normalizeEspoPhone,
  todayIso,
} from './espocrm.mapper';
import type {
  EspoConnectionTestResult,
  EspoIntegrationStatus,
  EspoJobType,
  EspoLogQuery,
} from './espocrm.types';

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
  private lastHealthCheck: Date | null = null;
  private lastHealthOk: boolean | null = null;
  private lastHealthAuth: boolean | null = null;

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
      select: { organisationId: true },
    });
    if (!assessment) throw new NotFoundException('Assessment not found.');
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

  private publicUrl() {
    return (this.config.get<string>('PUBLIC_URL') || this.config.get<string>('WEB_URL') || '').replace(
      /\/$/,
      '',
    );
  }

  private buildStatusSnapshot() {
    return {
      enabled: this.cfg.enabled,
      configured: Boolean(this.cfg.baseUrl && this.cfg.apiKey),
      baseUrlConfigured: Boolean(this.cfg.baseUrl),
      apiKeyConfigured: Boolean(this.cfg.apiKey),
      baseUrl: this.cfg.baseUrl || null,
      mode: 'Outbound REST API using a dedicated EspoCRM API User',
      source: this.cfg.baseUrl || this.cfg.apiKey ? 'merged' : 'none',
    };
  }

  async status() {
    await this.refreshConfig();
    return this.buildStatusSnapshot();
  }

  async updateConnectionSettings(
    input: { enabled?: boolean; baseUrl?: string; apiKey?: string },
    user: AuthUser,
  ) {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: ESPOCRM_SETTING_KEY } });
    const existing = parseEspoStoredConnection(row?.value);
    const env = loadEspoCrmConfig(this.config);
    const nodeEnv = this.config.get<string>('NODE_ENV') || 'development';

    const next: EspoCrmStoredConnection = { ...existing };
    if (typeof input.enabled === 'boolean') next.enabled = input.enabled;
    if (typeof input.baseUrl === 'string') {
      const trimmed = input.baseUrl.trim().replace(/\/+$/, '');
      if (trimmed) validateEspoBaseUrl(trimmed, nodeEnv);
      next.baseUrl = trimmed;
    }
    if (typeof input.apiKey === 'string' && input.apiKey.length > 0) {
      next.apiKey = input.apiKey;
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
        apiKeyUpdated: typeof input.apiKey === 'string' && input.apiKey.length > 0,
      },
    });

    await this.refreshConfig();
    return this.integrationStatus();
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

  async integrationStatus(): Promise<EspoIntegrationStatus> {
    await this.refreshConfig();
    const lastSuccess = await this.prisma.crmSyncRecord.findFirst({
      where: { status: { in: ['SUCCESS', 'SYNCED'] } },
      orderBy: { updatedAt: 'desc' },
    });
    const lastFailed = await this.prisma.crmSyncRecord.findFirst({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
    });
    const [
      failedCount,
      pendingCount,
      retryingCount,
      successCount,
      accountCount,
      opportunityCount,
      contactCount,
      taskCount,
      leadCount,
    ] = await Promise.all([
      this.prisma.crmSyncRecord.count({ where: { status: 'FAILED' } }),
      this.prisma.crmSyncRecord.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      this.prisma.crmSyncRecord.count({ where: { status: 'RETRYING' } }),
      this.prisma.crmSyncRecord.count({ where: { status: { in: ['SUCCESS', 'SYNCED'] } } }),
      this.prisma.crmSyncRecord.count({
        where: { entityType: 'Account', status: { in: ['SUCCESS', 'SYNCED'] } },
      }),
      this.prisma.crmSyncRecord.count({
        where: { entityType: 'Opportunity', status: { in: ['SUCCESS', 'SYNCED'] } },
      }),
      this.prisma.crmSyncRecord.count({
        where: { entityType: 'Contact', status: { in: ['SUCCESS', 'SYNCED'] } },
      }),
      this.prisma.crmSyncRecord.count({
        where: { entityType: 'Task', status: { in: ['SUCCESS', 'SYNCED'] } },
      }),
      this.prisma.crmSyncRecord.count({
        where: { entityType: 'Lead', status: { in: ['SUCCESS', 'SYNCED'] } },
      }),
    ]);

    const configured = Boolean(this.cfg.baseUrl && this.cfg.apiKey);
    const connected = this.cfg.enabled && configured && this.lastHealthOk !== false;

    const recentAlerts = await this.prisma.crmSyncRecord.findMany({
      where: { status: { in: ['FAILED', 'RETRYING', 'SUCCESS', 'SYNCED'] } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        entityType: true,
        status: true,
        errorMessage: true,
        updatedAt: true,
        localEntityId: true,
      },
    });

    const entityTotals = {
      Account: accountCount,
      Contact: contactCount,
      Lead: leadCount,
      Opportunity: opportunityCount,
      Task: taskCount,
    };
    const maxEntity = Math.max(1, ...Object.values(entityTotals));

    let healthMessage = 'Integration disabled';
    if (this.cfg.enabled && !configured) healthMessage = 'Enabled but missing base URL or API key';
    else if (this.cfg.enabled && failedCount > 0) healthMessage = `${failedCount} failed sync job(s) need attention`;
    else if (this.cfg.enabled && pendingCount > 0) healthMessage = `${pendingCount} job(s) pending`;
    else if (this.cfg.enabled) healthMessage = 'Outbound sync ready';

    return {
      ...this.buildStatusSnapshot(),
      connected,
      verifySsl: this.cfg.verifySsl,
      timeoutSeconds: Math.round(this.cfg.timeoutMs / 1000),
      autoSync: this.cfg.enabled && this.cfg.autoSync,
      syncDirection: 'Outbound (MOSS → EspoCRM)',
      lastSuccessfulSync: lastSuccess?.updatedAt || null,
      lastFailedSync: lastFailed?.updatedAt || null,
      lastFailedError: lastFailed?.errorMessage || null,
      failedCount,
      pendingCount,
      retryingCount,
      successCount,
      accountsSynced: accountCount,
      opportunitiesSynced: opportunityCount,
      contactsSynced: contactCount,
      tasksSynced: taskCount,
      leadsSynced: leadCount,
      // Live connection checks only (matches Settings → Connection Health list).
      // Sync backlog is surfaced via failedCount/pendingCount, not this gauge.
      healthScore: (() => {
        const apiReachable = configured && this.lastHealthOk !== false;
        const authValid = Boolean(this.cfg.apiKey) && this.lastHealthAuth !== false;
        const queueWorkerRunning = this.cfg.enabled;
        const sslValid = this.cfg.verifySsl ? this.lastHealthOk !== false : true;
        const passed = [apiReachable, authValid, queueWorkerRunning, sslValid].filter(Boolean).length;
        return Math.round((passed / 4) * 100);
      })(),
      healthMessage,
      lastHealthCheck: this.lastHealthCheck,
      apiReachable: this.lastHealthOk,
      authValid: this.lastHealthAuth,
      sslValid: this.cfg.verifySsl ? this.lastHealthOk : true,
      queueWorkerRunning: this.cfg.enabled,
      recentAlerts,
      entityBreakdown: Object.entries(entityTotals).map(([name, value]) => ({
        name,
        value,
        pct: Math.round((value / maxEntity) * 100),
      })),
    };
  }

  async testConnection(user?: AuthUser): Promise<EspoConnectionTestResult> {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const client = new EspoCrmClient(this.cfg);
    const result = await client.testConnection();
    this.lastHealthCheck = new Date();
    this.lastHealthOk = result.success;
    this.lastHealthAuth = result.success && result.errorCode !== 'AUTH_FAILED';
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
      throw new BadGatewayException(result.message);
    }
    return result;
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
      },
    });
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
  async syncLeadFromContactForm(leadId: string) {
    await this.refreshConfig();
    if (!this.cfg.enabled) {
      return { synced: false, reason: 'disabled' as const };
    }
    if (!this.cfg.baseUrl || !this.cfg.apiKey) {
      return { synced: false, reason: 'not_configured' as const };
    }

    try {
      const result = await this.syncLead(leadId);
      return { synced: true, leadId: result.leadId };
    } catch (error: unknown) {
      this.logger.warn(
        `Immediate EspoCRM lead sync failed for ${leadId}; queueing retry: ${(error as Error)?.message || error}`,
      );
      // Force a retry job even if AUTO_SYNC is off — contact form must eventually create the lead
      const existing = await this.prisma.crmSyncRecord.findFirst({
        where: {
          jobType: 'ESPO_SYNC_LEAD',
          localEntityId: leadId,
          status: { in: ['PENDING', 'PROCESSING', 'RETRYING'] },
        },
      });
      if (!existing) {
        const row = await this.prisma.crmSyncRecord.create({
          data: {
            entityType: 'Lead',
            localEntityId: leadId,
            jobType: 'ESPO_SYNC_LEAD',
            action: 'queue',
            payload: {
              jobType: 'ESPO_SYNC_LEAD',
              queuedAt: new Date().toISOString(),
              reason: 'contact_form_retry',
            },
            status: 'PENDING',
            lastAttemptAt: new Date(),
            nextRetryAt: new Date(Date.now() + 60_000),
          },
        });
        void this.processQueuedSync(row.id).catch(() => undefined);
      }
      return { synced: false, reason: 'queued_retry' as const };
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

  async processQueuedSync(syncId: string) {
    const row = await this.prisma.crmSyncRecord.findUnique({ where: { id: syncId } });
    if (!row) return;

    await this.prisma.crmSyncRecord.update({
      where: { id: syncId },
      data: { status: 'PROCESSING', lastAttemptAt: new Date() },
    });

    const systemUser = await this.prisma.user.findFirst({
      where: { systemRole: 'SUPER_ADMIN', isActive: true },
    });
    const authUser: AuthUser | null = systemUser
      ? { id: systemUser.id, email: systemUser.email, role: String(systemUser.systemRole) }
      : null;

    try {
      const jobType = (row.jobType ||
        (row.entityType === 'Opportunity'
          ? 'ESPO_SYNC_OPPORTUNITY'
          : row.entityType === 'Lead'
            ? 'ESPO_SYNC_LEAD'
            : row.entityType === 'Account'
              ? 'ESPO_SYNC_ACCOUNT'
              : null)) as EspoJobType | null;

      if (jobType === 'ESPO_SYNC_LEAD') {
        await this.syncLead(row.localEntityId, authUser || undefined);
      } else if (jobType === 'ESPO_SYNC_ACCOUNT') {
        await this.syncOrganisation(row.localEntityId, authUser || undefined);
      } else if (jobType === 'ESPO_SYNC_CONTACT') {
        await this.syncContactByLeadId(row.localEntityId, authUser || undefined);
      } else if (jobType === 'ESPO_UPDATE_REPORT' && row.assessmentId) {
        await this.updateReportOnOpportunity(row.assessmentId, authUser || undefined);
      } else if (row.assessmentId || jobType === 'ESPO_SYNC_OPPORTUNITY') {
        if (!authUser) throw new BadRequestException('System user required for CRM sync.');
        await this.syncAssessment(row.assessmentId || row.localEntityId, authUser, {
          skipAccessCheck: true,
        });
      } else {
        throw new BadRequestException(`Unsupported CRM job for ${row.entityType}`);
      }

      await this.prisma.crmSyncRecord.update({
        where: { id: syncId },
        data: {
          status: 'SUCCESS',
          errorMessage: null,
          errorCode: null,
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 },
          nextRetryAt: null,
        },
      });
    } catch (error: unknown) {
      const safe = this.asError(error);
      const attemptCount = (row.attemptCount || 0) + 1;
      const retryable = safe.retryable && attemptCount < ESPO_MAX_ATTEMPTS;
      await this.prisma.crmSyncRecord.update({
        where: { id: syncId },
        data: {
          status: retryable ? 'RETRYING' : 'FAILED',
          errorMessage: safe.message,
          errorCode: safe.code,
          lastAttemptAt: new Date(),
          attemptCount,
          nextRetryAt: nextRetryAt(attemptCount, retryable),
        },
      });
      await this.audit.record({
        userId: authUser?.id,
        action: 'ESPOCRM_SYNC_FAILED',
        entityType: row.entityType,
        entityId: row.localEntityId,
        metadata: { syncId, code: safe.code, jobType: row.jobType },
      });
    }
  }

  async syncOrganisation(organisationId: string, user?: AuthUser) {
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
    const contactId = await this.syncContact(lead, accountId);
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

    let found: { id: string } | null = null;
    try { found = await client.findByEmail('Lead', input.email); } catch { found = null; }
    let leadId: string;
    if (found?.id) {
      leadId = found.id;
      await client.put(`/Lead/${leadId}`, base);
    } else {
      const created = await client.post('/Lead', { ...base, description: input.description });
      leadId = created.data.id;
    }
    await client.post('/Note', {
      parentType: 'Lead',
      parentId: leadId,
      type: 'Post',
      post: `Website contact enquiry – Book a MOSS Assessment\n\n${input.description}`,
    });
    return { leadId, action: found?.id ? 'update' : 'create' };
  }

  async syncLead(leadId: string, user?: AuthUser) {
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    const client = await this.client();
    const lead = await this.prisma.publicLead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found.');

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
    const payload: Record<string, unknown> = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      name: `${lead.firstName} ${lead.lastName}`.trim(),
      emailAddress: lead.email,
      accountName: lead.organisationName,
      status: espStatus,
      source: espSource,
      description: [
        `MOSS lead ID: ${lead.id}`,
        assessment?.reference ? `Assessment reference: ${assessment.reference}` : null,
        lead.industry ? `Industry: ${lead.industry}` : null,
        lead.source ? `MOSS source: ${lead.source}` : null,
        lead.phone && !espPhone ? `Phone (raw): ${lead.phone}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    };
    if (espPhone) {
      payload.phoneNumber = espPhone;
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

    const createLead = async () => {
      try {
        return await client.post('/Lead', payload);
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

    try {
      let remoteId = lead.espocrmLeadId;
      let action = 'update';

      if (remoteId) {
        await client.put(`/Lead/${remoteId}`, payload);
      } else {
        let byEmail: { id: string } | null = null;
        try {
          byEmail = await client.findByEmail('Lead', lead.email);
        } catch {
          byEmail = null;
        }
        if (byEmail?.id) {
          remoteId = byEmail.id;
          await client.put(`/Lead/${remoteId}`, payload);
        } else {
          action = 'create';
          const created = await createLead();
          remoteId = created.data.id;
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
      const safe = this.asError(error);
      await this.writeLog({
        organisationId: lead.organisationId,
        assessmentId: lead.assessmentId,
        entityType: 'Lead',
        localEntityId: lead.id,
        jobType: 'ESPO_SYNC_LEAD',
        action: 'sync',
        payload,
        status: 'FAILED',
        errorMessage: safe.message,
        errorCode: safe.code,
      });
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

    const payload: Record<string, unknown> = {
      name: organisation.name,
      website: organisation.website || null,
      emailAddress: organisation.primaryEmail || null,
      industry: organisation.industry || null,
      description: [
        `MOSS organisation ID: ${organisation.id}`,
        `Industry: ${organisation.industry || 'Not specified'}`,
        `Number of sites: ${sites ?? 'n/a'}`,
        `Annual security contract value: ${contractValue ?? 'n/a'}`,
      ].join('\n'),
      assignedUserId: this.cfg.assignedUserId,
      [this.cfg.accountMossIdField]: organisation.id,
    };
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
      const safe = this.asError(error);
      await this.writeLog({
        organisationId: lead.organisationId,
        assessmentId: lead.assessmentId,
        entityType: 'Contact',
        localEntityId: lead.id,
        jobType: 'ESPO_SYNC_CONTACT',
        action: 'sync',
        payload,
        status: 'FAILED',
        errorMessage: safe.message,
        errorCode: safe.code,
      });
      return null;
    }
  }

  async syncAssessment(
    assessmentId: string,
    user: AuthUser,
    opts?: { skipAccessCheck?: boolean },
  ) {
    if (!['SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES'].includes(user.role)) {
      throw new ForbiddenException('Internal sales or review permission required.');
    }
    await this.refreshConfig();
    assertEspoConfigured(this.cfg);
    if (!opts?.skipAccessCheck) {
      await this.checkAssessmentAccess(assessmentId, user);
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
      const safe = this.asError(error);
      await this.prisma.crmSyncRecord.update({
        where: { id: sync.id },
        data: {
          status: safe.retryable ? 'RETRYING' : 'FAILED',
          errorMessage: safe.message,
          errorCode: safe.code,
          nextRetryAt: nextRetryAt(1, safe.retryable),
        },
      });
      throw error instanceof EspoCrmHttpError
        ? new BadGatewayException(safe.message)
        : error;
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
      where: {
        status: { in: ['FAILED', 'PENDING', 'RETRYING'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
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

  async retry(id: string, user?: AuthUser) {
    const row = await this.prisma.crmSyncRecord.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Sync record not found.');
    await this.prisma.crmSyncRecord.update({
      where: { id },
      data: { status: 'PENDING', errorMessage: null, errorCode: null, nextRetryAt: null },
    });
    await this.audit.record({
      userId: user?.id,
      action: 'ESPOCRM_SYNC_RETRIED',
      entityType: row.entityType,
      entityId: row.localEntityId,
      metadata: { syncId: id },
    });
    await this.processQueuedSync(id);
    return this.prisma.crmSyncRecord.findUnique({ where: { id } });
  }

  async retryFailed(user?: AuthUser) {
    const failed = await this.prisma.crmSyncRecord.findMany({
      where: { status: { in: ['FAILED', 'RETRYING'] } },
      take: 50,
      orderBy: { updatedAt: 'asc' },
    });
    let processed = 0;
    for (const row of failed) {
      await this.retry(row.id, user);
      processed += 1;
    }
    return { processed };
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailedCron() {
    await this.refreshConfig();
    if (!this.cfg.enabled || !this.cfg.autoSync) return;
    const due = await this.prisma.crmSyncRecord.findMany({
      where: {
        status: { in: ['FAILED', 'PENDING', 'RETRYING'] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
      },
      take: 10,
      orderBy: { updatedAt: 'asc' },
    });
    for (const row of due) {
      await this.processQueuedSync(row.id).catch(() => undefined);
    }
  }
}
