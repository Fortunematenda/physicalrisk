import { Module } from '@nestjs/common';
import { WorkspaceCodeService } from './workspace-code.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceCodeService],
  exports: [WorkspacesService, WorkspaceCodeService],
})
export class WorkspacesModule {}
