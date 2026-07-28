import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ExternalImportOrchestratorService } from './external-import-orchestrator.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ExternalImportOrchestratorService, RolesGuard],
  exports: [ImportsService, ExternalImportOrchestratorService],
})
export class ImportsModule {}
