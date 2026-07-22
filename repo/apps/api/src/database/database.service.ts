import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuditLog, DirectoryTemplate, DirectoryTemplateSection, Document, DocumentNote, DocumentRelationship,
  DocumentType, DocumentVersion, FileType, ImportJob, MetadataField, Project, ProjectSection,
  RoutingRule, SourceSystem, SystemSetting, User,
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
  ) {}
}
