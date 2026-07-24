import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { ConfigurationConflictException, ConfigurationException } from '../common/configuration.exception';
import { DatabaseService } from '../database/database.service';
import { VpsStorageService } from '../storage/vps-storage.service';
import {
  DirectoryTemplate,
  DirectoryTemplateSection,
  FileType,
  MetadataField,
  Project,
  ProjectSection,
  ProjectStatus,
  RoutingRule,
  SourceSystem,
  SystemSetting,
} from '../database/entities';

const clean = (value: unknown) => String(value ?? '').trim();
const nullable = (value: unknown) => {
  if (value === undefined) return undefined;
  const text = clean(value);
  return text || null;
};
const boolean = (value: unknown, fallback = true) => value === undefined ? fallback : value === true || value === 'true' || value === 1 || value === '1';
const sectionKey = (value: unknown) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const slugify = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const codeify = (value: unknown) => clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
const repositoryPath = (value: unknown, fallback: unknown) => {
  const raw = clean(value || fallback).replace(/\\/g, '/');
  const parts = raw.split('/').filter(Boolean).map((part) => {
    if (part === '.' || part === '..') throw new ConfigurationException('INVALID_REPOSITORY_PATH', 'Repository path traversal is not allowed');
    return part.replace(/[<>:"|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '').trim();
  }).filter(Boolean);
  if (!parts.length) throw new ConfigurationException('INVALID_REPOSITORY_PATH', 'A valid relative repository path is required');
  return parts.join('/');
};
const parseJson = (value: unknown, fallback: unknown = null) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  if (!value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return value; }
};
const fromImport = (input: Record<string, unknown>) => clean(input.origin).toUpperCase() === 'IMPORT_DOCUMENT';


@Injectable()
export class ConfigurationService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService, private readonly storage: VpsStorageService) {}

  async listProjects() {
    const projects = await this.db.projects.find({
      relations: { directoryTemplate: true, sections: true },
      order: { name: 'ASC' },
    });
    return Promise.all(projects.map(async (project) => ({
      ...project,
      directoryTemplateId: project.directoryTemplate?.id ?? null,
      sections: [...(project.sections ?? [])].sort((a, b) => a.position - b.position),
      _count: {
        documents: await this.db.documents.count({ where: { project: { id: project.id } } }),
        importJobs: await this.db.importJobs.count({ where: { project: { id: project.id } } }),
      },
    })));
  }

  async getProject(id: string) {
    const project = await this.db.projects.findOne({
      where: { id },
      relations: { directoryTemplate: true, sections: true, routingRules: { sourceSystem: true } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return {
      ...project,
      directoryTemplateId: project.directoryTemplate?.id ?? null,
      sections: [...(project.sections ?? [])].sort((a, b) => a.position - b.position),
      routingRules: [...(project.routingRules ?? [])].sort((a, b) => a.priority - b.priority),
      _count: {
        documents: await this.db.documents.count({ where: { project: { id } } }),
        importJobs: await this.db.importJobs.count({ where: { project: { id } } }),
      },
    };
  }

  async createProject(input: Record<string, unknown>, userId?: string) {
    const code = clean(input.code).toUpperCase();
    const name = clean(input.name);
    if (!code || !name) throw new ConfigurationException('VALIDATION_ERROR', 'Project code and name are required');

    const existingByCode = await this.db.projects.findOne({ where: { code } });
    if (existingByCode) {
      throw new ConfigurationConflictException('PROJECT_ALREADY_EXISTS', `A project with code “${code}” already exists.`, {
        existingId: existingByCode.id, existingCode: existingByCode.code, existingName: existingByCode.name,
      });
    }
    const existingByName = await this.db.projects
      .createQueryBuilder('project')
      .where('LOWER(project.name) = LOWER(:name)', { name })
      .getOne();
    if (existingByName) {
      throw new ConfigurationConflictException('PROJECT_ALREADY_EXISTS', `A project named “${existingByName.name}” already exists.`, {
        existingId: existingByName.id, existingCode: existingByName.code, existingName: existingByName.name,
      });
    }

    const template = input.directoryTemplateId
      ? await this.db.directoryTemplates.findOne({ where: { id: clean(input.directoryTemplateId) }, relations: { sections: true } })
      : await this.db.directoryTemplates.findOne({ where: { isDefault: true, active: true }, relations: { sections: true } });

    const created = await this.db.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(Project);
      const sectionRepo = manager.getRepository(ProjectSection);
      const project = projectRepo.create({
        code,
        name,
        description: nullable(input.description) ?? null,
        status: (input.status as ProjectStatus) ?? ProjectStatus.ACTIVE,
        directoryTemplate: template ?? null,
        repositoryRootPath: repositoryPath(input.repositoryRootPath, code),
        storageConfiguration: (parseJson(input.storageConfiguration, null) as Record<string, unknown> | null | undefined) ?? null,
      });
      const saved = await projectRepo.save(project);
      if (template?.sections?.length) {
        const sections = [...template.sections].sort((a, b) => a.position - b.position).map((section) => sectionRepo.create({
          project: saved,
          sectionKey: section.sectionKey,
          code: section.code,
          name: section.name,
          slug: section.slug,
          position: section.position,
          active: section.active,
          relativePath: section.name,
        }));
        await sectionRepo.save(sections);
      }
      return saved;
    });
    const action = fromImport(input) ? 'PROJECT_CREATED_FROM_IMPORT' : 'CREATE';
    await this.audit.record({
      userId,
      action,
      entityType: 'Project',
      entityId: created.id,
      message: `Created project ${created.code}`,
      after: { ...created, origin: fromImport(input) ? 'IMPORT_DOCUMENT' : undefined },
    });
    await this.storage.ensureProjectStructure(created.id);
    return this.getProject(created.id);
  }

  async updateProject(id: string, input: Record<string, unknown>, userId?: string) {
    const existing = await this.db.projects.findOne({ where: { id }, relations: { directoryTemplate: true } });
    if (!existing) throw new NotFoundException('Project not found');
    const before = { ...existing };
    if (input.code !== undefined) existing.code = clean(input.code).toUpperCase();
    if (input.name !== undefined) existing.name = clean(input.name);
    if (input.description !== undefined) existing.description = nullable(input.description) ?? null;
    if (input.status !== undefined) existing.status = input.status as ProjectStatus;
    if (input.repositoryRootPath !== undefined) existing.repositoryRootPath = repositoryPath(input.repositoryRootPath, existing.code);
    if (input.storageConfiguration !== undefined) existing.storageConfiguration = (parseJson(input.storageConfiguration, null) as Record<string, unknown> | null) ?? null;
    const updated = await this.db.projects.save(existing);
    await this.audit.record({ userId, action: 'UPDATE', entityType: 'Project', entityId: id, message: `Updated project ${updated.code}`, before, after: updated });
    await this.storage.ensureProjectStructure(id);
    return this.getProject(id);
  }

  async applyTemplate(projectId: string, templateId: string, userId?: string) {
    const [project, template] = await Promise.all([
      this.db.projects.findOne({ where: { id: projectId }, relations: { sections: true } }),
      this.db.directoryTemplates.findOne({ where: { id: templateId }, relations: { sections: true } }),
    ]);
    if (!project) throw new NotFoundException('Project not found');
    if (!template) throw new NotFoundException('Directory template not found');

    await this.db.dataSource.transaction(async (manager) => {
      const projects = manager.getRepository(Project);
      const sections = manager.getRepository(ProjectSection);
      for (const source of [...template.sections].sort((a, b) => a.position - b.position)) {
        let target = await sections.findOne({ where: { project: { id: projectId }, sectionKey: source.sectionKey }, relations: { project: true } });
        if (!target) target = sections.create({ project, sectionKey: source.sectionKey, relativePath: source.name });
        target.code = source.code;
        target.name = source.name;
        target.slug = source.slug;
        target.position = source.position;
        target.active = source.active;
        await sections.save(target);
      }
      project.directoryTemplate = template;
      await projects.save(project);
    });
    await this.audit.record({ userId, action: 'CONFIG_CHANGE', entityType: 'Project', entityId: projectId, message: `Applied template ${template.name} to ${project.code}` });
    await this.storage.ensureProjectStructure(projectId);
    return this.getProject(projectId);
  }

  async createProjectSection(projectId: string, input: Record<string, unknown>, userId?: string) {
    if (!clean(projectId)) throw new ConfigurationException('PROJECT_REQUIRED', 'Select a project before adding a repository section.');
    const project = await this.db.projects.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const key = sectionKey(input.sectionKey ?? input.name);
    const name = clean(input.name);
    const code = clean(input.code || codeify(name)).toUpperCase();
    if (!key || !name || !code) throw new ConfigurationException('VALIDATION_ERROR', 'Section key, code and name are required');

    const existingByKey = await this.db.projectSections.findOne({ where: { project: { id: projectId }, sectionKey: key } });
    if (existingByKey) {
      throw new ConfigurationConflictException('REPOSITORY_MODULE_ALREADY_EXISTS', `A repository section “${existingByKey.name}” already exists in this project.`, {
        existingId: existingByKey.id, existingName: existingByKey.name, existingCode: existingByKey.code,
      });
    }
    const existingByName = await this.db.projectSections
      .createQueryBuilder('section')
      .where('section.project_id = :projectId', { projectId })
      .andWhere('LOWER(section.name) = LOWER(:name)', { name })
      .getOne();
    if (existingByName) {
      throw new ConfigurationConflictException('REPOSITORY_MODULE_ALREADY_EXISTS', `A repository section named “${existingByName.name}” already exists in this project.`, {
        existingId: existingByName.id, existingName: existingByName.name, existingCode: existingByName.code,
      });
    }

    let relativePath: string;
    try {
      relativePath = repositoryPath(input.relativePath, name);
    } catch (error) {
      if (error instanceof ConfigurationException) throw error;
      throw new ConfigurationException('INVALID_REPOSITORY_PATH', 'A valid relative repository path is required');
    }

    const existingByPath = await this.db.projectSections.findOne({ where: { project: { id: projectId }, relativePath } });
    if (existingByPath) {
      throw new ConfigurationConflictException('REPOSITORY_MODULE_ALREADY_EXISTS', `A repository section already uses path “${relativePath}” in this project.`, {
        existingId: existingByPath.id, existingName: existingByPath.name,
      });
    }

    const section = this.db.projectSections.create({
      project,
      sectionKey: key,
      code,
      name,
      slug: slugify(input.slug ?? name),
      position: Number(input.position ?? (await this.db.projectSections.count({ where: { project: { id: projectId } } })) + 1),
      active: boolean(input.active),
      relativePath,
    });
    const saved = await this.db.projectSections.save(section);
    const action = fromImport(input) ? 'REPOSITORY_SECTION_CREATED_FROM_IMPORT' : 'CONFIG_CHANGE';
    await this.audit.record({
      userId,
      action,
      entityType: 'ProjectSection',
      entityId: saved.id,
      message: `Added repository section ${saved.name}`,
      after: { ...saved, projectId, origin: fromImport(input) ? 'IMPORT_DOCUMENT' : undefined },
    });
    await this.storage.ensureProjectStructure(projectId);
    return saved;
  }

  async updateProjectSection(id: string, input: Record<string, unknown>, userId?: string) {
    const section = await this.db.projectSections.findOne({ where: { id }, relations: { project: true } });
    if (!section) throw new NotFoundException('Project section not found');
    const before = { ...section };
    if (input.sectionKey !== undefined) section.sectionKey = sectionKey(input.sectionKey);
    if (input.code !== undefined) section.code = clean(input.code).toUpperCase();
    if (input.name !== undefined) section.name = clean(input.name);
    if (input.slug !== undefined) section.slug = slugify(input.slug);
    else if (input.name !== undefined) section.slug = slugify(input.name);
    if (input.position !== undefined) section.position = Number(input.position);
    if (input.active !== undefined) section.active = boolean(input.active);
    if (input.relativePath !== undefined) section.relativePath = repositoryPath(input.relativePath, section.name);
    const saved = await this.db.projectSections.save(section);
    await this.audit.record({ userId, action: 'CONFIG_CHANGE', entityType: 'ProjectSection', entityId: id, message: `Updated repository section ${saved.name}`, before, after: saved });
    await this.storage.ensureProjectStructure(saved.project.id);
    return saved;
  }

  async deleteProjectSection(id: string, userId?: string) {
    const section = await this.db.projectSections.findOne({ where: { id }, relations: { project: true } });
    if (!section) throw new NotFoundException('Project section not found');
    const documentCount = await this.db.documents.count({ where: { section: { id } } });
    if (documentCount > 0) {
      section.active = false;
      const disabled = await this.db.projectSections.save(section);
      await this.audit.record({ userId, action: 'CONFIG_CHANGE', entityType: 'ProjectSection', entityId: id, message: `Deactivated section ${section.name}; existing documents were retained` });
      return disabled;
    }
    await this.db.projectSections.remove(section);
    await this.audit.record({ userId, action: 'DELETE', entityType: 'ProjectSection', entityId: id, message: `Removed empty section ${section.name}` });
    return { deleted: true };
  }

  async listTemplates() {
    const templates = await this.db.directoryTemplates.find({ relations: { sections: true }, order: { isDefault: 'DESC', name: 'ASC' } });
    return Promise.all(templates.map(async (template) => ({
      ...template,
      sections: [...(template.sections ?? [])].sort((a, b) => a.position - b.position),
      _count: { projects: await this.db.projects.count({ where: { directoryTemplate: { id: template.id } } }) },
    })));
  }

  async createTemplate(input: Record<string, unknown>, userId?: string) {
    const code = clean(input.code).toUpperCase();
    const name = clean(input.name);
    if (!code || !name) throw new ConfigurationException('VALIDATION_ERROR', 'Template code and name are required');
    const rawSections = Array.isArray(input.sections) ? input.sections as Array<Record<string, unknown>> : [];
    const template = await this.db.dataSource.transaction(async (manager) => {
      const templates = manager.getRepository(DirectoryTemplate);
      const sections = manager.getRepository(DirectoryTemplateSection);
      if (boolean(input.isDefault, false)) await templates.update({}, { isDefault: false });
      const created = await templates.save(templates.create({
        code, name,
        description: nullable(input.description) ?? null,
        isDefault: boolean(input.isDefault, false),
        active: boolean(input.active),
      }));
      if (rawSections.length) {
        await sections.save(rawSections.map((raw, index) => sections.create({
          template: created,
          sectionKey: sectionKey(raw.sectionKey ?? raw.name),
          code: clean(raw.code || `SEC${index + 1}`).toUpperCase(),
          name: clean(raw.name),
          slug: slugify(raw.slug ?? raw.name),
          position: Number(raw.position ?? index + 1),
          active: boolean(raw.active),
        })));
      }
      return created;
    });
    await this.audit.record({ userId, action: 'CREATE', entityType: 'DirectoryTemplate', entityId: template.id, message: `Created directory template ${template.name}`, after: template });
    return this.db.directoryTemplates.findOne({ where: { id: template.id }, relations: { sections: true } });
  }

  listSources() { return this.db.sourceSystems.find({ order: { name: 'ASC' } }); }
  async createSource(input: Record<string, unknown>, userId?: string) {
    const name = clean(input.name);
    const code = clean(input.code || codeify(name)).toUpperCase();
    if (!name) throw new ConfigurationException('VALIDATION_ERROR', 'Source system name is required');
    if (!code) throw new ConfigurationException('VALIDATION_ERROR', 'Source system code is required');

    const existingByCode = await this.db.sourceSystems.findOne({ where: { code } });
    if (existingByCode) {
      throw new ConfigurationConflictException('SOURCE_SYSTEM_ALREADY_EXISTS', `A source system with code “${code}” already exists.`, {
        existingId: existingByCode.id, existingName: existingByCode.name, existingCode: existingByCode.code,
      });
    }
    const existingByName = await this.db.sourceSystems
      .createQueryBuilder('source')
      .where('LOWER(source.name) = LOWER(:name)', { name })
      .getOne();
    if (existingByName) {
      throw new ConfigurationConflictException('SOURCE_SYSTEM_ALREADY_EXISTS', `A source system named “${existingByName.name}” already exists.`, {
        existingId: existingByName.id, existingName: existingByName.name, existingCode: existingByName.code,
      });
    }

    const entity = this.db.sourceSystems.create({
      code,
      name,
      type: clean(input.type || input.sourceCategory || 'MANUAL_UPLOAD') || 'MANUAL_UPLOAD',
      description: nullable(input.description) ?? null,
      active: boolean(input.active),
      configuration: (parseJson(input.configuration, null) as Record<string, unknown> | null | undefined) ?? null,
    });
    const saved = await this.db.sourceSystems.save(entity);
    const action = fromImport(input) ? 'SOURCE_SYSTEM_CREATED_FROM_IMPORT' : 'CREATE';
    await this.audit.record({
      userId,
      action,
      entityType: 'SourceSystem',
      entityId: saved.id,
      message: `Created source system ${saved.name}`,
      after: { ...saved, origin: fromImport(input) ? 'IMPORT_DOCUMENT' : undefined },
    });
    return saved;
  }
  async updateSource(id: string, input: Record<string, unknown>) {
    const entity = await this.db.sourceSystems.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Source system not found');
    if (input.code !== undefined) entity.code = clean(input.code).toUpperCase();
    if (input.name !== undefined) entity.name = clean(input.name);
    if (input.type !== undefined) entity.type = clean(input.type);
    if (input.description !== undefined) entity.description = nullable(input.description) ?? null;
    if (input.active !== undefined) entity.active = boolean(input.active);
    if (input.configuration !== undefined) entity.configuration = (parseJson(input.configuration, null) as Record<string, unknown> | null) ?? null;
    return this.db.sourceSystems.save(entity);
  }

  listDocumentTypes() { return this.db.documentTypes.find({ order: { name: 'ASC' } }); }
  async createDocumentType(input: Record<string, unknown>, userId?: string) {
    const name = clean(input.name);
    const code = clean(input.code || codeify(name)).toUpperCase();
    if (!name) throw new ConfigurationException('VALIDATION_ERROR', 'Document type name is required');
    if (!code) throw new ConfigurationException('VALIDATION_ERROR', 'Document type code is required');

    const existingByName = await this.db.documentTypes
      .createQueryBuilder('type')
      .where('LOWER(type.name) = LOWER(:name)', { name })
      .getOne();
    if (existingByName) {
      throw new ConfigurationConflictException('DOCUMENT_TYPE_ALREADY_EXISTS', `A document type named “${existingByName.name}” already exists.`, {
        existingId: existingByName.id, existingName: existingByName.name, existingCode: existingByName.code,
      });
    }
    const existingByCode = await this.db.documentTypes.findOne({ where: { code } });
    if (existingByCode) {
      throw new ConfigurationConflictException('DOCUMENT_TYPE_ALREADY_EXISTS', `A document type with code “${code}” already exists.`, {
        existingId: existingByCode.id, existingName: existingByCode.name, existingCode: existingByCode.code,
      });
    }

    const entity = this.db.documentTypes.create({
      name,
      code,
      description: nullable(input.description) ?? null,
      active: boolean(input.active),
    });
    const saved = await this.db.documentTypes.save(entity);
    const action = fromImport(input) ? 'DOCUMENT_TYPE_CREATED_FROM_IMPORT' : 'CREATE';
    await this.audit.record({
      userId,
      action,
      entityType: 'DocumentType',
      entityId: saved.id,
      message: `Created document type ${saved.name}`,
      after: { ...saved, origin: fromImport(input) ? 'IMPORT_DOCUMENT' : undefined },
    });
    return saved;
  }
  async updateDocumentType(id: string, input: Record<string, unknown>) {
    const entity = await this.db.documentTypes.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Document type not found');
    if (input.name !== undefined) entity.name = clean(input.name);
    if (input.code !== undefined) entity.code = clean(input.code).toUpperCase();
    if (input.description !== undefined) entity.description = nullable(input.description) ?? null;
    if (input.active !== undefined) entity.active = boolean(input.active);
    return this.db.documentTypes.save(entity);
  }

  listFileTypes() { return this.db.fileTypes.find({ order: { extension: 'ASC' } }); }
  async createFileType(input: Record<string, unknown>) {
    const entity = this.db.fileTypes.create({
      extension: clean(input.extension).replace('.', '').toLowerCase(), label: clean(input.label),
      mimeTypes: (parseJson(input.mimeTypes, []) as string[]) ?? [], maxSizeMb: Number(input.maxSizeMb ?? 50),
      allowMetadataExtraction: boolean(input.allowMetadataExtraction), active: boolean(input.active),
    });
    return this.db.fileTypes.save(entity);
  }
  async updateFileType(id: string, input: Record<string, unknown>) {
    const entity = await this.db.fileTypes.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('File type not found');
    if (input.extension !== undefined) entity.extension = clean(input.extension).replace('.', '').toLowerCase();
    if (input.label !== undefined) entity.label = clean(input.label);
    if (input.mimeTypes !== undefined) entity.mimeTypes = (parseJson(input.mimeTypes, []) as string[]) ?? [];
    if (input.maxSizeMb !== undefined) entity.maxSizeMb = Number(input.maxSizeMb);
    if (input.allowMetadataExtraction !== undefined) entity.allowMetadataExtraction = boolean(input.allowMetadataExtraction);
    if (input.active !== undefined) entity.active = boolean(input.active);
    return this.db.fileTypes.save(entity);
  }

  listMetadataFields() { return this.db.metadataFields.find({ order: { position: 'ASC', label: 'ASC' } }); }
  async createMetadataField(input: Record<string, unknown>) {
    const entity = this.db.metadataFields.create({
      key: clean(input.key), label: clean(input.label), dataType: clean(input.dataType || 'TEXT'),
      description: nullable(input.description) ?? null, required: boolean(input.required, false),
      validationRule: nullable(input.validationRule) ?? null, defaultValue: nullable(input.defaultValue) ?? null,
      active: boolean(input.active), position: Number(input.position ?? 0),
    });
    return this.db.metadataFields.save(entity);
  }
  async updateMetadataField(id: string, input: Record<string, unknown>) {
    const entity = await this.db.metadataFields.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Metadata field not found');
    if (input.key !== undefined) entity.key = clean(input.key);
    if (input.label !== undefined) entity.label = clean(input.label);
    if (input.dataType !== undefined) entity.dataType = clean(input.dataType);
    if (input.description !== undefined) entity.description = nullable(input.description) ?? null;
    if (input.required !== undefined) entity.required = boolean(input.required);
    if (input.validationRule !== undefined) entity.validationRule = nullable(input.validationRule) ?? null;
    if (input.defaultValue !== undefined) entity.defaultValue = nullable(input.defaultValue) ?? null;
    if (input.active !== undefined) entity.active = boolean(input.active);
    if (input.position !== undefined) entity.position = Number(input.position);
    return this.db.metadataFields.save(entity);
  }

  async listRoutingRules(projectId?: string) {
    const qb = this.db.routingRules.createQueryBuilder('rule')
      .leftJoinAndSelect('rule.project', 'project')
      .leftJoinAndSelect('rule.sourceSystem', 'sourceSystem')
      .orderBy('rule.priority', 'ASC').addOrderBy('rule.name', 'ASC');
    if (projectId) qb.where(new Brackets((where) => where.where('project.id = :projectId', { projectId }).orWhere('project.id IS NULL')));
    const rules = await qb.getMany();
    return rules.map((rule) => ({ ...rule, projectId: rule.project?.id ?? null, sourceSystemId: rule.sourceSystem?.id ?? null }));
  }
  async createRoutingRule(input: Record<string, unknown>) {
    const [project, sourceSystem] = await Promise.all([
      input.projectId ? this.db.projects.findOne({ where: { id: clean(input.projectId) } }) : Promise.resolve(null),
      input.sourceSystemId ? this.db.sourceSystems.findOne({ where: { id: clean(input.sourceSystemId) } }) : Promise.resolve(null),
    ]);
    const entity = this.db.routingRules.create({
      name: clean(input.name), project, sourceSystem,
      documentType: nullable(input.documentType) ?? null, fileExtension: nullable(input.fileExtension)?.replace('.', '').toLowerCase() ?? null,
      metadataKey: nullable(input.metadataKey) ?? null, metadataValue: nullable(input.metadataValue) ?? null,
      targetSectionKey: sectionKey(input.targetSectionKey), priority: Number(input.priority ?? 100), active: boolean(input.active),
    });
    return this.db.routingRules.save(entity);
  }
  async updateRoutingRule(id: string, input: Record<string, unknown>) {
    const entity = await this.db.routingRules.findOne({ where: { id }, relations: { project: true, sourceSystem: true } });
    if (!entity) throw new NotFoundException('Routing rule not found');
    if (input.name !== undefined) entity.name = clean(input.name);
    if (input.projectId !== undefined) entity.project = input.projectId ? await this.db.projects.findOne({ where: { id: clean(input.projectId) } }) : null;
    if (input.sourceSystemId !== undefined) entity.sourceSystem = input.sourceSystemId ? await this.db.sourceSystems.findOne({ where: { id: clean(input.sourceSystemId) } }) : null;
    if (input.documentType !== undefined) entity.documentType = nullable(input.documentType) ?? null;
    if (input.fileExtension !== undefined) entity.fileExtension = nullable(input.fileExtension)?.replace('.', '').toLowerCase() ?? null;
    if (input.metadataKey !== undefined) entity.metadataKey = nullable(input.metadataKey) ?? null;
    if (input.metadataValue !== undefined) entity.metadataValue = nullable(input.metadataValue) ?? null;
    if (input.targetSectionKey !== undefined) entity.targetSectionKey = sectionKey(input.targetSectionKey);
    if (input.priority !== undefined) entity.priority = Number(input.priority);
    if (input.active !== undefined) entity.active = boolean(input.active);
    return this.db.routingRules.save(entity);
  }

  async deleteRoutingRule(id: string) {
    const entity = await this.db.routingRules.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Routing rule not found');
    await this.db.routingRules.remove(entity);
    return { id, deleted: true };
  }

  listSettings() { return this.db.systemSettings.find({ order: { key: 'ASC' } }); }
  async setSetting(key: string, value: unknown, description?: string) {
    let setting = await this.db.systemSettings.findOne({ where: { key } });
    if (!setting) setting = this.db.systemSettings.create({ key, value: parseJson(value, value), description: description ?? null });
    else { setting.value = parseJson(value, value); if (description !== undefined) setting.description = description; }
    return this.db.systemSettings.save(setting);
  }
}
