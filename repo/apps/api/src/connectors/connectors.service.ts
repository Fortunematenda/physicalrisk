import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AuditService } from '../common/audit.service';
import { DatabaseService } from '../database/database.service';
import {
  ConnectorProvider,
  FolderImportMode,
  SourceConnection,
  SourceConnectionStatus,
  SyncRunStatus,
  SyncTriggerType,
} from '../database/entities';
import { ExternalImportOrchestratorService } from '../imports/external-import-orchestrator.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { ConnectorNotConnectedError } from './connector-errors';
import {
  CreateFolderMappingDto,
  GoogleDriveConnectDto,
  ImportSelectedDto,
  SelectRootFolderDto,
  UpdateConnectionDto,
  UpdateFolderMappingDto,
} from './dto/connector.dto';
import { ExternalFile } from './interfaces/external-file.interface';
import { isFolderBrowsingConnector, isOAuthConnector } from './interfaces/repository-connector.interface';

type SafeConnection = Omit<SourceConnection, 'credentialsEncrypted'> & { credentialsEncrypted?: never };

@Injectable()
export class ConnectorsService {
  private readonly activeSyncs = new Set<string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ConnectorRegistryService,
    private readonly orchestrator: ExternalImportOrchestratorService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  listConnections() {
    return this.db.sourceConnections.find({
      relations: { defaultProject: true, defaultSection: true, createdBy: true },
      order: { createdAt: 'DESC' },
    }).then((rows) => rows.map((row) => this.sanitizeConnection(row)));
  }

  listProviders() {
    return this.registry.listProviders();
  }

  async getConnection(id: string) {
    const connection = await this.findConnection(id);
    return this.sanitizeConnection(connection);
  }

  async startGoogleDriveConnect(dto: GoogleDriveConnectDto, userId?: string) {
    const user = userId ? await this.db.users.findOne({ where: { id: userId } }) : null;
    const defaultProject = dto.defaultProjectId
      ? await this.db.projects.findOne({ where: { id: dto.defaultProjectId } })
      : null;
    const defaultSection = dto.defaultSectionId
      ? await this.db.projectSections.findOne({ where: { id: dto.defaultSectionId } })
      : null;
    const settings: Record<string, unknown> = {};
    if (dto.sourceSystemId) settings.sourceSystemId = dto.sourceSystemId;

    let connection = this.db.sourceConnections.create({
      provider: ConnectorProvider.GOOGLE_DRIVE,
      name: dto.name?.trim() || 'Google Drive',
      status: SourceConnectionStatus.PENDING,
      credentialsEncrypted: null,
      settings,
      defaultProject,
      defaultSection,
      createdBy: user,
      externalAccountId: null,
      externalAccountLabel: null,
      rootExternalFolderId: null,
      rootExternalFolderName: null,
      lastSyncAt: null,
      lastSyncError: null,
    });
    connection = await this.db.sourceConnections.save(connection);

    const connector = this.registry.get(ConnectorProvider.GOOGLE_DRIVE);
    if (!isOAuthConnector(connector)) throw new BadRequestException('Google Drive OAuth is unavailable');
    const redirectUri = this.getGoogleRedirectUri();
    const start = await connector.buildOAuthStart(connection, redirectUri);
    await this.audit.record({
      userId,
      action: 'SOURCE_CONNECTION_CREATED',
      entityType: 'SourceConnection',
      entityId: connection.id,
      message: `Started Google Drive OAuth for ${connection.name}`,
    });
    return { authUrl: start.authUrl, connectionId: connection.id, state: start.state };
  }

  async completeGoogleDriveCallback(code: string, state: string) {
    const connection = await this.db.sourceConnections.findOne({
      where: { id: state, provider: ConnectorProvider.GOOGLE_DRIVE },
    });
    if (!connection) throw new NotFoundException('OAuth connection was not found');
    const connector = this.registry.get(ConnectorProvider.GOOGLE_DRIVE);
    if (!isOAuthConnector(connector)) throw new BadRequestException('Google Drive OAuth is unavailable');
    const updated = await connector.completeOAuth(connection, code, this.getGoogleRedirectUri());
    await this.db.sourceConnections.save(updated);
    await this.audit.record({
      action: 'SOURCE_CONNECTED',
      entityType: 'SourceConnection',
      entityId: updated.id,
      message: `Completed Google Drive OAuth for ${updated.name}`,
      after: { status: updated.status, accountLabel: updated.externalAccountLabel },
    });
    return { connectionId: updated.id, status: updated.status };
  }

