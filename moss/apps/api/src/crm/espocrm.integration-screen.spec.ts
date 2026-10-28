import { BadGatewayException, ConflictException, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EspoCrmClient } from './espocrm.client';
import {
  ESPOCRM_CONNECTION_TEST_KEY,
  ESPOCRM_WORKER_HEARTBEAT_KEY,
  EspoCrmService,
} from './espocrm.service';
import { ESPOCRM_SETTING_KEY } from './espocrm.config';

const ENV_KEY = 'env-secret-key-1234567890';
const STORED_KEY = 'stored-secret-key-0987654321';
const ADMIN = { id: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' };
const ANALYST = { id: 'analyst-1', email: 'analyst@example.com', role: 'ANALYST' };

type Row = {
  id: string;
  entityType: string;
  localEntityId: string;
  remoteEntityId: string | null;
  jobType: string | null;
  action: string | null;
  status: string;
  payload: unknown;
  errorMessage: string | null;
  errorCode: string | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastAttemptAt: Date | null;
  assessmentId: string | null;
  organisationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function row(partial: Partial<Row> & { id: string }): Row {
  const at = partial.updatedAt ?? new Date('2026-10-27T08:00:00Z');
  return {
    entityType: 'Lead',
    localEntityId: `local-${partial.id}`,
    remoteEntityId: null,
    jobType: 'ESPO_SYNC_LEAD',
    action: 'create',
    status: 'SUCCESS',
    payload: {},
    errorMessage: null,
    errorCode: null,
    attemptCount: 1,
    nextRetryAt: null,
    lastAttemptAt: at,
    assessmentId: null,
    organisationId: null,
    createdAt: at,
    ...partial,
    updatedAt: at,
  };
}

function cond(value: unknown, c: unknown): boolean {
  if (c === undefined) return true;
  if (c === null) return value === null;
  if (c instanceof Date) return value instanceof Date && value.getTime() === c.getTime();
  if (typeof c === 'object') {
    const o = c as Record<string, unknown>;
    if ('in' in o) return (o.in as unknown[]).includes(value);
    if ('not' in o) return o.not === null ? value != null : value !== o.not;
    if ('gte' in o) return value instanceof Date && value.getTime() >= (o.gte as Date).getTime();
    if ('lte' in o) return value instanceof Date && value.getTime() <= (o.lte as Date).getTime();
  }
  return value === c;
}

function matches(r: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, c]) => {
    if (key === 'OR') return (c as Record<string, unknown>[]).some((w) => matches(r, w));
    return cond((r as unknown as Record<string, unknown>)[key], c);
  });
}

function sortRows(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>) {
  if (!orderBy) return rows;
  const [[field, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const av = (a as unknown as Record<string, Date | null>)[field]?.getTime() ?? 0;
    const bv = (b as unknown as Record<string, Date | null>)[field]?.getTime() ?? 0;
    return dir === 'desc' ? bv - av : av - bv;
  });
}

function withRelations(r: Row) {
  return { ...r, organisation: null, assessment: null };
}

function fakePrisma(seed: { settings?: Record<string, unknown>; records?: Row[] } = {}) {
  const settings = new Map<string, unknown>(Object.entries(seed.settings ?? {}));
  const records: Row[] = [...(seed.records ?? [])];
  let seq = 0;
  const applyData = (r: Row, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
        (r as unknown as Record<string, number>)[k] += (v as { increment: number }).increment;
      } else {
        (r as unknown as Record<string, unknown>)[k] = v;
      }
    }
    r.updatedAt = new Date();
  };
  return {
    settings,
    records,
    systemSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null,
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        settings.set(where.key, settings.has(where.key) ? update.value : create.value);
        return { key: where.key, value: settings.get(where.key) };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => {
        const had = settings.delete(where.key);
        return { count: had ? 1 : 0 };
      }),
    },
    crmSyncRecord: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const r = records.find((x) => x.id === where.id);
        return r ? withRelations(r) : null;
      }),
      findFirst: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'> }) => {
        const r = sortRows(records.filter((x) => matches(x, where)), orderBy)[0];
        return r ? withRelations(r) : null;
      }),
      findMany: vi.fn(async ({ where, orderBy, skip = 0, take }: { where?: Record<string, unknown>; orderBy?: Record<string, 'asc' | 'desc'>; skip?: number; take?: number }) =>
        sortRows(records.filter((x) => matches(x, where)), orderBy)
          .slice(skip, take ? skip + take : undefined)
          .map(withRelations),
      ),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => records.filter((x) => matches(x, where)).length),
      groupBy: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        const counts = new Map<string, number>();
        for (const r of records.filter((x) => matches(x, where))) {
          counts.set(r.entityType, (counts.get(r.entityType) ?? 0) + 1);
        }
        return [...counts].map(([entityType, n]) => ({ entityType, _count: { _all: n } }));
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = records.find((x) => x.id === where.id)!;
        applyData(r, data);
        return r;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = records.filter((x) => matches(x, where));
        hit.forEach((r) => applyData(r, data));
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const r = row({ ...data, id: `new-${(seq += 1)}` } as Partial<Row> & { id: string });
        records.push(r);
        return r;
      }),
    },
    user: { findFirst: vi.fn(async () => ({ id: ADMIN.id, email: ADMIN.email, systemRole: 'SUPER_ADMIN' })) },
  };
}

