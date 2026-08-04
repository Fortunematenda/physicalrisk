import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ConnectorStructuredException } from './mcp.exceptions';
import { hashIdempotencyPayload } from './mcp-token.util';

@Injectable()
export class ConnectorIdempotencyService {
  constructor(private readonly db: DatabaseService) {}

  async beginOrReplay<T>(opts: {
    idempotencyKey: string | undefined | null;
    operation: string;
    userId?: string | null;
    requestPayload?: unknown;
    execute: () => Promise<T>;
  }): Promise<{ result: T; replayed: boolean }> {
    const key = opts.idempotencyKey?.trim();
    if (!key) {
      return { result: await opts.execute(), replayed: false };
    }

    const existing = await this.db.connectorIdempotencyKeys.findOne({
      where: { idempotencyKey: key },
    });
    const requestHash = hashIdempotencyPayload(opts.requestPayload);

    if (existing) {
      if (existing.operation !== opts.operation) {
        throw new ConnectorStructuredException(
          409,
          'IDEMPOTENCY_KEY_CONFLICT',
          'Idempotency-Key was already used for a different operation',
          { retryable: false, requiresLogin: false },
        );
      }
      if (existing.requestHash && requestHash && existing.requestHash !== requestHash) {
        throw new ConnectorStructuredException(
          409,
          'IDEMPOTENCY_KEY_CONFLICT',
          'Idempotency-Key was already used with a different request body',
          { retryable: false, requiresLogin: false },
        );
      }
      return { result: existing.responseJson as T, replayed: true };
    }

    const result = await opts.execute();
    await this.db.connectorIdempotencyKeys.save(
      this.db.connectorIdempotencyKeys.create({
        idempotencyKey: key,
        userId: opts.userId ?? null,
        operation: opts.operation,
        requestHash,
        responseJson: result as unknown,
        httpStatus: 200,
      }),
    );
    return { result, replayed: false };
  }
}
