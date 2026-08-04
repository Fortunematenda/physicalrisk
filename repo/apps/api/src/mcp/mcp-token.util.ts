import { createHash } from 'node:crypto';

export type JwtClaims = {
  sub?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  preferred_username?: string;
  email?: string;
  iss?: string;
  azp?: string;
  [key: string]: unknown;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt?: number;
};

const SKEW_MS = 60_000;

export function decodeJwtPayload(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JwtClaims;
  } catch {
    return null;
  }
}

export function accessTokenExpiresAtMs(token: string): number | null {
  const claims = decodeJwtPayload(token);
  if (!claims?.exp) return null;
  return claims.exp * 1000;
}

export function accessTokenExpiresSoon(token: string, skewMs = SKEW_MS): boolean {
  const expiresAt = accessTokenExpiresAtMs(token);
  if (expiresAt == null) return true;
  return expiresAt <= Date.now() + skewMs;
}

export function accessTokenExpired(token: string): boolean {
  const expiresAt = accessTokenExpiresAtMs(token);
  if (expiresAt == null) return true;
  return expiresAt <= Date.now();
}

/** Stable session id derived from Keycloak subject (survives token rotation). */
export function sessionIdFromAccessToken(token: string): string | null {
  const claims = decodeJwtPayload(token);
  if (!claims?.sub) return null;
  return `kc:${claims.sub}`;
}

export function sessionIdFromApiKey(apiKey: string): string {
  const hash = createHash('sha256').update(apiKey).digest('hex').slice(0, 24);
  return `mcp:${hash}`;
}

export function hashIdempotencyPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}
