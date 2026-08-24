import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { extname } from 'path';
import { In, IsNull } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { alignStoredFileIdentity } from '../common/document-format.util';
import { ConnectorProvider, Document, McpIntegration, McpIntegrationStatus, ProjectStatus } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { ExternalImportOrchestratorService } from '../imports/external-import-orchestrator.service';
import { compareVersions, suggestNextVersion } from '../imports/version.util';
import { ConfigService } from '@nestjs/config';
import { McpAuthService } from './mcp-auth.service';
import {
  BeginDocumentUploadDto,
  CheckDocumentExistsDto,
  GetImportStatusDto,
  ListRepositoryModulesDto,
  MCP_TOOL_NAMES,
  McpToolName,
  PrepareApprovedDocumentDto,
  ResolveImportTargetsDto,
  SubmitApprovedDocumentDto,
  SubmitApprovedFileDto,
  UploadDocumentChunkDto,
  mcpAllowsAllProjects,
} from './mcp.dto';
import { McpForbiddenException } from './mcp.exceptions';
import { McpBrowserUploadService } from './mcp-browser-upload.service';
import { McpMarkdownPdfService } from './mcp-markdown-pdf.service';
import { McpMarkdownOfficeService } from './mcp-markdown-office.service';
import { McpRemoteFileService } from './mcp-remote-file.service';
import { McpUploadSessionService } from './mcp-upload-session.service';
import { DocumentsService } from '../documents/documents.service';
import { WorkspaceActivitySource } from '../database/entities';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConnectorIdempotencyService } from './connector-idempotency.service';
import { ConnectorImportJobService } from './connector-import-job.service';
import { McpBinaryImportService } from './mcp-binary-import.service';

