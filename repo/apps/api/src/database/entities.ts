import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole { ADMIN = 'ADMIN', IMPORTER = 'IMPORTER', REVIEWER = 'REVIEWER', VIEWER = 'VIEWER' }
export enum ProjectStatus { ACTIVE = 'ACTIVE', INACTIVE = 'INACTIVE', ARCHIVED = 'ARCHIVED' }
export enum ApprovalStatus { DRAFT = 'DRAFT', PENDING_REVIEW = 'PENDING_REVIEW', APPROVED = 'APPROVED', REJECTED = 'REJECTED' }
export enum DocumentStatus { CURRENT = 'CURRENT', SUPERSEDED = 'SUPERSEDED', ARCHIVED = 'ARCHIVED' }
export enum ImportStatus {
  DRAFT = 'DRAFT',
  RECEIVED = 'RECEIVED',
  VALIDATING = 'VALIDATING',
  READY = 'READY',
  ROUTING = 'ROUTING',
  IMPORTED = 'IMPORTED',
  FAILED = 'FAILED',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  DUPLICATE_REVIEW = 'DUPLICATE_REVIEW',
  VERSION_REVIEW = 'VERSION_REVIEW',
  REJECTED = 'REJECTED',
}
export enum ConnectorProvider {
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  CHATGPT_MCP = 'CHATGPT_MCP',
  MANUAL_UPLOAD = 'MANUAL_UPLOAD',
  SHAREPOINT = 'SHAREPOINT',
  ONEDRIVE = 'ONEDRIVE',
  DROPBOX = 'DROPBOX',
  SFTP = 'SFTP',
  LOCAL_FOLDER = 'LOCAL_FOLDER',
}
export enum SourceConnectionStatus { PENDING = 'PENDING', CONNECTED = 'CONNECTED', ERROR = 'ERROR', DISABLED = 'DISABLED', DISCONNECTED = 'DISCONNECTED' }
export enum FolderImportMode { NEW_ONLY = 'NEW_ONLY', NEW_AND_CHANGED = 'NEW_AND_CHANGED' }
export enum SyncTriggerType { MANUAL = 'MANUAL', SCHEDULED = 'SCHEDULED', WEBHOOK = 'WEBHOOK' }
export enum SyncRunStatus { RUNNING = 'RUNNING', COMPLETED = 'COMPLETED', FAILED = 'FAILED', CANCELLED = 'CANCELLED' }
export enum SyncSchedule { MANUAL = 'MANUAL', EVERY_15_MINUTES = 'EVERY_15_MINUTES', HOURLY = 'HOURLY', DAILY = 'DAILY' }
export enum ExternalImportStatus {
  DETECTED = 'DETECTED',
  DOWNLOADING = 'DOWNLOADING',
  STAGED = 'STAGED',
  PENDING_METADATA = 'PENDING_METADATA',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  DUPLICATE_REVIEW = 'DUPLICATE_REVIEW',
  VERSION_REVIEW = 'VERSION_REVIEW',
  READY_TO_IMPORT = 'READY_TO_IMPORT',
  IMPORTING = 'IMPORTING',
  IMPORTED = 'IMPORTED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}
export enum McpIntegrationStatus { ACTIVE = 'ACTIVE', DISABLED = 'DISABLED' }
export enum RelationshipType { SUPERSEDES = 'SUPERSEDES', RELATED_TO = 'RELATED_TO', DEPENDS_ON = 'DEPENDS_ON', SUPPORTS = 'SUPPORTS', PARENT_OF = 'PARENT_OF', CHILD_OF = 'CHILD_OF', REFERENCES = 'REFERENCES', IMPLEMENTS = 'IMPLEMENTS' }

export enum WorkspaceStatus {
  DRAFT = 'DRAFT',
  UPLOADING = 'UPLOADING',
  METADATA_REVIEW = 'METADATA_REVIEW',
  VALIDATION_REQUIRED = 'VALIDATION_REQUIRED',
  READY_TO_IMPORT = 'READY_TO_IMPORT',
  IMPORTING = 'IMPORTING',
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED',
}
export enum WorkspaceStep {
  UPLOAD = 'UPLOAD',
  EXTRACTION = 'EXTRACTION',
  METADATA = 'METADATA',
  APPROVAL = 'APPROVAL',
  VALIDATION = 'VALIDATION',
  ROUTING = 'ROUTING',
  IMPORT = 'IMPORT',
  COMPLETE = 'COMPLETE',
}
export enum WorkspaceDocumentStatus {
  PENDING = 'PENDING',
  EXTRACTED = 'EXTRACTED',
  METADATA_REQUIRED = 'METADATA_REQUIRED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  READY = 'READY',
  IMPORTING = 'IMPORTING',
  IMPORTED = 'IMPORTED',
  FAILED = 'FAILED',
  REMOVED = 'REMOVED',
}
export enum WorkspaceActivitySource {
  WEB = 'WEB',
  API = 'API',
  CHATGPT_ACTION = 'CHATGPT_ACTION',
  CHATGPT_MCP = 'CHATGPT_MCP',
  SYSTEM = 'SYSTEM',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @Column({ unique: true }) email!: string;
  @Column({ name: 'password_hash' }) passwordHash!: string;
  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER }) role!: UserRole;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
  @OneToMany(() => DocumentVersion, (version) => version.createdBy) versions!: DocumentVersion[];
  @OneToMany(() => ImportJob, (job) => job.initiatedBy) imports!: ImportJob[];
  @OneToMany(() => AuditLog, (log) => log.user) auditLogs!: AuditLog[];
  @OneToMany(() => DocumentRelationship, (rel) => rel.createdBy) relationships!: DocumentRelationship[];
  @OneToMany(() => SourceConnection, (connection) => connection.createdBy) sourceConnections!: SourceConnection[];
  @OneToMany(() => McpIntegration, (integration) => integration.createdBy) mcpIntegrations!: McpIntegration[];
  @OneToMany(() => RepositoryWorkspace, (workspace) => workspace.createdBy) workspaces!: RepositoryWorkspace[];
  @OneToMany(() => WorkspaceActivity, (activity) => activity.user) workspaceActivities!: WorkspaceActivity[];
}

