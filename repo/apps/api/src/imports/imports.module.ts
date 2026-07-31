import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ExternalImportOrchestratorService } from './external-import-orchestrator.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [ImportsController],
  providers: [ImportsService, ExternalImportOrchestratorService, RolesGuard],
  exports: [ImportsService, ExternalImportOrchestratorService],
})
export class ImportsModule {}
