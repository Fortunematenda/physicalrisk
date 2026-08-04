import {
  accessTokenExpired,
  accessTokenExpiresSoon,
  decodeJwtPayload,
  hashIdempotencyPayload,
  sessionIdFromAccessToken,
} from './mcp-token.util';
import { connectorErrorBody, isUnauthorizedError } from './mcp.exceptions';

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function fakeJwt(expSecondsFromNow: number, sub = 'user-1'): string {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const payload = b64url({
    sub,
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    iat: Math.floor(Date.now() / 1000),
  });
  return `${header}.${payload}.sig`;
}

describe('mcp-token.util', () => {
  it('decodes a valid access token payload', () => {
    const token = fakeJwt(3600);
    const claims = decodeJwtPayload(token);
    expect(claims?.sub).toBe('user-1');
    expect(accessTokenExpired(token)).toBe(false);
    expect(accessTokenExpiresSoon(token)).toBe(false);
    expect(sessionIdFromAccessToken(token)).toBe('kc:user-1');
  });

  it('detects an expired access token', () => {
    const token = fakeJwt(-10);
    expect(accessTokenExpired(token)).toBe(true);
    expect(accessTokenExpiresSoon(token)).toBe(true);
  });

  it('detects access token expiring within the skew window', () => {
    const token = fakeJwt(30);
    expect(accessTokenExpired(token)).toBe(false);
    expect(accessTokenExpiresSoon(token)).toBe(true);
  });
});

describe('connector structured errors', () => {
  it('builds structured auth error bodies', () => {
    const body = connectorErrorBody('ACCESS_TOKEN_EXPIRED', 'expired', {
      retryable: true,
      requiresLogin: true,
      requestId: 'req-1',
    });
    expect(body).toMatchObject({
      success: false,
      errorCode: 'ACCESS_TOKEN_EXPIRED',
      retryable: true,
      requiresLogin: true,
      requestId: 'req-1',
    });
  });

  it('detects unauthorized errors for retry middleware', () => {
    expect(isUnauthorizedError(new Error('ACCESS_TOKEN_EXPIRED: gone'))).toBe(true);
    expect(isUnauthorizedError(new Error('network down'))).toBe(false);
  });

  it('hashes idempotency payloads stably', () => {
    expect(hashIdempotencyPayload({ a: 1 })).toBe(hashIdempotencyPayload({ a: 1 }));
    expect(hashIdempotencyPayload({ a: 1 })).not.toBe(hashIdempotencyPayload({ a: 2 }));
  });
});

describe('auth retry helper contract', () => {
  async function requestWithAuthRetry<T>(
    getToken: () => Promise<string>,
    forceRefresh: () => Promise<string>,
    request: (token: string) => Promise<T>,
  ): Promise<T> {
    let token = await getToken();
    try {
      return await request(token);
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      token = await forceRefresh();
      return request(token);
    }
  }

  it('retries once after ACCESS_TOKEN_EXPIRED then succeeds', async () => {
    let calls = 0;
    const result = await requestWithAuthRetry(
      async () => 'old',
      async () => 'new',
      async (token) => {
        calls += 1;
        if (token === 'old') throw new Error('ACCESS_TOKEN_EXPIRED');
        return { ok: true, token };
      },
    );
    expect(result).toEqual({ ok: true, token: 'new' });
    expect(calls).toBe(2);
  });

  it('does not loop forever when refresh still fails', async () => {
    await expect(requestWithAuthRetry(
      async () => 'old',
      async () => 'still-bad',
      async () => {
        throw new Error('ACCESS_TOKEN_EXPIRED');
      },
    )).rejects.toThrow('ACCESS_TOKEN_EXPIRED');
  });
});
