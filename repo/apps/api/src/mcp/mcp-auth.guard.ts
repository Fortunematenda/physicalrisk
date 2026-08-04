import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { ConnectorSessionService } from './connector-session.service';
import { McpAuthService } from './mcp-auth.service';
import { McpAuthException, McpRateLimitException, McpToolException } from './mcp.exceptions';
import { McpToolName } from './mcp.dto';
import {
  accessTokenExpired,
  accessTokenExpiresSoon,
  sessionIdFromAccessToken,
  sessionIdFromApiKey,
} from './mcp-token.util';

export const MCP_INTEGRATION_KEY = 'mcpIntegration';
export const MCP_TOOL_KEY = 'mcpTool';
export const MCP_SESSION_ID_KEY = 'mcpSessionId';
export const MCP_REQUEST_ID_KEY = 'mcpRequestId';
export const MCP_TOKEN_REFRESHED_KEY = 'mcpTokenRefreshed';

export const McpTool = (toolName: McpToolName) => SetMetadata(MCP_TOOL_KEY, toolName);

interface RateWindow {
  timestamps: number[];
}

@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);
  private readonly windows = new Map<string, RateWindow>();
  private readonly windowMs = 60_000;
  private readonly maxRequests = 120;

  constructor(
    private readonly auth: McpAuthService,
    private readonly sessions: ConnectorSessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const started = Date.now();
    const requestId = (typeof request.headers?.['x-request-id'] === 'string'
      && request.headers['x-request-id'].trim())
      || randomUUID();
    request[MCP_REQUEST_ID_KEY] = requestId;

    const rawBearer = this.extractBearer(request);
    if (!rawBearer) {
      throw new McpAuthException(
        'Valid MCP API key or OAuth access token required',
        'MCP_AUTH_FAILED',
        { requiresLogin: true, requestId },
      );
    }

    const isApiKey = rawBearer.startsWith('mcp_');
    if (!isApiKey) {
      if (accessTokenExpired(rawBearer)) {
        throw new McpAuthException(
          'The access token expired. ChatGPT should refresh via Keycloak offline_access, or reconnect.',
          'ACCESS_TOKEN_EXPIRED',
          { requiresLogin: true, retryable: true, requestId },
        );
      }
      if (accessTokenExpiresSoon(rawBearer)) {
        // Still accept — but mark so clients can refresh proactively on next call.
        request[MCP_TOKEN_REFRESHED_KEY] = false;
      }
    }

    let integration;
    try {
      integration = await this.auth.validateBearer(rawBearer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = (error as { code?: string })?.code;
      if (code === 'ACCESS_TOKEN_EXPIRED' || /Token expired/i.test(message)) {
        throw new McpAuthException(
          'The access token expired and could not be used.',
          'ACCESS_TOKEN_EXPIRED',
          { requiresLogin: true, retryable: true, requestId },
        );
      }
      if (/keycloak|jwks|ECONNREFUSED|fetch/i.test(message)) {
        throw new McpAuthException(
          'Keycloak is temporarily unavailable while validating the access token.',
          'KEYCLOAK_UNAVAILABLE',
          { requiresLogin: false, retryable: true, requestId },
        );
      }
      throw new McpAuthException(
        'Valid MCP API key or OAuth access token required',
        'MCP_AUTH_FAILED',
        { requiresLogin: true, requestId },
      );
    }

    const toolName = this.reflector.getAllAndOverride<McpToolName | undefined>(MCP_TOOL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (toolName) {
      try {
        this.auth.assertToolAllowed(integration, toolName);
      } catch {
        throw new McpToolException(toolName);
      }
    }

    this.assertRateLimit(integration.id);

    let sessionId: string | null = isApiKey
      ? sessionIdFromApiKey(rawBearer)
      : sessionIdFromAccessToken(rawBearer);
    try {
      const session = await this.sessions.touchFromBearer(rawBearer, integration);
      if (session) sessionId = session.sessionId;
    } catch (error) {
      if (error instanceof McpAuthException) throw error;
      this.logger.warn(`Connector session persist failed: ${error instanceof Error ? error.message : error}`);
    }

    request[MCP_INTEGRATION_KEY] = integration;
    request[MCP_SESSION_ID_KEY] = sessionId;

    const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown';
    this.logger.log(JSON.stringify({
      requestId,
      sessionId,
      userId: integration.createdBy?.id ?? null,
      operation: toolName || request.method + ' ' + request.url,
      httpStatus: 0,
      tokenExpiry: isApiKey ? null : undefined,
      tokenRefreshOccurred: false,
      retryCount: 0,
      durationMs: Date.now() - started,
      containerInstance: hostname,
      timestamp: new Date().toISOString(),
    }));

    return true;
  }

  private extractBearer(request: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
    const headerKey = request.headers?.['x-mcp-api-key'];
    if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();
    if (Array.isArray(headerKey) && headerKey[0]?.trim()) return headerKey[0].trim();

    const authorization = request.headers?.authorization;
    const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
    if (typeof authValue === 'string') {
      const value = authValue.trim();
      if (/^bearer\s+/i.test(value)) {
        return value.replace(/^bearer\s+/i, '').trim();
      }
      if (value.startsWith('mcp_')) return value;
    }
    return undefined;
  }

  private assertRateLimit(integrationId: string): void {
    const now = Date.now();
    const bucket = this.windows.get(integrationId) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < this.windowMs);
    if (bucket.timestamps.length >= this.maxRequests) {
      throw new McpRateLimitException();
    }
    bucket.timestamps.push(now);
    this.windows.set(integrationId, bucket);
  }
}
