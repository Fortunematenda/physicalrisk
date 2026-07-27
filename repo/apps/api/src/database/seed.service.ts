import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { DatabaseService } from './database.service';
import {
  ConnectorProvider,
  DirectoryTemplate,
  DirectoryTemplateSection,
  ExternalImportStatus,
  FileType,
  ImportStatus,
  MetadataField,
  Project,
  ProjectSection,
  ProjectStatus,
  RoutingRule,
  SourceSystem,
  SystemSetting,
  User,
  UserRole,
} from './entities';

const DEFAULT_SECTIONS = [
  ['PRODUCT_ARCHITECTURE', 'PA', 'Product Architecture'],
  ['ENTERPRISE_ARCHITECTURE', 'EA', 'Enterprise Architecture'],
  ['FUNCTIONAL_SPECIFICATIONS', 'FS', 'Functional Specifications'],
  ['TECHNICAL_SPECIFICATIONS', 'TS', 'Technical Specifications'],
  ['API_SPECIFICATIONS', 'API', 'API Specifications'],
  ['DATA_MODELS', 'DM', 'Data Models'],
  ['BUSINESS_RULES', 'BR', 'Business Rules'],
  ['GOVERNANCE_STANDARDS', 'GS', 'Governance Standards'],
  ['OPERATING_PROCEDURES', 'OP', 'Operating Procedures'],
  ['DEVELOPER_PACKS', 'DP', 'Developer Packs'],
  ['RESEARCH_LIBRARY', 'RL', 'Research Library'],
  ['MARKETING_ASSETS', 'MA', 'Marketing Assets'],
  ['ARTICLES', 'AR', 'Articles'],
  ['TEMPLATES', 'TP', 'Templates'],
  ['DECISIONS', 'DC', 'Decisions'],
  ['MEETING_RECORDS', 'MR', 'Meeting Records'],
  ['RELEASE_NOTES', 'RN', 'Release Notes'],
  ['VERSION_REGISTER', 'VR', 'Version Register'],
  ['MASTER_DOCUMENT_INDEX', 'MDI', 'Master Document Index'],
] as const;

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed() {
    const adminEmail = (this.config.get<string>('DEFAULT_ADMIN_EMAIL') ?? 'admin@physicalrisk.com').toLowerCase();
    const adminPassword = this.config.get<string>('DEFAULT_ADMIN_PASSWORD') ?? 'CHANGE_ME_ADMIN_PASSWORD';
    // Keep local display name aligned with Keycloak (Platform Administrator).
    const adminName = 'Platform Administrator';
    let admin =
      (await this.db.users.findOne({ where: { email: adminEmail } })) ||
      (await this.db.users.findOne({ where: { email: 'admin@physicalrisk.local' } }));
    if (!admin) {
      admin = this.db.users.create({
        name: adminName,
        email: adminEmail,
        passwordHash: await hash(adminPassword, 12),
        role: UserRole.ADMIN,
        active: true,
      });
      await this.db.users.save(admin);
    } else {
      admin.email = adminEmail;
      admin.name = adminName;
      admin.active = true;
      admin.role = UserRole.ADMIN;
      admin.passwordHash = await hash(adminPassword, 12);
      await this.db.users.save(admin);
    }

    let template = await this.db.directoryTemplates.findOne({ where: { code: 'RFP001_DEFAULT' }, relations: { sections: true } });
    if (!template) {
      const existingDefault = await this.db.directoryTemplates.findOne({ where: { isDefault: true } });
      template = this.db.directoryTemplates.create({
        code: 'RFP001_DEFAULT',
        name: 'Standard Repository Directory',
        description: 'Seeded multi-project directory blueprint. Administrators may set any template as the system default.',
        isDefault: !existingDefault,
        active: true,
      });
      template = await this.db.directoryTemplates.save(template);
    } else {
      // Do NOT force isDefault=true on every boot — admins own the default in Settings.
      template.name = template.name || 'Standard Repository Directory';
      template.description = template.description || 'Seeded multi-project directory blueprint.';
      template.active = true;
      template = await this.db.directoryTemplates.save(template);
    }
    const defaultCount = await this.db.directoryTemplates.count({ where: { isDefault: true } });
    if (defaultCount === 0) {
      template.isDefault = true;
      template = await this.db.directoryTemplates.save(template);
    } else if (defaultCount > 1) {
      // Repair multiple defaults: keep the earliest-created default.
      const defaults = await this.db.directoryTemplates.find({ where: { isDefault: true }, order: { createdAt: 'ASC' } });
      for (let i = 1; i < defaults.length; i += 1) {
        defaults[i].isDefault = false;
        await this.db.directoryTemplates.save(defaults[i]);
      }
    }

    for (let index = 0; index < DEFAULT_SECTIONS.length; index += 1) {
      const [sectionKey, code, name] = DEFAULT_SECTIONS[index];
      let section = await this.db.directoryTemplateSections.findOne({ where: { template: { id: template.id }, sectionKey }, relations: { template: true } });
      if (!section) section = this.db.directoryTemplateSections.create({ template, sectionKey, code, name, slug: slugify(name), position: index + 1, active: true });
      else Object.assign(section, { code, name, slug: slugify(name), position: index + 1, active: true });
      await this.db.directoryTemplateSections.save(section);
    }

    let project = await this.db.projects.findOne({ where: { code: 'MOSS' }, relations: { sections: true, directoryTemplate: true } });
    if (!project) project = this.db.projects.create({ code: 'MOSS', name: 'MOSS', description: 'Physical Risk MOSS project repository.', status: ProjectStatus.ACTIVE, directoryTemplate: template, repositoryRootPath: 'MOSS', storageConfiguration: { mode: 'VPS_LOCAL_FILESYSTEM' } });
    else Object.assign(project, { name: 'MOSS', status: ProjectStatus.ACTIVE, directoryTemplate: template, repositoryRootPath: project.repositoryRootPath || 'MOSS', storageConfiguration: project.storageConfiguration || { mode: 'VPS_LOCAL_FILESYSTEM' } });
    project = await this.db.projects.save(project);

    for (let index = 0; index < DEFAULT_SECTIONS.length; index += 1) {
      const [sectionKey, code, name] = DEFAULT_SECTIONS[index];
      let section = await this.db.projectSections.findOne({ where: { project: { id: project.id }, sectionKey }, relations: { project: true } });
      if (!section) section = this.db.projectSections.create({ project, sectionKey, code, name, slug: slugify(name), position: index + 1, active: true, relativePath: name });
      else Object.assign(section, { code, name, slug: slugify(name), position: index + 1, active: true, relativePath: section.relativePath || name });
      await this.db.projectSections.save(section);
    }

    const sources: Array<[string, string, string]> = [
      ['CHATGPT', 'ChatGPT', 'AI_EXPORT'], ['CLAUDE', 'Claude', 'AI_EXPORT'], ['GEMINI', 'Gemini', 'AI_EXPORT'],
      ['MICROSOFT_WORD', 'Microsoft Word', 'DESKTOP_AUTHORING'], ['LOCAL_FOLDER', 'Local Folder', 'MANUAL_UPLOAD'],
      ['WEBSITE_WORKFLOW', 'Website Publishing Workflow', 'API_WORKFLOW'], ['FUTURE_SOURCE', 'Future Source / API', 'EXTENSIBLE'],
    ];
    for (const [code, name, type] of sources) {
      let source = await this.db.sourceSystems.findOne({ where: { code } });
      if (!source) source = this.db.sourceSystems.create({ code, name, type, active: true, description: null, configuration: null });
      else Object.assign(source, { name, type, active: true });
      await this.db.sourceSystems.save(source);
    }

    for (let index = 0; index < DEFAULT_SECTIONS.length; index += 1) {
      const [sectionKey, code, name] = DEFAULT_SECTIONS[index];
      if (['VERSION_REGISTER', 'MASTER_DOCUMENT_INDEX'].includes(sectionKey)) continue;
      let documentType = await this.db.documentTypes.findOne({ where: { code } });
      if (!documentType) {
        documentType = this.db.documentTypes.create({
          code,
          name,
          description: `${name} documents`,
          active: true,
        });
      } else {
        Object.assign(documentType, { name, active: true });
      }
      await this.db.documentTypes.save(documentType);
    }

    // Alias used in demos / Wayne feedback — routes like Product Architecture.
    let architectureDoc = await this.db.documentTypes.findOne({ where: { code: 'ARCH_DOC' } });
    if (!architectureDoc) {
      architectureDoc = this.db.documentTypes.create({
        code: 'ARCH_DOC',
        name: 'Architecture Doc',
        description: 'Architecture document (alias for Product Architecture routing).',
        active: true,
      });
      await this.db.documentTypes.save(architectureDoc);
    } else {
      architectureDoc.name = 'Architecture Doc';
      architectureDoc.active = true;
      await this.db.documentTypes.save(architectureDoc);
    }

    const fileTypes: Array<[string, string, string[], number, boolean]> = [
      ['docx', 'Microsoft Word Document', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 50, true],
      ['pdf', 'PDF Document', ['application/pdf'], 50, true],
      ['xlsx', 'Microsoft Excel Workbook', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], 50, true],
      ['pptx', 'Microsoft PowerPoint Presentation', ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], 50, true],
      ['md', 'Markdown Document', ['text/markdown', 'text/plain'], 10, true], ['txt', 'Plain Text Document', ['text/plain'], 10, true],
      ['csv', 'CSV Dataset', ['text/csv'], 25, true], ['png', 'PNG Image', ['image/png'], 25, false],
      ['jpg', 'JPEG Image', ['image/jpeg'], 25, false], ['zip', 'Developer Pack Archive', ['application/zip'], 100, false],
    ];
    for (const [extension, label, mimeTypes, maxSizeMb, allowMetadataExtraction] of fileTypes) {
      let row = await this.db.fileTypes.findOne({ where: { extension } });
      if (!row) row = this.db.fileTypes.create({ extension, label, mimeTypes, maxSizeMb, allowMetadataExtraction, active: true });
      else Object.assign(row, { label, mimeTypes, maxSizeMb, allowMetadataExtraction, active: true });
      await this.db.fileTypes.save(row);
    }

    const metadata: Array<[string, string, string, boolean, number]> = [
      ['title', 'Document Title', 'TEXT', true, 1], ['documentType', 'Document Type', 'TEXT', true, 2],
      ['versionNo', 'Version', 'VERSION', true, 3], ['approvalStatus', 'Approval Status', 'STATUS', true, 4],
      ['approvedBy', 'Approved By', 'TEXT', true, 5], ['approvalDate', 'Approval Date', 'DATE', true, 6],
      ['owner', 'Document Owner', 'TEXT', false, 7], ['description', 'Description', 'TEXTAREA', false, 8],
    ];
    for (const [key, label, dataType, required, position] of metadata) {
      let row = await this.db.metadataFields.findOne({ where: { key } });
      if (!row) row = this.db.metadataFields.create({ key, label, dataType, required, position, active: true, description: null, validationRule: null, defaultValue: null });
      else Object.assign(row, { label, dataType, required, position, active: true });
      await this.db.metadataFields.save(row);
    }

    // Seed default routes only when missing — never wipe admin-customised priorities on restart.
    for (let index = 0; index < DEFAULT_SECTIONS.length; index += 1) {
      const [sectionKey, , name] = DEFAULT_SECTIONS[index];
      if (['VERSION_REGISTER', 'MASTER_DOCUMENT_INDEX'].includes(sectionKey)) continue;
      const ruleName = `Default route: ${name}`;
      const existing = await this.db.routingRules.findOne({ where: { name: ruleName } });
      if (!existing) {
        const priority = 100 + index;
        const conflict = await this.db.routingRules.findOne({ where: { priority } });
        const rule = this.db.routingRules.create({
          name: ruleName,
          project: null,
          sourceSystem: null,
          documentType: name,
          fileExtension: null,
          metadataKey: null,
          metadataValue: null,
          targetSectionKey: sectionKey,
          priority: conflict ? 1000 + index : priority,
          active: true,
        });
        await this.db.routingRules.save(rule);
      }
    }

    const archRuleName = 'Default route: Architecture Doc';
    if (!(await this.db.routingRules.findOne({ where: { name: archRuleName } }))) {
      const priority = 90;
      const conflict = await this.db.routingRules.findOne({ where: { priority } });
      await this.db.routingRules.save(this.db.routingRules.create({
        name: archRuleName,
        project: null,
        sourceSystem: null,
        documentType: 'Architecture Doc',
        fileExtension: null,
        metadataKey: null,
        metadataValue: null,
        targetSectionKey: 'PRODUCT_ARCHITECTURE',
        priority: conflict ? 89 : priority,
        active: true,
      }));
    }

    const settings: Array<[string, unknown, string]> = [
      ['gateway.designPrinciple', 'Lightweight approved-document import middleware; not a DMS, CMS or KMS.', 'RFP-001 design boundary.'],
      ['gateway.requireApprovedOnly', true, 'Reject non-approved documents.'],
      ['gateway.defaultDirectoryTemplate', template.code, 'Default directory configuration for new projects. Change via Directory Templates → Set as default.'],
      ['gateway.storageMode', 'VPS_LOCAL_FILESYSTEM', 'Approved files and generated registers are stored on the mounted VPS filesystem.'],
    ];
    for (const [key, value, description] of settings) {
      let row = await this.db.systemSettings.findOne({ where: { key } });
      if (!row) row = this.db.systemSettings.create({ key, value, description });
      else if (key !== 'gateway.defaultDirectoryTemplate') {
        // Preserve admin-chosen default template code across restarts.
        Object.assign(row, { value, description });
      } else {
        const currentDefault = await this.db.directoryTemplates.findOne({ where: { isDefault: true } });
        row.value = currentDefault?.code ?? value;
        row.description = description;
      }
      await this.db.systemSettings.save(row);
    }

    // Promote older ChatGPT MCP jobs stuck in RECEIVED so they appear in Import Queue.
    const promoted = await this.db.importJobs
      .createQueryBuilder()
      .update()
      .set({
        status: ImportStatus.READY_FOR_REVIEW,
        externalImportStatus: ExternalImportStatus.READY_FOR_REVIEW,
      })
      .where('provider = :provider', { provider: ConnectorProvider.CHATGPT_MCP })
      .andWhere('status = :status', { status: ImportStatus.RECEIVED })
      .execute();
    if (promoted.affected) {
      this.logger.log(`Promoted ${promoted.affected} ChatGPT MCP import job(s) to READY_FOR_REVIEW`);
    }

    this.logger.log('Repository gateway default configuration is ready.');
  }
}
