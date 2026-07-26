import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export class McpAuthException extends UnauthorizedException {
  constructor(message = 'Valid MCP API key required') {
    super({ code: 'MCP_AUTH_FAILED', message });
  }
}

export class McpForbiddenException extends ForbiddenException {
  constructor(message: string, code = 'MCP_FORBIDDEN') {
    super({ code, message });
  }
}

export class McpRateLimitException extends ForbiddenException {
  constructor(message = 'MCP rate limit exceeded') {
    super({ code: 'MCP_RATE_LIMIT', message });
  }
}

export class McpToolException extends ForbiddenException {
  constructor(toolName: string) {
    super({ code: 'MCP_TOOL_NOT_ALLOWED', message: `Tool '${toolName}' is not allowed for this integration` });
  }
}
