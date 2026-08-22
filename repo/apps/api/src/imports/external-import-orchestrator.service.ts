import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { AuditService } from '../common/audit.service';
import { assertFileSizeAllowed, assertMimeTypeAllowed } from '../connectors/connector-validation.util';
import { ExternalImportRequest, McpApprovedDocumentRequest, McpExternalImportResult } from '../connectors/interfaces/external-import-request.interface';
import { DatabaseService } from '../database/database.service';
import {
  ApprovalStatus,
  ConnectorProvider,
  ExternalImportStatus,
  ImportJob,
  ImportStatus,
  Project,
  ProjectSection,
  SourceConnection,
  SourceConnectionStatus,
  SourceSystem,
  User,
} from '../database/entities';
import { VpsStorageService } from '../storage/vps-storage.service';
import { determineExternalImportStatuses } from './external-import-dedup.util';
import { ImportsService } from './imports.service';

@Injectable()
export class ExternalImportOrchestratorService {
  private static readonly CHATGPT_MCP_SOURCE_CODE = 'CHATGPT_MCP';

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: VpsStorageService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => ImportsService))
    private readonly imports: ImportsService,
  ) {}

  async queueExternalImport(request: ExternalImportRequest): Promise<ImportJob> {
    const connection = request.sourceConnectionId
      ? await this.db.sourceConnections.findOne({
          where: { id: request.sourceConnectionId },
          relations: { defaultProject: true, defaultSection: true, createdBy: true },
        })
      : null;
    if (request.sourceConnectionId && !connection) {
      throw new NotFoundException('Source connection not found');
    }
    if (connection && connection.provider !== request.provider) {
      throw new BadRequestException('Provider does not match the source connection');
    }
    if (connection && connection.status !== SourceConnectionStatus.CONNECTED) {
      throw new BadRequestException('Source connection is not connected');
    }

    const user = request.initiatedByUserId
      ? await this.db.users.findOne({ where: { id: request.initiatedByUserId } })
      : null;

    const extension = extname(request.externalFileName).replace('.', '').toLowerCase();
    const fileType = await this.db.fileTypes.findOne({ where: { extension } });
    if (!fileType || !fileType.active) {
      throw new BadRequestException(`.${extension || 'unknown'} files are not enabled in the database`);
    }
    assertFileSizeAllowed(request.fileSize, fileType);
    assertMimeTypeAllowed(request.mimeType, fileType, request.externalFileName);

    const checksum = createHash('sha256').update(request.data).digest('hex');
    const revisionId = request.externalRevisionId?.trim() || '';
    const staged = await this.storage.stageExternalImport(request.externalFileName, request.data);

    const existingReference = await this.db.externalImportReferences.findOne({
      where: {
        provider: request.provider,
        externalFileId: request.externalFileId,
        externalRevisionId: revisionId,
      },
      relations: { importJob: true },
    });

    const matchingVersion = await this.db.documentVersions.findOne({
      where: { checksum },
      relations: { document: true },
    });
    const sameDocumentVersions = matchingVersion
      ? await this.db.documentVersions.find({
          where: { document: { id: matchingVersion.document.id } },
          relations: { document: true },
        })
      : [];

    const dedup = determineExternalImportStatuses({
      existingReferenceImported: Boolean(existingReference?.importJob?.status === ImportStatus.IMPORTED),
      matchingVersionChecksum: Boolean(matchingVersion),
      matchingVersionDifferentRevision: Boolean(existingReference && existingReference.checksum !== checksum),
      sameDocumentDifferentChecksum: sameDocumentVersions.some((version) => version.checksum !== checksum),
    });

    const { project, section, sourceSystem } = await this.resolveTargets(request, connection);

    const metadata: Record<string, unknown> = {
      provider: request.provider,
      externalFileId: request.externalFileId,
      externalRevisionId: revisionId,
      externalModifiedAt: request.externalModifiedAt?.toISOString() ?? null,
      folderId: request.folderId ?? null,
      folderMappingId: request.folderMappingId ?? null,
      dedupReason: dedup.reason,
      title: request.externalFileName.replace(/\.[^.]+$/, ''),
      documentType: '',
      versionNo: '1.0',
      approvalDate: new Date().toISOString(),
      projectId: project.id,
      sourceSystemId: sourceSystem.id,
      sectionKey: section?.sectionKey ?? null,
    };

    const job = this.db.importJobs.create({
      sourceSystem,
      project,
      resolvedSection: section,
      document: null,
      version: null,
      fileName: request.externalFileName,
      incomingPath: staged.relativePath,
      mimeType: request.mimeType,
      fileSize: request.fileSize,
      checksum,
      status: dedup.importStatus,
      metadata,
      errorMessage: null,
      routingDecision: null,
      storageResult: null,
      initiatedBy: user,
      completedAt: null,
      provider: request.provider,
      externalImportStatus: dedup.externalImportStatus as ExternalImportStatus,
      sourceConnection: connection,
    });
    const saved = await this.db.importJobs.save(job);

    const reference = existingReference ?? this.db.externalImportReferences.create({
      provider: request.provider,
      externalFileId: request.externalFileId,
      externalRevisionId: revisionId,
      externalFileName: request.externalFileName,
      checksum,
      externalModifiedAt: request.externalModifiedAt ?? null,
      sourceConnection: connection,
      importJob: saved,
    });
    reference.checksum = checksum;
    reference.externalFileName = request.externalFileName;
    reference.externalModifiedAt = request.externalModifiedAt ?? null;
    reference.importJob = saved;
    await this.db.externalImportReferences.save(reference);

    await this.audit.record({
      userId: user?.id,
      action: 'EXTERNAL_IMPORT_QUEUED',
      entityType: 'ImportJob',
      entityId: saved.id,
      message: `Queued external import ${request.externalFileName} from ${request.provider}`,
      after: {
        provider: request.provider,
        status: saved.status,
        externalImportStatus: saved.externalImportStatus,
        checksum,
        dedupReason: dedup.reason,
      },
    });

    return this.db.importJobs.findOne({
      where: { id: saved.id },
      relations: {
        project: true,
        sourceSystem: true,
        resolvedSection: true,
        initiatedBy: true,
        sourceConnection: true,
      },
    }) as Promise<ImportJob>;
  }

  assertApprovedStatus(rawStatus: string | undefined): void {
    const normalized = String(rawStatus ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (normalized !== ApprovalStatus.APPROVED) {
      throw new BadRequestException(
        `Only APPROVED documents may be submitted (received: ${normalized || 'empty'}). Draft, pending, in-review, or rejected assets are not accepted.`,
      );
    }
  }

  async queueMcpApprovedDocument(request: McpApprovedDocumentRequest): Promise<McpExternalImportResult> {
    this.assertApprovedStatus(request.approvalStatus);

    const project = await this.db.projects.findOne({ where: { id: request.projectId.trim() } });
    if (!project || project.status !== 'ACTIVE') {
      throw new BadRequestException('Select an active project configured in the database');
    }

    const source = request.sourceSystemId?.trim()
      ? await this.db.sourceSystems.findOne({ where: { id: request.sourceSystemId.trim() } })
      : await this.resolveMcpSourceSystem(request.provider);
    if (!source || !source.active) {
      throw new BadRequestException('Select an active source system configured in the database');
    }

    const fileBuffer = this.decodeBase64File(request.fileContentBase64);
    const fileName = request.fileName.trim();
    const extension = extname(fileName).replace('.', '').toLowerCase();
    const fileType = await this.db.fileTypes.findOne({ where: { extension } });
    if (!fileType || !fileType.active) {
      throw new BadRequestException(`.${extension || 'unknown'} files are not enabled in the database`);
    }
    assertFileSizeAllowed(fileBuffer.length, fileType);
    const mimeType = request.mimeType?.trim() || 'application/octet-stream';
    assertMimeTypeAllowed(mimeType, fileType, fileName);

    const checksum = createHash('sha256').update(fileBuffer).digest('hex');
    const sourceSha256 = (request.sourceSha256?.trim().toLowerCase() || checksum).toLowerCase();
    if (request.sourceSha256?.trim() && sourceSha256 !== checksum) {
      throw new BadRequestException({
        status: 'FILE_INTEGRITY_MISMATCH',
        message: 'Client-reported source SHA-256 does not match received file bytes.',
        sourceSha256,
        receivedSha256: checksum,
      });
    }
    const staged = await this.storage.stageIncoming(fileName, fileBuffer);
    const storedBuffer = await this.storage.readIncoming(staged.relativePath);
    const storedSha256 = createHash('sha256').update(storedBuffer).digest('hex');
    const checksumVerified = storedSha256 === checksum && storedBuffer.length === fileBuffer.length;
    if (!checksumVerified) {
      await this.storage.remove(staged.relativePath).catch(() => undefined);
      throw new BadRequestException({
        status: 'FILE_INTEGRITY_MISMATCH',
        message: 'Stored file SHA-256 does not match source bytes. Import aborted.',
        sourceSha256: checksum,
        storedSha256,
        sourceSizeBytes: fileBuffer.length,
        storedSizeBytes: storedBuffer.length,
      });
    }
    const approvalDate = new Date(String(request.approvalDate).trim());
    if (Number.isNaN(approvalDate.getTime())) {
      throw new BadRequestException('Approval date is invalid');
    }

    let customMetadata: Record<string, unknown> = {};
    let relationships: unknown[] = [];
    try {
      customMetadata = request.metadataJson ? JSON.parse(request.metadataJson) as Record<string, unknown> : {};
    } catch {
      throw new BadRequestException('metadataJson must be valid JSON');
    }
    try {
      relationships = request.relationshipsJson ? JSON.parse(request.relationshipsJson) as unknown[] : [];
      if (!Array.isArray(relationships)) relationships = [];
    } catch {
      relationships = [];
    }

    const importMode: 'FILE_PRESERVE' | 'CONTENT_CREATE' =
      request.importMode === 'FILE_PRESERVE' ? 'FILE_PRESERVE' : 'CONTENT_CREATE';
    const conversionPerformed = request.conversionPerformed === true;
    const originalFilename = (request.originalFilename || fileName).trim();

    const matchingVersion = await this.db.documentVersions.findOne({
      where: { checksum },
      relations: { document: true },
    });
    const sameDocumentVersions = matchingVersion
      ? await this.db.documentVersions.find({
          where: { document: { id: matchingVersion.document.id } },
          relations: { document: true },
        })
      : [];
    const dedup = determineExternalImportStatuses({
      existingReferenceImported: false,
      matchingVersionChecksum: Boolean(matchingVersion),
      matchingVersionDifferentRevision: false,
      sameDocumentDifferentChecksum: sameDocumentVersions.some((version) => version.checksum !== checksum),
    });

    let resolvedSection: ProjectSection | null = null;
    const sectionKey = request.sectionKey?.trim();
    if (sectionKey) {
      resolvedSection = await this.db.projectSections.findOne({
        where: { project: { id: project.id }, sectionKey, active: true },
        relations: { project: true },
      });
    }

    const metadata: Record<string, unknown> = {
      projectId: request.projectId.trim(),
      sourceSystemId: source.id,
      title: request.title.trim(),
      documentCode: request.documentCode?.trim(),
      documentType: request.documentType.trim(),
      description: request.description?.trim(),
      owner: request.owner?.trim(),
      versionNo: request.versionNo.trim(),
      approvalStatus: ApprovalStatus.APPROVED,
      approvedBy: request.approvedBy.trim(),
      approvalDate: approvalDate.toISOString(),
      sectionKey: sectionKey || null,
      mode: request.mode,
      existingDocumentId: request.existingDocumentId?.trim(),
      provider: request.provider,
      mcpIntegrationId: request.mcpIntegrationId,
      customMetadata,
      relationships,
      dedupReason: dedup.reason,
      importMode,
      conversionPerformed,
      originalFilename,
      originalMimeType: mimeType,
      sourceSizeBytes: fileBuffer.length,
      sourceSha256: checksum,
      storedSizeBytes: storedBuffer.length,
      storedSha256,
      checksumVerified,
    };

    const job = this.db.importJobs.create({
      sourceSystem: source,
      project,
      resolvedSection,
      document: null,
      version: null,
      fileName,
      incomingPath: staged.relativePath,
      mimeType,
      fileSize: fileBuffer.length,
      checksum,
      // Must match Import Queue "External Imports" filter (READY_FOR_REVIEW / DUPLICATE / VERSION).
      status: dedup.importStatus,
      metadata,
      errorMessage: null,
      routingDecision: null,
      storageResult: null,
      initiatedBy: null,
      completedAt: null,
      provider: request.provider,
      externalImportStatus: dedup.externalImportStatus as ExternalImportStatus,
      sourceConnection: null,
    });

    const saved = await this.db.importJobs.save(job);
    await this.audit.record({
      action: 'IMPORT_READY_FOR_REVIEW',
      entityType: 'ImportJob',
      entityId: saved.id,
      message: `MCP submission received from ${request.provider}: ${fileName}`,
      after: {
        project: project.code,
        source: source.code,
        provider: request.provider,
        checksum,
        status: saved.status,
        externalImportStatus: saved.externalImportStatus,
        mcpIntegrationId: request.mcpIntegrationId,
        importMode,
        conversionPerformed,
        checksumVerified,
        originalFilename,
      },
    });

    const integrityFields = {
      importMode,
      conversionPerformed,
      originalFilename,
      mimeType,
      sourceSizeBytes: fileBuffer.length,
      storedSizeBytes: storedBuffer.length,
      sourceSha256: checksum,
      storedSha256,
      checksumVerified,
    };

    // Duplicates / version conflicts stay in Import Queue for a human.
    if (saved.status !== ImportStatus.READY_FOR_REVIEW) {
      return {
        importJobId: saved.id,
        status: saved.status,
        externalImportStatus: saved.externalImportStatus ?? ExternalImportStatus.READY_FOR_REVIEW,
        checksum,
        fileName,
        imported: false,
        needsReview: true,
        message:
          'Document needs Import Queue review (duplicate or version conflict). '
          + 'Routing rules were not auto-applied.',
        ...integrityFields,
      };
    }

    // Async path: return immediately so ChatGPT / nginx do not time out mid-import.
    if (request.processAsync !== false) {
      return {
        importJobId: saved.id,
        status: saved.status,
        externalImportStatus: saved.externalImportStatus ?? ExternalImportStatus.READY_FOR_REVIEW,
        checksum,
        fileName,
        imported: false,
        needsReview: false,
        message:
          'Import accepted and queued for background processing. '
          + 'Poll get_import_status with this importJobId; do not treat workspace creation as import completion.',
        ...integrityFields,
      };
    }

    // Auto-complete: admin routing rules / MCP module place the file and update Master Document Index.
    try {
      const completed = await this.imports.process(saved.id);
      return {
        importJobId: completed.id,
        status: completed.status,
        externalImportStatus: completed.externalImportStatus ?? ExternalImportStatus.IMPORTED,
        checksum,
        fileName,
        imported: completed.status === ImportStatus.IMPORTED,
        documentCode: completed.document?.code,
        sectionName: completed.resolvedSection?.name,
        message:
          completed.status === ImportStatus.IMPORTED
            ? `Imported into ${completed.resolvedSection?.name || 'repository'}; Master Document Index updated.`
            : 'Import did not complete; check Import Queue.',
        needsReview: completed.status !== ImportStatus.IMPORTED,
        ...integrityFields,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-import failed';
      const failed = await this.db.importJobs.findOne({ where: { id: saved.id } });
      if (failed && failed.status === ImportStatus.FAILED) {
        failed.status = ImportStatus.READY_FOR_REVIEW;
        failed.externalImportStatus = ExternalImportStatus.READY_FOR_REVIEW;
        failed.errorMessage = message;
        await this.db.importJobs.save(failed);
      }
      await this.audit.record({
        action: 'MCP_AUTO_IMPORT_FALLBACK',
        entityType: 'ImportJob',
        entityId: saved.id,
        message: `MCP auto-import failed; left in Import Queue (${message})`,
      });
      return {
        importJobId: saved.id,
        status: ImportStatus.READY_FOR_REVIEW,
        externalImportStatus: ExternalImportStatus.READY_FOR_REVIEW,
        checksum,
        fileName,
        imported: false,
        needsReview: true,
        message:
          `Could not auto-import (${message}). Confirm routing in Import Queue. `
          + 'Once routing rules cover this type/module, future ChatGPT approvals import automatically.',
        ...integrityFields,
      };
    }
  }

  private decodeBase64File(content: string): Buffer {
    const trimmed = content.trim();
    const payload = trimmed.includes(',') ? trimmed.split(',').pop()! : trimmed;
    try {
      const buffer = Buffer.from(payload, 'base64');
      if (!buffer.length) throw new Error('empty');
      return buffer;
    } catch {
      throw new BadRequestException('fileContentBase64 must be valid base64-encoded content');
    }
  }

  private async resolveMcpSourceSystem(provider: ConnectorProvider) {
    const code = provider === ConnectorProvider.CHATGPT_MCP
      ? ExternalImportOrchestratorService.CHATGPT_MCP_SOURCE_CODE
      : provider;
    let source = await this.db.sourceSystems.findOne({ where: { code } });
    if (!source && provider === ConnectorProvider.CHATGPT_MCP) {
      source = this.db.sourceSystems.create({
        code: ExternalImportOrchestratorService.CHATGPT_MCP_SOURCE_CODE,
        name: 'ChatGPT MCP',
        type: 'MCP',
        description: 'Documents submitted via ChatGPT MCP integration',
        active: true,
        configuration: { provider: ConnectorProvider.CHATGPT_MCP },
      });
      source = await this.db.sourceSystems.save(source);
    }
    if (!source) throw new NotFoundException(`No source system configured for provider ${provider}`);
    return source;
  }

  private async resolveTargets(
    request: ExternalImportRequest,
    connection: SourceConnection | null,
  ): Promise<{ project: Project; section: ProjectSection | null; sourceSystem: SourceSystem }> {
    let project: Project | null = null;
    let section: ProjectSection | null = null;

    if (request.folderMappingId) {
      const mapping = await this.db.sourceFolderMappings.findOne({
        where: { id: request.folderMappingId },
        relations: { project: true, section: true },
      });
      project = mapping?.project ?? null;
      section = mapping?.section ?? null;
    }

    if (request.projectId) {
      project = await this.db.projects.findOne({ where: { id: request.projectId }, relations: { sections: true } });
    }
    if (request.sectionId && project) {
      section = await this.db.projectSections.findOne({ where: { id: request.sectionId, project: { id: project.id } } });
    }
    if (!project && connection?.defaultProject) project = connection.defaultProject;
    if (!section && connection?.defaultSection) section = connection.defaultSection;

    if (!project) {
      throw new BadRequestException('A target project must be configured for external imports');
    }

    const sourceSystemId = (request.sourceSystemId
      ?? String(connection?.settings?.sourceSystemId ?? '').trim())
      || undefined;
    let sourceSystem = sourceSystemId
      ? await this.db.sourceSystems.findOne({ where: { id: sourceSystemId } })
      : null;
    if (!sourceSystem) {
      const candidates = await this.db.sourceSystems.find({ where: { active: true }, order: { createdAt: 'ASC' }, take: 1 });
      sourceSystem = candidates[0] ?? null;
    }
    if (!sourceSystem) throw new BadRequestException('No active source system is configured');

    return { project, section, sourceSystem };
  }
}

/** Alias for MCP and connector consumers expecting this name. */
export { ExternalImportOrchestratorService as ExternalImportOrchestrator };