  async updateConnection(id: string, dto: UpdateConnectionDto, userId?: string) {
    const connection = await this.findConnection(id);
    if (dto.name !== undefined) connection.name = dto.name.trim();
    if (dto.syncSchedule !== undefined) connection.syncSchedule = dto.syncSchedule;
    if (dto.defaultProjectId !== undefined) {
      connection.defaultProject = dto.defaultProjectId
        ? await this.db.projects.findOne({ where: { id: dto.defaultProjectId } })
        : null;
    }
    if (dto.defaultSectionId !== undefined) {
      connection.defaultSection = dto.defaultSectionId
        ? await this.db.projectSections.findOne({ where: { id: dto.defaultSectionId } })
        : null;
    }
    if (dto.sourceSystemId !== undefined) {
      connection.settings = {
        ...(connection.settings ?? {}),
        sourceSystemId: dto.sourceSystemId,
      };
    }
    const saved = await this.db.sourceConnections.save(connection);
    await this.audit.record({
      userId,
      action: 'SOURCE_CONNECTION_UPDATED',
      entityType: 'SourceConnection',
      entityId: saved.id,
      message: `Updated source connection ${saved.name}`,
      after: {
        syncSchedule: saved.syncSchedule,
        defaultProjectId: saved.defaultProject?.id ?? null,
        defaultSectionId: saved.defaultSection?.id ?? null,
      },
    });
    return this.sanitizeConnection(saved);
  }

  listFolderMappings(id: string) {
    return this.db.sourceFolderMappings.find({
      where: { connection: { id } },
      relations: { project: true, section: true },
      order: { createdAt: 'DESC' },
    });
  }

  async testConnection(id: string, userId?: string) {
    const connection = await this.findConnection(id);
    const connector = this.registry.get(connection.provider);
    const result = await connector.testConnection(connection);
    if (!result.ok) {
      connection.status = SourceConnectionStatus.ERROR;
      connection.lastSyncError = result.message;
      await this.db.sourceConnections.save(connection);
    } else if (connection.status === SourceConnectionStatus.ERROR) {
      connection.status = SourceConnectionStatus.CONNECTED;
      connection.lastSyncError = null;
      await this.db.sourceConnections.save(connection);
    }
    await this.audit.record({
      userId,
      action: 'SOURCE_CONNECTION_TESTED',
      entityType: 'SourceConnection',
      entityId: connection.id,
      message: result.message,
      after: { ok: result.ok },
    });
    return result;
  }

  async listFolders(id: string, parentFolderId?: string) {
    const connection = await this.requireConnected(id);
    const connector = this.registry.get(connection.provider);
    if (!isFolderBrowsingConnector(connector)) {
      throw new BadRequestException('This connector does not support folder browsing');
    }
    return connector.listFolders(connection, parentFolderId);
  }

  async listFiles(id: string, folderId: string, pageToken?: string) {
    const connection = await this.requireConnected(id);
    const connector = this.registry.get(connection.provider);
    if (!isFolderBrowsingConnector(connector)) {
      throw new BadRequestException('This connector does not support file listing');
    }
    const targetFolderId = folderId || connection.rootExternalFolderId;
    if (!targetFolderId) throw new BadRequestException('Select a root folder before listing files');
    return connector.listFiles(connection, targetFolderId, pageToken);
  }

  async selectRootFolder(id: string, dto: SelectRootFolderDto, userId?: string) {
    const connection = await this.requireConnected(id);
    connection.rootExternalFolderId = dto.folderId;
    connection.rootExternalFolderName = dto.folderName;
    await this.db.sourceConnections.save(connection);
    await this.audit.record({
      userId,
      action: 'SOURCE_ROOT_FOLDER_SELECTED',
      entityType: 'SourceConnection',
      entityId: connection.id,
      message: `Selected root folder ${dto.folderName}`,
      after: { folderId: dto.folderId },
    });
    return this.sanitizeConnection(connection);
  }

