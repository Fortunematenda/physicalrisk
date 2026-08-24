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
import { McpBinaryImportService } from './mcp-binary-import.service';
import { McpBinaryImportScheduler } from './mcp-binary-import.scheduler';
import { McpBrowserUploadService } from './mcp-browser-upload.service';
import { McpMarkdownPdfService } from './mcp-markdown-pdf.service';
import { McpMarkdownOfficeService } from './mcp-markdown-office.service';
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
    McpBinaryImportService,
    McpBinaryImportScheduler,
    McpBrowserUploadService,
    McpRemoteFileService,
    McpMarkdownPdfService,
    McpMarkdownOfficeService,
    ConnectorSessionService,
    ConnectorIdempotencyService,
    ConnectorImportJobService,
    RolesGuard,
  ],
  exports: [
    McpAuthService,
    McpToolsService,
    McpBinaryImportService,
    ConnectorSessionService,
    ConnectorIdempotencyService,
    ConnectorImportJobService,
  ],
})
export class McpModule {}
