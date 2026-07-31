import { HttpException, HttpStatus } from '@nestjs/common';

export class WorkspaceException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, message, details }, status);
  }
}

export const WorkspaceErrors = {
  notFound: (code?: string) =>
    new WorkspaceException('WORKSPACE_NOT_FOUND', code ? `Workspace ${code} was not found` : 'Workspace not found', HttpStatus.NOT_FOUND),
  accessDenied: () =>
    new WorkspaceException('WORKSPACE_ACCESS_DENIED', 'You do not have access to this workspace', HttpStatus.FORBIDDEN),
  alreadyCompleted: () =>
    new WorkspaceException('WORKSPACE_ALREADY_COMPLETED', 'This workspace is already completed', HttpStatus.CONFLICT),
  notReady: (reason?: string) =>
    new WorkspaceException('WORKSPACE_NOT_READY', reason || 'Workspace is not ready for this action', HttpStatus.CONFLICT),
  projectAccessDenied: () =>
    new WorkspaceException('PROJECT_ACCESS_DENIED', 'You do not have access to this project', HttpStatus.FORBIDDEN),
  authRequired: () =>
    new WorkspaceException('AUTHENTICATION_REQUIRED', 'Authentication is required', HttpStatus.UNAUTHORIZED),
};
