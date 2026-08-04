import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import {
  accessTokenExpired,
  accessTokenExpiresSoon,
  decodeJwtPayload,
} from '../token.js';

export class RepositoryApiError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
    public readonly requiresLogin = false,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'RepositoryApiError';
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof RepositoryApiError) {
    return error.status === 401
      || error.errorCode === 'ACCESS_TOKEN_EXPIRED'
      || error.errorCode === 'MCP_AUTH_FAILED';
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /401|Unauthorized|ACCESS_TOKEN_EXPIRED/i.test(message);
}

export class RepositoryApiClient {
  private tokenRefreshOccurred = false;
  private retryCount = 0;

  constructor(private authHeader?: string) {}

  setAuthHeader(header: string | undefined) {
    this.authHeader = header;
  }

  /** Ensure Bearer JWT is not already expired before calling the API. */
  assertAccessTokenUsable(): void {
    if (!this.authHeader) return;
    const token = this.authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token.startsWith('mcp_')) return;
    if (accessTokenExpired(token)) {
      throw new RepositoryApiError(
        'ACCESS_TOKEN_EXPIRED',
        'The connector access token expired. Reconnect or wait for ChatGPT to refresh via offline_access.',
        401,
        true,
        true,
      );
    }
    if (accessTokenExpiresSoon(token)) {
      // ChatGPT owns refresh for Mode B; we surface a soft signal in logs only.
      this.tokenRefreshOccurred = false;
    }
  }

  private headers(idempotencyKey?: string) {
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': requestId,
      'X-Request-Id': requestId,
    };
    if (this.authHeader) headers.Authorization = this.authHeader;
    else if (config.repoMcpApiKey) headers.Authorization = `Bearer ${config.repoMcpApiKey}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return headers;
  }

  async requestWithAuthRetry<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { idempotencyKey?: string },
  ): Promise<T> {
    this.retryCount = 0;
    this.assertAccessTokenUsable();
    try {
      return await this.request<T>(method, path, body, opts);
    } catch (error) {
      if (!isUnauthorizedError(error)) throw error;
      // Mode B: ChatGPT must refresh; we only retry once if the client replaced the header.
      this.retryCount = 1;
      this.assertAccessTokenUsable();
      return this.request<T>(method, path, body, opts);
    }
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { idempotencyKey?: string },
  ): Promise<T> {
    const started = Date.now();
    const headers = this.headers(opts?.idempotencyKey);
    const requestId = headers['X-Request-Id'];
    let tokenExpiry: string | null = null;
    if (this.authHeader) {
      const token = this.authHeader.replace(/^Bearer\s+/i, '').trim();
      const claims = decodeJwtPayload(token);
      if (claims?.exp) tokenExpiry = new Date(claims.exp * 1000).toISOString();
    }

    let response: Response;
    try {
      response = await fetch(`${config.repoApiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = /aborted|timeout|TimeoutError/i.test(message);
      console.error(JSON.stringify({
        requestId,
        operation: `${method} ${path}`,
        httpStatus: 0,
        tokenExpiry,
        tokenRefreshOccurred: this.tokenRefreshOccurred,
        retryCount: this.retryCount,
        durationMs: Date.now() - started,
        errorCode: timedOut ? 'CONNECTOR_REQUEST_TIMEOUT' : 'REPOSITORY_API_UNAVAILABLE',
        containerInstance: process.env.HOSTNAME || 'repo-mcp',
        timestamp: new Date().toISOString(),
      }));
      throw new RepositoryApiError(
        timedOut ? 'CONNECTOR_REQUEST_TIMEOUT' : 'REPOSITORY_API_UNAVAILABLE',
        timedOut
          ? 'Repository API request timed out'
          : `Repository API unavailable: ${message}`,
        timedOut ? 504 : 503,
        true,
        false,
        requestId,
      );
    }

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    console.log(JSON.stringify({
      requestId,
      operation: `${method} ${path}`,
      httpStatus: response.status,
      tokenExpiry,
      tokenRefreshOccurred: this.tokenRefreshOccurred,
      retryCount: this.retryCount,
      durationMs: Date.now() - started,
      errorCode: response.ok ? null : (payload.errorCode || payload.code || 'REPO_API_ERROR'),
      containerInstance: process.env.HOSTNAME || 'repo-mcp',
      timestamp: new Date().toISOString(),
    }));

    if (!response.ok) {
      const message = String(payload.message || response.statusText);
      const errorCode = String(payload.errorCode || payload.code || 'REPO_API_ERROR');
      throw new RepositoryApiError(
        errorCode,
        message,
        response.status,
        Boolean(payload.retryable),
        Boolean(payload.requiresLogin),
        typeof payload.requestId === 'string' ? payload.requestId : requestId,
      );
    }
    return payload as T;
  }
}
