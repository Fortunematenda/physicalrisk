import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { AuditService } from '../common/audit.service';
import { sha256AndSize } from '../common/file-hash.util';
import { assertFileSizeAllowed, assertMimeTypeAllowed } from '../connectors/connector-validation.util';
import { ExternalImportRequest, McpApprovedDocumentRequest, McpExternalImportResult } from '../connectors/interfaces/external-import-request.interface';
import { DatabaseService } from '../database/database.service';
import {
  ApprovalStatus,
  ConnectorProvider,
  Document,
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
import { IsNull } from 'typeorm';
import { determineExternalImportStatuses } from './external-import-dedup.util';
import { ImportsService } from './imports.service';
import { suggestNextVersion } from './version.util';

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

    const fileName = request.fileName.trim();
    const extension = extname(fileName).replace('.', '').toLowerCase();
    const fileType = await this.db.fileTypes.findOne({ where: { extension } });
    if (!fileType || !fileType.active) {
      throw new BadRequestException(`.${extension || 'unknown'} files are not enabled in the database`);
    }

    const resolved = await this.resolveApprovedFileBytes(request, fileName);
    assertFileSizeAllowed(resolved.size, fileType);
    const mimeType = request.mimeType?.trim() || 'application/octet-stream';
    assertMimeTypeAllowed(mimeType, fileType, fileName);

    const checksum = resolved.checksum;
    const sourceSha256 = (request.sourceSha256?.trim().toLowerCase() || checksum).toLowerCase();
    if (request.sourceSha256?.trim() && sourceSha256 !== checksum) {
      await this.storage.remove(resolved.staged.relativePath).catch(() => undefined);
      throw new BadRequestException({
        status: 'FILE_INTEGRITY_MISMATCH',
        message: 'Client-reported source SHA-256 does not match received file bytes.',
        sourceSha256,
        receivedSha256: checksum,
      });
    }
    const staged = resolved.staged;
    const storedSha256 = resolved.storedSha256;
    const checksumVerified = storedSha256 === checksum && resolved.storedSize === resolved.size;
    if (!checksumVerified) {
      await this.storage.remove(staged.relativePath).catch(() => undefined);
      throw new BadRequestException({
        status: 'FILE_INTEGRITY_MISMATCH',
        message: 'Stored file SHA-256 does not match source bytes. Import aborted.',
        sourceSha256: checksum,
        storedSha256,
        sourceSizeBytes: resolved.size,
        storedSizeBytes: resolved.storedSize,
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
      relations: { document: { versions: true, project: true } },
    });

    // MCP must never stall on Duplicate/Version review: existing docs auto-bump to NEW_VERSION.
    const autoTarget = await this.resolveMcpAutoVersionTarget({
      projectId: project.id,
      title: request.title.trim(),
      documentCode: request.documentCode?.trim(),
      existingDocumentId: request.existingDocumentId?.trim(),
      mode: request.mode,
      matchingVersion,
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
      title: autoTarget?.title || request.title.trim(),
      documentCode: autoTarget?.documentCode || request.documentCode?.trim(),
      documentType: request.documentType.trim(),
      description: request.description?.trim(),
      owner: request.owner?.trim(),
      versionNo: autoTarget?.versionNo || request.versionNo.trim(),
      approvalStatus: ApprovalStatus.APPROVED,
      approvedBy: request.approvedBy.trim(),
      approvalDate: approvalDate.toISOString(),
      sectionKey: sectionKey || null,
      mode: autoTarget ? 'NEW_VERSION' : (request.mode === 'NEW' ? 'NEW' : request.mode),
      existingDocumentId: autoTarget?.existingDocumentId || request.existingDocumentId?.trim(),
      provider: request.provider,
      mcpIntegrationId: request.mcpIntegrationId,
      customMetadata,
      relationships,
      dedupReason: autoTarget
        ? `MCP auto NEW_VERSION of ${autoTarget.documentCode} → ${autoTarget.versionNo}`
        : 'MCP new document — auto-import without human review',
      mcpAutoVersion: Boolean(autoTarget),
      importMode,
      conversionPerformed,
      originalFilename,
      originalMimeType: mimeType,
      sourceSizeBytes: resolved.size,
      sourceSha256: checksum,
      storedSizeBytes: resolved.storedSize,
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
      fileSize: resolved.size,
      checksum,
      // ChatGPT MCP always auto-processes — never DUPLICATE_REVIEW / VERSION_REVIEW.
      status: ImportStatus.READY_FOR_REVIEW,
      metadata,
      errorMessage: null,
      routingDecision: null,
      storageResult: null,
      initiatedBy: null,
      completedAt: null,
      provider: request.provider,
      externalImportStatus: ExternalImportStatus.READY_FOR_REVIEW,
      sourceConnection: null,
    });

    const saved = await this.db.importJobs.save(job);
    await this.audit.record({
      action: 'IMPORT_READY_FOR_REVIEW',
      entityType: 'ImportJob',
      entityId: saved.id,
      message: autoTarget
        ? `MCP auto-version queued for ${autoTarget.documentCode} → ${autoTarget.versionNo}: ${fileName}`
        : `MCP submission received from ${request.provider}: ${fileName}`,
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
        mcpAutoVersion: Boolean(autoTarget),
        mode: metadata.mode,
        documentCode: metadata.documentCode,
        versionNo: metadata.versionNo,
      },
    });

    const integrityFields = {
      importMode,
      conversionPerformed,
      originalFilename,
      mimeType,
      sourceSizeBytes: resolved.size,
      storedSizeBytes: resolved.storedSize,
      sourceSha256: checksum,
      storedSha256,
      checksumVerified,
    };

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
        documentCode: typeof metadata.documentCode === 'string' ? metadata.documentCode : undefined,
        message: autoTarget
          ? `Accepted — creating ${autoTarget.documentCode} ${autoTarget.versionNo} in the background. `
            + 'Poll get_import_status with this importJobId.'
          : 'Import accepted and queued for background processing. '
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

  /**
   * If the document already exists (by id, code, identical checksum, or same title),
   * force NEW_VERSION with a bumped revision — no Import Queue duplicate review.
   */
  private async resolveMcpAutoVersionTarget(input: {
    projectId: string;
    title: string;
    documentCode?: string;
    existingDocumentId?: string;
    mode?: 'NEW' | 'NEW_VERSION';
    matchingVersion: { document?: Document | null; versionNo?: string } | null;
  }): Promise<{
    existingDocumentId: string;
    documentCode: string;
    title: string;
    versionNo: string;
  } | null> {
    // Explicit mode=NEW still allocates a brand-new document ID.
    if (input.mode === 'NEW') return null;

    let document: Document | null = null;

    if (input.existingDocumentId) {
      document = await this.db.documents.findOne({
        where: {
          id: input.existingDocumentId,
          project: { id: input.projectId },
          deletedAt: IsNull(),
        },
        relations: { versions: true },
      });
    }

    if (!document && input.documentCode) {
      document = await this.db.documents.findOne({
        where: {
          project: { id: input.projectId },
          code: input.documentCode.toUpperCase(),
          deletedAt: IsNull(),
        },
        relations: { versions: true },
      });
    }

    if (
      !document
      && input.matchingVersion?.document
      && input.matchingVersion.document.project?.id === input.projectId
      && !input.matchingVersion.document.deletedAt
    ) {
      document = await this.db.documents.findOne({
        where: { id: input.matchingVersion.document.id, deletedAt: IsNull() },
        relations: { versions: true },
      });
    }

    if (!document && input.title) {
      document = await this.db.documents
        .createQueryBuilder('document')
        .leftJoinAndSelect('document.versions', 'versions')
        .innerJoin('document.project', 'project')
        .where('project.id = :projectId', { projectId: input.projectId })
        .andWhere('document.deletedAt IS NULL')
        .andWhere('LOWER(document.title) = LOWER(:title)', { title: input.title })
        .orderBy('document.updatedAt', 'DESC')
        .getOne();
    }

    if (!document) return null;

    const versionNos = (document.versions ?? []).map((version) => version.versionNo);
    if (document.currentVersionNo && !versionNos.includes(document.currentVersionNo)) {
      versionNos.push(document.currentVersionNo);
    }
    const versionNo = suggestNextVersion(versionNos.length ? versionNos : ['Rev 1.0']);

    return {
      existingDocumentId: document.id,
      documentCode: document.code,
      title: document.title,
      versionNo,
    };
  }

  private async resolveApprovedFileBytes(
    request: McpApprovedDocumentRequest,
    fileName: string,
  ): Promise<{
    size: number;
    checksum: string;
    storedSha256: string;
    storedSize: number;
    staged: { relativePath: string; absolutePath: string };
  }> {
    const filePath = request.filePath?.trim();
    if (filePath) {
      const source = await sha256AndSize(filePath);
      const staged = await this.storage.stageIncomingFromPath(fileName, filePath);
      const stored = await this.storage.hashIncoming(staged.relativePath);
      return {
        size: source.size,
        checksum: source.sha256,
        storedSha256: stored.sha256,
        storedSize: stored.size,
        staged,
      };
    }

    if (!request.fileContentBase64?.trim()) {
      throw new BadRequestException('Provide filePath or fileContentBase64 for FILE_PRESERVE import');
    }

    const fileBuffer = this.decodeBase64File(request.fileContentBase64);
    const checksum = createHash('sha256').update(fileBuffer).digest('hex');
    const staged = await this.storage.stageIncoming(fileName, fileBuffer);
    const stored = await this.storage.hashIncoming(staged.relativePath);
    return {
      size: fileBuffer.length,
      checksum,
      storedSha256: stored.sha256,
      storedSize: stored.size,
      staged,
    };
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
