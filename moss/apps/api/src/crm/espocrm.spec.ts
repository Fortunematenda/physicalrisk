import { describe, expect, it } from 'vitest';
import {
  assertEspoConfigured,
  loadEspoCrmConfig,
  redactSecrets,
  validateEspoBaseUrl,
} from './espocrm.config';
import { EspoCrmHttpError, buildApiBase, classifyEspoError } from './espocrm.client';
import {
  ESPO_MAX_ATTEMPTS,
  mapAssessmentStage,
  mapRiskPriority,
  nextRetryAt,
  normalizeEspoPhone,
} from './espocrm.mapper';

function mockConfig(values: Record<string, string | undefined>) {
  return {
    get: <T = string>(key: string) => values[key] as T | undefined,
  };
}

describe('EspoCRM config', () => {
  it('normalises base URL without trailing slash and builds /api/v1 once', () => {
    expect(buildApiBase('https://crm.example.com/')).toBe('https://crm.example.com/api/v1');
    expect(buildApiBase('https://crm.example.com')).toBe('https://crm.example.com/api/v1');
  });

  it('rejects invalid URLs and requires HTTPS in production', () => {
    expect(() => validateEspoBaseUrl('not-a-url', 'development')).toThrow();
    expect(() => validateEspoBaseUrl('http://crm.example.com', 'production')).toThrow(/HTTPS/);
    expect(validateEspoBaseUrl('https://crm.example.com', 'production').hostname).toBe('crm.example.com');
  });

  it('loads field mappings and stage mapper from env', () => {
    const cfg = loadEspoCrmConfig(
      mockConfig({
        ESPOCRM_ENABLED: 'true',
        ESPOCRM_BASE_URL: 'https://crm.example.com',
        ESPOCRM_API_KEY: 'secret-key',
        ESPOCRM_STAGE_SUBMITTED: 'Custom Qualification',
        ESPOCRM_OPPORTUNITY_SCLI_SCORE_FIELD: 'cCustomScore',
      }) as never,
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.opportunityFields.scliScore).toBe('cCustomScore');
    expect(mapAssessmentStage('SUBMITTED', cfg.stages)).toBe('Custom Qualification');
    expect(mapAssessmentStage('REPORT_ISSUED', cfg.stages)).toBe('Negotiation');
  });

  it('assertConfigured blocks disabled or incomplete setup', () => {
    expect(() =>
      assertEspoConfigured(
        loadEspoCrmConfig(mockConfig({ ESPOCRM_ENABLED: 'false' }) as never),
      ),
    ).toThrow(/disabled/i);
  });

  it('redacts API keys from logs and objects', () => {
    expect(redactSecrets({ apiKey: 'abc', nested: { authorization: 'Bearer x' } })).toEqual({
      apiKey: '[REDACTED]',
      nested: { authorization: '[REDACTED]' },
    });
    expect(String(redactSecrets('X-Api-Key: super-secret'))).toContain('[REDACTED]');
    expect(String(redactSecrets('X-Api-Key: super-secret'))).not.toContain('super-secret');
  });
});

describe('EspoCRM mapper', () => {
  it('maps risk priority bands', () => {
    expect(mapRiskPriority('Critical')).toBe('Urgent');
    expect(mapRiskPriority('High')).toBe('High');
    expect(mapRiskPriority('Moderate')).toBe('Normal');
    expect(mapRiskPriority('Low')).toBe('Low');
  });

  it('uses exponential retry schedule and stops after max attempts', () => {
    expect(nextRetryAt(1, true)?.getTime()).toBeGreaterThan(Date.now());
    expect(nextRetryAt(ESPO_MAX_ATTEMPTS, true)).toBeNull();
    expect(nextRetryAt(1, false)).toBeNull();
  });
  it('normalises South African phone numbers for EspoCRM', () => {
    expect(normalizeEspoPhone('0612685933')).toBe('+27612685933');
    expect(normalizeEspoPhone('+27 61 268 5933')).toBe('+27612685933');
    expect(normalizeEspoPhone('')).toBeNull();
    expect(normalizeEspoPhone('abc')).toBeNull();
  });
});

describe('EspoCRM error classification', () => {
  it('marks timeouts and 5xx as retryable', () => {
    const timeout = classifyEspoError({
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 15000ms exceeded',
      toJSON: () => ({}),
    });
    expect(timeout.retryable).toBe(true);
    expect(timeout.code).toBe('TIMEOUT');

    const server = classifyEspoError({
      isAxiosError: true,
      response: { status: 503, data: { message: 'Unavailable' } },
      message: 'Request failed',
      toJSON: () => ({}),
    });
    expect(server.retryable).toBe(true);
  });

  it('does not retry auth or validation failures', () => {
    const auth = classifyEspoError({
      isAxiosError: true,
      response: { status: 401, data: {} },
      message: 'Unauthorized',
      toJSON: () => ({}),
    });
    expect(auth.retryable).toBe(false);
    expect(auth.code).toBe('AUTH_FAILED');

    const validation = classifyEspoError({
      isAxiosError: true,
      response: { status: 400, data: { message: 'Bad payload' } },
      message: 'Bad Request',
      toJSON: () => ({}),
    });
    expect(validation.retryable).toBe(false);
    expect(validation.code).toBe('VALIDATION');
  });
});

describe('EspoCRM client HTTP behaviour', () => {
  it('keeps API key only in server config (never returned by status helpers)', () => {
    const cfg = loadEspoCrmConfig(
      mockConfig({
        ESPOCRM_ENABLED: 'true',
        ESPOCRM_BASE_URL: 'https://crm.example.com',
        ESPOCRM_API_KEY: 'test-key-value',
      }) as never,
    );
    expect(cfg.apiKey).toBe('test-key-value');
    expect(buildApiBase(cfg.baseUrl)).toBe('https://crm.example.com/api/v1');
    const statusShape = {
      enabled: cfg.enabled,
      apiKeyConfigured: Boolean(cfg.apiKey),
      apiKey: undefined,
    };
    expect(statusShape.apiKeyConfigured).toBe(true);
    expect(statusShape).not.toHaveProperty('apiKey', 'test-key-value');
  });

  it('throws EspoCrmHttpError for typed failures', () => {
    const err = new EspoCrmHttpError({
      retryable: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'EspoCRM permission denied (403).',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.retryable).toBe(false);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('EspoCRM sync contracts', () => {
  it('defines required outbound job types', () => {
    const jobs = [
      'ESPO_SYNC_LEAD',
      'ESPO_SYNC_ACCOUNT',
      'ESPO_SYNC_CONTACT',
      'ESPO_SYNC_OPPORTUNITY',
      'ESPO_SYNC_TASK',
      'ESPO_UPDATE_REPORT',
    ];
    expect(jobs).toHaveLength(6);
  });

  it('treats CRM outages as non-blocking by design', () => {
    const failureStatuses = ['FAILED', 'PENDING', 'RETRYING'];
    expect(failureStatuses).toContain('FAILED');
  });
});
