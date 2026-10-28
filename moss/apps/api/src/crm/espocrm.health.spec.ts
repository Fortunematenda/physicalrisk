import { describe, expect, it } from 'vitest';
import {
  classifyConnectionTest,
  countUnresolvedFailures,
  crmRecordUrl,
  historyStatus,
  isRetryEligible,
  publicConnectionMessage,
  readableEspoError,
  resolveConnectionState,
  resolveCrmAccess,
  resolveCrmAppUrl,
  resolveSyncState,
  resolveWorkerState,
  sanitizeErrorSummary,
  sastDayBounds,
  syncRecordKey,
} from './espocrm.health';

describe('EspoCRM connection health', () => {
  it('reports unknown — never connected — before any connection test', () => {
    expect(resolveConnectionState({ enabled: true, configured: true, lastTest: null })).toBe('untested');
    expect(resolveConnectionState({ enabled: false, configured: true, lastTest: null })).toBe('disabled');
    expect(resolveConnectionState({ enabled: true, configured: false, lastTest: null })).toBe('not_configured');
  });

  it('only reports connected after a successful test', () => {
    const checks = classifyConnectionTest({ success: true }, true);
    const at = new Date();
    expect(
      resolveConnectionState({
        enabled: true,
        configured: true,
        lastTest: { at, success: true, errorCode: null, message: 'ok', checks },
      }),
    ).toBe('connected');
    expect(
      resolveConnectionState({
        enabled: true,
        configured: true,
        lastTest: { at, success: false, errorCode: 'TIMEOUT', message: 'timeout', checks },
      }),
    ).toBe('failed');
  });

  it('does not infer authentication failure from a network failure', () => {
    expect(classifyConnectionTest({ success: false, errorCode: 'TIMEOUT' }, true)).toEqual({
      apiReachable: false,
      authValid: null,
      sslValid: null,
    });
  });

  it('marks the API reachable but auth failed on 401/403', () => {
    expect(classifyConnectionTest({ success: false, errorCode: 'AUTH_FAILED' }, true)).toEqual({
      apiReachable: true,
      authValid: false,
      sslValid: true,
    });
  });

  it('leaves SSL unknown when certificate verification is disabled', () => {
    expect(classifyConnectionTest({ success: true }, false).sslValid).toBeNull();
    expect(classifyConnectionTest({ success: false, errorCode: 'SSL_FAILURE' }, true).sslValid).toBe(false);
  });

  it('leaves every check unknown for unclassified errors', () => {
    expect(classifyConnectionTest({ success: false, errorCode: 'UNKNOWN' }, true)).toEqual({
      apiReachable: null,
      authValid: null,
      sslValid: null,
    });
  });
});

describe('EspoCRM interface link', () => {
  it('derives the CRM UI URL from the validated base URL', () => {
    expect(resolveCrmAppUrl('https://crm.physicalrisk.com', 'production')).toBe('https://crm.physicalrisk.com/');
    expect(resolveCrmAppUrl('https://crm.example.com/espo/', 'production')).toBe('https://crm.example.com/espo/');
    expect(resolveCrmAppUrl('https://crm.example.com/api/v1', 'production')).toBe('https://crm.example.com/');
  });

  it('never returns unsafe or credential-bearing URLs', () => {
    expect(resolveCrmAppUrl('javascript:alert(1)', 'development')).toBeNull();
    expect(resolveCrmAppUrl('data:text/html,hi', 'development')).toBeNull();
    expect(resolveCrmAppUrl('http://crm.example.com', 'production')).toBeNull();
    expect(resolveCrmAppUrl('https://user:secret@crm.example.com', 'production')).toBeNull();
    expect(resolveCrmAppUrl('', 'production')).toBeNull();
    expect(resolveCrmAppUrl('not a url', 'production')).toBeNull();
  });

  it('requires HTTPS, allowing plain HTTP only for loopback hosts outside production', () => {
    expect(resolveCrmAccess('http://crm.example.com', 'development')).toMatchObject({ available: false, reason: 'insecure' });
    expect(resolveCrmAccess('http://crm.localhost:8080', 'development').url).toBe('http://crm.localhost:8080/');
    expect(resolveCrmAccess('http://localhost:8080', 'production')).toMatchObject({ available: false, reason: 'insecure' });
    expect(resolveCrmAccess('ftp://crm.example.com', 'development').reason).toBe('insecure');
  });

  it('explains why the link is unavailable', () => {
    expect(resolveCrmAccess('', 'production')).toMatchObject({ available: false, reason: 'not_configured' });
    expect(resolveCrmAccess('not a url', 'production').reason).toBe('invalid');
    expect(resolveCrmAccess('https://u:p@crm.example.com', 'production').reason).toBe('credentials');
    for (const reason of ['not_configured', 'invalid', 'credentials', 'insecure']) {
      const access = [
        resolveCrmAccess('', 'production'),
        resolveCrmAccess('nope', 'production'),
        resolveCrmAccess('https://u:p@crm.example.com', 'production'),
        resolveCrmAccess('http://crm.example.com', 'production'),
      ].find((a) => a.reason === reason);
      expect(access?.message).toBeTruthy();
    }
  });

  it('drops query strings and fragments from the link', () => {
    expect(resolveCrmAccess('https://crm.example.com/?token=abc#x', 'production').url).toBe('https://crm.example.com/');
  });

  it('only deep-links known record types with plain ids', () => {
    const base = 'https://crm.example.com/';
    expect(crmRecordUrl(base, 'Opportunity', '64f1a2b3c4d5e6f7a')).toBe('https://crm.example.com/#Opportunity/view/64f1a2b3c4d5e6f7a');
    expect(crmRecordUrl(base, 'Opportunity', '../admin')).toBeNull();
    expect(crmRecordUrl(base, 'User', 'abc')).toBeNull();
    expect(crmRecordUrl(null, 'Lead', 'abc')).toBeNull();
    expect(crmRecordUrl(base, 'Lead', null)).toBeNull();
  });
});

