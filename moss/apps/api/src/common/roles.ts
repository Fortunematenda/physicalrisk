import { ForbiddenException, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './current-user.decorator';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Lean MVP roles: ADMIN, ANALYST, CLIENT.
 * Mapped onto existing SystemRole values for backward compatibility.
 */
export const ROLE_ALIASES: Record<string, string> = {
  ADMIN: 'SUPER_ADMIN',
  SYSTEM_ADMIN: 'SUPER_ADMIN',
  SENIOR_REVIEWER: 'REVIEWER',
  SALES_USER: 'SALES',
  CLIENT: 'CLIENT_EXECUTIVE',
};

export function normalizeRole(role: string): string {
  return ROLE_ALIASES[role] || role;
}

export const ADMIN_ROLES = new Set(['SUPER_ADMIN']);
/** Approvers: admins and authorised analysts (Lean MVP). */
export const APPROVER_ROLES = new Set(['SUPER_ADMIN', 'ANALYST', 'REVIEWER']);
export const INTERNAL_ROLES = new Set([
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
  'AUDITOR',
]);
export const REVIEWER_ROLES = new Set(['SUPER_ADMIN', 'REVIEWER', 'ANALYST']);
export const ANALYST_ROLES = new Set(['SUPER_ADMIN', 'ANALYST', 'REVIEWER']);
export const METHODOLOGY_ROLES = new Set(['SUPER_ADMIN', 'METHODOLOGY_ADMIN']);
export const WRITE_INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES']);
export const CLIENT_ROLES = new Set(['CLIENT_EXECUTIVE', 'CLIENT_CONTRIBUTOR']);

export function hasRole(user: AuthUser, allowed: Set<string> | string[]) {
  const role = normalizeRole(user.role);
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return set.has(role);
}

export function requireRole(user: AuthUser, allowed: Set<string> | string[], message = 'Insufficient permissions.') {
  if (!hasRole(user, allowed)) throw new ForbiddenException(message);
}

export function isInternal(user: AuthUser) {
  return hasRole(user, INTERNAL_ROLES);
}

export function isClient(user: AuthUser) {
  return hasRole(user, CLIENT_ROLES);
}

export function isAuditor(user: AuthUser) {
  return normalizeRole(user.role) === 'AUDITOR';
}

export function canApprove(user: AuthUser) {
  return hasRole(user, APPROVER_ROLES);
}

export function canApproveOverride(user: AuthUser) {
  return hasRole(user, ADMIN_ROLES) || normalizeRole(user.role) === 'REVIEWER';
}

export function canManageUsers(user: AuthUser) {
  return hasRole(user, ADMIN_ROLES);
}

/** Lean MVP display role label. */
export function mvpRoleLabel(role: string): 'ADMIN' | 'ANALYST' | 'CLIENT' | string {
  const r = normalizeRole(role);
  if (r === 'SUPER_ADMIN' || r === 'METHODOLOGY_ADMIN') return 'ADMIN';
  if (r === 'ANALYST' || r === 'REVIEWER' || r === 'SALES' || r === 'AUDITOR') return 'ANALYST';
  if (CLIENT_ROLES.has(r)) return 'CLIENT';
  return r;
}
