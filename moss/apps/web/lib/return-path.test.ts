import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME_PATH, currentReturnPath, sanitizeReturnPath } from './return-path';

describe('SSO return path', () => {
  it('returns to SOMOD after sign-in from the portal tile', () => {
    expect(sanitizeReturnPath('/somod')).toBe('/somod');
    expect(sanitizeReturnPath('https://moss.physicalrisk.com/somod')).toBe('/somod');
  });

  it('keeps deep links, query and hash on refresh / direct navigation', () => {
    expect(sanitizeReturnPath('/somod/assessments/abc?tab=financial#screen-b')).toBe(
      '/somod/assessments/abc?tab=financial#screen-b',
    );
    expect(sanitizeReturnPath('https://moss.physicalrisk.com/somod/assessments?status=DRAFT')).toBe(
      '/somod/assessments?status=DRAFT',
    );
    expect(currentReturnPath({ pathname: '/somod/assessments', search: '?status=DRAFT', hash: '' })).toBe(
      '/somod/assessments?status=DRAFT',
    );
  });

  it('never returns to auth intermediates', () => {
    expect(sanitizeReturnPath('/login?next=/somod')).toBe(DEFAULT_HOME_PATH);
    expect(sanitizeReturnPath('/auth/complete?next=/somod')).toBe(DEFAULT_HOME_PATH);
    expect(sanitizeReturnPath('/api/auth/callback/keycloak')).toBe(DEFAULT_HOME_PATH);
  });

  it('rejects open redirects to other origins', () => {
    expect(sanitizeReturnPath('//evil.example.com/somod')).toBe(DEFAULT_HOME_PATH);
    expect(sanitizeReturnPath('/\\evil.example.com')).toBe(DEFAULT_HOME_PATH);
    expect(sanitizeReturnPath('javascript:alert(1)')).toBe(DEFAULT_HOME_PATH);
    // Absolute URLs are reduced to an in-app path; the origin is never followed.
    expect(sanitizeReturnPath('https://evil.example.com/somod')).toBe('/somod');
  });

  it('falls back to the home path when nothing usable is supplied', () => {
    expect(sanitizeReturnPath('')).toBe(DEFAULT_HOME_PATH);
    expect(sanitizeReturnPath(null)).toBe(DEFAULT_HOME_PATH);
    expect(currentReturnPath(null, '/somod')).toBe('/somod');
  });
});
