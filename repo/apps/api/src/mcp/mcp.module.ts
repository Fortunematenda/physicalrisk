import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { ImportsModule } from '../imports/imports.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpAuthService } from './mcp-auth.service';
import { McpBrowserUploadService } from './mcp-browser-upload.service';
import { McpMarkdownPdfService } from './mcp-markdown-pdf.service';
import { McpRemoteFileService } from './mcp-remote-file.service';
import { McpController } from './mcp.controller';
import { McpToolsService } from './mcp-tools.service';
import { McpUploadSessionService } from './mcp-upload-session.service';

@Module({
  imports: [ImportsModule],
  controllers: [McpController],
  providers: [
    McpAuthService,
    McpAuthGuard,
    McpToolsService,
    McpUploadSessionService,
    McpBrowserUploadService,
    McpRemoteFileService,
    McpMarkdownPdfService,
    RolesGuard,
  ],
  exports: [McpAuthService, McpToolsService],
})
export class McpModule {}