describe('EspoCRM connection messages', () => {
  it('reports a pass without naming the integration user', () => {
    expect(publicConnectionMessage({ success: true })).toBe('Connection test passed');
  });

  it('gives actionable copy for known failures and a safe default otherwise', () => {
    expect(publicConnectionMessage({ success: false, errorCode: 'AUTH_FAILED' })).toMatch(/API key/);
    expect(publicConnectionMessage({ success: false, errorCode: 'SSL_FAILURE' })).toMatch(/certificate/);
    expect(publicConnectionMessage({ success: false, errorCode: 'WEIRD' })).toMatch(/base URL and API key/);
  });
});

describe('EspoCRM sync worker and sync state', () => {
  const now = new Date('2026-10-28T10:00:00Z');
  const beat = (minutesAgo: number) => ({
    lastRunAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    processed: 0,
    succeeded: 0,
    failed: 0,
  });

  it('reports the worker as not recorded until a heartbeat exists', () => {
    expect(resolveWorkerState({ enabled: true, autoSync: true, heartbeat: null, now })).toBe('not_recorded');
  });

  it('distinguishes running, stale, not scheduled and disabled workers', () => {
    expect(resolveWorkerState({ enabled: true, autoSync: true, heartbeat: beat(9), now })).toBe('running');
    expect(resolveWorkerState({ enabled: true, autoSync: true, heartbeat: beat(31), now })).toBe('stale');
    expect(resolveWorkerState({ enabled: true, autoSync: false, heartbeat: beat(1), now })).toBe('not_scheduled');
    expect(resolveWorkerState({ enabled: false, autoSync: true, heartbeat: beat(1), now })).toBe('disabled');
  });

  const counts = { pending: 0, processing: 0, retrying: 0, failedUnresolved: 0 };

  it('only reports idle (no new eligible activity) with recent worker evidence', () => {
    expect(resolveSyncState({ enabled: true, configured: true, counts, worker: 'running' })).toBe('idle');
    expect(resolveSyncState({ enabled: true, configured: true, counts, worker: 'not_recorded' })).toBe('unknown');
    expect(resolveSyncState({ enabled: true, configured: true, counts, worker: 'stale' })).toBe('unknown');
  });

  it('separates errors, in-flight and queued work', () => {
    const base = { enabled: true, configured: true, worker: 'running' as const };
    expect(resolveSyncState({ ...base, counts: { ...counts, failedUnresolved: 1, pending: 2 } })).toBe('errors');
    expect(resolveSyncState({ ...base, counts: { ...counts, processing: 1, pending: 2 } })).toBe('processing');
    expect(resolveSyncState({ ...base, counts: { ...counts, retrying: 1 } })).toBe('pending');
  });

  it('does not treat a failure that a later sync superseded as unresolved', () => {
    const t = (m: number) => new Date(now.getTime() + m * 60_000);
    const failed = [
      { jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', localEntityId: 'a', updatedAt: t(0) },
      { jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', localEntityId: 'b', updatedAt: t(0) },
    ];
    const successes = [
      { jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', localEntityId: 'a', updatedAt: t(5) },
      { jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', localEntityId: 'b', updatedAt: t(-5) },
    ];
    expect(countUnresolvedFailures(failed, successes)).toBe(1);
  });
});

describe('EspoCRM error text', () => {
  const body = '{"messageTranslation":{"label":"validationFailure","scope":null,"data":{"field":"industry","type":"valid"}}}';

  it('turns an EspoCRM validation body into a readable sentence', () => {
    expect(readableEspoError(body)).toBe('EspoCRM rejected the record: Industry is not one of the values EspoCRM allows.');
    expect(sanitizeErrorSummary(body)).toBe('EspoCRM rejected the record: Industry is not one of the values EspoCRM allows.');
  });

  it('humanises custom field names and keeps a leading prefix', () => {
    const custom = '{"messageTranslation":{"label":"validationFailure","data":{"field":"cMossRiskRating","type":"required"}}}';
    expect(readableEspoError(`Opportunity: ${custom}`)).toBe(
      'Opportunity: EspoCRM rejected the record: Moss risk rating is required.',
    );
  });

  it('never shows raw JSON, even when the shape is unknown', () => {
    expect(sanitizeErrorSummary('{"foo":{"bar":1}}')).toBe('EspoCRM rejected the request.');
    expect(sanitizeErrorSummary('{"message":"Name is too long"}')).toBe('Name is too long');
    expect(sanitizeErrorSummary('[{"id":"abc"}]')).toBe('EspoCRM rejected the request.');
  });

  it('leaves plain messages untouched', () => {
    expect(readableEspoError('EspoCRM request timed out.')).toBe('EspoCRM request timed out.');
    expect(readableEspoError('broken {json')).toBe('broken {json');
  });
});

describe('EspoCRM sync history helpers', () => {
  it('maps job statuses to user-facing history states', () => {
    expect(historyStatus('SYNCED')).toBe('success');
    expect(historyStatus('RETRYING')).toBe('retrying');
    expect(historyStatus('PENDING')).toBe('pending');
    expect(historyStatus('PROCESSING')).toBe('processing');
    expect(historyStatus('FAILED')).toBe('failed');
  });

  it('converts filter dates to SAST day bounds and rejects impossible dates', () => {
    const bounds = sastDayBounds('2026-10-28')!;
    expect(bounds.start.toISOString()).toBe('2026-10-27T22:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-10-28T21:59:59.999Z');
    expect(sastDayBounds('2026-02-30')).toBeNull();
    expect(sastDayBounds('28/10/2026')).toBeNull();
    expect(sastDayBounds('2026-10-28T00:00')).toBeNull();
  });

  it('keys records by job type and MOSS id, falling back to entity type', () => {
    expect(syncRecordKey({ jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', localEntityId: 'x' })).toBe('ESPO_SYNC_LEAD:x');
    expect(syncRecordKey({ jobType: null, entityType: 'Lead', localEntityId: 'x' })).toBe('Lead:x');
  });

  it('sanitises error summaries', () => {
    const summary = sanitizeErrorSummary(
      'Duplicate for jane@example.com X-Api-Key: abc123 at https://crm.example.com/x?apiKey=zzz',
    );
    expect(summary).not.toContain('jane@example.com');
    expect(summary).not.toContain('abc123');
    expect(summary).not.toContain('zzz');
    expect(sanitizeErrorSummary('x'.repeat(500))!.length).toBeLessThanOrEqual(200);
    expect(sanitizeErrorSummary(null)).toBeNull();
  });

  it('only allows retry of failed jobs that have a safe handler', () => {
    const row = { status: 'FAILED', jobType: 'ESPO_SYNC_LEAD', entityType: 'Lead', assessmentId: null };
    expect(isRetryEligible(row)).toBe(true);
    expect(isRetryEligible({ ...row, status: 'SUCCESS' })).toBe(false);
    expect(isRetryEligible({ ...row, status: 'PROCESSING' })).toBe(false);
    expect(isRetryEligible({ ...row, status: 'PENDING' })).toBe(false);
    expect(isRetryEligible({ ...row, jobType: 'ESPO_SYNC_TASK' })).toBe(false);
    expect(isRetryEligible({ ...row, jobType: 'ESPO_UPDATE_REPORT' })).toBe(false);
    expect(isRetryEligible({ ...row, jobType: 'ESPO_UPDATE_REPORT', assessmentId: 'as1' })).toBe(true);
    // A record written inside a job is re-sent only by retrying that job.
    expect(isRetryEligible({ ...row, parentId: 'job-1' })).toBe(false);
  });
});
