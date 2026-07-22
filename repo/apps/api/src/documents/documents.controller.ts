import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { DocumentStatus, RelationshipType, UserRole } from '../database/entities';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DocumentsService } from './documents.service';

const DOCUMENT_MUTATION_ROLES = [UserRole.ADMIN, UserRole.IMPORTER] as const;

@ApiTags('repository')
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('documents')
  list(@Query('projectId') projectId?: string, @Query('sectionId') sectionId?: string, @Query('search') search?: string, @Query('status') status?: string) {
    return this.documents.list({ projectId, sectionId, search, status });
  }

  @Get('documents/:id') get(@Param('id') id: string) { return this.documents.get(id); }

  @Patch('documents/:id')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseGuards(RolesGuard)
  @Roles(...DOCUMENT_MUTATION_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: {
      title?: string;
      documentType?: string;
      owner?: string | null;
      description?: string | null;
      notes?: string | null;
      status?: DocumentStatus;
      code?: string;
      projectId?: string;
      sectionId?: string;
      versionNo?: string;
      approvedBy?: string;
      approvalDate?: string;
    },
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.documents.update(id, body, file, user?.id);
  }

  @Patch('documents/:id/notes')
  @UseGuards(RolesGuard)
  @Roles(...DOCUMENT_MUTATION_ROLES)
  addNote(
    @Param('id') id: string,
    @Body() body: { notes?: string | null; body?: string | null },
    @CurrentUser() user: { id?: string } | null,
  ) {
    return this.documents.updateNotes(id, body?.notes ?? body?.body, user?.id);
  }

  @Delete('documents/:id')
  @UseGuards(RolesGuard)
  @Roles(...DOCUMENT_MUTATION_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) {
    return this.documents.remove(id, user?.id);
  }

  @Get('version-register') versionRegister(@Query('projectId') projectId?: string) { return this.documents.versionRegister(projectId); }
  @Get('relationships') relationships(@Query('projectId') projectId?: string) { return this.documents.relationships(projectId); }
  @Post('relationships') createRelationship(@Body() body: { fromDocumentId: string; toDocumentId: string; type?: RelationshipType; description?: string }, @CurrentUser() user: { id?: string } | null) { return this.documents.createRelationship(body, user?.id); }
  @Delete('relationships/:id') deleteRelationship(@Param('id') id: string, @CurrentUser() user: { id?: string } | null) { return this.documents.deleteRelationship(id, user?.id); }
  @Get('audit-logs') auditLogs(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) { return this.documents.auditLogs(entityType, entityId); }

  @Get('versions/:id/view')
  async view(@Param('id') id: string, @Res() response: Response) {
    const version = await this.documents.versionFile(id);
    const safeInlineTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const disposition = safeInlineTypes.includes(version.version.mimeType) ? 'inline' : 'attachment';
    response.setHeader('Content-Type', version.version.mimeType);
    response.setHeader('Content-Disposition', `${disposition}; filename="${version.version.originalFileName.replace(/"/g, '')}"`);
    createReadStream(version.absolutePath).pipe(response);
  }

  @Get('versions/:id/download')
  async download(@Param('id') id: string, @Res() response: Response) {
    const version = await this.documents.versionFile(id);
    response.setHeader('Content-Type', version.version.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${version.version.originalFileName.replace(/"/g, '')}"`);
    createReadStream(version.absolutePath).pipe(response);
  }
}
