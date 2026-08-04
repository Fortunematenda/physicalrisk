import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialEncryptionService } from '../connectors/credential-encryption.service';
import { DatabaseService } from '../database/database.service';
import { ConnectorSession, McpIntegration } from '../database/entities';
import { ConnectorStructuredException, McpAuthException } from './mcp.exceptions';
import {
  TokenSet,
  accessTokenExpiresAtMs,
  accessTokenExpiresSoon,
  decodeJwtPayload,
  sessionIdFromAccessToken,
  sessionIdFromApiKey,
} from './mcp-token.util';

@Injectable()
export class ConnectorSessionService {
  private readonly logger = new Logger(ConnectorSessionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: CredentialEncryptionService,
    private readonly config: ConfigService,
  ) {}

  async touchFromBearer(
    rawBearer: string,
    integration: McpIntegration,
  ): Promise<ConnectorSession | null> {
    const trimmed = rawBearer.trim();
    const isApiKey = trimmed.startsWith('mcp_');
    const sessionId = isApiKey
      ? sessionIdFromApiKey(trimmed)
      : sessionIdFromAccessToken(trimmed);
    if (!sessionId) return null;

    const userId = integration.createdBy?.id || sessionId;
    const expiresAtMs = isApiKey ? null : accessTokenExpiresAtMs(trimmed);
    const claims = isApiKey ? null : decodeJwtPayload(trimmed);

    let session = await this.db.connectorSessions.findOne({ where: { sessionId } });
    const now = new Date();
    await this.encryption.ensureKey().catch(() => undefined);

    let accessEncrypted: string | null = null;
    try {
      accessEncrypted = this.encryption.encrypt(trimmed);
    } catch (error) {
      this.logger.warn(`Unable to encrypt connector access token: ${error instanceof Error ? error.message : error}`);
    }

    if (!session) {
      session = this.db.connectorSessions.create({
        sessionId,
        userId,
        accessTokenEncrypted: accessEncrypted,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
        refreshTokenExpiresAt: null,
        lastSuccessfulRequestAt: now,
        lastUsedAt: now,
        revokedAt: null,
        keycloakSub: typeof claims?.sub === 'string' ? claims.sub : null,
      });
    } else {
      if (session.revokedAt) {
        throw new McpAuthException(
          'The connector session was revoked. Sign in again.',
          'CONNECTOR_SESSION_REVOKED',
          { requiresLogin: true, retryable: false },
        );
      }
      session.userId = userId;
      session.lastUsedAt = now;
      session.lastSuccessfulRequestAt = now;
      if (accessEncrypted) session.accessTokenEncrypted = accessEncrypted;
      if (expiresAtMs) session.accessTokenExpiresAt = new Date(expiresAtMs);
      if (claims?.sub) session.keycloakSub = String(claims.sub);
    }

    return this.db.connectorSessions.save(session);
  }

  async registerRefreshToken(sessionId: string, refreshToken: string, refreshExpiresAt?: Date): Promise<void> {
    const session = await this.db.connectorSessions.findOne({ where: { sessionId } });
    if (!session || session.revokedAt) {
      throw new McpAuthException(
        'Connector session not found',
        'CONNECTOR_SESSION_NOT_FOUND',
        { requiresLogin: true },
      );
    }
    await this.encryption.ensureKey();
    session.refreshTokenEncrypted = this.encryption.encrypt(refreshToken);
    session.refreshTokenExpiresAt = refreshExpiresAt ?? null;
    session.lastUsedAt = new Date();
    await this.db.connectorSessions.save(session);
  }

  /**
   * Return a valid access token for the session, refreshing via Keycloak when needed.
   * ChatGPT normally refreshes client-side; this covers stored refresh tokens (heartbeat register / tests).
   */
  async getValidAccessToken(sessionId: string): Promise<string> {
    const tokens = await this.loadTokenSet(sessionId);
    if (!tokens) {
      throw new McpAuthException(
        'AUTH_SESSION_NOT_FOUND',
        'CONNECTOR_SESSION_NOT_FOUND',
        { requiresLogin: true, retryable: false },
      );
    }

    if (!accessTokenExpiresSoon(tokens.accessToken)) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      throw new McpAuthException(
        'The access token is expired or about to expire and no refresh token is stored. Sign in again or reconnect the connector.',
        'ACCESS_TOKEN_EXPIRED',
        { requiresLogin: true, retryable: true },
      );
    }