  async createFolderMapping(id: string, dto: CreateFolderMappingDto, userId?: string) {
    const connection = await this.findConnection(id);
    const project = dto.projectId ? await this.db.projects.findOne({ where: { id: dto.projectId } }) : null;
    const section = dto.sectionId ? await this.db.projectSections.findOne({ where: { id: dto.sectionId } }) : null;
    const mapping = this.db.sourceFolderMappings.create({
      connection,
      externalFolderId: dto.externalFolderId,
      externalFolderName: dto.externalFolderName,
      externalFolderPath: dto.externalFolderPath ?? null,
      project,
      section,
      importMode: dto.importMode ?? FolderImportMode.NEW_AND_CHANGED,
      requireManualReview: dto.requireManualReview ?? true,
      defaultDocumentType: dto.defaultDocumentType?.trim() || null,
      enabled: dto.enabled ?? true,
    });
    const saved = await this.db.sourceFolderMappings.save(mapping);
    await this.audit.record({
      userId,
      action: 'SOURCE_FOLDER_MAPPING_CREATED',
      entityType: 'SourceFolderMapping',
      entityId: saved.id,
      message: `Mapped folder ${dto.externalFolderName}`,
    });
    return saved;
  }

  async updateFolderMapping(connectionId: string, mappingId: string, dto: UpdateFolderMappingDto, userId?: string) {
    const mapping = await this.findFolderMapping(connectionId, mappingId);
    if (dto.externalFolderName !== undefined) mapping.externalFolderName = dto.externalFolderName;
    if (dto.externalFolderPath !== undefined) mapping.externalFolderPath = dto.externalFolderPath ?? null;
    if (dto.projectId !== undefined) {
      mapping.project = dto.projectId
        ? await this.db.projects.findOne({ where: { id: dto.projectId } })
        : null;
    }
    if (dto.sectionId !== undefined) {
      mapping.section = dto.sectionId
        ? await this.db.projectSections.findOne({ where: { id: dto.sectionId } })
        : null;
    }
    if (dto.importMode !== undefined) mapping.importMode = dto.importMode;
    if (dto.requireManualReview !== undefined) mapping.requireManualReview = dto.requireManualReview;
    if (dto.defaultDocumentType !== undefined) {
      mapping.defaultDocumentType = dto.defaultDocumentType?.trim() || null;
    }
    if (dto.enabled !== undefined) mapping.enabled = dto.enabled;
    const saved = await this.db.sourceFolderMappings.save(mapping);
    await this.audit.record({
      userId,
      action: 'SOURCE_FOLDER_MAPPING_UPDATED',
      entityType: 'SourceFolderMapping',
      entityId: saved.id,
      message: `Updated folder mapping ${saved.externalFolderName}`,
    });
    return saved;
  }

  async deleteFolderMapping(connectionId: string, mappingId: string, userId?: string) {
    const mapping = await this.findFolderMapping(connectionId, mappingId);
    await this.db.sourceFolderMappings.remove(mapping);
    await this.audit.record({
      userId,
      action: 'SOURCE_FOLDER_MAPPING_DELETED',
      entityType: 'SourceFolderMapping',
      entityId: mappingId,
      message: `Deleted folder mapping ${mapping.externalFolderName}`,
    });
    return { id: mappingId, deleted: true };
  }

