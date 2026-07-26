import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { McpAuthService } from './mcp-auth.service';
import { McpAuthException, McpRateLimitException } from './mcp.exceptions';
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
  private readonly maxRequests = 60;

  constructor(
    private readonly auth: McpAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = this.extractApiKey(request);
    if (!rawKey) throw new McpAuthException();

    let integration;
    try {
      integration = await this.auth.validateApiKey(rawKey);
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
        throw new McpAuthException(`Tool '${toolName}' is not allowed for this integration`);
      }
    }

    this.assertRateLimit(integration.id);
    request[MCP_INTEGRATION_KEY] = integration;
    return true;
  }

  private extractApiKey(request: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
    const headerKey = request.headers?.['x-mcp-api-key'];
    if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();

    const authorization = request.headers?.authorization;
    if (typeof authorization === 'string') {
      const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (bearer.startsWith('mcp_')) return bearer;
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
