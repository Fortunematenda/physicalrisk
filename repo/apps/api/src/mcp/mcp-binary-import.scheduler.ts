import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { McpBinaryImportService } from './mcp-binary-import.service';

@Injectable()
export class McpBinaryImportScheduler {
  private readonly logger = new Logger(McpBinaryImportScheduler.name);

  constructor(private readonly binaryImport: McpBinaryImportService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStaleSessions() {
    try {
      const result = await this.binaryImport.expireStaleSessions();
      if (result.expired > 0) {
        this.logger.log(`Expired ${result.expired} MCP binary import session(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MCP binary import cleanup failed';
      this.logger.warn(message);
    }
  }
}