function config(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    NODE_ENV: 'production',
    ESPOCRM_ENABLED: 'true',
    ESPOCRM_BASE_URL: 'https://crm.example.com',
    ESPOCRM_API_KEY: ENV_KEY,
    ESPOCRM_AUTO_SYNC: 'true',
    ESPOCRM_VERIFY_SSL: 'true',
    ...overrides,
  };
  return { get: <T = string>(key: string) => values[key] as T | undefined };
}

function build(seed?: Parameters<typeof fakePrisma>[0], env?: Record<string, string>) {
  const prisma = fakePrisma(seed);
  const audit = { record: vi.fn(async () => undefined) };
  const service = new EspoCrmService(config(env) as never, prisma as never, audit as never);
  return { prisma, audit, service };
}

const logged: string[] = [];

beforeEach(() => {
  logged.length = 0;
  for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
    vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EspoCRM settings', () => {
  it('never returns the API key, only whether one is configured', async () => {
    const { service } = build();
    const settings = await service.getSettings();
    expect(settings.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(settings)).not.toContain(ENV_KEY);
    expect(Object.keys(settings)).not.toContain('apiKey');
  });

  it('keeps the stored key when the replacement field is blank or whitespace', async () => {
    const { service, prisma, audit } = build({
      settings: { [ESPOCRM_SETTING_KEY]: { enabled: true, baseUrl: 'https://crm.example.com', apiKey: STORED_KEY } },
    });
    for (const apiKey of ['', '   ', undefined]) {
      const result = await service.updateConnectionSettings({ enabled: true, apiKey }, ADMIN);
      expect(JSON.stringify(result)).not.toContain(STORED_KEY);
    }
    expect((prisma.settings.get(ESPOCRM_SETTING_KEY) as { apiKey: string }).apiKey).toBe(STORED_KEY);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(STORED_KEY);
  });

  it('replaces the key only when a new value is supplied, without echoing it', async () => {
    const { service, prisma, audit } = build({
      settings: { [ESPOCRM_SETTING_KEY]: { apiKey: STORED_KEY } },
    });
    const result = await service.updateConnectionSettings({ apiKey: '  new-key-abcdef  ' }, ADMIN);
    expect((prisma.settings.get(ESPOCRM_SETTING_KEY) as { apiKey: string }).apiKey).toBe('new-key-abcdef');
    expect(JSON.stringify(result)).not.toContain('new-key-abcdef');
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('new-key-abcdef');
  });

  it('clears the previous connection test when connection settings change', async () => {
    const { service, prisma } = build({
      settings: { [ESPOCRM_CONNECTION_TEST_KEY]: { at: new Date().toISOString(), success: true, checks: {} } },
    });
    await service.updateConnectionSettings({ baseUrl: 'https://crm2.example.com' }, ADMIN);
    expect(prisma.settings.has(ESPOCRM_CONNECTION_TEST_KEY)).toBe(false);
  });
});

