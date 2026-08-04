import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { ConnectorsModule } from '../connectors/connectors.module';
import { DocumentsModule } from '../documents/documents.module';
import { ImportsModule } from '../imports/imports.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ConnectorController, ConnectorHealthController, ConnectorImportJobsController } from './connector.controller';
import { ConnectorIdempotencyService } from './connector-idempotency.service';
import { ConnectorImportJobService } from './connector-import-job.service';
import { ConnectorSessionService } from './connector-session.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpAuthService } from './mcp-auth.service';
import { McpBrowserUploadService } from './mcp-browser-upload.service';
import { McpMarkdownPdfService } from './mcp-markdown-pdf.service';
import { McpRemoteFileService } from './mcp-remote-file.service';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';
import { McpUploadSessionService } from './mcp-upload-session.service';

@Module({
  imports: [ImportsModule, WorkspacesModule, DocumentsModule, ConnectorsModule],
  controllers: [
    McpController,
    ConnectorController,
    ConnectorImportJobsController,
    ConnectorHealthController,
  ],
  providers: [
    McpAuthService,
    McpAuthGuard,
    McpToolsService,
    McpUploadSessionService,
    McpBrowserUploadService,
    McpRemoteFileService,
    McpMarkdownPdfService,
    ConnectorSessionService,
    ConnectorIdempotencyService,
    ConnectorImportJobService,
    RolesGuard,
  ],
  exports: [
    McpAuthService,
    McpToolsService,
    ConnectorSessionService,
    ConnectorIdempotencyService,
    ConnectorImportJobService,
  ],
})
export class McpModule {}
