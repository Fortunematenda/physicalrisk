import { describe, expect, it } from 'vitest';
import {
  CHECK_COPY,
  CONNECTION_COPY,
  CRM_PAGE_INTRO,
  SYNC_COPY,
  describeSync,
  formatDateTime,
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
      counts: { pending: 0, processing: 0, retrying: 0, failedUnresolved: 0, failedTotal: 0, succeeded: 0, skipped: 0 },
      succeededByType: [],
      ...partial,
    },
  };
}

describe('CRM integration copy', () => {
  it('uses the agreed explanatory text', () => {
    expect(CRM_PAGE_INTRO).toBe(
      'This page manages the connection between MOSS and EspoCRM. Open EspoCRM to manage contacts, leads and opportunities. Separate sign-in may be required.',
    );
  });

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
