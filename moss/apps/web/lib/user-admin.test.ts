import { describe, expect, it } from 'vitest';
import { createdUserNotice, grantableRoles, userProvisioning } from './user-admin';

describe('user administration mode', () => {
  it('prefers Keycloak provisioning, then local accounts, else none', () => {
    expect(userProvisioning({ keycloakProvisioning: true, localUserAdmin: false })).toBe('keycloak');
    expect(userProvisioning({ localUserAdmin: true })).toBe('local');
    expect(userProvisioning({ localUserAdmin: false, keycloakProvisioning: false })).toBeNull();
    expect(userProvisioning(null)).toBeNull();
  });

  it('only offers roles the API says Keycloak can grant', () => {
    const caps = { keycloakProvisioning: true, assignableRoles: ['ANALYST', 'REVIEWER', 'CLIENT_EXECUTIVE', 'CLIENT_CONTRIBUTOR'] };
    expect(grantableRoles(caps)).toEqual(['ANALYST', 'REVIEWER', 'CLIENT_EXECUTIVE', 'CLIENT_CONTRIBUTOR']);
    expect(grantableRoles(caps)).not.toContain('SUPER_ADMIN');
    expect(grantableRoles(caps, ['ANALYST', 'REVIEWER'])).toEqual(['ANALYST', 'REVIEWER']);
    expect(grantableRoles({ localUserAdmin: true })).toContain('SUPER_ADMIN');
  });

  it('describes what happened after adding a user', () => {
    const base = { id: 'u1', email: 'a@b.co', firstName: 'A', lastName: 'B', systemRole: 'ANALYST', isActive: true };
    expect(createdUserNotice(base).title).toBe('User created');
    expect(createdUserNotice({ ...base, keycloak: { linkedExisting: false, inviteSent: true, inviteError: null } })).toMatchObject({
      variant: 'success',
      description: expect.stringContaining('a@b.co'),
    });
    expect(
      createdUserNotice({ ...base, keycloak: { linkedExisting: false, inviteSent: false, inviteError: 'SMTP not configured.' } }),
    ).toMatchObject({ variant: 'warning', description: expect.stringContaining('SMTP not configured.') });
    expect(createdUserNotice({ ...base, keycloak: { linkedExisting: true, inviteSent: false, inviteError: null } }).title).toBe(
      'Existing account added',
    );
  });
});
