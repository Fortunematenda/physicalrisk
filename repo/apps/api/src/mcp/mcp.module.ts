import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { ImportsModule } from '../imports/imports.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpAuthService } from './mcp-auth.service';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';
import { McpUploadSessionService } from './mcp-upload-session.service';

@Module({
  imports: [ImportsModule],
  controllers: [McpController],
  providers: [McpAuthService, McpAuthGuard, McpToolsService, McpUploadSessionService, RolesGuard],
  exports: [McpAuthService, McpToolsService],
})
export class McpModule {}