@Entity('directory_templates')
export class DirectoryTemplate {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'is_default', default: false }) isDefault!: boolean;
  @Column({ default: true }) active!: boolean;
  @OneToMany(() => DirectoryTemplateSection, (section) => section.template, { cascade: true }) sections!: DirectoryTemplateSection[];
  @OneToMany(() => Project, (project) => project.directoryTemplate) projects!: Project[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('directory_template_sections')
@Unique(['template', 'sectionKey'])
@Unique(['template', 'position'])
export class DirectoryTemplateSection {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => DirectoryTemplate, (template) => template.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' }) template!: DirectoryTemplate;
  @Column({ name: 'section_key' }) sectionKey!: string;
  @Column() code!: string;
  @Column() name!: string;
  @Column() slug!: string;
  @Column() position!: number;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.ACTIVE }) status!: ProjectStatus;
  @ManyToOne(() => DirectoryTemplate, (template) => template.projects, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'directory_template_id' }) directoryTemplate!: DirectoryTemplate | null;
  @Column({ name: 'repository_root_path' }) repositoryRootPath!: string;
  @Column({ name: 'storage_configuration', type: 'jsonb', nullable: true }) storageConfiguration!: Record<string, unknown> | null;
  @OneToMany(() => ProjectSection, (section) => section.project) sections!: ProjectSection[];
  @OneToMany(() => RoutingRule, (rule) => rule.project) routingRules!: RoutingRule[];
  @OneToMany(() => Document, (document) => document.project) documents!: Document[];
  @OneToMany(() => ImportJob, (job) => job.project) importJobs!: ImportJob[];
  @OneToMany(() => RepositoryWorkspace, (workspace) => workspace.project) workspaces!: RepositoryWorkspace[];
  @OneToMany(() => SourceConnection, (connection) => connection.defaultProject) sourceConnections!: SourceConnection[];
  @OneToMany(() => SourceFolderMapping, (mapping) => mapping.project) folderMappings!: SourceFolderMapping[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('project_sections')
@Unique(['project', 'sectionKey'])
@Unique(['project', 'position'])
export class ProjectSection {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Project, (project) => project.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' }) project!: Project;
  @Column({ name: 'section_key' }) sectionKey!: string;
  @Column() code!: string;
  @Column() name!: string;
  @Column() slug!: string;
  @Column() position!: number;
  @Column({ default: true }) active!: boolean;
  @Column({ name: 'relative_path' }) relativePath!: string;
  @OneToMany(() => Document, (document) => document.section) documents!: Document[];
  @OneToMany(() => ImportJob, (job) => job.resolvedSection) resolvedImports!: ImportJob[];
  @OneToMany(() => SourceConnection, (connection) => connection.defaultSection) sourceConnections!: SourceConnection[];
  @OneToMany(() => SourceFolderMapping, (mapping) => mapping.section) folderMappings!: SourceFolderMapping[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('source_connections')
export class SourceConnection {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'enum', enum: ConnectorProvider }) provider!: ConnectorProvider;
  @Column() name!: string;
  @Column({ type: 'enum', enum: SourceConnectionStatus, default: SourceConnectionStatus.PENDING }) status!: SourceConnectionStatus;
  @Column({ name: 'credentials_encrypted', type: 'text', nullable: true }) credentialsEncrypted!: string | null;
  @Column({ type: 'jsonb', default: {} }) settings!: Record<string, unknown>;
  @Column({ name: 'sync_schedule', type: 'enum', enum: SyncSchedule, default: SyncSchedule.MANUAL }) syncSchedule!: SyncSchedule;
  @Column({ name: 'external_account_id', type: 'text', nullable: true }) externalAccountId!: string | null;
  @Column({ name: 'external_account_label', type: 'text', nullable: true }) externalAccountLabel!: string | null;
  @Column({ name: 'root_external_folder_id', type: 'text', nullable: true }) rootExternalFolderId!: string | null;
  @Column({ name: 'root_external_folder_name', type: 'text', nullable: true }) rootExternalFolderName!: string | null;
  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true }) lastSyncAt!: Date | null;
  @Column({ name: 'last_sync_error', type: 'text', nullable: true }) lastSyncError!: string | null;
  @ManyToOne(() => User, (user) => user.sourceConnections, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' }) createdBy!: User | null;
  @ManyToOne(() => Project, (project) => project.sourceConnections, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_project_id' }) defaultProject!: Project | null;
  @ManyToOne(() => ProjectSection, (section) => section.sourceConnections, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_section_id' }) defaultSection!: ProjectSection | null;
  @OneToMany(() => SourceFolderMapping, (mapping) => mapping.connection) folderMappings!: SourceFolderMapping[];
  @OneToMany(() => ConnectorSyncRun, (run) => run.connection) syncRuns!: ConnectorSyncRun[];
  @OneToMany(() => ExternalImportReference, (ref) => ref.sourceConnection) externalImports!: ExternalImportReference[];
  @OneToMany(() => ImportJob, (job) => job.sourceConnection) importJobs!: ImportJob[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('source_folder_mappings')
@Unique(['connection', 'externalFolderId'])
export class SourceFolderMapping {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => SourceConnection, (connection) => connection.folderMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' }) connection!: SourceConnection;
  @Column({ name: 'external_folder_id' }) externalFolderId!: string;
  @Column({ name: 'external_folder_name' }) externalFolderName!: string;
  @Column({ name: 'external_folder_path', type: 'text', nullable: true }) externalFolderPath!: string | null;
  @ManyToOne(() => Project, (project) => project.folderMappings, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' }) project!: Project | null;
  @ManyToOne(() => ProjectSection, (section) => section.folderMappings, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'section_id' }) section!: ProjectSection | null;
  @Column({ name: 'import_mode', type: 'enum', enum: FolderImportMode, default: FolderImportMode.NEW_AND_CHANGED }) importMode!: FolderImportMode;
  @Column({ name: 'require_manual_review', default: true }) requireManualReview!: boolean;
  @Column({ name: 'default_document_type', type: 'text', nullable: true }) defaultDocumentType!: string | null;
  @Column({ default: true }) enabled!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('connector_sync_runs')
export class ConnectorSyncRun {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => SourceConnection, (connection) => connection.syncRuns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' }) connection!: SourceConnection;
  @Column({ name: 'trigger_type', type: 'enum', enum: SyncTriggerType }) triggerType!: SyncTriggerType;
  @Column({ type: 'enum', enum: SyncRunStatus, default: SyncRunStatus.RUNNING }) status!: SyncRunStatus;
  @Column({ name: 'files_detected', default: 0 }) filesDetected!: number;
  @Column({ name: 'files_queued', default: 0 }) filesQueued!: number;
  @Column({ name: 'files_skipped', default: 0 }) filesSkipped!: number;
  @Column({ name: 'files_failed', default: 0 }) filesFailed!: number;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'started_at' }) startedAt!: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
}

@Entity('external_import_references')
@Unique(['provider', 'externalFileId', 'externalRevisionId'])
export class ExternalImportReference {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'enum', enum: ConnectorProvider }) provider!: ConnectorProvider;
  @Column({ name: 'external_file_id' }) externalFileId!: string;
  @Column({ name: 'external_revision_id', default: '' }) externalRevisionId!: string;
  @Column({ name: 'external_file_name' }) externalFileName!: string;
  @Column() checksum!: string;
  @Column({ name: 'external_modified_at', type: 'timestamptz', nullable: true }) externalModifiedAt!: Date | null;
  @ManyToOne(() => SourceConnection, (connection) => connection.externalImports, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_connection_id' }) sourceConnection!: SourceConnection | null;
  @ManyToOne(() => ImportJob, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'import_job_id' }) importJob!: ImportJob | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('mcp_integrations')
export class McpIntegration {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @Column({ type: 'enum', enum: McpIntegrationStatus, default: McpIntegrationStatus.ACTIVE }) status!: McpIntegrationStatus;
  @Column({ name: 'api_key_hash' }) apiKeyHash!: string;
  @Column({ name: 'api_key_prefix' }) apiKeyPrefix!: string;
  @Column({ name: 'allowed_project_ids', type: 'jsonb', default: [] }) allowedProjectIds!: string[];
  @Column({ name: 'allowed_tools', type: 'jsonb', default: [] }) allowedTools!: string[];
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
  @ManyToOne(() => User, (user) => user.mcpIntegrations, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' }) createdBy!: User | null;
  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true }) rotatedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

export enum ConnectorImportJobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/** Durable ChatGPT / MCP OAuth session (survives API restarts). Tokens are encrypted at rest. */
@Entity('connector_sessions')
@Index(['userId'])
@Index(['lastUsedAt'])
export class ConnectorSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'session_id', unique: true }) sessionId!: string;
  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'access_token_encrypted', type: 'text', nullable: true }) accessTokenEncrypted!: string | null;
  @Column({ name: 'refresh_token_encrypted', type: 'text', nullable: true }) refreshTokenEncrypted!: string | null;
  @Column({ name: 'access_token_expires_at', type: 'timestamptz', nullable: true }) accessTokenExpiresAt!: Date | null;
  @Column({ name: 'refresh_token_expires_at', type: 'timestamptz', nullable: true }) refreshTokenExpiresAt!: Date | null;
  @Column({ name: 'last_successful_request_at', type: 'timestamptz', nullable: true }) lastSuccessfulRequestAt!: Date | null;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'keycloak_sub', type: 'text', nullable: true }) keycloakSub!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

