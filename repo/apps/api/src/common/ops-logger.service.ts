import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from './audit.service';

export type OpsFailureCategory =
  | 'IMPORT_FAILURE'
  | 'ROUTING_FAILURE'
  | 'TEMPLATE_FAILURE'
  | 'AUTH_FAILURE'
  | 'DATABASE_FAILURE'
  | 'CONFIGURATION_FAILURE';

@Injectable()
export class OpsLoggerService {
  private readonly logger = new Logger('OpsLogger');

  constructor(private readonly audit: AuditService) {}

  requestId() {
    return randomUUID();
  }

  async failure(input: {
    category: OpsFailureCategory;
    message: string;
    exception?: unknown;
    userId?: string;
    userEmail?: string;
    documentId?: string;
    documentCode?: string;
    projectId?: string;
    projectCode?: string;
    repository?: string;
    endpoint?: string;
    requestId?: string;
    meta?: Record<string, unknown>;
  }) {
    const requestId = input.requestId || this.requestId();
    const err = input.exception;
    const stack = err instanceof Error ? err.stack : undefined;
    const exceptionMessage = err instanceof Error ? err.message : err ? String(err) : undefined;

    const payload = {
      timestamp: new Date().toISOString(),
      requestId,
      category: input.category,
      message: input.message,
      user: input.userEmail || input.userId || null,
      document: input.documentCode || input.documentId || null,
      project: input.projectCode || input.projectId || null,
      repository: input.repository || null,
      endpoint: input.endpoint || null,
      exception: exceptionMessage || null,
      meta: input.meta || null,
    };

    // Server-only structured log (includes stack).
    this.logger.error({ ...payload, stack });

    try {
      await this.audit.record({
        userId: input.userId,
        action: input.category,
        entityType: input.category.includes('TEMPLATE')
          ? 'DirectoryTemplate'
          : input.category.includes('ROUTING')
            ? 'RoutingRule'
            : input.category.includes('AUTH')
              ? 'Auth'
              : 'ImportJob',
        entityId: input.documentId || input.projectId,
        message: `${input.message}${exceptionMessage ? ` — ${exceptionMessage}` : ''}`,
        after: { ...payload, stack: undefined },
      });
    } catch {
      // Never block the main request on logging failure.
    }

    return requestId;
  }
}
