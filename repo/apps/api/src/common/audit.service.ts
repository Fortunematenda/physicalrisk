import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(input: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    message: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string;
  }) {
    const user = input.userId ? await this.db.users.findOne({ where: { id: input.userId } }) : null;
    const row = this.db.auditLogs.create({
      user,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      message: input.message,
      before: input.before ?? null,
      after: input.after ?? null,
      ipAddress: input.ipAddress ?? null,
    });
    return this.db.auditLogs.save(row);
  }
}
