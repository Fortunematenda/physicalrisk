/**
 * In-process cache for Keycloak access tokens.
 * Keeps the NextAuth cookie small (refresh token only) so Set-Cookie succeeds.
 */

type Cached = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const g = globalThis as typeof globalThis & { __prTokenCache?: Map<string, Cached> };

function store(): Map<string, Cached> {
  if (!g.__prTokenCache) g.__prTokenCache = new Map();
  return g.__prTokenCache;
}

export function cacheAccessToken(
  sub: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
) {
  if (!sub || !accessToken) return;
  store().set(sub, { accessToken, refreshToken, expiresAt });
}

export function getCachedAccessToken(sub?: string | null): Cached | null {
  if (!sub) return null;
  return store().get(sub) ?? null;
}

export function clearCachedAccessToken(sub?: string | null) {
  if (!sub) return;
  store().delete(sub);
}
