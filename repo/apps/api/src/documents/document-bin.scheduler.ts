import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentsService } from './documents.service';

@Injectable()
export class DocumentBinScheduler {
  private readonly logger = new Logger(DocumentBinScheduler.name);

  constructor(private readonly documents: DocumentsService) {}

  /** Permanently remove recycle-bin documents older than the retention window. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpired() {
    try {
      const result = await this.documents.purgeExpiredBin();
      if (result.purged > 0) {
        this.logger.log(`Purged ${result.purged} expired recycle-bin document(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Recycle bin purge failed';
      this.logger.warn(message);
    }
  }
}
