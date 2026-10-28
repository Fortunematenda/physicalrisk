import { describe, expect, it } from 'vitest';
import {
  CHECK_COPY,
  CONNECTION_COPY,
  EMPTY_HISTORY_FILTERS,
  HISTORY_COPY,
  SYNC_COPY,
  describeSync,
  formatDateTime,
  formatDateTimeFull,
  hasActiveFilters,
  historyQuery,
  isJobInFlight,
  type CrmIntegrationStatus,
} from './crm-integration';

function status(partial: Partial<CrmIntegrationStatus['sync']> = {}, workerState: CrmIntegrationStatus['worker']['state'] = 'running'): CrmIntegrationStatus {
  return {
    enabled: true,
    configured: true,
    access: { available: true, url: 'https://crm.example.com/', reason: null, message: null },
    connection: { state: 'untested', checkedAt: null, message: null, responseTimeMs: null },
    checks: [],
    worker: { state: workerState, lastRunAt: null, lastProcessed: null, lastSucceeded: null, lastFailed: null, intervalMinutes: 10 },
    sync: {
      state: 'idle',
      direction: 'Outbound (MOSS → EspoCRM)',
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureSummary: null,
      lastFailureJob: null,
      counts: { pending: 0, processing: 0, retrying: 0, failedUnresolved: 0, failedTotal: 0, succeeded: 0, skipped: 0 },
      succeededByType: [],
      ...partial,
    },
  };
}

describe('CRM integration copy', () => {
  it('never presents an untested connection as connected or healthy', () => {
    expect(CONNECTION_COPY.untested.label).toBe('Not checked');
    expect(CONNECTION_COPY.connected.label).toBe('Verified');
    expect(CONNECTION_COPY.failed.label).toBe('Failed');
    const allLabels = JSON.stringify([CONNECTION_COPY, SYNC_COPY, CHECK_COPY]);
    expect(allLabels).not.toMatch(/Healthy|All systems operational|Connected/);
  });

  it('shows Not recorded rather than inventing a time', () => {
    expect(formatDateTime(null)).toBe('Not recorded');
    expect(formatDateTime('garbage')).toBe('Not recorded');
    expect(formatDateTimeFull(undefined)).toBe('Not recorded');
  });

  it('shows UTC timestamps in Johannesburg time, labelled SAST, whatever the browser zone', () => {
    // 22:30 UTC on 27 Oct is 00:30 on 28 Oct in South Africa.
    const text = formatDateTime('2026-10-27T22:30:00Z');
    expect(text).toMatch(/28 Oct 2026/);
    expect(text).toMatch(/00:30 SAST$/);
    const full = formatDateTimeFull('2026-10-27T22:30:05Z');
    expect(full).toMatch(/00:30:05 SAST/);
    expect(full).toContain('2026-10-27T22:30:05Z UTC');
  });
});

describe('CRM sync history helpers', () => {
  it('sends only filters that are set, with page and page size', () => {
    const query = new URLSearchParams(historyQuery({ ...EMPTY_HISTORY_FILTERS, status: 'failed', search: '  SCL-1 ' }, 2, 20));
    expect(Object.fromEntries(query)).toEqual({ page: '2', pageSize: '20', status: 'failed', search: 'SCL-1' });
    expect(hasActiveFilters(EMPTY_HISTORY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_HISTORY_FILTERS, dateTo: '2026-10-28' })).toBe(true);
  });

  it('labels awaiting-retry separately from queued work, and treats only queued or running jobs as in flight', () => {
    expect(HISTORY_COPY.retrying.label).toBe('Awaiting retry');
    expect(HISTORY_COPY.pending.label).toBe('Queued');
    expect(isJobInFlight('processing')).toBe(true);
    expect(isJobInFlight('pending')).toBe(true);
    expect(isJobInFlight('retrying')).toBe(false);
    expect(isJobInFlight('failed')).toBe(false);
  });

  it('describes unknown sync without implying failure or success', () => {
    expect(describeSync(status({ state: 'unknown' }, 'not_recorded'))).toMatch(/no recent sync worker run/);
    expect(describeSync(status({ state: 'unknown' }, 'stale'))).toMatch(/not run recently/);
    expect(SYNC_COPY.unknown.label).toBe('Unknown');
  });

  it('reports counts from the evidence for pending and errors', () => {
    const pending = status({ state: 'pending', counts: { pending: 2, processing: 0, retrying: 1, failedUnresolved: 0, failedTotal: 0, succeeded: 0, skipped: 0 } });
    expect(describeSync(pending)).toBe('2 queued, 1 awaiting automatic retry.');
    const errors = status({ state: 'errors', counts: { pending: 0, processing: 0, retrying: 0, failedUnresolved: 3, failedTotal: 5, succeeded: 0, skipped: 0 } });
    expect(describeSync(errors)).toMatch(/^3 failed/);
  });
});
