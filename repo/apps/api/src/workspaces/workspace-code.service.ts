import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SequenceCounter } from '../database/entities';

export type ReadableCodeKind = 'WS' | 'JOB' | 'PACK';

@Injectable()
export class WorkspaceCodeService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Atomically allocate the next readable code: PREFIX-YYYY-#####
   * Uses SELECT … FOR UPDATE on sequence_counters inside a transaction.
   */
  async nextCode(kind: ReadableCodeKind, year = new Date().getUTCFullYear()): Promise<string> {
    const name = kind === 'WS' ? 'workspace' : kind === 'JOB' ? 'import_job' : 'zip_pack';
    return this.db.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SequenceCounter);
      let row = await repo
        .createQueryBuilder('counter')
        .setLock('pessimistic_write')
        .where('counter.name = :name AND counter.year = :year', { name, year })
        .getOne();

      if (!row) {
        row = await repo.save(repo.create({ name, year, nextValue: 1 }));
        // Re-lock in case of concurrent insert race.
        row = await repo
          .createQueryBuilder('counter')
          .setLock('pessimistic_write')
          .where('counter.id = :id', { id: row.id })
          .getOne() ?? row;
      }

      const value = row.nextValue;
      row.nextValue = value + 1;
      await repo.save(row);
      return `${kind}-${year}-${String(value).padStart(5, '0')}`;
    });
  }
}
