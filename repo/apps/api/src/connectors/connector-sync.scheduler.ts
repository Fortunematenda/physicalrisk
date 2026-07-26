import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Not, In } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import {
  ImportStatus,
  SourceConnectionStatus,
  SyncSchedule,
  SyncTriggerType,
} from '../database/entities';
import { VpsStorageService } from '../storage/vps-storage.service';
import { ConnectorsService } from './connectors.service';

const TERMINAL_IMPORT_STATUSES = [
  ImportStatus.IMPORTED,
  ImportStatus.REJECTED,
  ImportStatus.FAILED,
];

@Injectable()
export class ConnectorSyncScheduler {
  private readonly logger = new Logger(ConnectorSyncScheduler.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly connectors: ConnectorsService,
    private readonly storage: VpsStorageService,
  ) {}

  @Cron('*/15 * * * *')
  async runScheduledSyncs() {
    const now = Date.now();
    const connections = await this.db.sourceConnections.find({
      where: { status: SourceConnectionStatus.CONNECTED },
    });

    for (const connection of connections) {
      if (connection.syncSchedule === SyncSchedule.MANUAL) continue;
      if (!this.isDue(connection.syncSchedule, connection.lastSyncAt, now)) continue;
      try {
        await this.connectors.syncConnection(connection.id, undefined, SyncTriggerType.SCHEDULED);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduled sync failed';
        this.logger.warn(`Scheduled sync skipped/failed for ${connection.id}: ${message}`);
      }
    }
  }

  /** Remove abandoned staging files older than 7 days that are not linked to active Import Queue items. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupAbandonedStaging() {
    const activeJobs = await this.db.importJobs.find({
      where: { status: Not(In(TERMINAL_IMPORT_STATUSES)) },
      select: { incomingPath: true },
    });
    const protectedPaths = new Set(
      activeJobs
        .map((job) => job.incomingPath?.replace(/\\/g, '/') ?? '')
        .filter((path) => path.startsWith('staging/external-imports/')),
    );
    const result = await this.storage.cleanupAbandonedExternalStaging(
      protectedPaths,
      7 * 24 * 60 * 60 * 1000,
    );
    this.logger.log(`Removed ${result.removed} abandoned external-import staging file(s)`);
  }

  private isDue(schedule: SyncSchedule, lastSyncAt: Date | null, nowMs: number): boolean {
    if (!lastSyncAt) return true;
    const elapsed = nowMs - lastSyncAt.getTime();
    switch (schedule) {
      case SyncSchedule.EVERY_15_MINUTES:
        return elapsed >= 15 * 60 * 1000;
      case SyncSchedule.HOURLY:
        return elapsed >= 60 * 60 * 1000;
      case SyncSchedule.DAILY:
        return elapsed >= 24 * 60 * 60 * 1000;
      default:
        return false;
    }
  }
}
