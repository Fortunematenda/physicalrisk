import { BadGatewayException, BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EspoCrmClient, EspoCrmHttpError } from './espocrm.client';
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
  parentId: string | null;
  attemptsTracked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Attempt = {
  id: string;
  syncRecordId: string;
  attemptNumber: number;
  trigger: string | null;
  triggeredById: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  outcome: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  remoteEntityId: string | null;
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
    parentId: null,
    attemptsTracked: true,
    createdAt: at,
    ...partial,
    updatedAt: at,
  };
}

function attempt(partial: Partial<Attempt> & { syncRecordId: string; attemptNumber: number }): Attempt {
  return {
    id: `seed-${partial.syncRecordId}-${partial.attemptNumber}`,
    trigger: null,
    triggeredById: null,
    startedAt: null,
    completedAt: null,
    outcome: null,
    errorCode: null,
    errorMessage: null,
    remoteEntityId: null,
    ...partial,
  };
}

type Where = Record<string, unknown>;

function cmp(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function cond(value: unknown, c: unknown): boolean {
  if (c === undefined) return true;
  if (c === null) return value == null;
  if (c instanceof Date) return value instanceof Date && value.getTime() === c.getTime();
  if (typeof c !== 'object') return value === c;
  const o = c as Record<string, unknown>;
  const insensitive = o.mode === 'insensitive';
  return Object.entries(o).every(([op, arg]) => {
    switch (op) {
      case 'in':
        return (arg as unknown[]).includes(value);
      case 'not':
        return arg === null ? value != null : value !== arg;
      case 'gt':
        return value != null && cmp(value, arg) > 0;
      case 'gte':
        return value != null && cmp(value, arg) >= 0;
      case 'lt':
        return value != null && cmp(value, arg) < 0;
      case 'lte':
        return value != null && cmp(value, arg) <= 0;
      case 'contains': {
        if (typeof value !== 'string') return false;
        return insensitive
          ? value.toLowerCase().includes(String(arg).toLowerCase())
          : value.includes(String(arg));
      }
      case 'mode':
        return true;
      default:
        throw new Error(`fake prisma: unsupported operator ${op}`);
    }
  });
}

function matchesObj(obj: Record<string, unknown>, where: Where = {}, relations: Record<string, (o: Record<string, unknown>) => Record<string, unknown> | null> = {}): boolean {
  return Object.entries(where).every(([key, c]) => {
    if (key === 'OR') return (c as Where[]).some((w) => matchesObj(obj, w, relations));
    if (key === 'AND') return (c as Where[]).every((w) => matchesObj(obj, w, relations));
    if (relations[key]) {
      const related = relations[key](obj);
      return related ? matchesObj(related, c as Where) : false;
    }
    return cond(obj[key], c);
  });
}

function sortBy<T>(items: T[], orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>) {
  if (!orderBy) return items;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  return [...items].sort((a, b) => {
    for (const [field, dir] of keys) {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      // Postgres sorts nulls first in descending order; mirror it.
      if (av == null || bv == null) {
        if (av == null && bv == null) continue;
        return (av == null ? -1 : 1) * (dir === 'desc' ? 1 : -1);
      }
      const d = cmp(av, bv);
      if (d !== 0) return dir === 'desc' ? -d : d;
    }
    return 0;
  });
}

function fakePrisma(
  seed: {
    settings?: Record<string, unknown>;
    records?: Row[];
    attempts?: Attempt[];
    organisations?: Record<string, string>;
    assessments?: Record<string, string>;
  } = {},
) {
  const settings = new Map<string, unknown>(Object.entries(seed.settings ?? {}));
  const records: Row[] = [...(seed.records ?? [])];
  const attempts: Attempt[] = [...(seed.attempts ?? [])];
  const organisations = seed.organisations ?? {};
  const assessments = seed.assessments ?? {};
  let seq = 0;
  let clock = new Date('2026-10-28T08:00:00Z').getTime();
  const tick = () => new Date((clock += 1000));

  const organisationOf = (r: Record<string, unknown>) =>
    r.organisationId && organisations[r.organisationId as string] ? { name: organisations[r.organisationId as string] } : null;
  const assessmentOf = (r: Record<string, unknown>) =>
    r.assessmentId && assessments[r.assessmentId as string] ? { reference: assessments[r.assessmentId as string] } : null;
  const recordRelations = { organisation: organisationOf, assessment: assessmentOf };
  const withRelations = (r: Row) => ({
    ...r,
    organisation: organisationOf(r as unknown as Record<string, unknown>),
    assessment: assessmentOf(r as unknown as Record<string, unknown>),
  });
  const matches = (r: Row, where?: Where) => matchesObj(r as unknown as Record<string, unknown>, where, recordRelations);

  const applyData = (r: Record<string, unknown>, data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && 'increment' in (v as Record<string, unknown>)) {
        (r as Record<string, number>)[k] += (v as { increment: number }).increment;
      } else {
        r[k] = v;
      }
    }
  };
  return {
    settings,
    records,
    attempts,
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
      findFirst: vi.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) => {
        const r = sortBy(records.filter((x) => matches(x, where)), orderBy)[0];
        return r ? withRelations(r) : null;
      }),
      findMany: vi.fn(
        async ({ where, orderBy, skip = 0, take }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>; skip?: number; take?: number }) =>
          sortBy(records.filter((x) => matches(x, where)), orderBy)
            .slice(skip, take ? skip + take : undefined)
            .map(withRelations),
      ),
      count: vi.fn(async ({ where }: { where?: Where }) => records.filter((x) => matches(x, where)).length),
      groupBy: vi.fn(async ({ by, where, _max }: { by: string[]; where?: Where; _max?: Record<string, true> }) => {
        const groups = new Map<string, Row[]>();
        for (const r of records.filter((x) => matches(x, where))) {
          const key = JSON.stringify(by.map((f) => (r as unknown as Record<string, unknown>)[f]));
          groups.set(key, [...(groups.get(key) ?? []), r]);
        }
        return [...groups.values()].map((members) => {
          const first = members[0] as unknown as Record<string, unknown>;
          const max: Record<string, unknown> = {};
          for (const f of Object.keys(_max ?? {})) {
            max[f] = sortBy(members, { [f]: 'desc' })[0][f as keyof Row];
          }
          return { ...Object.fromEntries(by.map((f) => [f, first[f]])), _count: { _all: members.length }, _max: max };
        });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = records.find((x) => x.id === where.id)!;
        applyData(r as unknown as Record<string, unknown>, data);
        r.updatedAt = tick();
        return r;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const hit = records.filter((x) => matches(x, where));
        hit.forEach((r) => {
          applyData(r as unknown as Record<string, unknown>, data);
          r.updatedAt = tick();
        });
        return { count: hit.length };
      }),
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const at = tick();
        const r = row({ attemptCount: 0, ...data, id: `new-${(seq += 1)}`, createdAt: at, updatedAt: at } as Partial<Row> & { id: string });
        records.push(r);
        return r;
      }),
    },
    crmSyncAttempt: {
      create: vi.fn(async ({ data }: { data: Partial<Attempt> & { syncRecordId: string; attemptNumber: number } }) => {
        if (attempts.some((a) => a.syncRecordId === data.syncRecordId && a.attemptNumber === data.attemptNumber)) {
          throw new Error('Unique constraint failed on (syncRecordId, attemptNumber)');
        }
        const a: Attempt = {
          id: `att-${(seq += 1)}`,
          trigger: null,
          triggeredById: null,
          startedAt: null,
          completedAt: null,
          outcome: null,
          errorCode: null,
          errorMessage: null,
          remoteEntityId: null,
          ...data,
        };
        attempts.push(a);
        return a;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const a = attempts.find((x) => x.id === where.id)!;
        applyData(a as unknown as Record<string, unknown>, data);
        return a;
      }),
      findMany: vi.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) =>
        sortBy(attempts.filter((a) => matchesObj(a as unknown as Record<string, unknown>, where)), orderBy),
      ),
      findFirst: vi.fn(async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }) => {
        const a = sortBy(attempts.filter((x) => matchesObj(x as unknown as Record<string, unknown>, where)), orderBy)[0];
        if (!a) return null;
        const parent = records.find((r) => r.id === a.syncRecordId)!;
        return { ...a, syncRecord: withRelations(parent) };
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
    const failedAt = new Date('2026-10-27T08:00:00Z');
    const { service } = build({
      records: [row({ id: 'f1', status: 'FAILED', errorMessage: 'Duplicate lead jane@example.com' })],
      attempts: [attempt({ syncRecordId: 'f1', attemptNumber: 1, outcome: 'failed', completedAt: failedAt, errorMessage: 'Duplicate lead jane@example.com' })],
    });
    const status = await service.integrationStatus();
    expect(status.sync.state).toBe('errors');
    expect(status.sync.counts.failedUnresolved).toBe(1);
    expect(status.sync.lastFailureAt).toBe(failedAt.toISOString());
    expect(status.sync.lastFailureSummary).toBe('Duplicate lead [email]');
    expect(status.sync.lastFailureJob).toMatchObject({ recordType: 'Lead', currentStatus: 'failed' });
  });

  it('keeps an old failure historical, and reports its job recovered only when that job succeeded', async () => {
    const failedAt = new Date('2026-10-20T08:00:00Z');
    const { service } = build({
      // A later passing certificate check does not touch the job; only its successful retry does.
      settings: { [ESPOCRM_CONNECTION_TEST_KEY]: { at: new Date().toISOString(), success: true, checks: { sslValid: true } } },
      records: [row({ id: 'j1', status: 'SUCCESS', attemptCount: 2 })],
      attempts: [
        attempt({ syncRecordId: 'j1', attemptNumber: 1, outcome: 'failed', completedAt: failedAt, errorCode: 'SSL_FAILURE', errorMessage: 'EspoCRM SSL/TLS verification failed.' }),
        attempt({ syncRecordId: 'j1', attemptNumber: 2, outcome: 'success', completedAt: new Date('2026-10-21T08:00:00Z') }),
      ],
    });
    const status = await service.integrationStatus();
    expect(status.sync.lastFailureAt).toBe(failedAt.toISOString());
    expect(status.sync.lastFailureSummary).toBe('EspoCRM SSL/TLS verification failed.');
    expect(status.sync.lastFailureJob?.currentStatus).toBe('success');
    expect(status.checks.find((c) => c.id === 'tls')?.result).toBe('passed');
  });

  it('describes a worker run with no jobs factually, without implying delivery', async () => {
    const now = new Date('2026-10-28T10:00:00Z');
    const { service } = build({
      settings: {
        [ESPOCRM_WORKER_HEARTBEAT_KEY]: { lastRunAt: new Date(now.getTime() - 60_000).toISOString(), processed: 0, succeeded: 0, failed: 0 },
      },
    });
    const worker = (await service.integrationStatus(now)).checks.find((c) => c.id === 'worker')!;
    expect(worker.statusLabel).toBe('Running');
    expect(worker.detail).toMatch(/^Worker running — last run processed 0 jobs\./);
    expect(worker.detail).toMatch(/does not confirm delivery/);
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

type WriteLog = { writeLog: (input: Record<string, unknown>) => Promise<unknown> };

describe('EspoCRM sync jobs and attempts', () => {
  function opportunityJob(partial: Partial<Row> & { id: string }) {
    return row({
      status: 'PENDING',
      jobType: 'ESPO_SYNC_OPPORTUNITY',
      entityType: 'Opportunity',
      localEntityId: 'as1',
      assessmentId: 'as1',
      action: 'queue',
      attemptCount: 0,
      ...partial,
    });
  }

  it('groups every attempt and every record written during them under one job', async () => {
    const { service, prisma } = build({ records: [opportunityJob({ id: 'job' })], assessments: { as1: 'SCL-2026-000001' } });
    let call = 0;
    vi.spyOn(service, 'syncAssessment').mockImplementation(async () => {
      call += 1;
      const ok = call === 3;
      // The real handler writes its Opportunity record on every run, success or not.
      await (service as unknown as WriteLog).writeLog({
        entityType: 'Opportunity',
        localEntityId: 'as1',
        assessmentId: 'as1',
        jobType: 'ESPO_SYNC_OPPORTUNITY',
        action: 'update',
        payload: {},
        status: ok ? 'SUCCESS' : 'FAILED',
        remoteEntityId: ok ? 'opp1' : null,
      });
      if (!ok) throw new EspoCrmHttpError({ retryable: true, code: 'TIMEOUT', message: 'EspoCRM request timed out.' });
      return { ok: true, opportunityId: 'opp1' } as never;
    });

    expect(await service.processQueuedSync('job')).toBe('RETRYING');
    expect(await service.processQueuedSync('job')).toBe('RETRYING');
    expect(await service.processQueuedSync('job')).toBe('SUCCESS');

    const page = await service.listHistory({}, ADMIN);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: 'job',
      status: 'success',
      attempts: 3,
      reference: 'SCL-2026-000001',
      crmUrl: 'https://crm.example.com/#Opportunity/view/opp1',
      legacy: false,
    });

    const detail = await service.getHistoryJob('job', ADMIN);
    expect(detail.attempts.map((a) => [a.attemptNumber, a.trigger, a.outcome])).toEqual([
      [1, 'automatic', 'retrying'],
      [2, 'automatic', 'retrying'],
      [3, 'automatic', 'success'],
    ]);
    expect(detail.attempts[0].errorSummary).toBe('EspoCRM request timed out.');
    expect(detail.attempts[2].crmUrl).toBe('https://crm.example.com/#Opportunity/view/opp1');
    expect(detail.unrecordedAttempts).toBe(0);
    expect(detail.records).toHaveLength(3);
    expect(prisma.records.filter((r) => r.parentId === 'job')).toHaveLength(3);
  });

  it('never lets the worker pick up records written inside a job, so failures cannot multiply', async () => {
    const { service, prisma } = build({
      records: [
        opportunityJob({ id: 'job', status: 'FAILED', attemptCount: 5 }),
        row({ id: 'c1', parentId: 'job', status: 'FAILED', nextRetryAt: new Date('2026-01-01T00:00:00Z') }),
        row({ id: 'c2', parentId: 'job', status: 'RETRYING', nextRetryAt: null }),
      ],
    });
    const sync = vi.spyOn(service, 'syncLead');
    await service.retryFailedCron();
    expect(sync).not.toHaveBeenCalled();
    expect(prisma.settings.get(ESPOCRM_WORKER_HEARTBEAT_KEY)).toMatchObject({ processed: 0 });
    expect(prisma.records).toHaveLength(3);
  });

  it('records a direct sync as one job with one attempt, not as loose rows', async () => {
    const { service, prisma } = build({ organisations: { org1: 'Acme' } });
    (prisma as unknown as { organisation: unknown }).organisation = {
      findUnique: vi.fn(async () => ({ id: 'org1', name: 'Acme' })),
    };
    vi.spyOn(service as unknown as { syncAccount: () => Promise<string> }, 'syncAccount').mockImplementation(async () => {
      await (service as unknown as WriteLog).writeLog({
        organisationId: 'org1',
        entityType: 'Account',
        localEntityId: 'org1',
        remoteEntityId: 'acc1',
        jobType: 'ESPO_SYNC_ACCOUNT',
        action: 'update',
        payload: {},
        status: 'SUCCESS',
      });
      return 'acc1';
    });

    await service.syncOrganisation('org1', ADMIN);

    const jobs = prisma.records.filter((r) => r.parentId === null);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'SUCCESS', attemptCount: 1, remoteEntityId: 'acc1', organisationId: 'org1' });
    expect(prisma.records.filter((r) => r.parentId === jobs[0].id)).toHaveLength(1);
    expect(prisma.attempts).toEqual([expect.objectContaining({ attemptNumber: 1, trigger: 'manual', outcome: 'success' })]);
  });

  it('shows separate jobs for the same record separately, each with its own status', async () => {
    const { service } = build({
      records: [
        opportunityJob({ id: 'old', status: 'SUCCESS', attemptCount: 1, updatedAt: new Date('2026-10-20T08:00:00Z') }),
        opportunityJob({ id: 'new', status: 'FAILED', attemptCount: 2, errorMessage: 'EspoCRM is unreachable.', updatedAt: new Date('2026-10-27T08:00:00Z') }),
      ],
      assessments: { as1: 'SCL-2026-000001' },
    });
    const page = await service.listHistory({}, ADMIN);
    expect(page.items.map((i) => [i.id, i.status, i.attempts])).toEqual([
      ['new', 'failed', 2],
      ['old', 'success', 1],
    ]);
    expect(page.items.every((i) => i.reference === 'SCL-2026-000001')).toBe(true);
    expect(page.items[0]).toMatchObject({ canRetry: true, supersededAt: null });
    expect(page.items[1].supersededAt).toBe('2026-10-27T08:00:00.000Z');
  });

  it('lists legacy rows individually and says which attempts were never recorded', async () => {
    const legacy = (id: string, hour: number) =>
      row({
        id,
        status: 'FAILED',
        action: 'sync',
        localEntityId: 'lead-x',
        attemptCount: 4,
        attemptsTracked: false,
        errorMessage: 'EspoCRM returned an unrelated conflict (409).',
        updatedAt: new Date(`2026-10-0${hour}T08:00:00Z`),
      });
    const { service } = build({
      records: [legacy('l1', 1), legacy('l2', 2), legacy('l3', 3)],
      attempts: [attempt({ syncRecordId: 'l3', attemptNumber: 4, outcome: 'failed', completedAt: new Date('2026-10-03T08:00:00Z'), errorMessage: 'EspoCRM returned an unrelated conflict (409).' })],
    });
    const page = await service.listHistory({}, ADMIN);
    expect(page.total).toBe(3);
    expect(page.items.every((i) => i.legacy && i.attempts === 4)).toBe(true);
    // Only the newest can be retried; retrying an older copy would re-send the same record again.
    expect(page.items.filter((i) => i.canRetry).map((i) => i.id)).toEqual(['l3']);

    const detail = await service.getHistoryJob('l3', ADMIN);
    expect(detail.attempts).toEqual([expect.objectContaining({ attemptNumber: 4, outcome: 'failed', trigger: null, startedAt: null })]);
    expect(detail.unrecordedAttempts).toBe(3);
  });

  it('refuses job details for records that are not jobs', async () => {
    const { service } = build({ records: [row({ id: 'job' }), row({ id: 'child', parentId: 'job' })] });
    await expect(service.getHistoryJob('child', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getHistoryJob('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EspoCRM sync history filters and pagination', () => {
  function seed() {
    const records: Row[] = [];
    for (let i = 0; i < 23; i += 1) {
      const at = new Date(Date.UTC(2026, 9, 1 + i, 8));
      records.push(row({ id: `lead-${String(i).padStart(2, '0')}`, organisationId: i % 2 ? 'org-a' : 'org-b', status: i % 3 ? 'SUCCESS' : 'FAILED', updatedAt: at }));
      records.push(row({ id: `child-${i}`, parentId: `lead-${String(i).padStart(2, '0')}`, updatedAt: at }));
    }
    for (let i = 0; i < 5; i += 1) {
      records.push(row({ id: `acc-${i}`, entityType: 'Account', jobType: 'ESPO_SYNC_ACCOUNT', organisationId: 'org-a', updatedAt: new Date(Date.UTC(2026, 8, 1 + i)) }));
    }
    return records;
  }

  it('paginates parent jobs only, 10 per page by default, with the shown range', async () => {
    const { service } = build({ records: seed() });
    const first = await service.listHistory({}, ADMIN);
    expect(first).toMatchObject({ total: 28, page: 1, pageSize: 10, totalPages: 3, rangeStart: 1, rangeEnd: 10 });
    expect(first.items[0].id).toBe('lead-22');
    const last = await service.listHistory({ page: 3 }, ADMIN);
    expect(last).toMatchObject({ rangeStart: 21, rangeEnd: 28 });
    expect(last.items.every((i) => !i.id.startsWith('child'))).toBe(true);
    expect((await service.listHistory({ pageSize: 20 }, ADMIN)).pageSize).toBe(20);
    expect((await service.listHistory({ pageSize: 50 }, ADMIN)).items).toHaveLength(28);
    expect((await service.listHistory({ pageSize: 7 }, ADMIN)).pageSize).toBe(10);
  });

  it('breaks ties in latest activity by id, so pages are stable', async () => {
    const same = new Date('2026-10-27T08:00:00Z');
    const { service } = build({ records: ['a', 'c', 'b'].map((id) => row({ id, updatedAt: same })) });
    expect((await service.listHistory({}, ADMIN)).items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('applies status, record type, reference and date filters to both rows and totals', async () => {
    const { service } = build({ records: seed(), assessments: { as9: 'SCL-2026-000099' } });
    const failed = await service.listHistory({ status: 'failed' }, ADMIN);
    expect(failed.total).toBe(8);
    expect(failed.items.every((i) => i.status === 'failed')).toBe(true);

    const accounts = await service.listHistory({ recordType: 'Account' }, ADMIN);
    expect(accounts.total).toBe(5);
    expect(accounts.items.every((i) => i.recordType === 'Account')).toBe(true);

    const search = await service.listHistory({ search: 'LEAD-07' }, ADMIN);
    expect(search.items.map((i) => i.id)).toEqual(['lead-07']);
  });

  it('interprets date filters as whole SAST days', async () => {
    const { service } = build({
      records: [
        row({ id: 'late-26th-sast', updatedAt: new Date('2026-10-26T21:30:00Z') }),
        row({ id: 'early-27th-sast', updatedAt: new Date('2026-10-26T22:30:00Z') }),
        row({ id: 'end-27th-sast', updatedAt: new Date('2026-10-27T21:59:00Z') }),
        row({ id: 'early-28th-sast', updatedAt: new Date('2026-10-27T22:00:00Z') }),
      ],
    });
    const page = await service.listHistory({ dateFrom: '2026-10-27', dateTo: '2026-10-27' }, ADMIN);
    expect(page.items.map((i) => i.id).sort()).toEqual(['early-27th-sast', 'end-27th-sast']);
    expect(page.total).toBe(2);
  });

  it('rejects unknown or inconsistent filters', async () => {
    const { service } = build();
    await expect(service.listHistory({ recordType: 'Invoice' }, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listHistory({ dateFrom: '2026-13-01' }, ADMIN)).rejects.toThrow(/YYYY-MM-DD/);
    await expect(service.listHistory({ dateFrom: '2026-10-28', dateTo: '2026-10-01' }, ADMIN)).rejects.toThrow(/on or before/);
  });

  it('scopes rows and totals to one organisation when asked', async () => {
    const { service } = build({ records: seed() });
    const orgB = await service.listHistory({ organisationId: 'org-b', pageSize: 50 }, ADMIN);
    expect(orgB.total).toBe(12);
    expect(orgB.items).toHaveLength(12);
    const orgA = await service.listHistory({ organisationId: 'org-a', pageSize: 50 }, ADMIN);
    expect(orgA.total).toBe(16);
    expect(new Set([...orgA.items, ...orgB.items].map((i) => i.id)).size).toBe(28);
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
    await vi.waitFor(() => expect(prisma.records.find((r) => r.id === 'f1')?.status).toBe('SUCCESS'));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('confirms the retry as processing before the sync runs, and records it as a manual attempt', async () => {
    const { service, prisma } = build({ records: [retryable()] });
    let release!: () => void;
    vi.spyOn(service, 'syncLead').mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ ok: true, leadId: 'remote1' } as never))),
    );

    const confirmed = await service.retry('f1', ADMIN);
    expect(confirmed).toMatchObject({ id: 'f1', status: 'processing', canRetry: false });

    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await vi.waitFor(() => expect(prisma.records.find((r) => r.id === 'f1')?.status).toBe('SUCCESS'));
    expect(prisma.attempts).toEqual([
      expect.objectContaining({ syncRecordId: 'f1', attemptNumber: 2, trigger: 'manual', triggeredById: ADMIN.id, outcome: 'success', remoteEntityId: 'remote1' }),
    ]);
    expect(prisma.records.find((r) => r.id === 'f1')).toMatchObject({ attemptCount: 2, remoteEntityId: 'remote1' });
  });

  it('refuses analysts at the service as well as the route', async () => {
    const { service } = build({ records: [retryable()] });
    vi.spyOn(service, 'syncLead').mockResolvedValue({ leadId: 'x' } as never);
    const listed = await service.listHistory({}, ANALYST);
    expect(listed.items[0]).toMatchObject({ canRetry: false, retryNote: 'Only administrators can retry jobs.' });
  });

  it('refuses to retry a job superseded by a newer job for the same record', async () => {
    const { service } = build({
      records: [
        retryable(),
        row({ id: 'f2', status: 'FAILED', jobType: 'ESPO_SYNC_LEAD', localEntityId: 'lead-1', updatedAt: new Date('2026-10-27T09:00:00Z') }),
      ],
    });
    await expect(service.retry('f1', ADMIN)).rejects.toThrow(/newer sync/);
  });

  it('refuses to retry a record written inside a job on its own', async () => {
    const { service } = build({
      records: [row({ id: 'job', status: 'FAILED' }), row({ id: 'child', status: 'FAILED', parentId: 'job' })],
    });
    await expect(service.retry('child', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
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
