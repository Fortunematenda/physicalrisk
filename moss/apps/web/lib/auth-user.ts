export type StoredUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

export type MvpNavRole = 'ADMIN' | 'ANALYST' | 'CLIENT';

const CLIENT_ROLES = new Set(['CLIENT_EXECUTIVE', 'CLIENT_CONTRIBUTOR']);
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'METHODOLOGY_ADMIN']);
const ANALYST_ROLES = new Set(['ANALYST', 'REVIEWER', 'SALES', 'AUDITOR']);

export function mapRealmRolesToMossRole(realmRoles: string[] = []): string {
  if (realmRoles.includes('moss_admin')) return 'SUPER_ADMIN';
  if (realmRoles.includes('moss_reviewer')) return 'REVIEWER';
  if (realmRoles.includes('moss_analyst')) return 'ANALYST';
  if (realmRoles.includes('moss_client')) return 'CLIENT_EXECUTIVE';
  return 'CLIENT_CONTRIBUTOR';
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('moss_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('moss_user', JSON.stringify(user));
}

/** Hydrate local user profile from NextAuth SSO session. */
export async function ensureSsoUser(): Promise<StoredUser | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return getStoredUser();
    const session = await res.json();
    if (!session?.user && !session?.accessToken) return getStoredUser();

    const realmRoles: string[] = session.realmRoles ?? [];
    const nameParts = String(session.user?.name || '')
      .trim()
      .split(/\s+/);
    const user: StoredUser = {
      id: session.user?.id || session.user?.email || 'sso-user',
      email: session.user?.email || '',
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      role: mapRealmRolesToMossRole(realmRoles),
    };
    setStoredUser(user);
    return user;
  } catch {
    return getStoredUser();
  }
}

export function getUserDisplayName(user: StoredUser | null): string {
  if (!user) return 'Signed in user';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email;
}

export function roleDisplayLabel(systemRole: string): string {
  const labels: Record<string, string> = {
    SUPER_ADMIN: 'Administrator',
    METHODOLOGY_ADMIN: 'Methodology Administrator',
    ANALYST: 'Analyst',
    REVIEWER: 'Senior Reviewer',
    SALES: 'Sales User',
    AUDITOR: 'Auditor',
    CLIENT_EXECUTIVE: 'Client Executive',
    CLIENT_CONTRIBUTOR: 'Client Contributor',
  };
  return labels[systemRole] || systemRole.replaceAll('_', ' ');
}

export function resolveMvpNavRole(systemRole: string): MvpNavRole {
  if (ADMIN_ROLES.has(systemRole)) return 'ADMIN';
  if (CLIENT_ROLES.has(systemRole)) return 'CLIENT';
  if (ANALYST_ROLES.has(systemRole)) return 'ANALYST';
  return 'CLIENT';
}

export function canAccessNavRole(userRole: MvpNavRole, allowed: MvpNavRole[]): boolean {
  return allowed.includes(userRole);
}