  async syncConnection(
    id: string,
    userId?: string,
    triggerType: SyncTriggerType = SyncTriggerType.MANUAL,
  ) {
    if (this.activeSyncs.has(id)) {
      throw new BadRequestException('A sync is already running for this source connection');
    }

    const connection = await this.requireConnected(id);
    const connector = this.registry.get(connection.provider);
    if (!isFolderBrowsingConnector(connector)) {
      throw new BadRequestException('This connector does not support sync');
    }

    this.activeSyncs.add(id);
    try {
      let run = this.db.connectorSyncRuns.create({
        connection,
        triggerType,
        status: SyncRunStatus.RUNNING,
        filesDetected: 0,
        filesQueued: 0,
        filesSkipped: 0,
        filesFailed: 0,
        errorMessage: null,
        metadata: null,
        completedAt: null,
      });
      run = await this.db.connectorSyncRuns.save(run);
      await this.audit.record({
        userId,
        action: 'SOURCE_SYNC_STARTED',
        entityType: 'ConnectorSyncRun',
        entityId: run.id,
        message: `Sync started for ${connection.name}`,
        after: { triggerType },
      });

      try {
        const mappings = await this.db.sourceFolderMappings.find({
          where: { connection: { id: connection.id }, enabled: true },
          relations: { project: true, section: true },
        });
        const targets = mappings.length
          ? mappings
          : connection.rootExternalFolderId
            ? [{
                id: undefined,
                externalFolderId: connection.rootExternalFolderId,
                externalFolderName: connection.rootExternalFolderName ?? 'Root',
                project: connection.defaultProject,
                section: connection.defaultSection,
                importMode: FolderImportMode.NEW_AND_CHANGED,
                enabled: true,
              }]
            : [];
        if (!targets.length) throw new BadRequestException('Configure a root folder or folder mappings before syncing');

        for (const mapping of targets) {
          let pageToken: string | undefined;
          do {
            const page = await connector.listFiles(connection, mapping.externalFolderId, pageToken);
            run.filesDetected += page.files.length;
            for (const file of page.files) {
              try {
                const queued = await this.queueFileIfNeeded(connection, connector, file, mapping);
                if (queued) run.filesQueued += 1;
                else run.filesSkipped += 1;
              } catch {
                run.filesFailed += 1;
              }
            }
            pageToken = page.nextPageToken;
          } while (pageToken);
        }

        run.status = SyncRunStatus.COMPLETED;
        run.completedAt = new Date();
        connection.lastSyncAt = run.completedAt;
        connection.lastSyncError = null;
        await this.db.sourceConnections.save(connection);
      } catch (error) {
        run.status = SyncRunStatus.FAILED;
        run.errorMessage = error instanceof Error ? error.message : 'Sync failed';
        run.completedAt = new Date();
        connection.lastSyncError = run.errorMessage;
        await this.db.sourceConnections.save(connection);
      }

      await this.db.connectorSyncRuns.save(run);
      await this.audit.record({
        userId,
        action: run.status === SyncRunStatus.FAILED ? 'SOURCE_SYNC_FAILED' : 'SOURCE_SYNC_COMPLETED',
        entityType: 'ConnectorSyncRun',
        entityId: run.id,
        message: `Sync ${run.status.toLowerCase()} for ${connection.name}`,
        after: {
          filesDetected: run.filesDetected,
          filesQueued: run.filesQueued,
          filesSkipped: run.filesSkipped,
          filesFailed: run.filesFailed,
          errorMessage: run.errorMessage,
        },
      });
      return run;
    } finally {
      this.activeSyncs.delete(id);
    }
  }

  async importSelected(id: string, dto: ImportSelectedDto, userId?: string) {
    const connection = await this.requireConnected(id);
    const connector = this.registry.get(connection.provider);
    if (!isFolderBrowsingConnector(connector)) {
      throw new BadRequestException('This connector does not support selective import');
    }
    const folderId = dto.folderId || connection.rootExternalFolderId;
    if (!folderId) throw new BadRequestException('folderId is required when no root folder is configured');

    const jobs = [];
    let pageToken: string | undefined;
    const selected = new Set(dto.fileIds);
    do {
      const page = await connector.listFiles(connection, folderId, pageToken);
      for (const file of page.files.filter((item) => selected.has(item.id))) {
        const downloaded = await connector.downloadFile(connection, file);
        const job = await this.orchestrator.queueExternalImport({
          provider: connection.provider,
          sourceConnectionId: connection.id,
          externalFileId: file.id,
          externalRevisionId: downloaded.revisionId || file.revisionId,
          externalFileName: downloaded.fileName,
          mimeType: downloaded.mimeType,
          fileSize: downloaded.data.length,
          externalModifiedAt: file.modifiedAt,
          folderId,
          projectId: connection.defaultProject?.id,
          sectionId: connection.defaultSection?.id,
          initiatedByUserId: userId,
          data: downloaded.data,
        });
        jobs.push(job);
      }
      pageToken = page.nextPageToken;
    } while (pageToken && jobs.length < dto.fileIds.length);

    if (!jobs.length) throw new NotFoundException('None of the selected files were found in the configured folder');
    return jobs;
  }

