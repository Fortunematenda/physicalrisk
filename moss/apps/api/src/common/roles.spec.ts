import { describe, expect, it } from 'vitest';
import { canApprove, hasRole, isClient, mvpRoleLabel, ADMIN_ROLES, CLIENT_ROLES, ANALYST_ROLES } from './roles';

describe('Lean MVP roles', () => {
  it('maps ADMIN alias to SUPER_ADMIN', () => {
    expect(hasRole({ id: '1', email: 'a', role: 'ADMIN' }, ADMIN_ROLES)).toBe(true);
  });

  it('allows analyst approval', () => {
    expect(canApprove({ id: '1', email: 'a', role: 'ANALYST' })).toBe(true);
    expect(canApprove({ id: '1', email: 'a', role: 'CLIENT_EXECUTIVE' })).toBe(false);
  });

  it('identifies client roles', () => {
    expect(isClient({ id: '1', email: 'a', role: 'CLIENT_CONTRIBUTOR' })).toBe(true);
    expect(hasRole({ id: '1', email: 'a', role: 'CLIENT' }, CLIENT_ROLES)).toBe(true);
  });

  it('returns mvp labels', () => {
    expect(mvpRoleLabel('SUPER_ADMIN')).toBe('ADMIN');
    expect(mvpRoleLabel('ANALYST')).toBe('ANALYST');
    expect(mvpRoleLabel('CLIENT_EXECUTIVE')).toBe('CLIENT');
  });

  it('keeps analyst role set for review work', () => {
    expect(hasRole({ id: '1', email: 'a', role: 'REVIEWER' }, ANALYST_ROLES)).toBe(true);
  });
});
