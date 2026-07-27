import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { ConnectorProvider, McpIntegration, McpIntegrationStatus, ProjectStatus } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { ExternalImportOrchestratorService } from '../imports/external-import-orchestrator.service';
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
  UploadDocumentChunkDto,
} from './mcp.dto';
import { McpForbiddenException } from './mcp.exceptions';
import { McpBrowserUploadService } from './mcp-browser-upload.service';
import { McpUploadSessionService } from './mcp-upload-session.service';

@Injectable()
export class McpToolsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: McpAuthService,
    private readonly orchestrator: ExternalImportOrchestratorService,
    private readonly audit: AuditService,
    private readonly uploads: McpUploadSessionService,
    private readonly browserUploads: McpBrowserUploadService,
    private readonly config: ConfigService,
  ) {}

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
  ) {
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
      case 'prepare_approved_document':
        return this.prepareApprovedDocument(
          integration,
          this.parsePreparePayload(args),
        );
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
        // ChatGPT often still calls this name. Metadata-only → browser upload link.
        // Also accepts a single JSON "payload" string to avoid UnrecognizedKwargsError.
        const { dto: prepared, uploadId, fileContentBase64 } = this.parseSubmitPayload(args);
        if (!uploadId && !fileContentBase64) {
          return this.prepareApprovedDocument(integration, prepared);
        }
        const fileName = prepared.fileName?.trim();
        if (!fileName) {
          throw new BadRequestException('fileName is required when submitting file bytes');
        }
        return this.submitApprovedDocument(integration, {
          ...prepared,
          fileName,
          uploadId,
          fileContentBase64,
        }, ipAddress);
      }
      case 'get_import_status':
        return this.getImportStatus(integration, args as unknown as GetImportStatusDto);
      default:
        throw new BadRequestException(`Unknown MCP tool: ${toolName}`);
    }
  }

  async listRepositoryProjects(integration: McpIntegration) {
    const allowedIds = integration.allowedProjectIds ?? [];
    if (!allowedIds.length) return [];

    const projects = await this.db.projects.find({
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
    const projectId = await this.resolveProjectId(integration, input.projectId, input.projectCode);
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
    const projectId = await this.resolveProjectId(integration, undefined, input.project);
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
      .where('project.id = :projectId', { projectId });

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
      matches: filtered.map((document) => ({
        id: document.id,
        code: document.code,
        title: document.title,
        documentType: document.documentType,
        currentVersionNo: document.currentVersionNo,
        versions: (document.versions ?? []).map((version) => ({
          id: version.id,
          versionNo: version.versionNo,
          originalFileName: version.originalFileName,
          checksum: version.checksum,
        })),
      })),
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

    const pending = this.browserUploads.create({
      integrationId: integration.id,
      projectId,
      projectCode: project.code,
      module: input.module,
      sectionKey,
      documentType: input.documentType,
      title: input.title,
      versionNo: input.versionNo,
      approvalStatus: input.approvalStatus,
      approvedBy: input.approvedBy,
      approvalDate: input.approvalDate,
      fileName: input.fileName,
      mimeType: input.mimeType || 'application/pdf',
    });

    const baseUrl = this.publicBaseUrl();
    const uploadUrl = `${baseUrl}/api/mcp/upload/${pending.token}`;
    return {
      ready: true,
      uploadUrl,
      expiresAt: new Date(pending.expiresAt).toISOString(),
      project: { id: project.id, code: project.code, name: project.name },
      module: input.module ?? null,
      sectionKey: sectionKey ?? null,
      documentType: input.documentType,
      title: input.title,
      instructions:
        'Open uploadUrl in a browser, choose the PDF, and click Upload. '
        + 'That queues the Approved Document into the Import Queue. '
        + 'Then call get_import_status after the user confirms upload completed, or ask them for the import job id shown on the success page.',
    };
  }

  async completeBrowserUpload(
    token: string,
    file: { buffer: Buffer; originalname: string; mimetype?: string },
    ipAddress?: string,
  ) {
    const pending = this.browserUploads.get(token);
    this.browserUploads.assertNotExpired(pending);
    const integration = await this.db.mcpIntegrations.findOne({ where: { id: pending.integrationId } });
    if (!integration || integration.status !== McpIntegrationStatus.ACTIVE) {
      throw new BadRequestException('MCP integration for this upload link is not active');
    }

    const consumed = this.browserUploads.consume(token);
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
        fileName: consumed.fileName || file.originalname,
        mimeType: consumed.mimeType || file.mimetype,
        fileContentBase64: file.buffer.toString('base64'),
      },
      ipAddress,
    );
    return result;
  }

  async submitApprovedDocument(
    integration: McpIntegration,
    input: SubmitApprovedDocumentDto,
    ipAddress?: string,
  ) {
    const projectId = await this.resolveProjectId(integration, input.projectId, input.projectCode);
    let sectionKey = input.sectionKey?.trim() || undefined;
    if (!sectionKey && input.module?.trim()) {
      const resolved = await this.resolveImportTargets(integration, {
        project: projectId,
        module: input.module,
      });
      sectionKey = resolved.module?.sectionKey;
    }

    let fileContentBase64 = input.fileContentBase64?.trim();
    let fileName = input.fileName?.trim();
    let mimeType = input.mimeType?.trim();
    if (input.uploadId?.trim()) {
      const staged = this.uploads.takeBase64(input.uploadId.trim());
      fileContentBase64 = staged.fileContentBase64;
      fileName = fileName || staged.fileName;
      mimeType = mimeType || staged.mimeType;
    }
    if (!fileContentBase64) {
      throw new BadRequestException(
        'Provide uploadId from begin_document_upload/upload_document_chunk (preferred for ChatGPT), or fileContentBase64',
      );
    }
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }

    try {
      this.orchestrator.assertApprovedStatus(input.approvalStatus);
      const result = await this.orchestrator.queueMcpApprovedDocument({
        provider: ConnectorProvider.CHATGPT_MCP,
        projectId,
        title: input.title,
        documentCode: input.documentCode,
        documentType: input.documentType,
        description: input.description,
        owner: input.owner,
        versionNo: input.versionNo,
        approvalStatus: input.approvalStatus,
        approvedBy: input.approvedBy,
        approvalDate: input.approvalDate,
        sectionKey,
        metadataJson: input.metadataJson,
        relationshipsJson: input.relationshipsJson,
        mode: input.mode,
        existingDocumentId: input.existingDocumentId,
        fileName,
        fileContentBase64,
        mimeType,
        mcpIntegrationId: integration.id,
      });

      await this.audit.record({
        action: 'MCP_SUBMISSION_ACCEPTED',
        entityType: 'ImportJob',
        entityId: result.importJobId,
        message: `MCP submission accepted for ${input.fileName}`,
        after: { integrationId: integration.id, checksum: result.checksum },
        ipAddress,
      });

      return {
        accepted: true,
        importJobId: result.importJobId,
        status: result.status,
        externalImportStatus: result.externalImportStatus,
        checksum: result.checksum,
        fileName: result.fileName,
        projectId,
        sectionKey: sectionKey ?? null,
        documentType: input.documentType,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Submission rejected';
      await this.audit.record({
        action: 'MCP_SUBMISSION_REJECTED',
        entityType: 'McpIntegration',
        entityId: integration.id,
        message,
        after: { projectId, fileName: input.fileName },
        ipAddress,
      });
      throw error;
    }
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
    let source: Record<string, unknown> = args ?? {};
    const rawPayload = source.payload;
    if (typeof rawPayload === 'string' && rawPayload.trim()) {
      try {
        const parsed = JSON.parse(rawPayload) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new BadRequestException('payload must be a JSON object string');
        }
        source = parsed as Record<string, unknown>;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('payload must be valid JSON');
      }
    }
    return source;
  }

  /** Accept flat fields or a single JSON string `payload` (ChatGPT UnrecognizedKwargsError workaround). */
  private parsePreparePayload(args: Record<string, unknown>): PrepareApprovedDocumentDto {
    const source = this.unwrapPayloadObject(args);
    const str = (key: string) => {
      const value = source[key];
      return typeof value === 'string' ? value.trim() : undefined;
    };

    return {
      projectId: str('projectId'),
      projectCode: str('projectCode') || str('project'),
      title: str('title') || '',
      documentType: str('documentType') || '',
      versionNo: str('versionNo') || str('version') || '',
      approvalStatus: str('approvalStatus') || 'APPROVED',
      approvedBy: str('approvedBy') || '',
      approvalDate: str('approvalDate') || '',
      module: str('module') || str('repositoryModule'),
      sectionKey: str('sectionKey'),
      fileName: str('fileName'),
      mimeType: str('mimeType'),
    };
  }

  private parseSubmitPayload(args: Record<string, unknown>): {
    dto: PrepareApprovedDocumentDto;
    uploadId?: string;
    fileContentBase64?: string;
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
    return {
      dto: this.parsePreparePayload(args),
      uploadId: pick('uploadId'),
      fileContentBase64: pick('fileContentBase64'),
    };
  }

  assertProjectAccess(integration: McpIntegration, projectId: string): void {
    try {
      this.auth.assertProjectAllowed(integration, projectId);
    } catch {
      throw new McpForbiddenException(`Project '${projectId}' is not allowed for this MCP integration`);
    }
  }

  /** Accept project UUID, code, or name (case-insensitive). */
  async resolveProjectId(
    integration: McpIntegration,
    projectId?: string,
    projectCode?: string,
  ): Promise<string> {
    const needle = (projectId || projectCode || '').trim();
    if (!needle) {
      throw new BadRequestException('Provide projectId (UUID) or projectCode / project name');
    }

    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
    if (uuidLike) {
      this.assertProjectAccess(integration, needle);
      return needle;
    }

    const projects = await this.listRepositoryProjects(integration);
    const match = projects.find((project) =>
      project.code.toLowerCase() === needle.toLowerCase()
      || project.name.toLowerCase() === needle.toLowerCase());
    if (!match) {
      throw new NotFoundException(
        `Project '${needle}' was not found or is not allowed for this MCP integration. `
        + `Available: ${projects.map((item) => `${item.code} (${item.name})`).join(', ') || '(none)'}`,
      );
    }
    return match.id;
  }

  private toolDescription(name: McpToolName): string {
    const descriptions: Record<McpToolName, string> = {
      list_repository_projects: 'List active repository projects allowed for this integration',
      list_repository_modules: 'List active project sections (modules) for a project (projectId UUID or projectCode)',
      list_document_types: 'List active document types configured in the gateway',
      resolve_import_targets:
        'Resolve human-readable project / module / document type names into projectId, sectionKey, and documentType values for submission',
      prepare_approved_document:
        'PREFERRED for ChatGPT: create a one-time browser upload URL for an APPROVED document (Custom GPTs cannot send PDF bytes)',
      begin_document_upload:
        'Advanced: start a chunked file upload session',
      upload_document_chunk:
        'Advanced: upload one base64 chunk of the document',
      check_document_exists: 'Check whether a document already exists by title, filename, checksum, or code',
      submit_approved_document:
        'Advanced: submit using uploadId from chunked upload (prefer prepare_approved_document for ChatGPT)',
      get_import_status: 'Get the processing status of an import job by id',
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
      prepare_approved_document: {
        type: 'object',
        required: ['title', 'documentType', 'versionNo', 'approvalStatus', 'approvedBy', 'approvalDate'],
        properties: {
          projectCode: { type: 'string' },
          projectId: { type: 'string' },
          module: { type: 'string' },
          sectionKey: { type: 'string' },
          documentType: { type: 'string' },
          title: { type: 'string' },
          versionNo: { type: 'string' },
          approvalStatus: { type: 'string', enum: ['APPROVED'] },
          approvedBy: { type: 'string' },
          approvalDate: { type: 'string' },
          fileName: { type: 'string' },
          mimeType: { type: 'string' },
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
        required: ['title', 'documentType', 'versionNo', 'approvalStatus', 'approvedBy', 'approvalDate', 'fileName'],
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
          approvedBy: { type: 'string' },
          approvalDate: { type: 'string' },
          sectionKey: { type: 'string' },
          metadataJson: { type: 'string' },
          relationshipsJson: { type: 'string' },
          mode: { type: 'string', enum: ['NEW', 'NEW_VERSION'] },
          existingDocumentId: { type: 'string', format: 'uuid' },
          fileName: { type: 'string' },
          uploadId: { type: 'string', format: 'uuid', description: 'From begin_document_upload' },
          fileContentBase64: { type: 'string', description: 'Optional if uploadId provided' },
          mimeType: { type: 'string' },
          module: { type: 'string', description: 'Module name (e.g. Enterprise Architecture) — resolved to sectionKey' },
        },
      },
      get_import_status: {
        type: 'object',
        required: ['importJobId'],
        properties: { importJobId: { type: 'string', format: 'uuid' } },
      },
    };
    return schemas[name];
  }
}
