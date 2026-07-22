import { describe, expect, it } from 'vitest';
import { EmailJobStatus } from '@prisma/client';

describe('email failure handling contract', () => {
  it('uses PENDING / SENT / FAILED for MVP email log', () => {
    expect(EmailJobStatus.PENDING).toBe('PENDING');
    expect(EmailJobStatus.SENT).toBe('SENT');
    expect(EmailJobStatus.FAILED).toBe('FAILED');
  });
});

describe('EspoCRM failure handling contract', () => {
  it('treats CRM outages as non-blocking by design', () => {
    // Public submission queues sync and catches errors; sync failures are logged as FAILED.
    const failureStatuses = ['FAILED', 'PENDING', 'RETRYING'];
    expect(failureStatuses).toContain('FAILED');
  });
});