describe('EspoCRM connection test', () => {
  it('records the check time but never changes the last successful sync', async () => {
    const synced = new Date('2026-10-20T09:00:00Z');
    const { service, prisma } = build({ records: [row({ id: 's1', status: 'SUCCESS', updatedAt: synced })] });
    vi.spyOn(EspoCrmClient.prototype, 'testConnection').mockResolvedValue({
      success: true,
      statusCode: 200,
      responseTimeMs: 42,
      authenticatedUserName: 'integration-bot',
      message: 'Authenticated as integration-bot',
    });

    const before = await service.integrationStatus();
    const result = await service.testConnection(ADMIN);
    const after = await service.integrationStatus();

    expect(result).toMatchObject({ success: true, message: 'Connection test passed', responseTimeMs: 42 });
    expect(JSON.stringify(result)).not.toContain('integration-bot');
    expect(JSON.stringify(after)).not.toContain('integration-bot');
    expect(before.sync.lastSuccessAt).toBe(synced.toISOString());
    expect(after.sync.lastSuccessAt).toBe(synced.toISOString());
    expect(prisma.records).toHaveLength(1);
    expect(after.connection.state).toBe('connected');
    expect(after.connection.checkedAt).toBe(result.checkedAt);
    expect(after.checks.find((c) => c.id === 'api')).toMatchObject({ result: 'passed', checkedAt: result.checkedAt });
  });

  it('persists a sanitised failure and reports individual checks', async () => {
    const { service } = build();
    vi.spyOn(EspoCrmClient.prototype, 'testConnection').mockResolvedValue({
      success: false,
      statusCode: 401,
      responseTimeMs: 10,
      message: `EspoCRM authentication failed (401). key=${ENV_KEY}`,
      errorCode: 'AUTH_FAILED',
    });

    const failure = await service.testConnection(ADMIN).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(BadGatewayException);
    expect((failure as Error).message).toMatch(/rejected the integration API key/);
    expect((failure as Error).message).not.toContain(ENV_KEY);

    const status = await service.integrationStatus();
    expect(status.connection.state).toBe('failed');
    const byId = Object.fromEntries(status.checks.map((c) => [c.id, c.result]));
    expect(byId).toEqual({ api: 'passed', auth: 'failed', tls: 'passed', worker: 'not_checked' });
  });

  it('never writes the API key to logs, audit events or responses', async () => {
    const { service, audit } = build({ records: [row({ id: 'f1', status: 'FAILED', errorMessage: 'boom' })] });
    vi.spyOn(EspoCrmClient.prototype, 'testConnection').mockResolvedValue({
      success: false,
      responseTimeMs: 5,
      message: 'unreachable',
      errorCode: 'NETWORK_ERROR',
    });
    const responses = [
      await service.getSettings(),
      await service.integrationStatus(),
      await service.access(),
      await service.listHistory({}, ADMIN),
      await service.testConnection(ADMIN).catch((e: Error) => e.message),
    ];
    const everything = JSON.stringify([responses, audit.record.mock.calls, logged]);
    expect(everything).not.toContain(ENV_KEY);
  });
});

describe('EspoCRM health states', () => {
  it('reports unknown rather than healthy before any evidence exists', async () => {
    const { service } = build();
    const status = await service.integrationStatus();
    expect(status.connection.state).toBe('untested');
    expect(status.checks.map((c) => c.result)).toEqual(['not_checked', 'not_checked', 'not_checked', 'not_checked']);
    expect(status.worker.state).toBe('not_recorded');
    expect(status.sync.state).toBe('unknown');
    expect(status.sync.lastSuccessAt).toBeNull();
  });

  it('flags a stale worker and does not call the sync idle', async () => {
    const now = new Date('2026-10-28T10:00:00Z');
    const { service } = build({
      settings: {
        [ESPOCRM_WORKER_HEARTBEAT_KEY]: {
          lastRunAt: new Date(now.getTime() - 45 * 60_000).toISOString(),
          processed: 0,
          succeeded: 0,
          failed: 0,
        },
      },
    });
    const status = await service.integrationStatus(now);
    expect(status.worker.state).toBe('stale');
    expect(status.checks.find((c) => c.id === 'worker')?.result).toBe('failed');
    expect(status.sync.state).toBe('unknown');
  });

  it('treats an old last-sync time with a recent worker run as idle, not failed', async () => {
    const now = new Date('2026-10-28T10:00:00Z');
    const { service } = build({
      records: [row({ id: 'old', status: 'SUCCESS', updatedAt: new Date('2026-09-01T00:00:00Z') })],
      settings: {
        [ESPOCRM_WORKER_HEARTBEAT_KEY]: { lastRunAt: new Date(now.getTime() - 5 * 60_000).toISOString(), processed: 0, succeeded: 0, failed: 0 },
      },
    });
    const status = await service.integrationStatus(now);
    expect(status.sync.state).toBe('idle');
    expect(status.checks.find((c) => c.id === 'worker')?.result).toBe('passed');
  });

  it('reports unresolved failures with a sanitised summary', async () => {
    const { service } = build({
      records: [row({ id: 'f1', status: 'FAILED', errorMessage: 'Duplicate lead jane@example.com' })],
    });
    const status = await service.integrationStatus();
    expect(status.sync.state).toBe('errors');
    expect(status.sync.counts.failedUnresolved).toBe(1);
    expect(status.sync.lastFailureSummary).not.toContain('jane@example.com');
  });

  it('marks TLS as not checked when verification is off rather than passed', async () => {
    const { service } = build(undefined, { ESPOCRM_VERIFY_SSL: 'false' });
    vi.spyOn(EspoCrmClient.prototype, 'testConnection').mockResolvedValue({ success: true, responseTimeMs: 1, message: 'ok' });
    await service.testConnection(ADMIN);
    const status = await service.integrationStatus();
    expect(status.checks.find((c) => c.id === 'tls')?.result).toBe('not_checked');
  });

  it('disables the CRM link with an explanation for unsafe URLs', async () => {
    const { service } = build(undefined, { ESPOCRM_BASE_URL: '' });
    expect(await service.access()).toMatchObject({ available: false, url: null, reason: 'not_configured' });
    const status = await service.integrationStatus();
    expect(status.access.available).toBe(false);
    expect(status.access.message).toBeTruthy();
  });
});