  listSyncRuns(id: string) {
    return this.db.connectorSyncRuns.find({
      where: { connection: { id } },
      order: { startedAt: 'DESC' },
      take: 50,
    });
  }

  async deleteConnection(id: string, userId?: string) {
    const connection = await this.findConnection(id);
    connection.status = SourceConnectionStatus.DISCONNECTED;
    connection.credentialsEncrypted = null;
    await this.db.sourceConnections.save(connection);
    await this.audit.record({
      userId,
      action: 'SOURCE_DISCONNECTED',
      entityType: 'SourceConnection',
      entityId: connection.id,
      message: `Disconnected ${connection.name}`,
    });
    return { id, disconnected: true };
  }

  health() {
    return {
      status: 'ok',
      providers: this.registry.listProviders(),
      mcpEnabled: this.config.get<string>('MCP_ENABLED', 'true') === 'true',
    };
  }

  private async queueFileIfNeeded(
    connection: SourceConnection,
    connector: ReturnType<ConnectorRegistryService['get']>,
    file: ExternalFile,
    mapping: {
      id?: string;
      externalFolderId: string;
      project?: SourceConnection['defaultProject'];
      section?: SourceConnection['defaultSection'];
      importMode: FolderImportMode;
    },
  ) {
    const revisionId = file.revisionId || '';
    const existing = await this.db.externalImportReferences.findOne({
      where: {
        provider: connection.provider,
        externalFileId: file.id,
        externalRevisionId: revisionId,
      },
    });
    if (existing && mapping.importMode === FolderImportMode.NEW_ONLY) return false;

    const downloaded = await connector.downloadFile(connection, file);
    const checksum = createHash('sha256').update(downloaded.data).digest('hex');
    if (existing?.checksum === checksum) return false;

    await this.orchestrator.queueExternalImport({
      provider: connection.provider,
      sourceConnectionId: connection.id,
      externalFileId: file.id,
      externalRevisionId: downloaded.revisionId || revisionId,
      externalFileName: downloaded.fileName,
      mimeType: downloaded.mimeType,
      fileSize: downloaded.data.length,
      externalModifiedAt: file.modifiedAt,
      folderId: mapping.externalFolderId,
      folderMappingId: mapping.id,
      projectId: mapping.project?.id,
      sectionId: mapping.section?.id,
      data: downloaded.data,
    });
    return true;
  }

  private sanitizeConnection(connection: SourceConnection): SafeConnection {
    const { credentialsEncrypted: _credentials, ...safe } = connection;
    return safe;
  }

  private async findConnection(id: string) {
    const connection = await this.db.sourceConnections.findOne({
      where: { id },
      relations: {
        defaultProject: true,
        defaultSection: true,
        createdBy: true,
        folderMappings: { project: true, section: true },
      },
    });
    if (!connection) throw new NotFoundException('Connector connection not found');
    return connection;
  }

  private async requireConnected(id: string) {
    const connection = await this.findConnection(id);
    if (connection.status !== SourceConnectionStatus.CONNECTED) {
      throw new ConnectorNotConnectedError();
    }
    return connection;
  }

  private async findFolderMapping(connectionId: string, mappingId: string) {
    const mapping = await this.db.sourceFolderMappings.findOne({
      where: { id: mappingId, connection: { id: connectionId } },
      relations: { connection: true, project: true, section: true },
    });
    if (!mapping) throw new NotFoundException('Folder mapping not found');
    return mapping;
  }

  private getGoogleRedirectUri() {
    return this.config.get<string>('GOOGLE_REDIRECT_URI')?.trim()
      ?? 'http://localhost:8080/api/connectors/google-drive/callback';
  }
}