    const refreshed = await this.refreshAccessToken(tokens.refreshToken);
    await this.persistTokenSet(sessionId, refreshed);
    return refreshed.accessToken;
  }

  async forceRefreshAccessToken(sessionId: string): Promise<string> {
    const tokens = await this.loadTokenSet(sessionId);
    if (!tokens?.refreshToken) {
      throw new McpAuthException(
        'No refresh token available for this connector session.',
        'REFRESH_TOKEN_INVALID',
        { requiresLogin: true, retryable: false },
      );
    }
    const refreshed = await this.refreshAccessToken(tokens.refreshToken);
    await this.persistTokenSet(sessionId, refreshed);
    return refreshed.accessToken;
  }

  async requestWithAuthRetry<T>(
    sessionId: string,
    request: (token: string) => Promise<T>,
  ): Promise<T> {
    let token = await this.getValidAccessToken(sessionId);
    try {
      return await request(token);
    } catch (error) {
      if (!this.isUnauthorized(error)) throw error;
      token = await this.forceRefreshAccessToken(sessionId);
      return request(token);
    }
  }

  async heartbeat(sessionId: string, opts?: {
    refreshToken?: string;
    accessToken?: string;
  }): Promise<{
    connected: boolean;
    authenticated: boolean;
    sessionId: string;
    userId: string;
    accessTokenExpiresAt: string | null;
    refreshTokenAvailable: boolean;
    lastSuccessfulRequestAt: string | null;
    repositoryApiReachable: boolean;
    databaseReachable: boolean;
    storageReachable: boolean;
    tokenRefreshed: boolean;
  }> {
    let session = await this.db.connectorSessions.findOne({ where: { sessionId } });
    if (!session || session.revokedAt) {
      throw new McpAuthException(
        'Connector session not found',
        'CONNECTOR_SESSION_NOT_FOUND',
        { requiresLogin: true },
      );
    }

    if (opts?.refreshToken) {
      await this.registerRefreshToken(sessionId, opts.refreshToken);
      session = (await this.db.connectorSessions.findOne({ where: { sessionId } }))!;
    }
    if (opts?.accessToken) {
      await this.encryption.ensureKey();
      session.accessTokenEncrypted = this.encryption.encrypt(opts.accessToken);
      const exp = accessTokenExpiresAtMs(opts.accessToken);
      session.accessTokenExpiresAt = exp ? new Date(exp) : session.accessTokenExpiresAt;
    }

    let tokenRefreshed = false;
    if (session.refreshTokenEncrypted) {
      try {
        const tokens = await this.loadTokenSet(sessionId);
        if (tokens && accessTokenExpiresSoon(tokens.accessToken)) {
          const refreshed = await this.refreshAccessToken(tokens.refreshToken);
          await this.persistTokenSet(sessionId, refreshed);
          tokenRefreshed = true;
          session = (await this.db.connectorSessions.findOne({ where: { sessionId } }))!;
        }
      } catch (error) {
        this.logger.warn(`Heartbeat refresh failed: ${error instanceof Error ? error.message : error}`);
      }
    }

    session.lastUsedAt = new Date();
    await this.db.connectorSessions.save(session);

    const [databaseReachable, storageReachable, repositoryApiReachable] = await Promise.all([
      this.pingDatabase(),
      this.pingStorage(),
      Promise.resolve(true),
    ]);

    return {
      connected: databaseReachable && !session.revokedAt,
      authenticated: Boolean(session.accessTokenEncrypted || session.refreshTokenEncrypted),
      sessionId: session.sessionId,
      userId: session.userId,
      accessTokenExpiresAt: session.accessTokenExpiresAt?.toISOString() ?? null,
      refreshTokenAvailable: Boolean(session.refreshTokenEncrypted),
      lastSuccessfulRequestAt: session.lastSuccessfulRequestAt?.toISOString() ?? null,
      repositoryApiReachable,
      databaseReachable,
      storageReachable,
      tokenRefreshed,
    };
  }

  async status(sessionId: string | null, integration?: McpIntegration | null) {
    const [databaseReachable, storageReachable] = await Promise.all([
      this.pingDatabase(),
      this.pingStorage(),
    ]);

    if (!sessionId) {
      return {
        connected: false,
        authenticated: false,
        sessionId: null,
        userId: integration?.createdBy?.id ?? null,
        accessTokenExpiresAt: null,
        refreshTokenAvailable: false,
        lastSuccessfulRequestAt: null,
        repositoryApiReachable: true,
        databaseReachable,
        storageReachable,
      };
    }

    const session = await this.db.connectorSessions.findOne({ where: { sessionId } });
    if (!session || session.revokedAt) {
      return {
        connected: false,
        authenticated: false,
        sessionId,
        userId: integration?.createdBy?.id ?? null,
        accessTokenExpiresAt: null,
        refreshTokenAvailable: false,
        lastSuccessfulRequestAt: null,
        repositoryApiReachable: true,
        databaseReachable,
        storageReachable,
      };
    }

    return {
      connected: databaseReachable,
      authenticated: true,
      sessionId: session.sessionId,
      userId: session.userId,
      accessTokenExpiresAt: session.accessTokenExpiresAt?.toISOString() ?? null,
      refreshTokenAvailable: Boolean(session.refreshTokenEncrypted),
      lastSuccessfulRequestAt: session.lastSuccessfulRequestAt?.toISOString() ?? null,
      repositoryApiReachable: true,
      databaseReachable,
      storageReachable,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const tokenUrl = this.tokenEndpoint();
    const clientId = this.config.get<string>('REPO_MCP_CLIENT_ID')
      || this.config.get<string>('KEYCLOAK_CLIENT_ID')
      || 'repo-chatgpt-app';
    const clientSecret = this.config.get<string>('REPO_MCP_CLIENT_SECRET')
      || this.config.get<string>('KEYCLOAK_CLIENT_SECRET')
      || '';

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });
    if (clientSecret) body.set('client_secret', clientSecret);

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (error) {
      throw new ConnectorStructuredException(
        503,
        'KEYCLOAK_UNAVAILABLE',
        `Keycloak token endpoint unreachable: ${error instanceof Error ? error.message : error}`,
        { retryable: true, requiresLogin: false },
      );
    }

    const payload = await response.json().catch(() => ({})) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      const desc = payload.error_description || payload.error || response.statusText;
      const expired = /expired|invalid_grant/i.test(desc);
      throw new McpAuthException(
        desc || 'Refresh token rejected',
        expired ? 'REFRESH_TOKEN_EXPIRED' : 'REFRESH_TOKEN_INVALID',
        { requiresLogin: true, retryable: false },
      );
    }

    const expiresAt = Date.now() + (Number(payload.expires_in || 300) * 1000);
    const refreshExpiresAt = payload.refresh_expires_in
      ? Date.now() + (Number(payload.refresh_expires_in) * 1000)
      : undefined;

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  }

  private async loadTokenSet(sessionId: string): Promise<TokenSet | null> {
    const session = await this.db.connectorSessions.findOne({ where: { sessionId } });
    if (!session || session.revokedAt || !session.accessTokenEncrypted) return null;
    try {
      await this.encryption.ensureKey();
      const accessToken = this.encryption.decrypt(session.accessTokenEncrypted);
      const refreshToken = session.refreshTokenEncrypted
        ? this.encryption.decrypt(session.refreshTokenEncrypted)
        : '';
      const expiresAt = session.accessTokenExpiresAt?.getTime()
        ?? accessTokenExpiresAtMs(accessToken)
        ?? Date.now();
      return { accessToken, refreshToken, expiresAt };
    } catch {
      return null;
    }
  }

  private async persistTokenSet(sessionId: string, tokens: TokenSet): Promise<void> {
    const session = await this.db.connectorSessions.findOne({ where: { sessionId } });
    if (!session) return;
    await this.encryption.ensureKey();
    session.accessTokenEncrypted = this.encryption.encrypt(tokens.accessToken);
    if (tokens.refreshToken) {
      session.refreshTokenEncrypted = this.encryption.encrypt(tokens.refreshToken);
    }
    session.accessTokenExpiresAt = new Date(tokens.expiresAt);
    if (tokens.refreshExpiresAt) {
      session.refreshTokenExpiresAt = new Date(tokens.refreshExpiresAt);
    }
    session.lastUsedAt = new Date();
    session.lastSuccessfulRequestAt = new Date();
    await this.db.connectorSessions.save(session);
  }

  private tokenEndpoint(): string {
    const issuer = (this.config.get<string>('KEYCLOAK_ISSUER') || '').replace(/\/$/, '');
    if (!issuer) {
      throw new ConnectorStructuredException(
        503,
        'KEYCLOAK_UNAVAILABLE',
        'KEYCLOAK_ISSUER is not configured',
        { retryable: false, requiresLogin: false },
      );
    }
    return `${issuer}/protocol/openid-connect/token`;
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await this.db.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async pingStorage(): Promise<boolean> {
    try {
      const root = this.config.get<string>('STORAGE_ROOT') || this.config.get<string>('REPO_STORAGE_ROOT');
      if (!root) return true;
      const fs = await import('node:fs/promises');
      await fs.access(root);
      return true;
    } catch {
      return false;
    }
  }

  private isUnauthorized(error: unknown): boolean {
    if (error instanceof McpAuthException) return true;
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /401|Unauthorized|ACCESS_TOKEN_EXPIRED|Token expired/i.test(message);
  }
}
