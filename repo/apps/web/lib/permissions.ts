export type GatewayRole = 'ADMIN' | 'IMPORTER' | 'REVIEWER' | 'VIEWER';

export interface GatewayUser {
  id?: string;
  name?: string;
  email?: string;
  role?: GatewayRole | string;
}

const CREATE_CONFIG_ROLES: GatewayRole[] = ['ADMIN', 'IMPORTER'];

export function getCurrentUser(): GatewayUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('gateway_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GatewayUser;
  } catch {
    return null;
  }
}

export function canCreateConfiguration(user: GatewayUser | null = getCurrentUser()): boolean {
  if (!user?.role) return false;
  return CREATE_CONFIG_ROLES.includes(user.role as GatewayRole);
}
