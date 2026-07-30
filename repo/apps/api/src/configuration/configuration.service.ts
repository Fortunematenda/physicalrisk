import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { ConfigurationConflictException, ConfigurationException } from '../common/configuration.exception';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
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
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly storage: VpsStorageService,
    private readonly documents: DocumentsService,
  ) {}

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
        repositoryRootPath: repositoryPath(input.repositoryRootPath, name),
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

  async deleteProject(id: string, userId?: string) {
    const project = await this.db.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    const documentCount = await this.db.documents.count({ where: { project: { id } } });
    if (documentCount > 0) {
      throw new ConfigurationException(
        'PROJECT_HAS_DOCUMENTS',
        `“${project.name}” still has ${documentCount} document(s). Delete or move them before deleting the project.`,
        { documentCount },
      );
    }
    const importCount = await this.db.importJobs.count({ where: { project: { id } } });
    if (importCount > 0) {
      await this.db.importJobs
        .createQueryBuilder()
        .delete()
        .from('import_jobs')
        .where('project_id = :id', { id })
        .execute();
    }
    const rootRelative = this.storage.projectRelativeRoot(project);
    await this.db.projects.remove(project);
    await this.storage.removeDirectory(rootRelative);
    await this.audit.record({
      userId,
      action: 'DELETE',
      entityType: 'Project',
      entityId: id,
      message: `Deleted project ${project.code}`,
      before: project,
    });
    return { deleted: true, id };
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
      const existing = await sections.find({ where: { project: { id: projectId } }, relations: { project: true } });

      // Shift positions out of the unique (project, position) range before reordering.
      let tempPosition = 10_000;
      for (const row of existing) {
        row.position = tempPosition++;
        await sections.save(row);
      }

      const templateSections = [...(template.sections ?? [])].sort((a, b) => a.position - b.position);
      const keptKeys = new Set(templateSections.map((source) => source.sectionKey));

      for (const source of templateSections) {
        let target = existing.find((row) => row.sectionKey === source.sectionKey);
        if (!target) {
          target = sections.create({
            project,
            sectionKey: source.sectionKey,
            relativePath: source.name,
          });
          existing.push(target);
        }
        target.code = source.code;
        target.name = source.name;
        target.slug = source.slug;
        target.position = source.position;
        target.active = source.active !== false;
        if (!target.relativePath) target.relativePath = source.name;
        await sections.save(target);
      }

      // Sections not in the new template sink inactive to the bottom (kept for existing docs).
      const extras = existing
        .filter((row) => !keptKeys.has(row.sectionKey))
        .sort((a, b) => a.position - b.position);
      let nextPosition = templateSections.length + 1;
      for (const row of extras) {
        row.active = false;
        row.position = nextPosition++;
        await sections.save(row);
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
    const before = {
      sectionKey: section.sectionKey,
      code: section.code,
      name: section.name,
      slug: section.slug,
      position: section.position,
      active: section.active,
      relativePath: section.relativePath,
    };
    const projectId = section.project.id;
    const nextActive = input.active !== undefined ? boolean(input.active, section.active) : section.active;
    const nextPosition = input.position !== undefined ? Number(input.position) : undefined;
    if (nextPosition !== undefined && (!Number.isFinite(nextPosition) || nextPosition < 1)) {
      throw new ConfigurationException('VALIDATION_ERROR', 'Section order must be a positive number');
    }

    if (input.sectionKey !== undefined) {
      const nextKey = sectionKey(input.sectionKey);
      if (!nextKey) throw new ConfigurationException('VALIDATION_ERROR', 'Section key is required');
      const existingKey = await this.db.projectSections.findOne({
        where: { project: { id: projectId }, sectionKey: nextKey },
      });
      if (existingKey && existingKey.id !== id) {
        throw new ConfigurationConflictException(
          'REPOSITORY_MODULE_ALREADY_EXISTS',
          `A repository section with key “${nextKey}” already exists in this project.`,
          { existingId: existingKey.id, existingName: existingKey.name },
        );
      }
      section.sectionKey = nextKey;
    }
    if (input.code !== undefined) section.code = clean(input.code).toUpperCase();
    if (input.name !== undefined) section.name = clean(input.name);
    if (input.slug !== undefined) section.slug = slugify(input.slug);
    else if (input.name !== undefined) section.slug = slugify(input.name);
    if (input.relativePath !== undefined) section.relativePath = repositoryPath(input.relativePath, section.name);
    section.active = nextActive;

    const previousRelativePath = before.relativePath;
    const nextRelativePath = section.relativePath;

    const saved = await this.db.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProjectSection);
      await repo.save(section);

      const siblings = await repo.find({
        where: { project: { id: projectId } },
        order: { position: 'ASC', createdAt: 'ASC' },
      });
      const current = siblings.find((item) => item.id === id) ?? section;
      current.active = nextActive;

      let active = siblings
        .filter((item) => item.id !== id && item.active)
        .sort((a, b) => a.position - b.position);
      let inactive = siblings
        .filter((item) => item.id !== id && !item.active)
        .sort((a, b) => a.position - b.position);

      if (current.active) {
        const insertAt = nextPosition === undefined
          ? active.filter((item) => item.position < before.position).length
          : Math.max(0, Math.min(active.length, Math.floor(nextPosition) - 1));
        active = [...active];
        active.splice(insertAt, 0, current);
      } else {
        inactive = [...inactive, current];
      }

      // Active sections stay contiguous from 1..N; inactive sections follow.
      await this.persistSectionPositions(repo, [...active, ...inactive]);
      const refreshed = await repo.findOne({ where: { id }, relations: { project: true } });
      return refreshed ?? current;
    });

    await this.audit.record({
      userId,
      action: 'CONFIG_CHANGE',
      entityType: 'ProjectSection',
      entityId: id,
      message: `Updated repository section ${saved.name}`,
      before,
      after: saved,
    });
    if (previousRelativePath !== nextRelativePath) {
      const project = section.project;
      const from = `${this.storage.projectRelativeRoot(project)}/${this.storage.normaliseRelativePath(previousRelativePath)}`.replace(/\\/g, '/');
      const to = `${this.storage.projectRelativeRoot(project)}/${this.storage.normaliseRelativePath(nextRelativePath)}`.replace(/\\/g, '/');
      try {
        await this.storage.renameDirectory(from, to);
      } catch {
        // ensureProjectStructure will recreate the destination if rename failed because source was missing.
      }
    }
    await this.storage.ensureProjectStructure(projectId);
    return saved;
  }

  /** Two-phase write avoids unique (project, position) conflicts while reordering. */
  private async persistSectionPositions(
    repo: { save: (entities: ProjectSection[]) => Promise<ProjectSection[]> },
    ordered: ProjectSection[],
  ) {
    if (!ordered.length) return;
    for (let index = 0; index < ordered.length; index += 1) {
      ordered[index].position = -(index + 1);
    }
    await repo.save(ordered);
    for (let index = 0; index < ordered.length; index += 1) {
      ordered[index].position = index + 1;
    }
    await repo.save(ordered);
  }

  /**
   * Set active/inactive for a repository module everywhere it appears:
   * all project placements and matching directory-template sections.
   */
  async setRepositoryModuleActive(rawKey: string, active: boolean, userId?: string) {
    const key = sectionKey(rawKey);
    if (!key) throw new ConfigurationException('VALIDATION_ERROR', 'Section key is required');

    const projectSections = await this.db.projectSections.find({
      where: { sectionKey: key },
      relations: { project: true },
      order: { createdAt: 'ASC' },
    });
    const templateSections = await this.db.directoryTemplateSections.find({
      where: { sectionKey: key },
      relations: { template: true },
    });

    if (!projectSections.length && !templateSections.length) {
      throw new NotFoundException(`Repository module “${key}” was not found`);
    }

    for (const section of projectSections) {
      if (section.active === active) continue;
      await this.updateProjectSection(section.id, { active }, userId);
    }

    for (const section of templateSections) {
      if (section.active === active) continue;
      section.active = active;
      await this.db.directoryTemplateSections.save(section);
    }

    await this.audit.record({
      userId,
      action: 'CONFIG_CHANGE',
      entityType: 'ProjectSection',
      entityId: key,
      message: `Set repository module ${key} ${active ? 'active' : 'inactive'} across ${projectSections.length} project(s) and ${templateSections.length} template section(s)`,
    });

    return {
      sectionKey: key,
      active,
      projectSectionsUpdated: projectSections.length,
      templateSectionsUpdated: templateSections.length,
    };
  }

  async deleteProjectSection(id: string, userId?: string) {
    const section = await this.db.projectSections.findOne({ where: { id }, relations: { project: true } });
    if (!section) throw new NotFoundException('Project section not found');
    const folderRelative = `${this.storage.projectRelativeRoot(section.project)}/${this.storage.normaliseRelativePath(section.relativePath)}`
      .replace(/\\/g, '/');
    // Cascade: documents, pack subfolders, VPS directory, and the module row.
    return this.documents.deleteRepositoryFolder(section.project.id, folderRelative, userId);
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
    const existing = await this.db.directoryTemplates.findOne({ where: { code } });
    if (existing) {
      throw new ConfigurationConflictException('TEMPLATE_CODE_EXISTS', `A directory template with code “${code}” already exists.`, {
        existingId: existing.id,
        existingCode: existing.code,
        existingName: existing.name,
      });
    }
    const rawSections = Array.isArray(input.sections) ? input.sections as Array<Record<string, unknown>> : [];
    try {
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
      if (template.isDefault) {
        await this.setSetting('gateway.defaultDirectoryTemplate', template.code, 'Default directory configuration for new projects.');
      }
      await this.audit.record({ userId, action: 'CREATE', entityType: 'DirectoryTemplate', entityId: template.id, message: `Created directory template ${template.name}`, after: template });
      return this.db.directoryTemplates.findOne({ where: { id: template.id }, relations: { sections: true } });
    } catch (error) {
      if (error instanceof ConfigurationException || error instanceof ConfigurationConflictException) throw error;
      throw new ConfigurationException(
        'TEMPLATE_CREATE_FAILED',
        'The directory template could not be created. Check that section positions and keys are unique, then try again.',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async setDefaultTemplate(id: string, userId?: string) {
    const template = await this.db.directoryTemplates.findOne({ where: { id }, relations: { sections: true } });
    if (!template) throw new NotFoundException('Directory template not found');
    if (!template.active) {
      throw new ConfigurationException('TEMPLATE_INACTIVE', 'Only an active directory template can be set as the system default.');
    }
    try {
      await this.db.dataSource.transaction(async (manager) => {
        const templates = manager.getRepository(DirectoryTemplate);
        await templates.createQueryBuilder().update().set({ isDefault: false }).execute();
        await templates.update({ id }, { isDefault: true });
      });
      await this.setSetting('gateway.defaultDirectoryTemplate', template.code, 'Default directory configuration for new projects.');
      await this.audit.record({
        userId,
        action: 'CONFIG_CHANGE',
        entityType: 'DirectoryTemplate',
        entityId: id,
        message: `Set directory template ${template.name} as system default`,
        after: { code: template.code, isDefault: true },
      });
      return this.db.directoryTemplates.findOne({ where: { id }, relations: { sections: true } });
    } catch (error) {
      throw new ConfigurationException(
        'TEMPLATE_DEFAULT_FAILED',
        'The selected directory template could not be updated. Please try again.',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async duplicateTemplate(id: string, userId?: string) {
    const source = await this.db.directoryTemplates.findOne({ where: { id }, relations: { sections: true } });
    if (!source) throw new NotFoundException('Directory template not found');
    const baseCode = `${source.code}_COPY`.slice(0, 48);
    let code = baseCode;
    let n = 2;
    while (await this.db.directoryTemplates.findOne({ where: { code } })) {
      code = `${baseCode}_${n}`.slice(0, 48);
      n += 1;
    }
    return this.createTemplate({
      code,
      name: `${source.name} (copy)`,
      description: source.description,
      isDefault: false,
      active: true,
      sections: (source.sections ?? []).map((section) => ({
        name: section.name,
        code: section.code,
        sectionKey: section.sectionKey,
        slug: section.slug,
        position: section.position,
        active: section.active,
      })),
    }, userId);
  }

  async archiveTemplate(id: string, userId?: string) {
    const template = await this.db.directoryTemplates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Directory template not found');
    if (template.isDefault) {
      throw new ConfigurationException('TEMPLATE_DEFAULT_ARCHIVE', 'Set another template as default before archiving this one.');
    }
    template.active = false;
    const saved = await this.db.directoryTemplates.save(template);
    await this.audit.record({ userId, action: 'CONFIG_CHANGE', entityType: 'DirectoryTemplate', entityId: id, message: `Archived directory template ${template.name}` });
    return saved;
  }

  async updateTemplate(id: string, input: Record<string, unknown>, userId?: string) {
    const template = await this.db.directoryTemplates.findOne({ where: { id }, relations: { sections: true } });
    if (!template) throw new NotFoundException('Directory template not found');
    const nextCode = input.code !== undefined ? clean(input.code).toUpperCase() : template.code;
    const nextName = input.name !== undefined ? clean(input.name) : template.name;
    if (!nextCode || !nextName) throw new ConfigurationException('VALIDATION_ERROR', 'Template code and name are required');
    if (nextCode !== template.code) {
      const existing = await this.db.directoryTemplates.findOne({ where: { code: nextCode } });
      if (existing && existing.id !== id) {
        throw new ConfigurationConflictException('TEMPLATE_CODE_EXISTS', `A directory template with code “${nextCode}” already exists.`, {
          existingId: existing.id,
          existingCode: existing.code,
          existingName: existing.name,
        });
      }
    }
    const rawSections = input.sections !== undefined
      ? (Array.isArray(input.sections) ? input.sections as Array<Record<string, unknown>> : null)
      : undefined;
    if (rawSections === null) throw new ConfigurationException('VALIDATION_ERROR', 'Sections must be an array');

    try {
      await this.db.dataSource.transaction(async (manager) => {
        const templates = manager.getRepository(DirectoryTemplate);
        const sections = manager.getRepository(DirectoryTemplateSection);
        if (input.isDefault !== undefined && boolean(input.isDefault, false)) {
          await templates.createQueryBuilder().update().set({ isDefault: false }).execute();
        }
        template.code = nextCode;
        template.name = nextName;
        if (input.description !== undefined) template.description = nullable(input.description) ?? null;
        if (input.active !== undefined) template.active = boolean(input.active);
        if (input.isDefault !== undefined) template.isDefault = boolean(input.isDefault, false);
        await templates.save(template);

        if (rawSections) {
          await sections.delete({ template: { id } });
          if (rawSections.length) {
            await sections.save(rawSections.map((raw, index) => sections.create({
              template,
              sectionKey: sectionKey(raw.sectionKey ?? raw.name),
              code: clean(raw.code || `SEC${index + 1}`).toUpperCase(),
              name: clean(raw.name),
              slug: slugify(raw.slug ?? raw.name),
              position: Number(raw.position ?? index + 1),
              active: boolean(raw.active),
            })));
          }
        }
      });
      if (template.isDefault) {
        await this.setSetting('gateway.defaultDirectoryTemplate', template.code, 'Default directory configuration for new projects.');
      }
      await this.audit.record({
        userId,
        action: 'CONFIG_CHANGE',
        entityType: 'DirectoryTemplate',
        entityId: id,
        message: `Updated directory template ${template.name}`,
      });
      return this.db.directoryTemplates.findOne({ where: { id }, relations: { sections: true } });
    } catch (error) {
      if (error instanceof ConfigurationException || error instanceof ConfigurationConflictException) throw error;
      throw new ConfigurationException(
        'TEMPLATE_UPDATE_FAILED',
        'The directory template could not be updated. Check that section positions and keys are unique, then try again.',
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  async deleteTemplate(id: string, userId?: string) {
    const template = await this.db.directoryTemplates.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Directory template not found');
    if (template.isDefault) {
      throw new ConfigurationException('TEMPLATE_DEFAULT_DELETE', 'Set another template as default before deleting this one.');
    }
    await this.db.directoryTemplates.remove(template);
    await this.audit.record({ userId, action: 'DELETE', entityType: 'DirectoryTemplate', entityId: id, message: `Deleted directory template ${template.name}` });
    return { id, deleted: true };
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

  async deleteSource(id: string, userId?: string) {
    const entity = await this.db.sourceSystems.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Source system not found');
    const importJobs = await this.db.importJobs.count({ where: { sourceSystem: { id } } });
    if (importJobs > 0) {
      if (!entity.active) {
        return { id, deleted: false, deactivated: true, alreadyInactive: true };
      }
      entity.active = false;
      await this.db.sourceSystems.save(entity);
      await this.audit.record({
        userId,
        action: 'CONFIG_CHANGE',
        entityType: 'SourceSystem',
        entityId: id,
        message: `Deactivated source system ${entity.name} (linked to ${importJobs} import job${importJobs === 1 ? '' : 's'})`,
      });
      return { id, deleted: false, deactivated: true, importJobs };
    }
    await this.db.sourceSystems.remove(entity);
    await this.audit.record({ userId, action: 'DELETE', entityType: 'SourceSystem', entityId: id, message: `Deleted source system ${entity.name}` });
    return { id, deleted: true };
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

  async deleteDocumentType(id: string, userId?: string) {
    const entity = await this.db.documentTypes.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Document type not found');
    await this.db.documentTypes.remove(entity);
    await this.audit.record({ userId, action: 'DELETE', entityType: 'DocumentType', entityId: id, message: `Deleted document type ${entity.name}` });
    return { id, deleted: true };
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
      .orderBy('rule.priority', 'ASC')
      .addOrderBy('rule.createdAt', 'ASC')
      .addOrderBy('rule.id', 'ASC');
    if (projectId) qb.where(new Brackets((where) => where.where('project.id = :projectId', { projectId }).orWhere('project.id IS NULL')));
    const rules = await qb.getMany();
    return rules.map((rule) => ({ ...rule, projectId: rule.project?.id ?? null, sourceSystemId: rule.sourceSystem?.id ?? null }));
  }

  private async assertUniquePriority(priority: number, excludeId?: string) {
    const qb = this.db.routingRules.createQueryBuilder('rule').where('rule.priority = :priority', { priority });
    if (excludeId) qb.andWhere('rule.id != :excludeId', { excludeId });
    const existing = await qb.getOne();
    if (existing) {
      throw new ConfigurationConflictException(
        'ROUTING_PRIORITY_EXISTS',
        `Priority ${priority} already exists (“${existing.name}”). Please choose another priority.`,
        { existingId: existing.id, existingName: existing.name, priority },
      );
    }
  }

  async createRoutingRule(input: Record<string, unknown>) {
    const [project, sourceSystem] = await Promise.all([
      input.projectId ? this.db.projects.findOne({ where: { id: clean(input.projectId) } }) : Promise.resolve(null),
      input.sourceSystemId ? this.db.sourceSystems.findOne({ where: { id: clean(input.sourceSystemId) } }) : Promise.resolve(null),
    ]);
    const priority = Number(input.priority ?? 100);
    if (!Number.isFinite(priority)) throw new ConfigurationException('VALIDATION_ERROR', 'Priority must be a number');
    await this.assertUniquePriority(priority);
    const entity = this.db.routingRules.create({
      name: clean(input.name), project, sourceSystem,
      documentType: nullable(input.documentType) ?? null, fileExtension: nullable(input.fileExtension)?.replace('.', '').toLowerCase() ?? null,
      metadataKey: nullable(input.metadataKey) ?? null, metadataValue: nullable(input.metadataValue) ?? null,
      targetSectionKey: sectionKey(input.targetSectionKey), priority, active: boolean(input.active),
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
    if (input.priority !== undefined) {
      const priority = Number(input.priority);
      if (!Number.isFinite(priority)) throw new ConfigurationException('VALIDATION_ERROR', 'Priority must be a number');
      await this.assertUniquePriority(priority, id);
      entity.priority = priority;
    }
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
