import { describe, expect, it } from 'vitest';
import { resolveIdentityAdminUrl } from './identity-admin-url';

describe('Keycloak admin console link', () => {
  it('derives the realm user list from KEYCLOAK_ISSUER', () => {
    expect(resolveIdentityAdminUrl({ issuer: 'https://auth.physicalrisk.com/realms/physicalrisk' })).toBe(
      'https://auth.physicalrisk.com/admin/master/console/#/physicalrisk/users',
    );
    expect(resolveIdentityAdminUrl({ issuer: 'http://localhost:8086/auth/realms/physicalrisk' })).toBe(
      'http://localhost:8086/auth/admin/master/console/#/physicalrisk/users',
    );
  });

  it('prefers an explicit KEYCLOAK_ADMIN_CONSOLE_URL', () => {
    expect(
      resolveIdentityAdminUrl({
        explicit: 'https://auth.physicalrisk.com/admin/physicalrisk/console/',
        issuer: 'https://auth.physicalrisk.com/realms/physicalrisk',
      }),
    ).toBe('https://auth.physicalrisk.com/admin/physicalrisk/console/');
  });

  it('returns null for missing or unsafe config', () => {
    expect(resolveIdentityAdminUrl({})).toBeNull();
    expect(resolveIdentityAdminUrl({ issuer: 'https://auth.physicalrisk.com/' })).toBeNull();
    expect(resolveIdentityAdminUrl({ explicit: 'javascript:alert(1)', issuer: '' })).toBeNull();
    expect(resolveIdentityAdminUrl({ explicit: 'https://admin:pw@auth.example.com/' })).toBeNull();
  });
});
