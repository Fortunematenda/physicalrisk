import { ConnectorIdempotencyService } from './connector-idempotency.service';

describe('ConnectorIdempotencyService', () => {
  it('replays the original result for the same Idempotency-Key', async () => {
    const store = new Map<string, any>();
    const db = {
      connectorIdempotencyKeys: {
        findOne: jest.fn(async ({ where }: any) => store.get(where.idempotencyKey) ?? null),
        create: jest.fn((row: any) => row),
        save: jest.fn(async (row: any) => {
          store.set(row.idempotencyKey, row);
          return row;
        }),
      },
    };

    const service = new ConnectorIdempotencyService(db as any);
    let executions = 0;
    const first = await service.beginOrReplay({
      idempotencyKey: 'wysu-ws-2026-00005-document-01',
      operation: 'submit_approved_document',
      requestPayload: { title: 'Doc' },
      execute: async () => {
        executions += 1;
        return { importJobId: 'job-1', status: 'QUEUED' };
      },
    });
    const second = await service.beginOrReplay({
      idempotencyKey: 'wysu-ws-2026-00005-document-01',
      operation: 'submit_approved_document',
      requestPayload: { title: 'Doc' },
      execute: async () => {
        executions += 1;
        return { importJobId: 'job-2', status: 'QUEUED' };
      },
    });

    expect(executions).toBe(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
  });

  it('rejects the same key used with a different payload', async () => {
    const store = new Map<string, any>();
    const db = {
      connectorIdempotencyKeys: {
        findOne: jest.fn(async ({ where }: any) => store.get(where.idempotencyKey) ?? null),
        create: jest.fn((row: any) => row),
        save: jest.fn(async (row: any) => {
          store.set(row.idempotencyKey, row);
          return row;
        }),
      },
    };
    const service = new ConnectorIdempotencyService(db as any);
    await service.beginOrReplay({
      idempotencyKey: 'same-key',
      operation: 'submit_approved_document',
      requestPayload: { title: 'A' },
      execute: async () => ({ ok: true }),
    });
    await expect(service.beginOrReplay({
      idempotencyKey: 'same-key',
      operation: 'submit_approved_document',
      requestPayload: { title: 'B' },
      execute: async () => ({ ok: true }),
    })).rejects.toMatchObject({ status: 409 });
  });
});