@Injectable()
export class McpToolsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: McpAuthService,
    private readonly orchestrator: ExternalImportOrchestratorService,
    private readonly audit: AuditService,
    private readonly uploads: McpUploadSessionService,
    private readonly browserUploads: McpBrowserUploadService,
    private readonly remoteFiles: McpRemoteFileService,
    private readonly markdownPdf: McpMarkdownPdfService,
    private readonly markdownOffice: McpMarkdownOfficeService,
    private readonly config: ConfigService,
    private readonly workspaces: WorkspacesService,
    private readonly documents: DocumentsService,
    private readonly idempotency: ConnectorIdempotencyService,
    private readonly connectorImports: ConnectorImportJobService,
    private readonly binaryImport: McpBinaryImportService,
  ) {}

  private mcpActor(integration: McpIntegration) {
    const id = integration.createdBy?.id;
    if (!id) {
      throw new BadRequestException(
        'This MCP integration has no owner user. Recreate it in Settings → MCP while signed in as a repository user.',
      );
    }
    return { id };
  }

  listToolDefinitions() {
    return MCP_TOOL_NAMES.map((name) => ({
      name,
      description: this.toolDescription(name),
      inputSchema: this.toolInputSchema(name),
    }));
  }

  async dispatchTool(
    integration: McpIntegration,
    toolName: McpToolName,
    args: Record<string, unknown> = {},
    ipAddress?: string,
  ): Promise<unknown> {
    await this.audit.record({
      action: 'MCP_REQUEST_RECEIVED',
      entityType: 'McpIntegration',
      entityId: integration.id,
      message: `MCP tool ${toolName} invoked`,
      after: { toolName },
      ipAddress,
    });

    this.auth.assertToolAllowed(integration, toolName);

    switch (toolName) {
      case 'list_repository_projects':
        return this.listRepositoryProjects(integration);
      case 'list_repository_modules':
        return this.listRepositoryModules(integration, args as unknown as ListRepositoryModulesDto);
      case 'list_document_types':
        return this.listDocumentTypes();
      case 'resolve_import_targets':
        return this.resolveImportTargets(integration, args as unknown as ResolveImportTargetsDto);
      case 'check_document_exists':
        return this.checkDocumentExists(integration, args as unknown as CheckDocumentExistsDto);
      case 'inspect_attachment_capability':
        return this.binaryImport.inspectAttachmentCapability({
          fileName: typeof args.fileName === 'string' ? args.fileName : undefined,
          attachmentReference:
            typeof args.attachmentReference === 'string' ? args.attachmentReference : undefined,
          fileUrl: typeof args.fileUrl === 'string' ? args.fileUrl : undefined,
          canProvideExactBytes: args.canProvideExactBytes === true,
          declaredMimeType: typeof args.mimeType === 'string' ? args.mimeType : undefined,
          expectedFileSize: args.expectedFileSize != null ? Number(args.expectedFileSize) : undefined,
        });
      case 'prepare_original_file_import': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          { ...parsed.dto, documentContent: undefined, outputFormat: undefined } as PrepareApprovedDocumentDto,
          undefined,
          this.defaultApproverName(integration),
        );
        if (parsed.fileUrl?.trim()) {
          return this.dispatchTool(integration, 'import_original_file', args, ipAddress);
        }
        return this.prepareOriginalFileImport(integration, prepared);
      }
      case 'finalize_original_file_import':
        return this.finalizeOriginalFileImport(integration, args);
      case 'import_original_file': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          { ...parsed.dto, documentContent: undefined, outputFormat: undefined } as PrepareApprovedDocumentDto,
          undefined,
          this.defaultApproverName(integration),
        );
        const projectId = await this.resolveProjectId(
          integration,
          prepared.projectId,
          prepared.projectCode,
        );
        let sectionKey = prepared.sectionKey?.trim() || undefined;
        if (!sectionKey && prepared.module?.trim()) {
          const resolved = await this.resolveImportTargets(integration, {
            project: projectId,
            module: prepared.module,
          });
          sectionKey = resolved.module?.sectionKey;
        }
        const versioned = await this.resolveNewVersionSubmit(projectId, {
          ...prepared,
          documentCode: prepared.documentCode,
          mode: prepared.mode,
          existingDocumentId: prepared.existingDocumentId,
        } as SubmitApprovedDocumentDto);
        const fileUrl =
          parsed.fileUrl?.trim()
          || (typeof args.fileUrl === 'string' ? args.fileUrl.trim() : undefined)
          || (typeof args.attachmentReference === 'string' ? args.attachmentReference.trim() : undefined);
        return this.binaryImport.importOriginalFile(integration, {
          projectId,
          fileName: prepared.fileName || 'document.docx',
          title: versioned.title,
          documentType: versioned.documentType || prepared.documentType,
          description: versioned.description,
          owner: versioned.owner,
          versionNo: versioned.versionNo,
          approvalStatus: prepared.approvalStatus,
          approvedBy: prepared.approvedBy || this.defaultApproverName(integration),
          approvalDate: prepared.approvalDate,
          sectionKey,
          mode: versioned.mode === 'NEW_VERSION' ? 'NEW_VERSION' : versioned.mode === 'NEW' ? 'NEW' : undefined,
          existingDocumentId: versioned.existingDocumentId,
          documentCode: versioned.documentCode,
          fileUrl,
          attachmentReference: typeof args.attachmentReference === 'string' ? args.attachmentReference : undefined,
          mimeType: prepared.mimeType,
          sourceSha256: typeof args.expectedSha256 === 'string' ? args.expectedSha256 : undefined,
        });
      }
      case 'prepare_automatic_file_import': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          { ...parsed.dto, documentContent: undefined, outputFormat: undefined } as PrepareApprovedDocumentDto,
          undefined,
          this.defaultApproverName(integration),
        );
        const projectId = await this.resolveProjectId(
          integration,
          prepared.projectId,
          prepared.projectCode,
        );
        let sectionKey = prepared.sectionKey?.trim() || undefined;
        if (!sectionKey && prepared.module?.trim()) {
          const resolved = await this.resolveImportTargets(integration, {
            project: projectId,
            module: prepared.module,
          });
          sectionKey = resolved.module?.sectionKey;
        }
        const versioned = await this.resolveNewVersionSubmit(projectId, {
          ...prepared,
          documentCode: prepared.documentCode,
          mode: prepared.mode,
          existingDocumentId: prepared.existingDocumentId,
        } as SubmitApprovedDocumentDto);
        return this.binaryImport.prepareAutomaticFileImport(integration, {
          projectId,
          projectCode: prepared.projectCode,
          userId: integration.createdBy?.id ?? null,
          fileName: prepared.fileName || 'document.docx',
          expectedFileSize: args.expectedFileSize != null ? Number(args.expectedFileSize) : undefined,
          expectedSha256: typeof args.expectedSha256 === 'string' ? args.expectedSha256 : undefined,
          declaredMimeType: prepared.mimeType,
          expectedChunkCount: args.expectedChunkCount != null ? Number(args.expectedChunkCount) : undefined,
          documentType: versioned.documentType || prepared.documentType,
          documentId: versioned.existingDocumentId,
          documentCode: versioned.documentCode,
          sectionKey,
          module: prepared.module,
          mode: versioned.mode === 'NEW_VERSION' ? 'NEW_VERSION' : 'NEW_DOCUMENT',
          title: versioned.title,
          versionNo: versioned.versionNo,
          approvalStatus: prepared.approvalStatus,
          approvedBy: prepared.approvedBy || this.defaultApproverName(integration),
          approvalDate: prepared.approvalDate,
          description: versioned.description,
          owner: versioned.owner,
        });
      }
      case 'upload_original_file_chunk':
        return this.binaryImport.uploadOriginalFileChunk({
          uploadId: String(args.uploadId ?? ''),
          uploadToken: String(args.uploadToken ?? ''),
          chunkIndex: Number(args.chunkIndex ?? args.chunkNumber ?? 0),
          chunkBase64: String(args.encodedContent ?? args.chunkBase64 ?? args.data ?? ''),
          chunkSha256: String(args.chunkSha256 ?? ''),
          rawByteLength: Number(args.rawByteLength ?? 0),
        });
      case 'get_automatic_file_import_progress':
        return this.binaryImport.getProgress(String(args.uploadId ?? ''), String(args.uploadToken ?? ''));
      case 'resume_automatic_file_import':
        return this.binaryImport.resume(String(args.uploadId ?? ''), String(args.uploadToken ?? ''));
      case 'complete_automatic_file_import': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          { ...parsed.dto, documentContent: undefined, outputFormat: undefined } as PrepareApprovedDocumentDto,
          undefined,
          this.defaultApproverName(integration),
        );
        const projectId = await this.resolveProjectId(
          integration,
          prepared.projectId,
          prepared.projectCode,
        );
        let sectionKey = prepared.sectionKey?.trim() || undefined;
        if (!sectionKey && prepared.module?.trim()) {
          const resolved = await this.resolveImportTargets(integration, {
            project: projectId,
            module: prepared.module,
          });
          sectionKey = resolved.module?.sectionKey;
        }
        const versioned = await this.resolveNewVersionSubmit(projectId, {
          ...prepared,
          documentCode: prepared.documentCode,
          mode: prepared.mode,
          existingDocumentId: prepared.existingDocumentId,
        } as SubmitApprovedDocumentDto);
        return this.binaryImport.complete(
          String(args.uploadId ?? ''),
          String(args.uploadToken ?? ''),
          integration,
          {
            projectId,
            fileName: prepared.fileName,
            title: versioned.title,
            documentType: versioned.documentType || prepared.documentType || 'Article',
            description: versioned.description,
            owner: versioned.owner,
            versionNo: versioned.versionNo,
            approvalStatus: prepared.approvalStatus || 'APPROVED',
            approvedBy: prepared.approvedBy || this.defaultApproverName(integration),
            approvalDate: prepared.approvalDate || new Date().toISOString().slice(0, 10),
            sectionKey,
            mode: versioned.mode === 'NEW_VERSION' ? 'NEW_VERSION' : versioned.mode === 'NEW' ? 'NEW' : undefined,
            existingDocumentId: versioned.existingDocumentId,
            documentCode: versioned.documentCode,
            sourceSha256: typeof args.expectedSha256 === 'string' ? args.expectedSha256 : undefined,
          },
        );
      }
      case 'abort_automatic_file_import':
        return this.binaryImport.abort(
          String(args.uploadId ?? ''),
          String(args.uploadToken ?? ''),
          typeof args.reason === 'string' ? args.reason : undefined,
        );
      case 'upload_original_docx':
      case 'upload_original_xlsx':
      case 'upload_original_pdf':
      case 'upload_original_pptx':
      case 'prepare_approved_document': {
        const parsed = this.parseSubmitPayload(args);
        // Metadata only. NEVER accept documentContent here — ChatGPT Actions hit
        // "request entity too large" when GPTs paste converted Markdown (~400KB+).
        // Prefer import_original_file (fileUrl) or prepare_automatic_file_import (chunks).
        const prepared = this.applySubmitDefaults(
          {
            ...parsed.dto,
            documentContent: undefined,
            outputFormat: undefined,
          } as PrepareApprovedDocumentDto,
          undefined,
          this.defaultApproverName(integration),
        );
        if (parsed.fileUrl?.trim()) {
          return this.dispatchTool(integration, 'import_original_file', args, ipAddress);
        }
        return this.prepareOriginalFileImport(integration, prepared);
      }
      case 'begin_document_upload': {
        const input = args as unknown as BeginDocumentUploadDto;
        return this.uploads.begin(
          String(input.fileName ?? ''),
          Number(input.totalChunks),
          input.mimeType,
        );
      }
      case 'upload_document_chunk': {
        const input = args as unknown as UploadDocumentChunkDto;
        return this.uploads.addChunk(
          String(input.uploadId ?? ''),
          Number(input.index),
          Number(input.total),
          String(input.data ?? ''),
        );
      }
      case 'submit_approved_document': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          parsed.dto,
          parsed.documentContent,
          this.defaultApproverName(integration),
        );
        if (!parsed.uploadId && !parsed.fileContentBase64 && !parsed.fileUrl && !parsed.documentContent) {
          return this.prepareApprovedDocument(integration, prepared);
        }
        return this.submitApprovedDocument(integration, {
          ...prepared,
          documentCode: prepared.documentCode,
          description: prepared.description,
          owner: prepared.owner,
          metadataJson: prepared.metadataJson,
          relationshipsJson: prepared.relationshipsJson,
          mode: prepared.mode,
          existingDocumentId: prepared.existingDocumentId,
          fileName: prepared.fileName!,
          mimeType: prepared.mimeType,
          outputFormat: prepared.outputFormat,
          uploadId: parsed.uploadId,
          fileContentBase64: parsed.fileContentBase64,
          fileUrl: parsed.fileUrl,
          documentContent: parsed.documentContent,
        }, ipAddress);
      }
      case 'submit_approved_file': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          parsed.dto,
          undefined,
          this.defaultApproverName(integration),
        );
        const source = this.unwrapPayloadObject(args);
        return this.submitApprovedFile(
          integration,
          {
            ...prepared,
            fileName: prepared.fileName || parsed.dto.fileName || 'document.xlsx',
            fileContentBase64: parsed.fileContentBase64,
            uploadId: parsed.uploadId,
            fileUrl: parsed.fileUrl,
            mimeType: prepared.mimeType || (typeof source.mimeType === 'string' ? source.mimeType : undefined),
            workspaceCode:
              typeof source.workspaceCode === 'string' ? source.workspaceCode.trim() : undefined,
            sourceSha256:
              typeof source.sourceSha256 === 'string' ? source.sourceSha256.trim() : undefined,
            idempotencyKey:
              typeof source.idempotencyKey === 'string' ? source.idempotencyKey.trim() : undefined,
            mode: prepared.mode,
            existingDocumentId: prepared.existingDocumentId,
            documentCode: prepared.documentCode,
            description: prepared.description,
            owner: prepared.owner,
          } as SubmitApprovedFileDto,
          ipAddress,
        );
      }
      case 'submit_approved_content': {
        const parsed = this.parseSubmitPayload(args);
        const prepared = this.applySubmitDefaults(
          parsed.dto,
          parsed.documentContent,
          this.defaultApproverName(integration),
        );
        if (!parsed.documentContent?.trim()) {
          return {
            status: 'CONTENT_REQUIRED',
            message:
              'submit_approved_content requires documentContent (Markdown/text). '
              + 'To preserve an original DOCX/XLSX/PDF, use submit_approved_file instead.',
          };
        }
        if (parsed.fileContentBase64 || parsed.uploadId || parsed.fileUrl) {
          return {
            status: 'USE_SUBMIT_APPROVED_FILE',
            message:
              'Binary file fields were supplied. Use submit_approved_file to preserve the original artifact '
              + 'without Markdown conversion.',
          };
        }
        return this.submitApprovedDocument(integration, {
          ...prepared,
          documentCode: prepared.documentCode,
          description: prepared.description,
          owner: prepared.owner,
          metadataJson: prepared.metadataJson,
          relationshipsJson: prepared.relationshipsJson,
          mode: prepared.mode,
          existingDocumentId: prepared.existingDocumentId,
          fileName: prepared.fileName!,
          mimeType: prepared.mimeType,
          outputFormat: prepared.outputFormat,
          documentContent: parsed.documentContent,
        }, ipAddress, { forceContentCreate: true });
      }
      case 'get_import_status':
        return this.getImportStatus(integration, args as unknown as GetImportStatusDto);
      case 'create_workspace': {
        const name = String(args.name ?? '').trim();
        const projectId = await this.resolveProjectId(
          integration,
          args.projectId ? String(args.projectId) : undefined,
          String(args.projectCode ?? args.project ?? '').trim() || undefined,
        );
        const idempotencyKey = args.idempotencyKey
          ? String(args.idempotencyKey)
          : undefined;
        const { result } = await this.idempotency.beginOrReplay({
          idempotencyKey,
          operation: 'create_workspace',
          userId: integration.createdBy?.id,
          requestPayload: { name, projectId },
          execute: () => this.workspaces.create(
            { name, projectId, source: WorkspaceActivitySource.CHATGPT_ACTION },
            this.mcpActor(integration),
          ),
        });
        return {
          ...result,
          // Explicit: workspace creation is not document import completion.
          imported: false,
          documentImportComplete: false,
          hint: 'Workspace created. Submit documents separately; poll get_import_status for import completion.',
        };
      }
      case 'get_workspace':
        return this.workspaces.get(String(args.workspaceCode ?? ''), this.mcpActor(integration));
      case 'find_workspaces':
        return this.workspaces.list({
          workspaceCode: args.workspaceCode ? String(args.workspaceCode) : undefined,
          name: args.name ? String(args.name) : undefined,
          projectCode: args.projectCode ? String(args.projectCode) : undefined,
          status: args.status ? String(args.status) : undefined,
          mine: true,
        }, this.mcpActor(integration));
      case 'get_latest_pending_workspace':
        return this.workspaces.latestPending(this.mcpActor(integration));
      case 'resume_workspace':
        return this.workspaces.resume(
          String(args.workspaceCode ?? ''),
          this.mcpActor(integration),
          WorkspaceActivitySource.CHATGPT_ACTION,
        );
      case 'list_workspace_documents':
        return this.workspaces.listDocuments(String(args.workspaceCode ?? ''), this.mcpActor(integration));
      case 'get_workspace_summary':
        return this.workspaces.summary(String(args.workspaceCode ?? ''), this.mcpActor(integration));
      case 'validate_workspace':
        return this.workspaces.validate(
          String(args.workspaceCode ?? ''),
          this.mcpActor(integration),
          WorkspaceActivitySource.CHATGPT_ACTION,
        );
      case 'submit_workspace':
        return this.workspaces.submit(
          String(args.workspaceCode ?? ''),
          this.mcpActor(integration),
          WorkspaceActivitySource.CHATGPT_ACTION,
        );
      case 'attach_document_to_workspace':
        return this.workspaces.attachRepositoryDocument(
          String(args.workspaceCode ?? ''),
          {
            documentId: args.documentId ? String(args.documentId) : undefined,
            documentCode: args.documentCode ? String(args.documentCode) : undefined,
            importJobId: args.importJobId ? String(args.importJobId) : undefined,
            fileName: args.fileName ? String(args.fileName) : undefined,
          },
          this.mcpActor(integration),
          WorkspaceActivitySource.CHATGPT_MCP,
        );
      case 'search_documents':
        return this.searchDocuments(integration, {
          projectId: args.projectId ? String(args.projectId) : undefined,
          projectCode: args.projectCode ? String(args.projectCode) : undefined,
          search: args.search ? String(args.search) : undefined,
          status: args.status ? String(args.status) : undefined,
          limit: args.limit != null ? Number(args.limit) : undefined,
        });
      case 'get_document':
        return this.getDocument(integration, {
          documentId: args.documentId ? String(args.documentId) : args.id ? String(args.id) : undefined,
          documentCode: args.documentCode ? String(args.documentCode) : undefined,
        });
      default:
        throw new BadRequestException(`Unknown MCP tool: ${toolName}`);
    }
  }

  /**
   * Compact Master Document Index rows for ChatGPT/Cursor (full document graphs
   * overflow Actions validation and blow response size limits).
   */
  async searchDocuments(
    integration: McpIntegration,
    input: {
      projectId?: string;
      projectCode?: string;
      search?: string;
      status?: string;
      limit?: number;
    },
  ) {
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    let projectId: string | undefined;
    if (input.projectId || input.projectCode) {
      projectId = await this.resolveProjectId(integration, input.projectId, input.projectCode);
    }

    const allowedIds = integration.allowedProjectIds ?? [];
    const qb = this.db.documents.createQueryBuilder('document')
      .leftJoinAndSelect('document.project', 'project')
      .leftJoinAndSelect('document.section', 'section')
      .leftJoinAndSelect('document.versions', 'versions')
      .where('document.deletedAt IS NULL')
      .orderBy('document.updatedAt', 'DESC')
      .take(limit);

    if (projectId) {
      qb.andWhere('project.id = :projectId', { projectId });
    } else if (!mcpAllowsAllProjects(allowedIds)) {
      if (!allowedIds.length) {
        return { total: 0, count: 0, documents: [] };
      }
      qb.andWhere('project.id IN (:...allowedIds)', { allowedIds });
    }

    if (input.status) qb.andWhere('document.status = :status', { status: input.status });
    if (input.search?.trim()) {
      qb.andWhere(
        '(document.title ILIKE :search OR document.code ILIKE :search OR document.documentType ILIKE :search)',
        { search: `%${input.search.trim()}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    const documents = rows.map((doc) => {
      const current = [...(doc.versions ?? [])].find((v) => v.isCurrent)
        ?? [...(doc.versions ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      return {
        id: doc.id,
        documentCode: doc.code,
        title: doc.title,
        projectCode: doc.project?.code ?? null,
        projectName: doc.project?.name ?? null,
        module: doc.section?.name ?? null,
        sectionKey: doc.section?.sectionKey ?? null,
        documentType: doc.documentType,
        status: doc.status,
        currentVersion: current?.versionNo ?? null,
        owner: doc.owner ?? null,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
      };
    });

    return {
      total,
      count: documents.length,
      truncated: total > documents.length,
      documents,
      message: total === 0
        ? 'No documents matched.'
        : `Found ${total} document(s)${total > documents.length ? ` (showing ${documents.length})` : ''}.`,
    };
  }

  async getDocument(
    integration: McpIntegration,
    input: { documentId?: string; documentCode?: string },
  ) {
    const id = (input.documentId || '').trim();
    const code = (input.documentCode || '').trim();
    if (!id && !code) {
      throw new BadRequestException('Provide documentId or documentCode');
    }

    const document = id
      ? await this.db.documents.findOne({
        where: { id, deletedAt: IsNull() },
        relations: { project: true, section: true, versions: true },
      })
      : await this.db.documents.findOne({
        where: { code, deletedAt: IsNull() },
        relations: { project: true, section: true, versions: true },
      });

    if (!document) {
      throw new NotFoundException(
        id ? `Document '${id}' was not found` : `Document code '${code}' was not found`,
      );
    }

    this.assertProjectAccess(integration, document.project.id);
    const current = [...(document.versions ?? [])].find((v) => v.isCurrent)
      ?? [...(document.versions ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    return {
      id: document.id,
      documentCode: document.code,
      title: document.title,
      description: document.description,
      projectCode: document.project?.code ?? null,
      projectName: document.project?.name ?? null,
      module: document.section?.name ?? null,
      sectionKey: document.section?.sectionKey ?? null,
      documentType: document.documentType,
      status: document.status,
      owner: document.owner ?? null,
      currentVersion: current
        ? {
          id: current.id,
          versionNo: current.versionNo,
          approvalStatus: current.approvalStatus,
          approvedBy: current.approvedBy,
          approvalDate: current.approvalDate,
          originalFileName: current.originalFileName,
          mimeType: current.mimeType,
          fileSize: current.fileSize,
          createdAt: current.createdAt,
        }
        : null,
      updatedAt: document.updatedAt,
      createdAt: document.createdAt,
    };
  }

  async listRepositoryProjects(integration: McpIntegration) {
    const allowedIds = integration.allowedProjectIds ?? [];
    if (!allowedIds.length) return [];

    const projects = mcpAllowsAllProjects(allowedIds)
      ? await this.db.projects.find({
        where: { status: ProjectStatus.ACTIVE },
        order: { code: 'ASC' },
      })
      : await this.db.projects.find({
        where: { id: In(allowedIds), status: ProjectStatus.ACTIVE },
        order: { code: 'ASC' },
      });
    return projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
    }));
  }

  async listRepositoryModules(integration: McpIntegration, input: ListRepositoryModulesDto) {
    const projectId = await this.resolveProjectId(
      integration,
      input.projectId,
      input.projectCode || (input as { project?: string }).project,
    );
    const sections = await this.db.projectSections.find({
      where: { project: { id: projectId }, active: true },
      order: { position: 'ASC' },
    });
    return sections.map((section) => ({
      id: section.id,
      sectionKey: section.sectionKey,
      code: section.code,
      name: section.name,
      slug: section.slug,
      position: section.position,
      relativePath: section.relativePath,
    }));
  }

  async listDocumentTypes() {
    const types = await this.db.documentTypes.find({
      where: { active: true },
      order: { code: 'ASC' },
    });
    return types.map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
    }));
  }

  /**
   * Resolve human-readable project / module / document-type labels to the IDs
   * and keys required by check_document_exists and submit_approved_document.
   */
  async resolveImportTargets(integration: McpIntegration, input: ResolveImportTargetsDto) {
    const projectId = await this.resolveProjectId(
      integration,
      (input as { projectId?: string }).projectId,
      input.project || (input as { projectCode?: string }).projectCode,
    );
    const projects = await this.listRepositoryProjects(integration);
    const project = projects.find((item) => item.id === projectId)!;
    const modules = await this.listRepositoryModules(integration, { projectId });
    const documentTypes = await this.listDocumentTypes();

    const moduleNeedle = input.module?.trim().toLowerCase();
    const module = moduleNeedle
      ? modules.find((item) =>
        item.name.toLowerCase() === moduleNeedle
        || item.code.toLowerCase() === moduleNeedle
        || item.sectionKey.toLowerCase() === moduleNeedle
        || item.slug?.toLowerCase() === moduleNeedle)
      ?? null
      : null;

    const typeNeedle = input.documentType?.trim().toLowerCase();
    const documentType = typeNeedle
      ? documentTypes.find((item) =>
        item.name.toLowerCase() === typeNeedle || item.code.toLowerCase() === typeNeedle)
      ?? null
      : null;

    if (input.module && !module) {
      throw new NotFoundException(
        `Module '${input.module}' was not found for project ${project.code}. `
        + `Available: ${modules.map((item) => item.name).join(', ') || '(none)'}`,
      );
    }
    if (input.documentType && !documentType) {
      throw new NotFoundException(
        `Document type '${input.documentType}' was not found. `
        + `Available: ${documentTypes.map((item) => item.name).join(', ') || '(none)'}`,
      );
    }

    return {
      project: {
        projectId: project.id,
        projectCode: project.code,
        name: project.name,
      },
      module: module
        ? {
          id: module.id,
          sectionKey: module.sectionKey,
          code: module.code,
          name: module.name,
        }
        : null,
      documentType: documentType
        ? {
          id: documentType.id,
          code: documentType.code,
          name: documentType.name,
          /** Use this string for submit_approved_document.documentType */
          value: documentType.code || documentType.name,
        }
        : null,
      submitHints: {
        projectId: project.id,
        projectCode: project.code,
        sectionKey: module?.sectionKey ?? null,
        documentType: documentType?.code || documentType?.name || null,
      },
    };
  }

  async checkDocumentExists(integration: McpIntegration, input: CheckDocumentExistsDto) {
    const projectId = await this.resolveProjectId(integration, input.projectId, input.projectCode);
    const title = input.title?.trim();
    const fileName = input.fileName?.trim();
    const checksum = input.checksum?.trim();
    const documentCode = input.documentCode?.trim()?.toUpperCase();
    if (!title && !fileName && !checksum && !documentCode) {
      throw new BadRequestException('Provide at least one of title, fileName, checksum, or documentCode');
    }

    const qb = this.db.documents.createQueryBuilder('document')
      .leftJoinAndSelect('document.project', 'project')
      .leftJoinAndSelect('document.versions', 'versions')
      .where('project.id = :projectId', { projectId })
      .andWhere('document.deletedAt IS NULL');

    const conditions: string[] = [];
    const params: Record<string, string> = { projectId };
    if (documentCode) {
      conditions.push('document.code = :documentCode');
      params.documentCode = documentCode;
    }
    if (title) {
      conditions.push('document.title ILIKE :title');
      params.title = `%${title}%`;
    }
    if (fileName) {
      conditions.push('versions.originalFileName ILIKE :fileName');
      params.fileName = `%${fileName}%`;
    }
    if (checksum) {
      conditions.push('versions.checksum = :checksum');
      params.checksum = checksum;
    }
    qb.andWhere(`(${conditions.join(' OR ')})`, params);

    const matches = await qb.getMany();
    const filtered = matches.filter((document) => {
      if (documentCode && document.code === documentCode) return true;
      if (title && document.title.toLowerCase().includes(title.toLowerCase())) return true;
      const versions = document.versions ?? [];
      if (fileName && versions.some((version) => version.originalFileName.toLowerCase().includes(fileName.toLowerCase()))) {
        return true;
      }
      if (checksum && versions.some((version) => version.checksum === checksum)) return true;
      return false;
    });

    return {
      exists: filtered.length > 0,
      projectId,
      matches: filtered.map((document) => {
        const versionNos = (document.versions ?? []).map((version) => version.versionNo);
        if (document.currentVersionNo && !versionNos.includes(document.currentVersionNo)) {
          versionNos.push(document.currentVersionNo);
        }
        const suggestedNextVersionNo = suggestNextVersion(
          versionNos.length ? versionNos : ['Rev 1.0'],
        );
        return {
          id: document.id,
          code: document.code,
          title: document.title,
          documentType: document.documentType,
          currentVersionNo: document.currentVersionNo,
          suggestedNextVersionNo,
          /** Pass these fields in submit_approved_document payload for a new revision. */
          newVersionSubmitHints: {
            mode: 'NEW_VERSION' as const,
            existingDocumentId: document.id,
            documentCode: document.code,
            versionNo: suggestedNextVersionNo,
            title: document.title,
            documentType: document.documentType,
            owner: document.owner ?? undefined,
            description: document.description ?? undefined,
          },
          versions: (document.versions ?? []).map((version) => ({
            id: version.id,
            versionNo: version.versionNo,
            originalFileName: version.originalFileName,
            checksum: version.checksum,
          })),
        };
      }),
    };
  }

  /**
   * ChatGPT-friendly path: collect metadata, return a one-time browser upload URL.
   * Custom GPT Actions cannot transmit PDF bytes reliably.
   */
  async prepareApprovedDocument(integration: McpIntegration, input: PrepareApprovedDocumentDto) {
    this.orchestrator.assertApprovedStatus(input.approvalStatus);
    const projectId = await this.resolveProjectId(integration, input.projectId, input.projectCode);
    const projects = await this.listRepositoryProjects(integration);
    const project = projects.find((item) => item.id === projectId)!;
    let sectionKey = input.sectionKey?.trim() || undefined;
    if (!sectionKey && input.module?.trim()) {
      const resolved = await this.resolveImportTargets(integration, {
        project: projectId,
        module: input.module,
      });
      sectionKey = resolved.module?.sectionKey;
    }

    const approvedBy = input.approvedBy?.trim() || this.defaultApproverName(integration);
    const versioned = await this.resolveNewVersionSubmit(projectId, input as SubmitApprovedDocumentDto);
    const pending = this.browserUploads.create({
      integrationId: integration.id,
      projectId,
      projectCode: project.code,
      module: input.module,
      sectionKey,
      documentType: versioned.documentType || input.documentType,
      title: versioned.title,
      versionNo: versioned.versionNo,
      approvalStatus: input.approvalStatus,
      approvedBy,
      approvalDate: input.approvalDate,
      fileName: input.fileName,
      mimeType: input.mimeType || undefined,
      mode: versioned.mode,
      documentCode: versioned.documentCode,
      existingDocumentId: versioned.existingDocumentId,
    });

    const baseUrl = this.publicBaseUrl();
    const uploadUrl = `${baseUrl}/api/mcp/upload/${pending.token}`;
    return {
      ready: true,
      status: 'UPLOAD_PENDING',
      uploadId: pending.token,
      uploadUrl,
      method: 'PUT',
      expiresAt: new Date(pending.expiresAt).toISOString(),
      maxFileSize: 524_288_000,
      acceptedMimeTypes: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/pdf',
      ],
      importMode: 'FILE_PRESERVE' as const,
      preserveOriginal: true,
      preservationMode: 'ORIGINAL_BINARY',
      source: 'CHATGPT_MCP',
      conversionPerformed: false,
      mode: versioned.mode ?? 'NEW',
      documentCode: versioned.documentCode ?? null,
      existingDocumentId: versioned.existingDocumentId ?? null,
      versionNo: versioned.versionNo,
      project: { id: project.id, code: project.code, name: project.name },
      module: input.module ?? null,
      sectionKey: sectionKey ?? null,
      documentType: versioned.documentType || input.documentType,
      title: versioned.title,
      fileName: input.fileName ?? null,
      instructions:
        'FILE_PRESERVE staged upload. PUT the exact original bytes to uploadUrl (or POST multipart field "file"). '
        + 'Do not convert to Markdown or PDF. Then call finalize_original_file_import with uploadId. '
        + 'Creating this session is not IMPORTED.',
    };
  }

  /**
   * Dedicated original-file staged session. Same FILE_PRESERVE contract as prepareApprovedDocument,
   * with an explicit name so ChatGPT does not use Markdown→PDF submit_approved_document.
   */
  async prepareOriginalFileImport(integration: McpIntegration, input: PrepareApprovedDocumentDto) {
    return this.prepareApprovedDocument(integration, input);
  }

  async finalizeOriginalFileImport(integration: McpIntegration, args: Record<string, unknown>) {
    const uploadId = String(args.uploadId ?? '').trim();
    const uploadToken = String(args.uploadToken ?? '').trim();
    if (!uploadId) {
      throw new BadRequestException('uploadId is required');
    }

    if (uploadToken) {
      return this.binaryImport.complete(uploadId, uploadToken, integration, {
        projectId: String(args.projectId ?? ''),
        fileName: typeof args.fileName === 'string' ? args.fileName : undefined,
        title: typeof args.title === 'string' ? args.title : undefined,
        documentType: typeof args.documentType === 'string' ? args.documentType : 'Article',
        versionNo: typeof args.versionNo === 'string' ? args.versionNo : 'Rev 1.0',
        approvalStatus: 'APPROVED',
        approvedBy: this.defaultApproverName(integration),
        approvalDate: new Date().toISOString().slice(0, 10),
        documentCode: typeof args.documentCode === 'string' ? args.documentCode : undefined,
        mode: args.mode === 'NEW_VERSION' ? 'NEW_VERSION' : args.mode === 'NEW' ? 'NEW' : undefined,
      } as any);
    }

    const completed = this.browserUploads.getCompleted(uploadId);
    if (completed) {
      if (completed.importJobId) {
        const status = await this.getImportStatus(integration, { importJobId: completed.importJobId });
        const imported = status.status === 'IMPORTED';
        return {
          ...completed,
          status: imported ? 'IMPORTED' : completed.checksumVerified ? 'VERIFIED' : status.status,
          imported,
          uploadId,
          importJob: status,
          conversionPerformed: false,
          importMode: 'FILE_PRESERVE',
          preservationMode: 'ORIGINAL_BINARY',
        };
      }
      return {
        ...completed,
        status: completed.checksumVerified ? 'VERIFIED' : 'VERIFICATION_FAILED',
        imported: false,
        uploadId,
        conversionPerformed: false,
        importMode: 'FILE_PRESERVE',
      };
    }

    try {
      this.browserUploads.get(uploadId);
      return {
        status: 'UPLOAD_PENDING',
        ready: false,
        imported: false,
        uploadId,
        conversionPerformed: false,
        importMode: 'FILE_PRESERVE',
        message:
          'Original file has not been PUT/POSTed to uploadUrl yet. Do not convert to Markdown. '
          + 'Do not report IMPORTED.',
      };
    } catch {
      /* token not pending */
    }

    try {
      return await this.getImportStatus(integration, { importJobId: uploadId });
    } catch {
      return {
        status: 'VERIFICATION_FAILED',
        imported: false,
        uploadId,
        conversionPerformed: false,
        message: 'uploadId is not a pending original-file session or import job.',
      };
    }
  }

  async completeBrowserUpload(
    token: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    ipAddress?: string,
  ) {
    const pending = this.browserUploads.get(token);
    this.browserUploads.assertNotExpired(pending);
    const integration = await this.auth.resolveIntegrationForBrowserUpload(pending.integrationId);

    const consumed = this.browserUploads.consume(token);
    // Prefer the uploaded file's real name/MIME — pending often still has a PDF placeholder.
    const uploadedName = file.originalname?.trim();
    const uploadedMime = file.mimetype?.trim();
    const fileName = uploadedName || consumed.fileName?.trim() || 'document';
    const result = await this.submitApprovedDocument(
      integration,
      {
        projectId: consumed.projectId,
        projectCode: consumed.projectCode,
        title: consumed.title,
        documentType: consumed.documentType,
        versionNo: consumed.versionNo,
        approvalStatus: consumed.approvalStatus,
        approvedBy: consumed.approvedBy,
        approvalDate: consumed.approvalDate,
        module: consumed.module,
        sectionKey: consumed.sectionKey,
        mode: consumed.mode,
        documentCode: consumed.documentCode,
        existingDocumentId: consumed.existingDocumentId,
        fileName,
        mimeType: uploadedMime || consumed.mimeType,
        fileContentBase64: file.buffer.toString('base64'),
      },
      ipAddress,
      { forceFilePreserve: true },
    );
    this.browserUploads.rememberCompleted({
      uploadId: token,
      importJobId: 'importJobId' in result ? String(result.importJobId ?? '') || undefined : undefined,
      status: 'status' in result ? String(result.status) : 'UPLOADED',
      fileName,
      fileSize: file.buffer.length,
      sha256: 'storedSha256' in result ? String((result as { storedSha256?: string }).storedSha256 ?? '') : undefined,
      checksumVerified: 'checksumVerified' in result ? Boolean((result as { checksumVerified?: boolean }).checksumVerified) : undefined,
      completedAt: Date.now(),
    });
    return result;
  }

  async submitApprovedDocument(
    integration: McpIntegration,
    input: SubmitApprovedDocumentDto,
    ipAddress?: string,
    options?: { forceContentCreate?: boolean; forceFilePreserve?: boolean },
  ) {
    // Always normalise — browser upload / multipart callers skip dispatchTool defaults.
    const normalised = await this.normaliseSubmitInput(input, integration);
    input = { ...input, ...normalised };

    const projectId = await this.resolveProjectId(integration, input.projectId, input.projectCode);
    let sectionKey = input.sectionKey?.trim() || undefined;
    if (!sectionKey && input.module?.trim()) {
      const resolved = await this.resolveImportTargets(integration, {
        project: projectId,
        module: input.module,
      });
      sectionKey = resolved.module?.sectionKey;
      // If GPT sent a folder name as documentType, map it to the seeded type for that module.
      if ((!input.documentType || !input.documentType.trim()) && resolved.module) {
        input.documentType = await this.resolveDocumentTypeName(
          resolved.module.name,
          resolved.module.code,
        ) || input.documentType;
      }
    }

    let fileContentBase64 = input.fileContentBase64?.trim();
    let fileName = input.fileName?.trim();
    let mimeType = input.mimeType?.trim();
    let conversionPerformed = false;
    let importMode: 'FILE_PRESERVE' | 'CONTENT_CREATE' = 'FILE_PRESERVE';
    const originalFilenameHint = fileName;
    if (input.uploadId?.trim()) {
      const staged = this.uploads.takeBase64(input.uploadId.trim());
      fileContentBase64 = staged.fileContentBase64;
      fileName = fileName || staged.fileName;
      mimeType = mimeType || staged.mimeType;
    }
    if (!fileContentBase64 && input.fileUrl?.trim()) {
      const remote = await this.remoteFiles.fetchApprovedDocument(input.fileUrl.trim(), fileName);
      fileContentBase64 = remote.buffer.toString('base64');
      fileName = fileName || remote.fileName;
      mimeType = mimeType || remote.mimeType;
    }
    if (!fileContentBase64 && input.documentContent != null) {
      if (options?.forceFilePreserve) {
        return this.offerBrowserUploadForOriginal(
          integration,
          input,
          'The Repository connector did not receive the original source artifact.',
        );
      }
      // Office/PDF fileName + Markdown body without CONTENT_CREATE = GPT trying to "import DOCX"
      // via text. Refuse conversion and give a browser upload link instead.
      if (
        !options?.forceContentCreate
        && this.looksLikeOriginalBinaryFile(fileName, mimeType)
      ) {
        await this.audit.record({
          action: 'MCP_ORIGINAL_FILE_UNAVAILABLE',
          entityType: 'McpIntegration',
          entityId: integration.id,
          message: `Refused Markdown rebuild for ${fileName || 'binary'}; offering browser upload`,
          after: { tool: 'submit_approved_document', fileName, mimeType },
          ipAddress,
        });
        return this.offerBrowserUploadForOriginal(
          integration,
          input,
          `Refused to rebuild ${fileName || 'the Office/PDF file'} from Markdown (that would destroy structure/formulas).`,
        );
      }
      const content = String(input.documentContent);
      if (!content.trim()) {
        throw new BadRequestException('documentContent must not be empty');
      }
      this.assertDocumentContentUsable(content);
      const maxChars = 500 * 1024;
      if (content.length > maxChars) {
        throw new BadRequestException(
          `documentContent exceeds ${maxChars} characters. `
          + 'For large DOCX/XLSX files, call prepare_approved_document (or submit_approved_file) '
          + 'and upload the original binary via the returned uploadUrl — do not paste the whole document as Markdown.',
        );
      }
      conversionPerformed = true;
      importMode = 'CONTENT_CREATE';
      const intentFormat = this.inferFormatFromIntent(
        (input as { outputFormat?: string }).outputFormat,
        fileName,
        input.title,
        input.description,
        content,
      );
      let format = McpMarkdownOfficeService.resolveFormat({
        fileName: fileName || this.inferFileNameHint(fileName, input.title, input.description, content),
        mimeType: this.effectiveMimeForFormat(mimeType),
        outputFormat: (input as { outputFormat?: string }).outputFormat || intentFormat,
      });
      if (format === 'pdf' && intentFormat) {
        format = intentFormat;
      }
      const author = input.approvedBy || 'Physical Risk Repository';
      try {
        if (format === 'docx') {
          const buffer = await this.markdownOffice.renderDocx(content, { title: input.title, author });
          fileContentBase64 = buffer.toString('base64');
          fileName = McpMarkdownOfficeService.fileNameFor(fileName || input.title, 'docx');
          mimeType = McpMarkdownOfficeService.mimeFor('docx');
        } else if (format === 'xlsx') {
          const buffer = await this.markdownOffice.renderXlsx(content, { title: input.title, author });
          fileContentBase64 = buffer.toString('base64');
          fileName = McpMarkdownOfficeService.fileNameFor(fileName || input.title, 'xlsx');
          mimeType = McpMarkdownOfficeService.mimeFor('xlsx');
        } else if (format === 'pptx') {
          const buffer = await this.markdownOffice.renderPptx(content, { title: input.title, author });
          fileContentBase64 = buffer.toString('base64');
          fileName = McpMarkdownOfficeService.fileNameFor(fileName || input.title, 'pptx');
          mimeType = McpMarkdownOfficeService.mimeFor('pptx');
        } else if (format === 'txt') {
          const buffer = await this.markdownOffice.renderTxt(content, { title: input.title, author });
          fileContentBase64 = buffer.toString('base64');
          fileName = McpMarkdownOfficeService.fileNameFor(fileName || input.title, 'txt');
          mimeType = McpMarkdownOfficeService.mimeFor('txt');
        } else {
          const pdfBuffer = await this.markdownPdf.render(content, {
            title: input.title,
            author,
          });
          fileContentBase64 = pdfBuffer.toString('base64');
          fileName = McpMarkdownOfficeService.fileNameFor(fileName || input.title, 'pdf');
          mimeType = 'application/pdf';
        }
      } catch (error) {
        // Keep same-chat submit working if Office/PDF rendering fails in the container.
        const message = error instanceof Error ? error.message : String(error);
        await this.audit.record({
          action: 'MCP_PDF_FALLBACK',
          entityType: 'McpIntegration',
          entityId: integration.id,
          message: `${format.toUpperCase()} render failed; queuing Markdown instead (${message})`,
          ipAddress,
        });
        fileContentBase64 = Buffer.from(content, 'utf8').toString('base64');
        fileName = this.defaultMarkdownFileName(fileName || input.title);
        mimeType = 'text/markdown';
      }
    }
    if (options?.forceContentCreate) {
      importMode = 'CONTENT_CREATE';
      conversionPerformed = true;
    }
    if (!fileContentBase64) {
      if (options?.forceFilePreserve) {
        return this.offerBrowserUploadForOriginal(
          integration,
          input,
          'The Repository connector did not receive the original source artifact.',
        );
      }
      throw new BadRequestException(
        'Provide documentContent (same-chat), fileUrl, uploadId, or fileContentBase64. '
        + 'For original DOCX/XLSX, call prepare_approved_document and upload via uploadUrl.',
      );
    }
    // Final channel: sniff bytes + align extension/MIME so Repo stores the real format
    // (defeats ChatGPT sending application/pdf with an .xlsx body, etc.).
    {
      const aligned = alignStoredFileIdentity({
        buffer: Buffer.from(fileContentBase64, 'base64'),
        fileName,
        mimeType,
        title: input.title,
      });
      fileName = aligned.fileName;
      mimeType = aligned.mimeType;
    }
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }
    if (!input.documentType?.trim()) {
      throw new BadRequestException(
        'documentType is required (e.g. Article). Call list_document_types and use a type name — not the folder/module name.',
      );
    }

    try {
      this.orchestrator.assertApprovedStatus(input.approvalStatus);
      const versioned = await this.resolveNewVersionSubmit(projectId, input);
      const idempotencyKey = (input as { idempotencyKey?: string }).idempotencyKey
        || (input as { idempotency_key?: string }).idempotency_key;

      const { result, replayed } = await this.idempotency.beginOrReplay({
        idempotencyKey,
        operation: options?.forceFilePreserve ? 'submit_approved_file' : 'submit_approved_document',
        userId: integration.createdBy?.id,
        requestPayload: {
          projectId,
          title: versioned.title,
          documentCode: versioned.documentCode,
          versionNo: versioned.versionNo,
          fileName,
          importMode,
          checksumHint: fileContentBase64.slice(0, 64),
        },
        execute: async () => {
          const queued = await this.orchestrator.queueMcpApprovedDocument({
            provider: ConnectorProvider.CHATGPT_MCP,
            projectId,
            title: versioned.title,
            documentCode: versioned.documentCode,
            documentType: versioned.documentType,
            description: versioned.description,
            owner: versioned.owner,
            versionNo: versioned.versionNo,
            approvalStatus: input.approvalStatus,
            approvedBy: input.approvedBy?.trim() || this.defaultApproverName(integration),
            approvalDate: input.approvalDate,
            sectionKey,
            metadataJson: input.metadataJson,
            relationshipsJson: input.relationshipsJson,
            mode: versioned.mode,
            existingDocumentId: versioned.existingDocumentId,
            fileName,
            fileContentBase64,
            mimeType,
            sourceSha256: (input as { sourceSha256?: string }).sourceSha256,
            mcpIntegrationId: integration.id,
            processAsync: true,
            importMode,
            conversionPerformed,
            originalFilename: originalFilenameHint || fileName,
          });

          const workspaceCode = input.workspaceCode?.trim() || null;
          if (!queued.needsReview) {
            this.connectorImports.enqueueSingleImport(queued.importJobId, {
              workspaceCode,
              userId: this.mcpActor(integration).id,
            });
          }

          await this.audit.record({
            action: 'MCP_SUBMISSION_ACCEPTED',
            entityType: 'ImportJob',
            entityId: queued.importJobId,
            message: `MCP ${importMode} submission accepted for ${fileName} (async queue)`,
            after: {
              integrationId: integration.id,
              checksum: queued.checksum,
              async: true,
              importMode,
              conversionPerformed,
              checksumVerified: queued.checksumVerified === true,
              tool: options?.forceFilePreserve ? 'submit_approved_file' : 'submit_approved_document',
            },
            ipAddress,
          });

          return {
            accepted: true,
            status: queued.imported ? 'IMPORTED' : 'QUEUED',
            importJobId: queued.importJobId,
            importStatus: queued.status,
            externalImportStatus: queued.externalImportStatus,
            checksum: queued.checksum,
            fileName: queued.fileName,
            originalFilename: queued.originalFilename || originalFilenameHint || fileName,
            outputFormat: (extname(queued.fileName).replace('.', '') || 'bin').toLowerCase(),
            mimeType: queued.mimeType || mimeType,
            imported: false,
            needsReview: queued.needsReview === true,
            documentCode: queued.documentCode ?? null,
            sectionName: queued.sectionName ?? null,
            workspaceCode,
            importMode: queued.importMode || importMode,
            conversionPerformed: queued.conversionPerformed === true,
            sourceSizeBytes: queued.sourceSizeBytes,
            storedSizeBytes: queued.storedSizeBytes,
            sourceSha256: queued.sourceSha256 || queued.checksum,
            storedSha256: queued.storedSha256 || queued.checksum,
            checksumVerified: queued.checksumVerified === true,
            message: queued.message
              ?? `Import accepted as ${queued.fileName}. Poll get_import_status; workspace creation is not import completion.`,
            projectId,
            sectionKey: sectionKey ?? null,
            documentType: versioned.documentType,
            hint: workspaceCode
              ? `Queued for workspace ${workspaceCode}. Use get_import_status with importJobId.`
              : 'Pass workspaceCode to attach after import, or call attach_document_to_workspace later.',
          };
        },
      });

      return { ...result, idempotentReplay: replayed };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Submission rejected';
      await this.audit.record({
        action: 'MCP_SUBMISSION_REJECTED',
        entityType: 'McpIntegration',
        entityId: integration.id,
        message,
        after: { projectId, fileName: input.fileName, importMode },
        ipAddress,
      });
      throw error;
    }
  }

  /** True when the request names an Office/PDF binary that must not be rebuilt from Markdown. */
  private looksLikeOriginalBinaryFile(fileName?: string, mimeType?: string): boolean {
    const name = String(fileName || '').toLowerCase();
    if (/\.(docx|xlsx|pptx|pdf|doc|xls|ppt)$/i.test(name)) return true;
    const mime = String(mimeType || '').toLowerCase();
    return (
      mime.includes('wordprocessingml')
      || mime.includes('spreadsheetml')
      || mime.includes('presentationml')
      || mime === 'application/pdf'
      || mime === 'application/msword'
      || mime.includes('ms-excel')
      || mime.includes('ms-powerpoint')
    );
  }

  /**
   * ChatGPT Actions cannot attach DOCX/XLSX bytes. Prefer HTTPS fileUrl (Mode A) or
   * prepare_automatic_file_import chunks (Mode C). Do not treat browser upload as success UX.
   */
  private async offerBrowserUploadForOriginal(
    integration: McpIntegration,
    input: {
      projectId?: string;
      projectCode?: string;
      module?: string;
      sectionKey?: string;
      documentType?: string;
      title?: string;
      versionNo?: string;
      approvalStatus?: string;
      approvedBy?: string;
      approvalDate?: string;
      fileName?: string;
      mimeType?: string;
      mode?: 'NEW' | 'NEW_VERSION';
      documentCode?: string;
      existingDocumentId?: string;
    },
    reason: string,
  ) {
    const capability = this.binaryImport.inspectAttachmentCapability({
      fileName: input.fileName,
      canProvideExactBytes: false,
    });
    return {
      status: 'AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST' as const,
      ready: false,
      conversionPerformed: false,
      importMode: 'FILE_PRESERVE' as const,
      preserveOriginal: true,
      errorCode: 'AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST',
      supportedTransport: capability.supportedTransport,
      mode: input.mode,
      documentCode: input.documentCode ?? null,
      existingDocumentId: input.existingDocumentId ?? null,
      fileName: input.fileName ?? null,
      title: input.title ?? null,
      message:
        `${reason} `
        + 'Host did not supply fileUrl/attachmentReference or exact binary chunks. '
        + 'Do NOT convert to Markdown/PDF. Do NOT claim import succeeded. '
        + 'ZERO-CLICK: resubmit with fileUrl=https://… to the exact file, or call '
        + 'prepare_automatic_file_import and upload_original_file_chunk if the host can send exact bytes.',
      zeroClickHint:
        'Pass fileUrl (public HTTPS to the exact DOCX/XLSX) to import_original_file / submit_approved_file.',
      neverConvertsMarkdownToOffice: true,
      browserUploadForbiddenAsPrimaryUx: true,
    };
  }

  /**
   * FILE_PRESERVE: import exact original bytes. Never converts Markdown to Office/PDF.
   */
  async submitApprovedFile(
    integration: McpIntegration,
    input: SubmitApprovedFileDto,
    ipAddress?: string,
  ) {
    const hasBinary = Boolean(
      input.fileContentBase64?.trim() || input.uploadId?.trim() || input.fileUrl?.trim(),
    );
    if (!hasBinary) {
      await this.audit.record({
        action: 'MCP_ORIGINAL_FILE_UNAVAILABLE',
        entityType: 'McpIntegration',
        entityId: integration.id,
        message: 'submit_approved_file called without usable file bytes/reference',
        after: {
          tool: 'submit_approved_file',
          fileName: input.fileName,
          workspaceCode: input.workspaceCode,
        },
        ipAddress,
      });
      return this.offerBrowserUploadForOriginal(
        integration,
        input,
        'ChatGPT Actions/MCP did not supply original binary bytes or HTTPS fileUrl.',
      );
    }

    const defaults = this.applySubmitDefaults(
      {
        ...input,
        versionNo: input.versionNo || '1.0',
        approvalStatus: input.approvalStatus || 'APPROVED',
        approvalDate: input.approvalDate || new Date().toISOString().slice(0, 10),
        fileName: input.fileName,
      } as SubmitApprovedDocumentDto,
      undefined,
      this.defaultApproverName(integration),
    );

    return this.submitApprovedDocument(
      integration,
      {
        ...defaults,
        fileName: input.fileName,
        fileContentBase64: input.fileContentBase64,
        uploadId: input.uploadId,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        workspaceCode: input.workspaceCode,
        sourceSha256: input.sourceSha256,
        documentContent: undefined,
        outputFormat: undefined,
        idempotencyKey: input.idempotencyKey,
      },
      ipAddress,
      { forceFilePreserve: true },
    );
  }

  async getImportStatus(integration: McpIntegration, input: GetImportStatusDto) {
    const job = await this.db.importJobs.findOne({
      where: { id: input.importJobId },
      relations: { project: true, sourceSystem: true, resolvedSection: true, document: true, version: true },
    });
    if (!job) throw new NotFoundException('Import job not found');
    this.assertProjectAccess(integration, job.project.id);

    return {
      id: job.id,
      status: job.status,
      externalImportStatus: job.externalImportStatus,
      provider: job.provider,
      fileName: job.fileName,
      checksum: job.checksum,
      errorMessage: job.errorMessage,
      importMode: (job.metadata as Record<string, unknown> | null)?.importMode ?? null,
      conversionPerformed: (job.metadata as Record<string, unknown> | null)?.conversionPerformed ?? null,
      checksumVerified: (job.metadata as Record<string, unknown> | null)?.checksumVerified ?? null,
      originalFilename: (job.metadata as Record<string, unknown> | null)?.originalFilename ?? job.fileName,
      sourceSizeBytes: (job.metadata as Record<string, unknown> | null)?.sourceSizeBytes ?? job.fileSize,
      storedSizeBytes: (job.metadata as Record<string, unknown> | null)?.storedSizeBytes ?? job.fileSize,
      sourceSha256: (job.metadata as Record<string, unknown> | null)?.sourceSha256 ?? job.checksum,
      storedSha256: (job.metadata as Record<string, unknown> | null)?.storedSha256 ?? job.checksum,
      project: { id: job.project.id, code: job.project.code, name: job.project.name },
      sourceSystem: { id: job.sourceSystem.id, code: job.sourceSystem.code, name: job.sourceSystem.name },
      resolvedSection: job.resolvedSection
        ? { id: job.resolvedSection.id, sectionKey: job.resolvedSection.sectionKey, name: job.resolvedSection.name }
        : null,
      document: job.document ? { id: job.document.id, code: job.document.code, title: job.document.title } : null,
      version: job.version ? { id: job.version.id, versionNo: job.version.versionNo } : null,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }

  private publicBaseUrl(): string {
    const configured =
      this.config.get<string>('REPO_WEB_URL')
      || this.config.get<string>('PUBLIC_WEB_URL')
      || this.config.get<string>('CORS_ORIGIN')
      || 'https://repo.physicalrisk.com';
    const first = configured.split(',')[0]?.trim() || 'https://repo.physicalrisk.com';
    return first.replace(/\/+$/, '');
  }

  /** Unwrap optional ChatGPT `payload` JSON string into a plain object. */
  private unwrapPayloadObject(args: Record<string, unknown>): Record<string, unknown> {
    const outer: Record<string, unknown> = args ?? {};
    const rawPayload = outer.payload;
    if (typeof rawPayload === 'string' && rawPayload.trim()) {
      try {
        const parsed = JSON.parse(rawPayload) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException('payload must be a JSON object string');
        }
        // Merge inner payload with top-level Action fields (outputFormat/fileName).
        // Outer non-empty values win so ChatGPT can set format outside the JSON string.
        const { payload: _ignored, ...rest } = outer;
        const merged: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
        for (const [key, value] of Object.entries(rest)) {
          if (typeof value === 'string' && value.trim()) {
            merged[key] = value.trim();
          } else if (value !== undefined && value !== null && typeof value !== 'string') {
            merged[key] = value;
          }
        }
        return merged;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('payload must be valid JSON');
      }
    }
    return outer;
  }

  /**
   * When submitting a revision of an existing document, attach existingDocumentId / documentCode
   * and bump versionNo past the current revision (defaults alone would stay at Rev 1.0).
   * Preserve Document Information when GPT omits owner/description/type on the revision.
   */
  private async resolveNewVersionSubmit(
    projectId: string,
    input: SubmitApprovedDocumentDto,
  ): Promise<{
    title: string;
    documentCode?: string;
    documentType: string;
    description?: string;
    owner?: string;
    versionNo: string;
    mode?: 'NEW' | 'NEW_VERSION';
    existingDocumentId?: string;
  }> {
    // Explicit mode=NEW always allocates a new document code.
    // Otherwise: existingDocumentId / documentCode / same title → NEW_VERSION (Rev 1.1, …).
    const forceNewDocument = input.mode === 'NEW';
    let document: Document | null = null;

    if (input.existingDocumentId?.trim()) {
      document = await this.db.documents.findOne({
        where: { id: input.existingDocumentId.trim(), project: { id: projectId }, deletedAt: IsNull() },
        relations: { versions: true },
      });
      if (!document) {
        throw new BadRequestException('existingDocumentId was not found in this project');
      }
    } else if (input.documentCode?.trim()) {
      document = await this.db.documents.findOne({
        where: { project: { id: projectId }, code: input.documentCode.trim().toUpperCase(), deletedAt: IsNull() },
        relations: { versions: true },
      });
    } else if (!forceNewDocument && input.title?.trim()) {
      // Auto-version: same title in project → bump Rev (stops PROR-PA-001/002/003 duplicates).
      document = await this.db.documents
        .createQueryBuilder('document')
        .leftJoinAndSelect('document.versions', 'versions')
        .innerJoin('document.project', 'project')
        .where('project.id = :projectId', { projectId })
        .andWhere('document.deletedAt IS NULL')
        .andWhere('LOWER(document.title) = LOWER(:title)', { title: input.title.trim() })
        .orderBy('document.updatedAt', 'DESC')
        .getOne();
    }

    if (!document) {
      return {
        title: input.title,
        documentCode: input.documentCode,
        documentType: input.documentType,
        description: input.description,
        owner: input.owner,
        versionNo: input.versionNo,
        mode: input.mode,
        existingDocumentId: input.existingDocumentId,
      };
    }

    const versionNos = (document.versions ?? []).map((version) => version.versionNo);
    if (document.currentVersionNo && !versionNos.includes(document.currentVersionNo)) {
      versionNos.push(document.currentVersionNo);
    }
    const suggested = suggestNextVersion(versionNos.length ? versionNos : ['Rev 1.0']);
    const submitted = input.versionNo?.trim() || '';
    const current = document.currentVersionNo || versionNos[0] || 'Rev 1.0';
    const treatAsDefault = !submitted || /^rev\s*1\.0$/i.test(submitted) || submitted === '1.0';
    const notNewer = Boolean(submitted) && compareVersions(submitted, current) <= 0;
    const versionNo = treatAsDefault || notNewer ? suggested : submitted;

    // Targeting an existing document always means a new revision — merge metadata, don't blank it.
    return {
      title: document.title,
      documentCode: document.code,
      documentType: input.documentType?.trim() || document.documentType || '',
      description: input.description?.trim() || document.description || undefined,
      owner: input.owner?.trim() || document.owner || undefined,
      versionNo,
      mode: 'NEW_VERSION',
      existingDocumentId: document.id,
    };
  }

  /** Apply defaults + resolve documentType aliases for every submit path. */
  private async normaliseSubmitInput(
    input: SubmitApprovedDocumentDto,
    integration?: McpIntegration,
  ): Promise<SubmitApprovedDocumentDto> {
    const defaultApprover = integration ? this.defaultApproverName(integration) : undefined;
    const withDefaults = this.applySubmitDefaults(input, input.documentContent, defaultApprover);
    const documentType = await this.resolveDocumentTypeName(
      withDefaults.documentType,
      input.module,
    );
    const titleFromContent = this.deriveTitleFromContent(input.documentContent);
    const title = withDefaults.title === 'document' && titleFromContent
      ? titleFromContent
      : withDefaults.title;
    return {
      ...input,
      ...withDefaults,
      title,
      documentType: documentType || withDefaults.documentType || '',
      description: withDefaults.description?.trim()
        || this.deriveDescription(input.documentContent, title)
        || title,
      owner: withDefaults.owner?.trim() || withDefaults.approvedBy || defaultApprover || 'Repository User',
    };
  }

  /** Map folder names / plurals ChatGPT often sends onto seeded document type names. */
  private async resolveDocumentTypeName(
    rawType?: string | null,
    moduleHint?: string | null,
  ): Promise<string | undefined> {
    const needle = (rawType || moduleHint || '').trim();
    if (!needle) return undefined;
    const types = await this.listDocumentTypes();
    const lower = needle.toLowerCase();
    const exact = types.find((type) => type.name.toLowerCase() === lower || type.code.toLowerCase() === lower);
    if (exact) return exact.name;

    const aliases: Record<string, string> = {
      articles: 'Article',
      article: 'Article',
      'research library': 'Research Note',
      'research note': 'Research Note',
      'product architecture': 'Architecture Document',
      'architecture document': 'Architecture Document',
      'architecture doc': 'Architecture Doc',
      'enterprise architecture': 'EA Blueprint',
      'ea blueprint': 'EA Blueprint',
      'functional specifications': 'Functional Specification',
      'technical specifications': 'Technical Specification',
      'api specifications': 'API Contract',
      'data models': 'Data Model Definition',
      'business rules': 'Business Rule',
      'governance standards': 'Governance Standard',
      'operating procedures': 'Operating Procedure',
      'developer packs': 'Developer Pack',
      'marketing assets': 'Marketing Collateral',
      templates: 'Template',
      decisions: 'Decision Record',
      'meeting records': 'Meeting Minutes',
      'release notes': 'Release Note',
    };
    const aliased = aliases[lower];
    if (aliased) {
      const match = types.find((type) => type.name === aliased);
      if (match) return match.name;
    }

    // Singularise trailing "s" (Articles → Article) when that type exists.
    if (lower.endsWith('s')) {
      const singular = needle.replace(/s$/i, '');
      const match = types.find((type) => type.name.toLowerCase() === singular.toLowerCase());
      if (match) return match.name;
    }
    return needle;
  }

  private deriveTitleFromContent(documentContent?: string): string | undefined {
    const raw = documentContent?.trim();
    if (!raw) return undefined;
    const heading = raw.split(/\r?\n/).map((line) => line.trim()).find((line) => /^#\s+\S/.test(line));
    if (!heading) return undefined;
    const title = heading.replace(/^#+\s+/, '').replace(/[*_`]+/g, '').trim();
    return title || undefined;
  }

  /** Reject placeholder / truncated Markdown that would produce a near-empty PDF. */
  private assertDocumentContentUsable(content: string) {
    const trimmed = content.trim();
    const withoutHeading = trimmed.replace(/^#+\s.*$/m, '').trim();
    const substantive = withoutHeading
      .replace(/\.{3,}/g, '')
      .replace(/…/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (substantive.length < 80) {
      throw new BadRequestException(
        'documentContent is too short or looks like a placeholder. '
        + 'Put the full Markdown article from this chat into documentContent before submitting.',
      );
    }
  }

  /** Accept flat fields or a single JSON string `payload` (ChatGPT UnrecognizedKwargsError workaround). */
  private parsePreparePayload(args: Record<string, unknown>): PrepareApprovedDocumentDto {
    const source = this.unwrapPayloadObject(args);
    const str = (key: string) => {
      const value = source[key];
      return typeof value === 'string' ? value.trim() : undefined;
    };
    const modeRaw = str('mode');
    const asNewVersion = source.asNewVersion === true
      || source.newVersion === true
      || str('asNewVersion')?.toLowerCase() === 'true'
      || str('newVersion')?.toLowerCase() === 'true';
    const mode = modeRaw === 'NEW' || modeRaw === 'NEW_VERSION'
      ? modeRaw
      : (asNewVersion ? 'NEW_VERSION' : undefined);

    return {
      projectId: str('projectId'),
      projectCode: str('projectCode') || str('project') || str('repositoryProject'),
      title: str('title') || '',
      documentCode: str('documentCode') || str('code') || str('document_code'),
      documentType: str('documentType') || str('repositoryDocumentType') || '',
      description: str('description') || str('summary') || str('abstract'),
      owner: str('owner') || str('author') || str('documentOwner'),
      versionNo: str('versionNo') || str('version') || '',
      approvalStatus: str('approvalStatus') || 'APPROVED',
      approvedBy: str('approvedBy') || str('approver') || '',
      approvalDate: str('approvalDate') || '',
      module: str('module') || str('repositoryModule') || str('repository_module'),
      sectionKey: str('sectionKey'),
      fileName: str('fileName') || str('originalFilename') || str('original_filename'),
      mimeType: str('mimeType'),
      outputFormat:
        str('outputFormat')
        || str('output_format')
        || str('format')
        || str('fileType')
        || str('file_type')
        || str('extension')
        || str('fileExtension'),
      metadataJson: str('metadataJson'),
      relationshipsJson: str('relationshipsJson'),
      mode,
      existingDocumentId: str('existingDocumentId') || str('existing_document_id') || str('documentId'),
      workspaceCode: str('workspaceCode') || str('workspace_code') || str('workspace'),
    };
  }

  /** Fill ChatGPT-omitted fields so approve→submit works without another questionnaire. */
  private applySubmitDefaults(
    input: PrepareApprovedDocumentDto,
    documentContent?: string,
    defaultApprover?: string,
  ): PrepareApprovedDocumentDto {
    const today = new Date().toISOString().slice(0, 10);
    const titleFromContent = this.deriveTitleFromContent(documentContent);
    const title = (input.title?.trim() && input.title.trim() !== 'document'
      ? input.title.trim()
      : titleFromContent)
      || input.title?.trim()
      || 'document';
    const hasMarkdown = Boolean(documentContent?.trim());
    const fallbackApprover = defaultApprover?.trim() || 'Repository User';
    const approvedBy = input.approvedBy?.trim() || fallbackApprover;
    const description = input.description?.trim()
      || this.deriveDescription(documentContent, title)
      || title;
    // ChatGPT often sends mimeType=application/pdf even for Excel — ignore that weak default.
    const hintedName = this.inferFileNameHint(input.fileName, title, description, documentContent);
    const intentFormat = this.inferFormatFromIntent(
      (input as { outputFormat?: string }).outputFormat,
      hintedName || input.fileName,
      title,
      description,
      documentContent,
    );
    let format = hasMarkdown
      ? McpMarkdownOfficeService.resolveFormat({
        fileName: hintedName || input.fileName,
        mimeType: this.effectiveMimeForFormat(input.mimeType),
        outputFormat: (input as { outputFormat?: string }).outputFormat || intentFormat,
      })
      : 'pdf';
    if (hasMarkdown && format === 'pdf' && intentFormat) {
      format = intentFormat;
    }
    return {
      ...input,
      title,
      documentType: input.documentType?.trim() || '',
      description,
      owner: input.owner?.trim() || approvedBy,
      versionNo: input.versionNo?.trim() || 'Rev 1.0',
      approvalStatus: input.approvalStatus?.trim() || 'APPROVED',
      approvedBy,
      approvalDate: input.approvalDate?.trim() || today,
      outputFormat: format,
      fileName:
        input.fileName?.trim()
        || hintedName
        || (hasMarkdown ? McpMarkdownOfficeService.fileNameFor(title, format) : undefined),
      // Always align MIME with resolved format for Markdown submits (do not keep GPT's pdf default).
      mimeType: hasMarkdown
        ? McpMarkdownOfficeService.mimeFor(format)
        : (input.mimeType?.trim() || undefined),
    };
  }

  /** Drop ChatGPT's habitual application/pdf so it cannot override .xlsx/.docx intent. */
  private effectiveMimeForFormat(mimeType?: string): string | undefined {
    const mime = String(mimeType || '').trim().toLowerCase().split(';')[0].trim();
    if (!mime || mime === 'application/pdf' || mime === 'application/octet-stream') {
      return undefined;
    }
    return mimeType?.trim();
  }

  /** Recover Excel/Word/PPT/TXT intent from title/description when GPT omits fileName/outputFormat. */
  private inferFileNameHint(
    fileName?: string,
    title?: string,
    description?: string,
    documentContent?: string,
  ): string | undefined {
    if (fileName?.trim()) return fileName.trim();
    const blob = [title, description, documentContent?.slice(0, 2000)].filter(Boolean).join('\n');
    const match = blob.match(/([\w .,-]+?\.(xlsx|xls|docx|doc|pptx|ppt|txt))\b/i);
    return match?.[1]?.trim();
  }

  /**
   * Detect Office/TXT intent from ChatGPT wording even when it forgets outputFormat.
   * Example: description says "Excel-based … workbook: Plan.xlsx" but payload omits format → still xlsx.
   */
  private inferFormatFromIntent(
    outputFormat?: string,
    fileName?: string,
    title?: string,
    description?: string,
    documentContent?: string,
  ): 'docx' | 'xlsx' | 'pptx' | 'txt' | undefined {
    const explicit = McpMarkdownOfficeService.resolveFormat({
      fileName,
      outputFormat,
    });
    if (explicit !== 'pdf') return explicit;

    const blob = [title, description, documentContent?.slice(0, 4000), fileName]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();

    const fromPhrase = McpMarkdownOfficeService.formatFromPhrase(
      [title, description, fileName].filter(Boolean).join(' '),
    );
    if (fromPhrase && fromPhrase !== 'pdf') return fromPhrase;

    if (/\.xlsx?\b/.test(blob) || /\b(xlsx|xls|excel|spreadsheet|workbook)\b/.test(blob)) {
      return 'xlsx';
    }
    if (/\.docx?\b/.test(blob) || /\b(docx|ms[- ]word|word document)\b/.test(blob)) {
      return 'docx';
    }
    if (/\.pptx?\b/.test(blob) || /\b(pptx|ppt|powerpoint)\b/.test(blob)) {
      return 'pptx';
    }
    if (/\.txt\b/.test(blob) || /\b(plain text|plaintext)\b/.test(blob)) {
      return 'txt';
    }
    return undefined;
  }

  /** Prefer the repo user who owns the MCP API key; ChatGPT does not send end-user identity. */
  private defaultApproverName(integration: McpIntegration): string {
    const user = integration.createdBy;
    const name = user?.name?.trim();
    if (name) return name;
    const email = user?.email?.trim();
    if (email) return email;
    const integrationName = integration.name?.trim();
    if (integrationName) return integrationName;
    return 'Repository User';
  }

  /** Short Document Information description from Markdown when GPT omits description. */
  private deriveDescription(documentContent: string | undefined, title: string): string | undefined {
    const raw = documentContent?.trim();
    if (!raw) return undefined;
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const paragraph = lines.find((line) => {
      if (line.startsWith('#')) return false;
      if (line.startsWith('```')) return false;
      if (line.startsWith('|')) return false;
      if (/^[-*+]\s/.test(line)) return false;
      if (/^\d+\.\s/.test(line)) return false;
      return line.length > 20;
    });
    const text = (paragraph || lines.find((line) => !line.startsWith('#')) || title)
      .replace(/[*_`>#]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return undefined;
    return text.length > 400 ? `${text.slice(0, 397).trimEnd()}…` : text;
  }

  private parseSubmitPayload(args: Record<string, unknown>): {
    dto: PrepareApprovedDocumentDto;
    uploadId?: string;
    fileContentBase64?: string;
    fileUrl?: string;
    documentContent?: string;
  } {
    const source = this.unwrapPayloadObject(args);
    const outer = args ?? {};
    const pick = (key: string) => {
      const fromSource = source[key];
      const fromOuter = outer[key];
      if (typeof fromSource === 'string' && fromSource.trim()) return fromSource.trim();
      if (typeof fromOuter === 'string' && fromOuter.trim()) return fromOuter.trim();
      return undefined;
    };
    const pickContent = (key: string) => {
      const fromSource = source[key];
      const fromOuter = outer[key];
      if (typeof fromSource === 'string' && fromSource.trim()) return fromSource;
      if (typeof fromOuter === 'string' && fromOuter.trim()) return fromOuter;
      return undefined;
    };
    return {
      dto: this.parsePreparePayload(args),
      uploadId: pick('uploadId'),
      fileContentBase64: pick('fileContentBase64'),
      fileUrl: pick('fileUrl') || pick('file_url') || pick('documentUrl'),
      documentContent:
        pickContent('documentContent')
        || pickContent('document_content')
        || pickContent('content')
        || pickContent('body'),
    };
  }

  private defaultMarkdownFileName(title?: string): string {
    const base = String(title || 'document')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim() || 'document';
    return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
  }

  private defaultPdfFileName(titleOrName?: string): string {
    const raw = String(titleOrName || 'document').trim();
    const withoutExt = raw.replace(/\.(md|markdown|txt|pdf)$/i, '');
    const base = withoutExt
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim() || 'document';
    return `${base}.pdf`;
  }

  assertProjectAccess(integration: McpIntegration, projectId: string): void {
    try {
      this.auth.assertProjectAllowed(integration, projectId);
    } catch {
      throw new McpForbiddenException(`Project '${projectId}' is not allowed for this MCP integration`);
    }
  }

  /** Accept project UUID, code, or name (case-insensitive). Tries every candidate ChatGPT may send. */
  async resolveProjectId(
    integration: McpIntegration,
    projectId?: string,
    projectCode?: string,
  ): Promise<string> {
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const raw = [projectCode, projectId].map((value) => (value || '').trim()).filter(Boolean);
    if (!raw.length) {
      throw new BadRequestException('Provide projectId (UUID) or projectCode / project name');
    }

    // Expand "MCRD — Marketing…" / "MCRD (Marketing…)" into code candidates.
    // Also try each field on its own — GPT often puts the module name in projectCode
    // while the real code sits in projectId (or the reverse).
    const candidates: string[] = [];
    for (const value of raw) {
      for (const part of this.expandProjectNeedle(value)) {
        if (!candidates.includes(part)) candidates.push(part);
      }
    }

    for (const candidate of candidates) {
      if (uuidLike.test(candidate)) {
        try {
          this.assertProjectAccess(integration, candidate);
          return candidate;
        } catch {
          // Stale UUID from an old chat — keep trying code/name candidates.
        }
      }
    }

    const projects = await this.listRepositoryProjects(integration);
    for (const needle of candidates) {
      const lowered = needle.toLowerCase();
      const exact = projects.find((project) =>
        project.code.toLowerCase() === lowered
        || project.name.toLowerCase() === lowered);
      if (exact) return exact.id;

      const fuzzy = projects.filter((project) =>
        project.name.toLowerCase().includes(lowered)
        || project.code.toLowerCase().includes(lowered)
        || lowered.includes(project.code.toLowerCase()));
      if (fuzzy.length === 1) return fuzzy[0].id;
    }

    const shown = raw.join("' / '");
    throw new NotFoundException(
      `Project '${shown}' was not found or is not allowed for this MCP integration. `
      + `Available: ${projects.map((item) => `${item.code} (${item.name})`).join(', ') || '(none)'}. `
      + 'Use a project code from list_repository_projects (e.g. MCRD).',
    );
  }

  /** Split ChatGPT project labels into matchable tokens (code, bare name, etc.). */
  private expandProjectNeedle(value: string): string[] {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const out = [trimmed];
    const beforeDash = trimmed.split(/\s*[—–|:]\s+/)[0]?.trim();
    if (beforeDash && beforeDash !== trimmed) out.push(beforeDash);
    const beforeParen = trimmed.split(/\s*\(/)[0]?.trim();
    if (beforeParen && beforeParen !== trimmed) out.push(beforeParen);
    const codeToken = trimmed.match(/\b([A-Z][A-Z0-9]{1,12})\b/);
    if (codeToken?.[1]) out.push(codeToken[1]);
    return out;
  }

  private toolDescription(name: McpToolName): string {
    const descriptions: Record<McpToolName, string> = {
      list_repository_projects: 'List active repository projects allowed for this integration',
      list_repository_modules: 'List active project sections (modules) for a project (projectId UUID or projectCode)',
      list_document_types: 'List active document types configured in the gateway',
      resolve_import_targets:
        'Resolve human-readable project / module / document type names into projectId, sectionKey, and documentType values for submission',
      inspect_attachment_capability:
        'Detect whether ChatGPT can supply original binary (HTTPS fileUrl/reference or exact-byte chunks). '
        + 'Never converts Markdown. Returns HOST_REFERENCE, CHUNKED_BINARY, or UNSUPPORTED.',
      import_original_file:
        'Import an existing source file into the Physical Risk Repository while preserving the original file format and binary contents. '
        + 'Use this tool for DOCX, XLSX, PDF and other uploaded/generated files when the user requests the original file to be imported. '
        + 'Do not convert the file to Markdown or PDF. ALWAYS use this action instead of submit_approved_document when an existing DOCX, XLSX, PDF, PPTX or other source file must be preserved exactly. '
        + 'Pass fileUrl when available. For NEW_VERSION use mode=NEW_VERSION and documentCode (e.g. MOSS-GS-003). '
        + 'Creating a session is not IMPORTED — report success only after size and SHA-256 match.',
      prepare_original_file_import:
        'Start FILE_PRESERVE staged import of the exact original DOCX/XLSX/PDF/PPTX. Returns uploadId, uploadUrl, method=PUT. '
        + 'ALWAYS use this instead of submit_approved_document when an existing Office/PDF file must be preserved. '
        + 'Never convert to Markdown or PDF. Then PUT original bytes to uploadUrl and call finalize_original_file_import.',
      finalize_original_file_import:
        'Verify the stored original file (byte size + SHA-256) after staged PUT/chunk upload. '
        + 'Returns UPLOAD_PENDING, VERIFIED, VERIFICATION_FAILED, or IMPORTED. Never treat session creation as IMPORTED.',
      prepare_automatic_file_import:
        'Start durable automatic chunked FILE_PRESERVE import. Returns uploadId + uploadToken + acceptedChunkSize. '
        + 'Then upload_original_file_chunk repeatedly without waiting for another user message. Never Markdown.',
      upload_original_file_chunk:
        'Upload one Base64-encoded exact binary chunk. Validates chunkSha256 and rawByteLength. Idempotent. Never UTF-8-interpret bytes.',
      get_automatic_file_import_progress:
        'Progress for automatic chunked import (received/missing chunks, bytes, status).',
      resume_automatic_file_import:
        'Resume interrupted automatic chunked import; returns missingChunks and nextExpectedChunk.',
      complete_automatic_file_import:
        'Assemble chunks, validate OOXML/PDF signature + SHA-256/size, then queue FILE_PRESERVE. '
        + 'Creating a session is not success — report AVAILABLE/queued only after validation.',
      abort_automatic_file_import:
        'Abort automatic import; never deletes an existing valid document version.',
      prepare_approved_document:
        'Alias of upload_original_docx: FILE_PRESERVE staged PUT of the exact original file. Not Markdown→PDF.',
      upload_original_docx:
        'PRIMARY binary original-file upload (FILE_PRESERVE) for DOCX/XLSX/PDF/PPTX. '
        + 'Returns uploadUrl for exact bytes PUT. NEW_VERSION + documentCode supported. Not Markdown→PDF. This tool IS available.',
      upload_original_xlsx:
        'PRIMARY binary XLSX FILE_PRESERVE upload (same as upload_original_docx). Not Markdown.',
      upload_original_pdf:
        'PRIMARY binary PDF FILE_PRESERVE upload (same as upload_original_docx). Not Markdown.',
      upload_original_pptx:
        'PRIMARY binary PPTX FILE_PRESERVE upload (same as upload_original_docx). Not Markdown.',
      begin_document_upload:
        'Advanced: start a chunked file upload session',
      upload_document_chunk:
        'Advanced: upload one base64 chunk of the document',
      check_document_exists:
        'Check whether a document already exists; returns newVersionSubmitHints for the next revision',
      submit_approved_document:
        'GENERATED TEXT ONLY. Use only when the authoritative source is generated text/Markdown and conversion to a repository-generated document is intended. '
        + 'Do NOT use for an existing attached DOCX/XLSX/PDF/PPTX — use import_original_file or prepare_original_file_import instead. '
        + 'This is not a binary DOCX upload action.',
      submit_approved_file:
        'FILE_PRESERVE import of exact original bytes via fileUrl, fileContentBase64, or uploadId. '
        + 'ALWAYS prefer import_original_file for attached DOCX/XLSX/PDF. Never convert to Markdown.',
      submit_approved_content:
        'Use only when the authoritative source is generated text/Markdown and conversion to a repository-generated document is intended. '
        + 'Not for preserving an existing DOCX/XLSX/PDF attachment — use import_original_file.',
      get_import_status: 'Get the processing status of an import job by id',
      create_workspace: 'Create a Repository Workspace (returns WS-YYYY-#####)',
      get_workspace: 'Get a workspace by workspaceCode',
      find_workspaces: 'Find workspaces for the current user',
      get_latest_pending_workspace: 'Latest pending workspace for the authenticated MCP key owner',
      resume_workspace: 'Resume a paused or in-progress workspace',
      list_workspace_documents: 'List documents in a workspace',
      get_workspace_summary: 'Workspace summary with progress and documents',
      validate_workspace: 'Validate workspace documents before submit',
      submit_workspace: 'Submit a ready workspace for import processing',
      attach_document_to_workspace:
        'Attach an already-imported repository document to a workspace by documentCode (e.g. PROR-PA-002) or documentId',
      search_documents:
        'Search / list Master Document Index (compact). Use for "how many documents", "list documents", "what did I import". '
        + 'Optional projectCode, search text, status, limit.',
      get_document: 'Get one document by documentId or documentCode (e.g. MCRD-AS1-012)',
    };
    return descriptions[name];
  }

  private toolInputSchema(name: McpToolName): Record<string, unknown> {
    const schemas: Record<McpToolName, Record<string, unknown>> = {
      list_repository_projects: {
        type: 'object',
        description: 'No parameters required. Send an empty object.',
        properties: {
          unused: { type: 'boolean', description: 'Optional unused field for schema validators' },
        },
        additionalProperties: false,
      },
      list_repository_modules: {
        type: 'object',
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          projectCode: { type: 'string', description: 'Project code or name if UUID unknown' },
        },
      },
      list_document_types: {
        type: 'object',
        description: 'No parameters required. Send an empty object.',
        properties: {
          unused: { type: 'boolean', description: 'Optional unused field for schema validators' },
        },
        additionalProperties: false,
      },
      resolve_import_targets: {
        type: 'object',
        required: ['project'],
        properties: {
          project: { type: 'string', description: 'Project code, name, or UUID (e.g. MOSS)' },
          module: { type: 'string', description: 'Module/section name, code, or sectionKey (e.g. Enterprise Architecture)' },
          documentType: { type: 'string', description: 'Document type name or code (e.g. Articles)' },
        },
      },
      inspect_attachment_capability: {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
          fileUrl: { type: 'string', format: 'uri' },
          attachmentReference: { type: 'string' },
          canProvideExactBytes: { type: 'boolean' },
          expectedFileSize: { type: 'integer' },
          mimeType: { type: 'string' },
        },
      },
      import_original_file: {
        type: 'object',
        required: ['title', 'documentType', 'fileName'],
        properties: {
          projectCode: { type: 'string' },
          projectId: { type: 'string' },
          module: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          fileName: { type: 'string' },
          fileUrl: { type: 'string', format: 'uri' },
          attachmentReference: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          documentCode: { type: 'string' },
          existingDocumentId: { type: 'string', format: 'uuid' },
          expectedSha256: { type: 'string' },
          payload: { type: 'string' },
        },
      },
      prepare_original_file_import: {
        type: 'object',
        required: ['fileName', 'documentType', 'title'],
        properties: {
          projectCode: { type: 'string' },
          workspaceCode: { type: 'string' },
          module: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          documentCode: { type: 'string' },
          versionNo: { type: 'string' },
          fileName: { type: 'string' },
          mimeType: { type: 'string' },
          fileUrl: { type: 'string', format: 'uri' },
          payload: { type: 'string' },
        },
      },
      finalize_original_file_import: {
        type: 'object',
        required: ['uploadId'],
        properties: {
          uploadId: { type: 'string' },
          uploadToken: { type: 'string' },
        },
      },
      prepare_automatic_file_import: {
        type: 'object',
        required: ['fileName', 'documentType', 'title'],
        properties: {
          projectCode: { type: 'string' },
          module: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          fileName: { type: 'string' },
          expectedFileSize: { type: 'integer' },
          expectedSha256: { type: 'string' },
          expectedChunkCount: { type: 'integer' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          documentCode: { type: 'string' },
          payload: { type: 'string' },
        },
      },
      upload_original_file_chunk: {
        type: 'object',
        required: ['uploadId', 'uploadToken', 'chunkIndex', 'chunkSha256', 'rawByteLength'],
        properties: {
          uploadId: { type: 'string' },
          uploadToken: { type: 'string' },
          chunkIndex: { type: 'integer' },
          chunkNumber: { type: 'integer' },
          encodedContent: { type: 'string', description: 'Base64 of exact binary chunk' },
          chunkBase64: { type: 'string' },
          chunkSha256: { type: 'string' },
          rawByteLength: { type: 'integer' },
        },
      },
      get_automatic_file_import_progress: {
        type: 'object',
        required: ['uploadId', 'uploadToken'],
        properties: { uploadId: { type: 'string' }, uploadToken: { type: 'string' } },
      },
      resume_automatic_file_import: {
        type: 'object',
        required: ['uploadId', 'uploadToken'],
        properties: { uploadId: { type: 'string' }, uploadToken: { type: 'string' } },
      },
      complete_automatic_file_import: {
        type: 'object',
        required: ['uploadId', 'uploadToken'],
        properties: {
          uploadId: { type: 'string' },
          uploadToken: { type: 'string' },
          expectedSha256: { type: 'string' },
          expectedFileSize: { type: 'integer' },
          payload: { type: 'string' },
        },
      },
      abort_automatic_file_import: {
        type: 'object',
        required: ['uploadId', 'uploadToken'],
        properties: {
          uploadId: { type: 'string' },
          uploadToken: { type: 'string' },
          reason: { type: 'string' },
        },
      },
      prepare_approved_document: {
        type: 'object',
        required: ['title', 'documentType'],
        properties: {
          projectCode: { type: 'string' },
          projectId: { type: 'string' },
          module: { type: 'string' },
          sectionKey: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          documentCode: { type: 'string', description: 'e.g. MOSS-GS-003 for NEW_VERSION' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvedBy: {
            type: 'string',
            description: 'Optional. Defaults to the MCP API key owner name from the repo.',
          },
          approvalDate: { type: 'string' },
          fileName: { type: 'string', description: 'e.g. Catalogue.docx — must match original extension' },
          mimeType: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          fileUrl: {
            type: 'string',
            format: 'uri',
            description: 'Optional public URL of original binary. Prefer browser uploadUrl when unset.',
          },
        },
      },
      upload_original_docx: {
        type: 'object',
        required: ['title', 'documentType', 'fileName'],
        properties: {
          projectCode: { type: 'string' },
          module: { type: 'string', description: 'e.g. Governance Standards' },
          documentType: { type: 'string', description: 'e.g. Master Control Catalogue' },
          title: { type: 'string' },
          documentCode: { type: 'string', description: 'e.g. MOSS-GS-003 for NEW_VERSION' },
          fileName: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvalDate: { type: 'string' },
        },
      },
      upload_original_xlsx: {
        type: 'object',
        required: ['title', 'documentType', 'fileName'],
        properties: {
          projectCode: { type: 'string' },
          module: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          documentCode: { type: 'string' },
          fileName: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvalDate: { type: 'string' },
        },
      },
      upload_original_pdf: {
        type: 'object',
        required: ['title', 'documentType', 'fileName'],
        properties: {
          projectCode: { type: 'string' },
          module: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          documentCode: { type: 'string' },
          fileName: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvalDate: { type: 'string' },
        },
      },
      upload_original_pptx: {
        type: 'object',
        required: ['title', 'documentType', 'fileName'],
        properties: {
          projectCode: { type: 'string' },
          module: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          documentCode: { type: 'string' },
          fileName: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvalDate: { type: 'string' },
        },
      },
      begin_document_upload: {
        type: 'object',
        required: ['fileName', 'totalChunks'],
        properties: {
          fileName: { type: 'string' },
          totalChunks: { type: 'integer', minimum: 1, maximum: 500 },
          mimeType: { type: 'string' },
        },
      },
      upload_document_chunk: {
        type: 'object',
        required: ['uploadId', 'index', 'total', 'data'],
        properties: {
          uploadId: { type: 'string', format: 'uuid' },
          index: { type: 'integer', minimum: 0 },
          total: { type: 'integer', minimum: 1 },
          data: { type: 'string', description: 'Base64 chunk (keep under ~3500 chars)' },
        },
      },
      check_document_exists: {
        type: 'object',
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          projectCode: { type: 'string' },
          title: { type: 'string' },
          fileName: { type: 'string' },
          checksum: { type: 'string' },
          documentCode: { type: 'string' },
        },
      },
      submit_approved_document: {
        type: 'object',
        required: ['title', 'documentType'],
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          projectCode: { type: 'string', description: 'Alternative to projectId (e.g. MOSS)' },
          title: { type: 'string' },
          documentCode: { type: 'string' },
          documentType: { type: 'string' },
          description: { type: 'string' },
          owner: { type: 'string' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvedBy: {
            type: 'string',
            description: 'Optional. Defaults to the MCP API key owner name from the repo.',
          },
          approvalDate: { type: 'string' },
          sectionKey: { type: 'string' },
          metadataJson: { type: 'string' },
          relationshipsJson: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          fileName: { type: 'string', description: 'e.g. report.docx, sheet.xlsx, deck.pptx, notes.txt (PDF only if user asked for PDF)' },
          fileUrl: {
            type: 'string',
            format: 'uri',
            description: 'Public http(s) URL to PDF/Word/Excel/PowerPoint/text. Repo downloads it.',
          },
          documentContent: {
            type: 'string',
            description:
              'Full Markdown body from chat. Converts to XLSX/DOCX/PPTX/TXT/PDF from fileName/outputFormat (Excel request must be xlsx, never PDF). Max ~500KB.',
          },
          uploadId: { type: 'string', format: 'uuid', description: 'From begin_document_upload' },
          fileContentBase64: { type: 'string', description: 'Optional if documentContent, fileUrl, or uploadId provided' },
          mimeType: { type: 'string' },
          outputFormat: {
            type: 'string',
            enum: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'],
            description: 'Required when not PDF. Use xlsx if the user asked for Excel/spreadsheet.',
          },
          module: { type: 'string', description: 'Module name (e.g. Enterprise Architecture) — resolved to sectionKey' },
          workspaceCode: {
            type: 'string',
            description: 'Optional WS-YYYY-##### — attach this import to the workspace after submit',
          },
        },
      },
      submit_approved_file: {
        type: 'object',
        required: ['title', 'documentType', 'fileName'],
        description:
          'Import the exact original approved artifact without conversion. '
          + 'Requires fileContentBase64, fileUrl, or uploadId.',
        properties: {
          projectCode: { type: 'string' },
          projectId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          documentType: { type: 'string' },
          documentCode: { type: 'string' },
          module: { type: 'string' },
          fileName: { type: 'string', description: 'Original filename including extension (.docx, .xlsx, .pdf, …)' },
          mimeType: { type: 'string' },
          fileContentBase64: {
            type: 'string',
            description: 'Base64 of the original file bytes (preferred when ChatGPT can supply them)',
          },
          fileUrl: {
            type: 'string',
            format: 'uri',
            description: 'HTTPS URL the repository can fetch for the original artifact',
          },
          uploadId: {
            type: 'string',
            format: 'uuid',
            description: 'From begin_document_upload + upload_document_chunk',
          },
          sourceSha256: { type: 'string', description: 'Optional client SHA-256 hex of source bytes' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          versionNo: { type: 'string' },
          workspaceCode: { type: 'string' },
          description: { type: 'string' },
          owner: { type: 'string' },
        },
      },
      submit_approved_content: {
        type: 'object',
        required: ['title', 'documentType', 'documentContent'],
        description:
          'Create a Repository document from Markdown/text. Not for preserving original binary files.',
        properties: {
          projectCode: { type: 'string' },
          projectId: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          documentType: { type: 'string' },
          documentCode: { type: 'string' },
          module: { type: 'string' },
          documentContent: { type: 'string', description: 'Full Markdown/text body' },
          fileName: { type: 'string' },
          outputFormat: {
            type: 'string',
            enum: ['pdf', 'docx', 'xlsx', 'pptx', 'txt'],
          },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          versionNo: { type: 'string' },
          workspaceCode: { type: 'string' },
          description: { type: 'string' },
          owner: { type: 'string' },
        },
      },
      get_import_status: {
        type: 'object',
        required: ['importJobId'],
        properties: { importJobId: { type: 'string', format: 'uuid' } },
      },
      create_workspace: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          projectId: { type: 'string', format: 'uuid' },
          projectCode: { type: 'string' },
        },
      },
      get_workspace: {
        type: 'object',
        required: ['workspaceCode'],
        properties: { workspaceCode: { type: 'string', description: 'e.g. WS-2026-00045' } },
      },
      find_workspaces: {
        type: 'object',
        properties: {
          workspaceCode: { type: 'string' },
          name: { type: 'string' },
          projectCode: { type: 'string' },
          status: { type: 'string' },
        },
      },
      get_latest_pending_workspace: {
        type: 'object',
        properties: { unused: { type: 'boolean' } },
        additionalProperties: false,
      },
      resume_workspace: {
        type: 'object',
        required: ['workspaceCode'],
        properties: { workspaceCode: { type: 'string' } },
      },
      list_workspace_documents: {
        type: 'object',
        required: ['workspaceCode'],
        properties: { workspaceCode: { type: 'string' } },
      },
      get_workspace_summary: {
        type: 'object',
        required: ['workspaceCode'],
        properties: { workspaceCode: { type: 'string' } },
      },
      validate_workspace: {
        type: 'object',
        required: ['workspaceCode'],
        properties: { workspaceCode: { type: 'string' } },
      },
      submit_workspace: {
        type: 'object',
        required: ['workspaceCode'],
        properties: { workspaceCode: { type: 'string' } },
      },
      attach_document_to_workspace: {
        type: 'object',
        required: ['workspaceCode'],
        properties: {
          workspaceCode: { type: 'string', description: 'e.g. WS-2026-00004' },
          documentCode: { type: 'string', description: 'e.g. PROR-PA-002' },
          documentId: { type: 'string', format: 'uuid' },
          importJobId: { type: 'string', format: 'uuid' },
        },
      },
      search_documents: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Match title, document code, or document type' },
          projectCode: { type: 'string', description: 'e.g. MCRD, MOSS, PROR' },
          projectId: { type: 'string', format: 'uuid' },
          status: { type: 'string', description: 'Optional status filter (e.g. CURRENT)' },
          limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Max rows (default 50)' },
        },
      },
      get_document: {
        type: 'object',
        properties: {
          documentId: { type: 'string', format: 'uuid' },
          documentCode: { type: 'string', description: 'e.g. MCRD-AS1-012' },
        },
      },
    };
    return schemas[name];
  }
}
