export type JwtClaims = {
  sub?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
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
