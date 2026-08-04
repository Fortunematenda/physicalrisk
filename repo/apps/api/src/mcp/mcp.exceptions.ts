import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';

export type ConnectorErrorCode =
  | 'ACCESS_TOKEN_EXPIRED'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'REFRESH_TOKEN_INVALID'
  | 'CONNECTOR_SESSION_NOT_FOUND'
  | 'CONNECTOR_SESSION_REVOKED'
  | 'AUTH_SESSION_NOT_FOUND'
  | 'REPOSITORY_API_UNAVAILABLE'
  | 'CONNECTOR_REQUEST_TIMEOUT'
  | 'KEYCLOAK_UNAVAILABLE'
  | 'DATABASE_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE'
  | 'MCP_AUTH_FAILED'
  | 'MCP_FORBIDDEN'
  | 'MCP_RATE_LIMIT'
  | 'MCP_TOOL_NOT_ALLOWED'
  | 'IDEMPOTENCY_KEY_CONFLICT';

export interface ConnectorErrorBody {
  success: false;
  errorCode: ConnectorErrorCode;
  message: string;
  retryable: boolean;
  requiresLogin: boolean;
  requestId?: string;
  code?: string;
}

export function connectorErrorBody(
  errorCode: ConnectorErrorCode,
  message: string,
  opts?: Partial<Pick<ConnectorErrorBody, 'retryable' | 'requiresLogin' | 'requestId'>>,
): ConnectorErrorBody {
  return {
    success: false,
    errorCode,
    message,
    retryable: opts?.retryable ?? false,
    requiresLogin: opts?.requiresLogin ?? false,
    requestId: opts?.requestId,
    code: errorCode,
  };
}

export class McpAuthException extends UnauthorizedException {
  constructor(
    message = 'Valid MCP API key or OAuth access token required',
    errorCode: ConnectorErrorCode = 'MCP_AUTH_FAILED',
    opts?: Partial<Pick<ConnectorErrorBody, 'retryable' | 'requiresLogin' | 'requestId'>>,
  ) {
    super(connectorErrorBody(errorCode, message, {
      retryable: opts?.retryable ?? false,
      requiresLogin: opts?.requiresLogin ?? true,
      requestId: opts?.requestId,
    }));
  }
}

export class McpForbiddenException extends ForbiddenException {
  constructor(message: string, code: ConnectorErrorCode | string = 'MCP_FORBIDDEN') {
    const errorCode = (code as ConnectorErrorCode) || 'MCP_FORBIDDEN';
    super(connectorErrorBody(errorCode, message, { retryable: false, requiresLogin: false }));
  }
}

export class McpRateLimitException extends ForbiddenException {
  constructor(message = 'MCP rate limit exceeded') {
    super(connectorErrorBody('MCP_RATE_LIMIT', message, { retryable: true, requiresLogin: false }));
  }
}

export class McpToolException extends ForbiddenException {
  constructor(toolName: string) {
    super(connectorErrorBody(
      'MCP_TOOL_NOT_ALLOWED',
      `Tool '${toolName}' is not allowed for this integration`,
      { retryable: false, requiresLogin: false },
    ));
  }
}

export class ConnectorStructuredException extends HttpException {
  constructor(
    status: number,
    errorCode: ConnectorErrorCode,
    message: string,
    opts?: Partial<Pick<ConnectorErrorBody, 'retryable' | 'requiresLogin' | 'requestId'>>,
  ) {
    super(connectorErrorBody(errorCode, message, opts), status);
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof UnauthorizedException) return true;
  if (error instanceof HttpException && error.getStatus() === 401) return true;
  if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 401) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /ACCESS_TOKEN_EXPIRED|Token expired|401|Unauthorized/i.test(message);
}
