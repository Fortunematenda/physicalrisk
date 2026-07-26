import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ExternalImportOrchestratorService } from './external-import-orchestrator.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ExternalImportOrchestratorService],
  exports: [ImportsService, ExternalImportOrchestratorService],
})
export class ImportsModule {}
