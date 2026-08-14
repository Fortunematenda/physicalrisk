import { describe, expect, it } from 'vitest';
import { hasRole, SOMOD_APPROVER_ROLES } from '../../common/roles';
import type { AuthUser } from '../../common/current-user.decorator';

describe('SOMOD RBAC approvers', () => {
  const analyst: AuthUser = { id: '1', email: 'a@x.com', role: 'ANALYST' };
  const reviewer: AuthUser = { id: '2', email: 'r@x.com', role: 'REVIEWER' };
  const admin: AuthUser = { id: '3', email: 's@x.com', role: 'SUPER_ADMIN' };

  it('does not allow ANALYST to approve', () => {
    expect(hasRole(analyst, SOMOD_APPROVER_ROLES)).toBe(false);
  });

  it('allows REVIEWER and SUPER_ADMIN to approve', () => {
    expect(hasRole(reviewer, SOMOD_APPROVER_ROLES)).toBe(true);
    expect(hasRole(admin, SOMOD_APPROVER_ROLES)).toBe(true);
  });
});