/** Idempotency store for connector write operations. */
@Entity('connector_idempotency_keys')
@Unique(['idempotencyKey'])
export class ConnectorIdempotencyKey {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'idempotency_key' }) idempotencyKey!: string;
  @Column({ name: 'user_id', type: 'text', nullable: true }) userId!: string | null;
  @Column({ name: 'operation' }) operation!: string;
  @Column({ name: 'request_hash', type: 'text', nullable: true }) requestHash!: string | null;
  @Column({ name: 'response_json', type: 'jsonb' }) responseJson!: unknown;
  @Column({ name: 'http_status', type: 'int', default: 200 }) httpStatus!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

/** Multi-document import batch (continues after ChatGPT disconnects). */
@Entity('connector_import_jobs')
@Index(['workspaceCode'])
@Index(['status'])
export class ConnectorImportJob {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'job_code', unique: true }) jobCode!: string;
  @Column({ type: 'enum', enum: ConnectorImportJobStatus, default: ConnectorImportJobStatus.QUEUED })
  status!: ConnectorImportJobStatus;
  @Column({ name: 'workspace_code', type: 'text', nullable: true }) workspaceCode!: string | null;
  @Column({ name: 'user_id', type: 'text', nullable: true }) userId!: string | null;
  @Column({ name: 'total_documents', type: 'int', default: 0 }) totalDocuments!: number;
  @Column({ name: 'completed_documents', type: 'int', default: 0 }) completedDocuments!: number;
  @Column({ name: 'failed_documents', type: 'int', default: 0 }) failedDocuments!: number;
  @Column({ name: 'import_job_ids', type: 'jsonb', default: [] }) importJobIds!: string[];
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('source_systems')
export class SourceSystem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column() type!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ default: true }) active!: boolean;
  @Column({ type: 'jsonb', nullable: true }) configuration!: Record<string, unknown> | null;
  @OneToMany(() => RoutingRule, (rule) => rule.sourceSystem) routingRules!: RoutingRule[];
  @OneToMany(() => ImportJob, (job) => job.sourceSystem) importJobs!: ImportJob[];
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('document_types')
export class DocumentType {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('file_types')
export class FileType {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) extension!: string;
  @Column() label!: string;
  @Column({ name: 'mime_types', type: 'jsonb' }) mimeTypes!: string[];
  @Column({ name: 'max_size_mb', default: 50 }) maxSizeMb!: number;
  @Column({ name: 'allow_metadata_extraction', default: true }) allowMetadataExtraction!: boolean;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('metadata_fields')
export class MetadataField {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) key!: string;
  @Column() label!: string;
  @Column({ name: 'data_type' }) dataType!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ default: false }) required!: boolean;
  @Column({ name: 'validation_rule', type: 'text', nullable: true }) validationRule!: string | null;
  @Column({ name: 'default_value', type: 'text', nullable: true }) defaultValue!: string | null;
  @Column({ default: true }) active!: boolean;
  @Column({ default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('routing_rules')
export class RoutingRule {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @ManyToOne(() => Project, (project) => project.routingRules, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' }) project!: Project | null;
  @ManyToOne(() => SourceSystem, (source) => source.routingRules, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_system_id' }) sourceSystem!: SourceSystem | null;
  @Column({ name: 'document_type', type: 'text', nullable: true }) documentType!: string | null;
  @Column({ name: 'file_extension', type: 'text', nullable: true }) fileExtension!: string | null;
  @Column({ name: 'metadata_key', type: 'text', nullable: true }) metadataKey!: string | null;
  @Column({ name: 'metadata_value', type: 'text', nullable: true }) metadataValue!: string | null;
  @Column({ name: 'target_section_key' }) targetSectionKey!: string;
  @Column({ default: 100 }) priority!: number;
  @Column({ default: true }) active!: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('documents')
@Unique(['project', 'code'])
@Index(['title'])
export class Document {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Project, (project) => project.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' }) project!: Project;
  @ManyToOne(() => ProjectSection, (section) => section.documents)
  @JoinColumn({ name: 'section_id' }) section!: ProjectSection;
  @Column() code!: string;
  @Column() title!: string;
  @Column({ name: 'document_type' }) documentType!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'text', nullable: true }) owner!: string | null;
  @Column({ type: 'text', nullable: true }) notes!: string | null;
  @Column({ type: 'enum', enum: DocumentStatus, default: DocumentStatus.CURRENT }) status!: DocumentStatus;
  @Column({ name: 'current_version_no' }) currentVersionNo!: string;
  @OneToOne(() => DocumentVersion, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_version_id' })
  currentVersion!: DocumentVersion | null;
  @OneToMany(() => DocumentVersion, (version) => version.document) versions!: DocumentVersion[];
  @OneToMany(() => DocumentRelationship, (rel) => rel.fromDocument) outgoingRelationships!: DocumentRelationship[];
  @OneToMany(() => DocumentRelationship, (rel) => rel.toDocument) incomingRelationships!: DocumentRelationship[];
  @OneToMany(() => ImportJob, (job) => job.document) importJobs!: ImportJob[];
  @OneToMany(() => DocumentNote, (note) => note.document) noteEntries!: DocumentNote[];
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deleted_by_id' }) deletedBy!: User | null;
  @Column({ name: 'purge_after', type: 'timestamptz', nullable: true }) purgeAfter!: Date | null;
  /** Original document code while the row is in the recycle bin (code is renamed to free uniqueness). */
  @Column({ name: 'bin_original_code', type: 'varchar', nullable: true }) binOriginalCode!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('document_notes')
@Index(['document', 'createdAt'])
export class DocumentNote {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Document, (document) => document.noteEntries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' }) document!: Document;
  @Column({ type: 'text' }) body!: string;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('document_versions')
@Unique(['document', 'versionNo'])
@Unique(['document', 'checksum'])
@Index(['checksum'])
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Document, (document) => document.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' }) document!: Document;
  @Column({ name: 'version_no' }) versionNo!: string;
  @Column({ name: 'original_file_name' }) originalFileName!: string;
  @Column({ name: 'stored_file_name' }) storedFileName!: string;
  @Column({ name: 'mime_type' }) mimeType!: string;
  @Column({ name: 'file_size', type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } }) fileSize!: number;
  @Column() checksum!: string;
  @Column({ name: 'storage_path', type: 'text' }) storagePath!: string;
  @Column({ name: 'approval_status', type: 'enum', enum: ApprovalStatus }) approvalStatus!: ApprovalStatus;
  @Column({ name: 'approved_by' }) approvedBy!: string;
  @Column({ name: 'approval_date', type: 'date' }) approvalDate!: Date;
  @Column({ name: 'is_current', default: true }) isCurrent!: boolean;
  @Column({ type: 'jsonb', nullable: true }) metadata!: Record<string, unknown> | null;
  @ManyToOne(() => User, (user) => user.versions, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' }) createdBy!: User | null;
  @OneToOne(() => ImportJob, (job) => job.version) importJob!: ImportJob | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('document_relationships')
@Unique(['fromDocument', 'toDocument', 'type'])
export class DocumentRelationship {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Document, (document) => document.outgoingRelationships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_document_id' }) fromDocument!: Document;
  @ManyToOne(() => Document, (document) => document.incomingRelationships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_document_id' }) toDocument!: Document;
  @Column({ type: 'enum', enum: RelationshipType, default: RelationshipType.RELATED_TO }) type!: RelationshipType;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @ManyToOne(() => User, (user) => user.relationships, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' }) createdBy!: User | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => SourceSystem, (source) => source.importJobs)
  @JoinColumn({ name: 'source_system_id' }) sourceSystem!: SourceSystem;
  @ManyToOne(() => Project, (project) => project.importJobs)
  @JoinColumn({ name: 'project_id' }) project!: Project;
  @ManyToOne(() => ProjectSection, (section) => section.resolvedImports, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_section_id' }) resolvedSection!: ProjectSection | null;
  @ManyToOne(() => Document, (document) => document.importJobs, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'document_id' }) document!: Document | null;
  @OneToOne(() => DocumentVersion, (version) => version.importJob, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'version_id' }) version!: DocumentVersion | null;
  @Column({ name: 'file_name' }) fileName!: string;
  @Column({ name: 'incoming_path', type: 'text' }) incomingPath!: string;
  @Column({ name: 'mime_type' }) mimeType!: string;
  @Column({ name: 'file_size', type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } }) fileSize!: number;
  @Column() checksum!: string;
  @Column({ type: 'enum', enum: ImportStatus, default: ImportStatus.RECEIVED }) status!: ImportStatus;
  @Column({ type: 'jsonb' }) metadata!: Record<string, unknown>;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ name: 'routing_decision', type: 'jsonb', nullable: true }) routingDecision!: Record<string, unknown> | null;
  @Column({ name: 'storage_result', type: 'jsonb', nullable: true }) storageResult!: Record<string, unknown> | null;
  @ManyToOne(() => User, (user) => user.imports, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'initiated_by_id' }) initiatedBy!: User | null;
  @Column({ type: 'enum', enum: ConnectorProvider, nullable: true }) provider!: ConnectorProvider | null;
  @Column({ name: 'external_import_status', type: 'enum', enum: ExternalImportStatus, nullable: true }) externalImportStatus!: ExternalImportStatus | null;
  @ManyToOne(() => SourceConnection, (connection) => connection.importJobs, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_connection_id' }) sourceConnection!: SourceConnection | null;
  @ManyToOne(() => RepositoryWorkspace, (workspace) => workspace.importJobs, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' }) workspace!: RepositoryWorkspace | null;
  @CreateDateColumn({ name: 'started_at' }) startedAt!: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('sequence_counters')
@Unique(['name', 'year'])
export class SequenceCounter {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @Column({ type: 'int' }) year!: number;
  @Column({ name: 'next_value', type: 'int', default: 1 }) nextValue!: number;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('repository_workspaces')
export class RepositoryWorkspace {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'workspace_code', unique: true }) workspaceCode!: string;
  @Column() name!: string;
  @ManyToOne(() => Project, (project) => project.workspaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' }) project!: Project;
  @ManyToOne(() => User, (user) => user.workspaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' }) createdBy!: User;
  @Column({ type: 'enum', enum: WorkspaceStatus, default: WorkspaceStatus.DRAFT }) status!: WorkspaceStatus;
  @Column({ name: 'current_step', type: 'enum', enum: WorkspaceStep, default: WorkspaceStep.UPLOAD }) currentStep!: WorkspaceStep;
  @Column({ name: 'total_documents', type: 'int', default: 0 }) totalDocuments!: number;
  @Column({ name: 'completed_documents', type: 'int', default: 0 }) completedDocuments!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
  @OneToMany(() => WorkspaceDocument, (document) => document.workspace) documents!: WorkspaceDocument[];
  @OneToMany(() => WorkspaceActivity, (activity) => activity.workspace) activities!: WorkspaceActivity[];
  @OneToMany(() => ImportJob, (job) => job.workspace) importJobs!: ImportJob[];
}

@Entity('workspace_documents')
export class WorkspaceDocument {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => RepositoryWorkspace, (workspace) => workspace.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' }) workspace!: RepositoryWorkspace;
  @ManyToOne(() => Document, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'document_id' }) document!: Document | null;
  @ManyToOne(() => ImportJob, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'import_job_id' }) importJob!: ImportJob | null;
  @Column({ name: 'file_name' }) fileName!: string;
  @Column({ name: 'original_file_name', type: 'text', nullable: true }) originalFileName!: string | null;
  @Column({ name: 'relative_path', type: 'text', nullable: true }) relativePath!: string | null;
  @Column({ name: 'storage_reference', type: 'text', nullable: true }) storageReference!: string | null;
  @Column({ name: 'mime_type', type: 'text', nullable: true }) mimeType!: string | null;
  @Column({ name: 'file_extension', type: 'text', nullable: true }) fileExtension!: string | null;
  @Column({ type: 'text', nullable: true }) checksum!: string | null;
  @Column({ type: 'enum', enum: WorkspaceDocumentStatus, default: WorkspaceDocumentStatus.PENDING }) status!: WorkspaceDocumentStatus;
  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true }) metadataJson!: Record<string, unknown> | null;
  @Column({ name: 'validation_json', type: 'jsonb', nullable: true }) validationJson!: Record<string, unknown> | null;
  @Column({ name: 'routing_json', type: 'jsonb', nullable: true }) routingJson!: Record<string, unknown> | null;
  @Column({ name: 'error_json', type: 'jsonb', nullable: true }) errorJson!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('workspace_activities')
@Index(['workspace', 'createdAt'])
export class WorkspaceActivity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => RepositoryWorkspace, (workspace) => workspace.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' }) workspace!: RepositoryWorkspace;
  @ManyToOne(() => User, (user) => user.workspaceActivities, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' }) user!: User | null;
  @Column() action!: string;
  @Column({ type: 'enum', enum: WorkspaceActivitySource, default: WorkspaceActivitySource.SYSTEM }) source!: WorkspaceActivitySource;
  @Column({ name: 'details_json', type: 'jsonb', nullable: true }) detailsJson!: Record<string, unknown> | null;
  @Column({ name: 'correlation_id', type: 'text', nullable: true }) correlationId!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('audit_logs')
@Index(['entityType', 'entityId'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => User, (user) => user.auditLogs, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' }) user!: User | null;
  @Column() action!: string;
  @Column({ name: 'entity_type' }) entityType!: string;
  @Column({ name: 'entity_id', type: 'text', nullable: true }) entityId!: string | null;
  @Column({ type: 'text' }) message!: string;
  @Column({ type: 'jsonb', nullable: true }) before!: unknown | null;
  @Column({ type: 'jsonb', nullable: true }) after!: unknown | null;
  @Column({ name: 'ip_address', type: 'text', nullable: true }) ipAddress!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

@Entity('system_settings')
export class SystemSetting {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) key!: string;
  @Column({ type: 'jsonb' }) value!: unknown;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

export enum McpBinaryImportStatus {
  PREPARING = 'PREPARING',
  RECEIVING = 'RECEIVING',
  PAUSED = 'PAUSED',
  ASSEMBLING = 'ASSEMBLING',
  VALIDATING = 'VALIDATING',
  AVAILABLE = 'AVAILABLE',
  FAILED = 'FAILED',
  ABORTED = 'ABORTED',
  EXPIRED = 'EXPIRED',
}

/** Durable ChatGPT MCP Mode C chunked binary FILE_PRESERVE upload session. */
@Entity('mcp_binary_import_sessions')
@Index(['uploadTokenHash'])
@Index(['status', 'expiresAt'])
export class McpBinaryImportSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'upload_token_hash' }) uploadTokenHash!: string;
  @Column({ name: 'integration_key', type: 'varchar', length: 120 }) integrationKey!: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!: string | null;
  @Column({ name: 'project_id', type: 'uuid', nullable: true }) projectId!: string | null;
  @Column({ name: 'project_code', type: 'varchar', nullable: true }) projectCode!: string | null;
  @Column({ type: 'varchar', nullable: true }) module!: string | null;
  @Column({ name: 'section_key', type: 'varchar', nullable: true }) sectionKey!: string | null;
  @Column({ name: 'document_type', type: 'varchar', nullable: true }) documentType!: string | null;
  @Column({ name: 'document_id', type: 'uuid', nullable: true }) documentId!: string | null;
  @Column({ name: 'document_code', type: 'varchar', nullable: true }) documentCode!: string | null;
  @Column({ type: 'varchar', default: 'NEW_DOCUMENT' }) mode!: string;
  @Column({ type: 'varchar', default: 'CHATGPT' }) source!: string;
  @Column({ name: 'transport_mode', type: 'varchar', nullable: true }) transportMode!: string | null;
  @Column({ name: 'original_file_name' }) originalFileName!: string;
  @Column({ name: 'expected_file_size', type: 'bigint', nullable: true }) expectedFileSize!: string | null;
  @Column({ name: 'actual_file_size', type: 'bigint', nullable: true }) actualFileSize!: string | null;
  @Column({ name: 'expected_sha256', type: 'varchar', nullable: true }) expectedSha256!: string | null;
  @Column({ name: 'actual_sha256', type: 'varchar', nullable: true }) actualSha256!: string | null;
  @Column({ name: 'declared_mime_type', type: 'varchar', nullable: true }) declaredMimeType!: string | null;
  @Column({ name: 'detected_mime_type', type: 'varchar', nullable: true }) detectedMimeType!: string | null;
  @Column({ name: 'chunk_size', type: 'int' }) chunkSize!: number;
  @Column({ name: 'expected_chunk_count', type: 'int', nullable: true }) expectedChunkCount!: number | null;
  @Column({ name: 'received_chunk_count', type: 'int', default: 0 }) receivedChunkCount!: number;
  @Column({ name: 'received_chunks', type: 'jsonb', default: [] }) receivedChunks!: number[];
  @Column({ name: 'temp_dir' }) tempDir!: string;
  @Column({ name: 'host_reference_type', type: 'varchar', nullable: true }) hostReferenceType!: string | null;
  @Column({ type: 'enum', enum: McpBinaryImportStatus, default: McpBinaryImportStatus.PREPARING })
  status!: McpBinaryImportStatus;
  @Column({ name: 'validation_status', type: 'varchar', nullable: true }) validationStatus!: string | null;
  @Column({ name: 'validation_details', type: 'jsonb', nullable: true }) validationDetails!: unknown;
  @Column({ name: 'error_code', type: 'varchar', nullable: true }) errorCode!: string | null;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage!: string | null;
  @Column({ type: 'boolean', default: false }) retryable!: boolean;
  @Column({ name: 'import_job_id', type: 'uuid', nullable: true }) importJobId!: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'last_activity_at', type: 'timestamptz' }) lastActivityAt!: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

export const ENTITIES = [
  User, DirectoryTemplate, DirectoryTemplateSection, Project, ProjectSection,
  SourceConnection, SourceFolderMapping, ConnectorSyncRun, ExternalImportReference, McpIntegration,
  SourceSystem, DocumentType, FileType, MetadataField, RoutingRule, Document, DocumentVersion, DocumentNote, DocumentRelationship,
  ImportJob, AuditLog, SystemSetting,
  SequenceCounter, RepositoryWorkspace, WorkspaceDocument, WorkspaceActivity,
  ConnectorSession, ConnectorIdempotencyKey, ConnectorImportJob,
  McpBinaryImportSession,
];
