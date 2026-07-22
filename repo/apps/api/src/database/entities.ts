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
export enum ImportStatus { DRAFT = 'DRAFT', RECEIVED = 'RECEIVED', VALIDATING = 'VALIDATING', READY = 'READY', ROUTING = 'ROUTING', IMPORTED = 'IMPORTED', FAILED = 'FAILED' }
export enum RelationshipType { SUPERSEDES = 'SUPERSEDES', RELATED_TO = 'RELATED_TO', DEPENDS_ON = 'DEPENDS_ON', SUPPORTS = 'SUPPORTS', PARENT_OF = 'PARENT_OF', CHILD_OF = 'CHILD_OF', REFERENCES = 'REFERENCES', IMPLEMENTS = 'IMPLEMENTS' }

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
  @CreateDateColumn({ name: 'started_at' }) startedAt!: Date;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
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

export const ENTITIES = [
  User, DirectoryTemplate, DirectoryTemplateSection, Project, ProjectSection, SourceSystem,
  DocumentType, FileType, MetadataField, RoutingRule, Document, DocumentVersion, DocumentNote, DocumentRelationship,
  ImportJob, AuditLog, SystemSetting,
];
