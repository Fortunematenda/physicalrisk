import { describe, expect, it } from 'vitest';
import { mapRealmRolesToMossRole } from './auth-user';
import { PLATFORM_ROLE_INFO, platformRoleInfo, summariseResponsibilities } from './role-catalogue';

describe('Platform role catalogue', () => {
  it('documents the Keycloak role behind every SSO-assignable platform role', () => {
    for (const [realmRole, systemRole] of [
      ['moss_admin', 'SUPER_ADMIN'],
      ['moss_reviewer', 'REVIEWER'],
      ['moss_analyst', 'ANALYST'],
      ['moss_client', 'CLIENT_EXECUTIVE'],
    ] as const) {
      expect(mapRealmRolesToMossRole([realmRole])).toBe(systemRole);
      expect(PLATFORM_ROLE_INFO[systemRole].keycloakRole).toBe(realmRole);
    }
    expect(mapRealmRolesToMossRole([])).toBe('CLIENT_CONTRIBUTOR');
  });

  it('falls back to a no-access description for unknown roles', () => {
    expect(platformRoleInfo('SOMETHING_NEW').description).toMatch(/no additional access/i);
  });

  it('summarises engagement responsibilities with business labels', () => {
    expect(
      summariseResponsibilities([{ role: 'PRIMARY_ANALYST' }, { role: 'PRIMARY_ANALYST' }, { role: 'APPROVER' }]),
    ).toBe('Engagement lead ×2 · Approver ×1');
    expect(summariseResponsibilities([])).toBe('');
  });
});
