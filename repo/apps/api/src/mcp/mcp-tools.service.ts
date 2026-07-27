import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { ConnectorProvider, McpIntegration, ProjectStatus } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { ExternalImportOrchestratorService } from '../imports/external-import-orchestrator.service';
import { McpAuthService } from './mcp-auth.service';
import {
  CheckDocumentExistsDto,
  GetImportStatusDto,
  ListRepositoryModulesDto,
  MCP_TOOL_NAMES,
  McpToolName,
  ResolveImportTargetsDto,
  SubmitApprovedDocumentDto,
} from './mcp.dto';
import { McpForbiddenException } from './mcp.exceptions';

@Injectable()
export class McpToolsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: McpAuthService,
    private readonly orchestrator: ExternalImportOrchestratorService,
    private readonly audit: AuditService,
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
      case 'submit_approved_document':
        return this.submitApprovedDocument(integration, args as unknown as SubmitApprovedDocumentDto, ipAddress);
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

    const fileContentBase64 = input.fileContentBase64?.trim();
    if (!fileContentBase64) {
      throw new BadRequestException(
        'fileContentBase64 is required (or upload the file via the multipart submit_approved_document action)',
      );
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
        fileName: input.fileName,
        fileContentBase64,
        mimeType: input.mimeType,
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
      check_document_exists: 'Check whether a document already exists by title, filename, checksum, or code',
      submit_approved_document: 'Submit an APPROVED document into the import queue (not final storage)',
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
          fileContentBase64: { type: 'string', description: 'Optional when using multipart file upload Action' },
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
