import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { McpAuthService } from './mcp-auth.service';
import { McpAuthException, McpRateLimitException, McpToolException } from './mcp.exceptions';
import { McpToolName } from './mcp.dto';

export const MCP_INTEGRATION_KEY = 'mcpIntegration';
export const MCP_TOOL_KEY = 'mcpTool';

export const McpTool = (toolName: McpToolName) => SetMetadata(MCP_TOOL_KEY, toolName);

interface RateWindow {
  timestamps: number[];
}

@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly windows = new Map<string, RateWindow>();
  private readonly windowMs = 60_000;
  private readonly maxRequests = 120;

  constructor(
    private readonly auth: McpAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawBearer = this.extractBearer(request);
    if (!rawBearer) throw new McpAuthException();

    let integration;
    try {
      integration = await this.auth.validateBearer(rawBearer);
    } catch {
      throw new McpAuthException();
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
    request[MCP_INTEGRATION_KEY] = integration;
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
      // Some Action clients send the raw mcp_ key in Authorization without Bearer.
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
