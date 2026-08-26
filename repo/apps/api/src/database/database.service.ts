import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditLog, ConnectorIdempotencyKey, ConnectorImportJob, ConnectorSession, ConnectorSyncRun,
  DirectoryTemplate, DirectoryTemplateSection, Document, DocumentNote,
  DocumentRelationship, DocumentType, DocumentVersion, ExternalImportReference, FileType, ImportJob,
  McpBinaryImportSession, McpIntegration, MetadataField, Project, ProjectSection, RepositoryWorkspace, RoutingRule,
  SequenceCounter, SourceConnection, SourceFolderMapping, SourceSystem, SystemSetting, User,
  WorkspaceActivity, WorkspaceDocument,
} from './entities';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectDataSource() public readonly dataSource: DataSource,
    @InjectRepository(User) public readonly users: Repository<User>,
    @InjectRepository(DirectoryTemplate) public readonly directoryTemplates: Repository<DirectoryTemplate>,
    @InjectRepository(DirectoryTemplateSection) public readonly directoryTemplateSections: Repository<DirectoryTemplateSection>,
    @InjectRepository(Project) public readonly projects: Repository<Project>,
    @InjectRepository(ProjectSection) public readonly projectSections: Repository<ProjectSection>,
    @InjectRepository(SourceSystem) public readonly sourceSystems: Repository<SourceSystem>,
    @InjectRepository(DocumentType) public readonly documentTypes: Repository<DocumentType>,
    @InjectRepository(FileType) public readonly fileTypes: Repository<FileType>,
    @InjectRepository(MetadataField) public readonly metadataFields: Repository<MetadataField>,
    @InjectRepository(RoutingRule) public readonly routingRules: Repository<RoutingRule>,
    @InjectRepository(Document) public readonly documents: Repository<Document>,
    @InjectRepository(DocumentVersion) public readonly documentVersions: Repository<DocumentVersion>,
    @InjectRepository(DocumentNote) public readonly documentNotes: Repository<DocumentNote>,
    @InjectRepository(DocumentRelationship) public readonly documentRelationships: Repository<DocumentRelationship>,
    @InjectRepository(ImportJob) public readonly importJobs: Repository<ImportJob>,
    @InjectRepository(AuditLog) public readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(SystemSetting) public readonly systemSettings: Repository<SystemSetting>,
    @InjectRepository(SourceConnection) public readonly sourceConnections: Repository<SourceConnection>,
    @InjectRepository(SourceFolderMapping) public readonly sourceFolderMappings: Repository<SourceFolderMapping>,
    @InjectRepository(ConnectorSyncRun) public readonly connectorSyncRuns: Repository<ConnectorSyncRun>,
    @InjectRepository(ExternalImportReference) public readonly externalImportReferences: Repository<ExternalImportReference>,
    @InjectRepository(McpIntegration) public readonly mcpIntegrations: Repository<McpIntegration>,
    @InjectRepository(SequenceCounter) public readonly sequenceCounters: Repository<SequenceCounter>,
    @InjectRepository(RepositoryWorkspace) public readonly workspaces: Repository<RepositoryWorkspace>,
    @InjectRepository(WorkspaceDocument) public readonly workspaceDocuments: Repository<WorkspaceDocument>,
    @InjectRepository(WorkspaceActivity) public readonly workspaceActivities: Repository<WorkspaceActivity>,
    @InjectRepository(ConnectorSession) public readonly connectorSessions: Repository<ConnectorSession>,
    @InjectRepository(ConnectorIdempotencyKey) public readonly connectorIdempotencyKeys: Repository<ConnectorIdempotencyKey>,
    @InjectRepository(ConnectorImportJob) public readonly connectorImportJobs: Repository<ConnectorImportJob>,
    @InjectRepository(McpBinaryImportSession) public readonly mcpBinaryImportSessions: Repository<McpBinaryImportSession>,
  ) {}
}