describe('EspoCRM sync history', () => {
  it('returns safe rows without payloads and only offers retry to administrators', async () => {
    const { service } = build({
      records: [
        row({ id: 'ok', status: 'SUCCESS', entityType: 'Opportunity', jobType: 'ESPO_SYNC_OPPORTUNITY', remoteEntityId: 'abc123', assessmentId: 'as1', payload: { secret: 'x' } }),
        row({ id: 'bad', status: 'FAILED', errorMessage: 'Rejected for bob@example.com' }),
      ],
    });
    const asAdmin = await service.listHistory({}, ADMIN);
    const asAnalyst = await service.listHistory({}, ANALYST);
    const ok = asAdmin.items.find((i) => i.id === 'ok')!;
    const bad = asAdmin.items.find((i) => i.id === 'bad')!;
    expect(ok).not.toHaveProperty('payload');
    expect(ok.crmUrl).toBe('https://crm.example.com/#Opportunity/view/abc123');
    expect(ok.canRetry).toBe(false);
    expect(bad.status).toBe('failed');
    expect(bad.errorSummary).not.toContain('bob@example.com');
    expect(bad.canRetry).toBe(true);
    expect(asAnalyst.items.every((i) => !i.canRetry)).toBe(true);
  });

  it('paginates and rejects unknown status filters', async () => {
    const records = Array.from({ length: 25 }, (_, i) => row({ id: `r${i}` }));
    const { service } = build({ records });
    const page2 = await service.listHistory({ page: 2, pageSize: 10 }, ADMIN);
    expect(page2).toMatchObject({ total: 25, page: 2, pageSize: 10, totalPages: 3 });
    expect(page2.items).toHaveLength(10);
    await expect(service.listHistory({ status: 'bogus' }, ADMIN)).rejects.toThrow(/Unknown status/);
  });
});

describe('EspoCRM retry', () => {
  function retryable() {
    return row({ id: 'f1', status: 'FAILED', jobType: 'ESPO_SYNC_LEAD', localEntityId: 'lead-1', errorMessage: 'timeout' });
  }

  it('refuses jobs that are not failed', async () => {
    const { service } = build({ records: [row({ id: 's1', status: 'SUCCESS' })] });
    await expect(service.retry('s1', ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses when the same record is already queued', async () => {
    const { service } = build({
      records: [retryable(), row({ id: 'q1', status: 'PENDING', jobType: 'ESPO_SYNC_LEAD', localEntityId: 'lead-1' })],
    });
    await expect(service.retry('f1', ADMIN)).rejects.toThrow(/already queued/);
  });

  it('runs a retry once even when requested twice at the same time', async () => {
    const { service, prisma } = build({ records: [retryable()] });
    const sync = vi.spyOn(service, 'syncLead').mockResolvedValue({ leadId: 'remote-1' } as never);

    const results = await Promise.allSettled([service.retry('f1', ADMIN), service.retry('f1', ADMIN)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(prisma.records.find((r) => r.id === 'f1')?.status).toBe('SUCCESS');
  });

  it('does not re-run a job another worker has already claimed', async () => {
    const { service } = build({ records: [row({ id: 'p1', status: 'PROCESSING' })] });
    const sync = vi.spyOn(service, 'syncLead');
    expect(await service.processQueuedSync('p1')).toBeNull();
    expect(sync).not.toHaveBeenCalled();
  });

  it('records a worker heartbeat each run, so worker status comes from evidence', async () => {
    const { service, prisma } = build({
      records: [row({ id: 'q1', status: 'PENDING', jobType: 'ESPO_SYNC_LEAD', localEntityId: 'lead-9' })],
    });
    vi.spyOn(service, 'syncLead').mockResolvedValue({ leadId: 'remote-9' } as never);
    await service.retryFailedCron();
    expect(prisma.settings.get(ESPOCRM_WORKER_HEARTBEAT_KEY)).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    const status = await service.integrationStatus();
    expect(status.worker.state).toBe('running');
  });
});
