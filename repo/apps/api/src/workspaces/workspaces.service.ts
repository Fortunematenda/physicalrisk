import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { DatabaseService } from '../database/database.service';
import {
  RepositoryWorkspace,
  User,
  UserRole,
  WorkspaceActivitySource,
  WorkspaceDocument,
  WorkspaceDocumentStatus,
  WorkspaceStatus,
  WorkspaceStep,
} from '../database/entities';
import { WorkspaceCodeService } from './workspace-code.service';
import { WorkspaceErrors } from './workspace.errors';

const OPEN_STATUSES: WorkspaceStatus[] = [
  WorkspaceStatus.DRAFT,
  WorkspaceStatus.UPLOADING,
  WorkspaceStatus.METADATA_REVIEW,
  WorkspaceStatus.VALIDATION_REQUIRED,
  WorkspaceStatus.READY_TO_IMPORT,
  WorkspaceStatus.IMPORTING,
  WorkspaceStatus.PAUSED,
  WorkspaceStatus.PARTIALLY_COMPLETED,
];

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly codes: WorkspaceCodeService,
    private readonly audit: AuditService,
  ) {}

  private assertUser(user?: { id?: string } | null): string {
    if (!user?.id) throw WorkspaceErrors.authRequired();
    return user.id;
  }

  private async loadUser(userId: string) {
    const user = await this.db.users.findOne({ where: { id: userId } });
    if (!user) throw WorkspaceErrors.authRequired();
    return user;
  }

  private canSeeAll(user: User) {
    return user.role === UserRole.ADMIN || user.role === UserRole.REVIEWER;
  }

  private serialize(workspace: RepositoryWorkspace) {
    const remaining = Math.max(0, (workspace.totalDocuments ?? 0) - (workspace.completedDocuments ?? 0));
    return {
      id: workspace.id,
      workspaceCode: workspace.workspaceCode,
      name: workspace.name,
      projectId: workspace.project?.id,
      projectCode: workspace.project?.code,
      projectName: workspace.project?.name,
      createdByUserId: workspace.createdBy?.id,
      createdByName: workspace.createdBy?.name,
      createdByEmail: workspace.createdBy?.email,
      status: workspace.status,
      currentStep: workspace.currentStep,
      totalDocuments: workspace.totalDocuments,
      completedDocuments: workspace.completedDocuments,
      remainingDocuments: remaining,
      progressPercent: workspace.totalDocuments
        ? Math.round((workspace.completedDocuments / workspace.totalDocuments) * 100)
        : 0,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  private serializeDocument(doc: WorkspaceDocument) {
    return {
      id: doc.id,
      fileName: doc.fileName,
      originalFileName: doc.originalFileName,
      relativePath: doc.relativePath,
      storageReference: doc.storageReference,
      mimeType: doc.mimeType,
      fileExtension: doc.fileExtension,
      checksum: doc.checksum,
      status: doc.status,
      documentId: doc.document?.id ?? null,
      documentCode: (doc.document as { code?: string } | null)?.code ?? null,
      importJobId: doc.importJob?.id ?? null,
      metadataJson: doc.metadataJson,
      validationJson: doc.validationJson,
      routingJson: doc.routingJson,
      errorJson: doc.errorJson,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async requireWorkspace(workspaceCode: string, userId: string) {
    const user = await this.loadUser(userId);
    const workspace = await this.db.workspaces.findOne({
      where: { workspaceCode },
      relations: { project: true, createdBy: true },
    });
    if (!workspace) throw WorkspaceErrors.notFound(workspaceCode);
    if (!this.canSeeAll(user) && workspace.createdBy?.id !== userId) {
      throw WorkspaceErrors.accessDenied();
    }
    return { workspace, user };
  }

  async recordActivity(
    workspace: RepositoryWorkspace,
    action: string,
    source: WorkspaceActivitySource,
    userId?: string | null,
    details?: Record<string, unknown>,
    correlationId?: string,
  ) {
    const activity = this.db.workspaceActivities.create({
      workspace,
      user: userId ? ({ id: userId } as User) : null,
      action,
      source,
      detailsJson: details ?? null,
      correlationId: correlationId ?? randomUUID(),
    });
    await this.db.workspaceActivities.save(activity);
    return activity;
  }

  async refreshProgress(workspaceId: string) {
    const docs = await this.db.workspaceDocuments.find({
      where: { workspace: { id: workspaceId } },
    });
    const active = docs.filter((d) => d.status !== WorkspaceDocumentStatus.REMOVED);
    const completed = active.filter((d) => d.status === WorkspaceDocumentStatus.IMPORTED).length;
    const failed = active.filter((d) => d.status === WorkspaceDocumentStatus.FAILED).length;
    const total = active.length;

    const workspace = await this.db.workspaces.findOne({ where: { id: workspaceId } });
    if (!workspace) return null;

    workspace.totalDocuments = total;
    workspace.completedDocuments = completed;

    if (workspace.status === WorkspaceStatus.CANCELLED || workspace.status === WorkspaceStatus.ARCHIVED) {
      await this.db.workspaces.save(workspace);
      return workspace;
    }

    if (total > 0 && completed === total) {
      workspace.status = WorkspaceStatus.COMPLETED;
      workspace.currentStep = WorkspaceStep.COMPLETE;
    } else if (completed > 0 && failed > 0 && completed + failed === total) {
      workspace.status = WorkspaceStatus.PARTIALLY_COMPLETED;
      workspace.currentStep = WorkspaceStep.IMPORT;
    }

    await this.db.workspaces.save(workspace);
    return workspace;
  }

  async create(
    input: { name: string; projectId: string; source?: WorkspaceActivitySource },
    user?: { id?: string } | null,
  ) {
    const userId = this.assertUser(user);
    const actor = await this.loadUser(userId);
    const project = await this.db.projects.findOne({ where: { id: input.projectId } });
    if (!project) throw WorkspaceErrors.projectAccessDenied();

    const workspaceCode = await this.codes.nextCode('WS');
    const workspace = await this.db.workspaces.save(this.db.workspaces.create({
      workspaceCode,
      name: input.name.trim() || 'Untitled workspace',
      project,
      createdBy: actor,
      status: WorkspaceStatus.DRAFT,
      currentStep: WorkspaceStep.UPLOAD,
      totalDocuments: 0,
      completedDocuments: 0,
    }));

    const source = input.source ?? WorkspaceActivitySource.WEB;
    await this.recordActivity(workspace, 'WORKSPACE_CREATED', source, userId, {
      workspaceCode,
      projectCode: project.code,
    });
    await this.audit.record({
      userId,
      action: 'WORKSPACE_CREATE',
      entityType: 'RepositoryWorkspace',
      entityId: workspace.id,
      message: `Created workspace ${workspaceCode}`,
      after: { workspaceCode, projectId: project.id },
    });

    const loaded = await this.db.workspaces.findOne({
      where: { id: workspace.id },
      relations: { project: true, createdBy: true },
    });
    return this.serialize(loaded!);
  }

  async list(filters: {
    workspaceCode?: string;
    name?: string;
    projectCode?: string;
    status?: string;
    mine?: boolean;
    documentCode?: string;
    importJobId?: string;
  }, user?: { id?: string } | null) {
    const userId = this.assertUser(user);
    const actor = await this.loadUser(userId);
    const qb = this.db.workspaces.createQueryBuilder('workspace')
      .leftJoinAndSelect('workspace.project', 'project')
      .leftJoinAndSelect('workspace.createdBy', 'createdBy')
      .orderBy('workspace.updatedAt', 'DESC');

    if (!this.canSeeAll(actor) || filters.mine) {
      qb.andWhere('createdBy.id = :userId', { userId });
    }
    if (filters.workspaceCode) {
      qb.andWhere('workspace.workspaceCode ILIKE :code', { code: `%${filters.workspaceCode}%` });
    }
    if (filters.name) {
      qb.andWhere('workspace.name ILIKE :name', { name: `%${filters.name}%` });
    }
    if (filters.projectCode) {
      qb.andWhere('project.code ILIKE :projectCode', { projectCode: `%${filters.projectCode}%` });
    }
    if (filters.status) {
      qb.andWhere('workspace.status = :status', { status: filters.status });
    }
    if (filters.documentCode) {
      qb.innerJoin('workspace.documents', 'wd')
        .innerJoin('wd.document', 'doc')
        .andWhere('doc.code ILIKE :documentCode', { documentCode: `%${filters.documentCode}%` });
    }
    if (filters.importJobId) {
      qb.innerJoin('workspace.importJobs', 'job')
        .andWhere('job.id = :importJobId', { importJobId: filters.importJobId });
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.serialize(row));
  }

  async search(q: string, user?: { id?: string } | null) {
    const term = q?.trim();
    if (!term) return this.list({}, user);
    return this.list({
      workspaceCode: term,
      name: term,
      projectCode: term,
      mine: true,
    }, user);
  }

  async latest(user?: { id?: string } | null) {
    const userId = this.assertUser(user);
    const row = await this.db.workspaces.findOne({
      where: { createdBy: { id: userId } },
      relations: { project: true, createdBy: true },
      order: { updatedAt: 'DESC' },
    });
    return row ? this.serialize(row) : null;
  }

  async latestPending(user?: { id?: string } | null) {
    const userId = this.assertUser(user);
    const rows = await this.db.workspaces.find({
      where: { createdBy: { id: userId }, status: In(OPEN_STATUSES) },
      relations: { project: true, createdBy: true },
      order: { updatedAt: 'DESC' },
      take: 10,
    });
    if (!rows.length) return { match: null, choices: [] };
    if (rows.length === 1) return { match: this.serialize(rows[0]), choices: [] };
    return {
      match: null,
      choices: rows.map((row) => this.serialize(row)),
    };
  }

  async get(workspaceCode: string, user?: { id?: string } | null) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    return this.serialize(workspace);
  }

  async update(
    workspaceCode: string,
    input: { name?: string; status?: WorkspaceStatus; currentStep?: WorkspaceStep },
    user?: { id?: string } | null,
    source: WorkspaceActivitySource = WorkspaceActivitySource.WEB,
  ) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    if (input.name !== undefined) workspace.name = input.name.trim();
    if (input.status !== undefined) workspace.status = input.status;
    if (input.currentStep !== undefined) workspace.currentStep = input.currentStep;
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_UPDATED', source, userId, input as Record<string, unknown>);
    return this.get(workspaceCode, user);
  }

  async pause(workspaceCode: string, user?: { id?: string } | null, source = WorkspaceActivitySource.WEB) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    if (workspace.status === WorkspaceStatus.COMPLETED) throw WorkspaceErrors.alreadyCompleted();
    workspace.status = WorkspaceStatus.PAUSED;
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_PAUSED', source, userId);
    return this.get(workspaceCode, user);
  }

  async resume(workspaceCode: string, user?: { id?: string } | null, source = WorkspaceActivitySource.WEB) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    if (workspace.status === WorkspaceStatus.ARCHIVED || workspace.status === WorkspaceStatus.CANCELLED) {
      throw WorkspaceErrors.notReady('Archived or cancelled workspaces cannot be resumed');
    }
    workspace.status = workspace.totalDocuments > 0
      ? WorkspaceStatus.METADATA_REVIEW
      : WorkspaceStatus.DRAFT;
    workspace.currentStep = workspace.totalDocuments > 0 ? WorkspaceStep.METADATA : WorkspaceStep.UPLOAD;
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_RESUMED', source, userId);
    return this.get(workspaceCode, user);
  }

  async validate(workspaceCode: string, user?: { id?: string } | null, source = WorkspaceActivitySource.WEB) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    const docs = await this.db.workspaceDocuments.find({ where: { workspace: { id: workspace.id } } });
    const active = docs.filter((d) => d.status !== WorkspaceDocumentStatus.REMOVED);
    const failed = active.filter((d) => d.status === WorkspaceDocumentStatus.VALIDATION_FAILED);
    if (!active.length) throw WorkspaceErrors.notReady('Add documents before validating');
    if (failed.length) {
      workspace.status = WorkspaceStatus.VALIDATION_REQUIRED;
      workspace.currentStep = WorkspaceStep.VALIDATION;
    } else {
      workspace.status = WorkspaceStatus.READY_TO_IMPORT;
      workspace.currentStep = WorkspaceStep.IMPORT;
    }
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_VALIDATED', source, userId, {
      total: active.length,
      failed: failed.length,
    });
    return this.summary(workspaceCode, user);
  }

  async submit(workspaceCode: string, user?: { id?: string } | null, source = WorkspaceActivitySource.WEB) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    if (workspace.status === WorkspaceStatus.COMPLETED) throw WorkspaceErrors.alreadyCompleted();
    if (![WorkspaceStatus.READY_TO_IMPORT, WorkspaceStatus.PARTIALLY_COMPLETED, WorkspaceStatus.METADATA_REVIEW].includes(workspace.status)) {
      throw WorkspaceErrors.notReady('Validate the workspace before submit');
    }
    workspace.status = WorkspaceStatus.IMPORTING;
    workspace.currentStep = WorkspaceStep.IMPORT;
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_SUBMITTED', source, userId);
    // Actual import remains in existing ImportsService — mark ready docs as IMPORTING.
    const docs = await this.db.workspaceDocuments.find({ where: { workspace: { id: workspace.id } } });
    for (const doc of docs) {
      if (doc.status === WorkspaceDocumentStatus.READY || doc.status === WorkspaceDocumentStatus.EXTRACTED) {
        doc.status = WorkspaceDocumentStatus.IMPORTING;
        await this.db.workspaceDocuments.save(doc);
      }
    }
    await this.refreshProgress(workspace.id);
    return this.summary(workspaceCode, user);
  }

  async cancel(workspaceCode: string, user?: { id?: string } | null, source = WorkspaceActivitySource.WEB) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    workspace.status = WorkspaceStatus.CANCELLED;
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_CANCELLED', source, userId);
    return this.get(workspaceCode, user);
  }

  async archive(workspaceCode: string, user?: { id?: string } | null, source = WorkspaceActivitySource.WEB) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    workspace.status = WorkspaceStatus.ARCHIVED;
    await this.db.workspaces.save(workspace);
    await this.recordActivity(workspace, 'WORKSPACE_ARCHIVED', source, userId);
    return this.get(workspaceCode, user);
  }

  async listDocuments(workspaceCode: string, user?: { id?: string } | null) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    const docs = await this.db.workspaceDocuments.find({
      where: { workspace: { id: workspace.id } },
      relations: { document: true, importJob: true },
      order: { createdAt: 'ASC' },
    });
    return docs.map((doc) => this.serializeDocument(doc));
  }

  async addDocument(
    workspaceCode: string,
    input: {
      fileName: string;
      originalFileName?: string;
      relativePath?: string;
      storageReference?: string;
      mimeType?: string;
      fileExtension?: string;
      checksum?: string;
      metadataJson?: Record<string, unknown>;
      importJobId?: string;
      status?: WorkspaceDocumentStatus;
    },
    user?: { id?: string } | null,
    source = WorkspaceActivitySource.WEB,
  ) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    const relativePath = input.relativePath
      ? input.relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\./g, '')
      : null;
    const doc = await this.db.workspaceDocuments.save(this.db.workspaceDocuments.create({
      workspace,
      fileName: input.fileName,
      originalFileName: input.originalFileName ?? input.fileName,
      relativePath,
      storageReference: input.storageReference ?? null,
      mimeType: input.mimeType ?? null,
      fileExtension: input.fileExtension ?? null,
      checksum: input.checksum ?? null,
      metadataJson: input.metadataJson ?? null,
      status: input.status ?? WorkspaceDocumentStatus.PENDING,
      importJob: input.importJobId ? ({ id: input.importJobId } as never) : null,
    }));
    if (workspace.status === WorkspaceStatus.DRAFT) {
      workspace.status = WorkspaceStatus.METADATA_REVIEW;
      workspace.currentStep = WorkspaceStep.METADATA;
      await this.db.workspaces.save(workspace);
    }
    await this.refreshProgress(workspace.id);
    await this.recordActivity(workspace, 'WORKSPACE_DOCUMENT_ADDED', source, userId, {
      fileName: doc.fileName,
      relativePath: doc.relativePath,
    });
    return this.serializeDocument(doc);
  }

  async updateDocument(
    workspaceCode: string,
    documentId: string,
    input: Partial<{
      status: WorkspaceDocumentStatus;
      metadataJson: Record<string, unknown>;
      validationJson: Record<string, unknown>;
      routingJson: Record<string, unknown>;
      errorJson: Record<string, unknown>;
      documentId: string | null;
      importJobId: string | null;
    }>,
    user?: { id?: string } | null,
    source = WorkspaceActivitySource.WEB,
  ) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    const doc = await this.db.workspaceDocuments.findOne({
      where: { id: documentId, workspace: { id: workspace.id } },
      relations: { document: true, importJob: true },
    });
    if (!doc) throw WorkspaceErrors.notFound();
    if (input.status !== undefined) doc.status = input.status;
    if (input.metadataJson !== undefined) doc.metadataJson = input.metadataJson;
    if (input.validationJson !== undefined) doc.validationJson = input.validationJson;
    if (input.routingJson !== undefined) doc.routingJson = input.routingJson;
    if (input.errorJson !== undefined) doc.errorJson = input.errorJson;
    if (input.documentId !== undefined) {
      doc.document = input.documentId ? ({ id: input.documentId } as never) : null;
    }
    if (input.importJobId !== undefined) {
      doc.importJob = input.importJobId ? ({ id: input.importJobId } as never) : null;
    }
    await this.db.workspaceDocuments.save(doc);
    await this.refreshProgress(workspace.id);
    await this.recordActivity(workspace, 'WORKSPACE_DOCUMENT_UPDATED', source, userId, { documentId });
    return this.serializeDocument(doc);
  }

  async removeDocument(
    workspaceCode: string,
    documentId: string,
    user?: { id?: string } | null,
    source = WorkspaceActivitySource.WEB,
  ) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    const doc = await this.db.workspaceDocuments.findOne({
      where: { id: documentId, workspace: { id: workspace.id } },
    });
    if (!doc) throw WorkspaceErrors.notFound();
    doc.status = WorkspaceDocumentStatus.REMOVED;
    await this.db.workspaceDocuments.save(doc);
    await this.refreshProgress(workspace.id);
    await this.recordActivity(workspace, 'WORKSPACE_DOCUMENT_REMOVED', source, userId, { documentId });
    return { removed: true, id: documentId };
  }

  async activity(workspaceCode: string, user?: { id?: string } | null) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);
    const rows = await this.db.workspaceActivities.find({
      where: { workspace: { id: workspace.id } },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      source: row.source,
      detailsJson: row.detailsJson,
      correlationId: row.correlationId,
      userId: row.user?.id ?? null,
      userName: row.user?.name ?? null,
      createdAt: row.createdAt,
    }));
  }

  async summary(workspaceCode: string, user?: { id?: string } | null) {
    const workspace = await this.get(workspaceCode, user);
    const documents = await this.listDocuments(workspaceCode, user);
    const byStatus = documents.reduce<Record<string, number>>((acc, doc) => {
      acc[doc.status] = (acc[doc.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      ...workspace,
      documentsByStatus: byStatus,
      documents,
    };
  }

  /**
   * Display path for workspace UI (ZIP members have zip-relative paths; MCP attach did not).
   * Prefer version storagePath; else section/code/fileName.
   */
  private async resolveWorkspaceRelativePath(
    documentId: string | undefined,
    fileName: string,
  ): Promise<{ relativePath: string; fileName: string; mimeType: string | null; storageReference: string | null }> {
    const safeName = (fileName || 'document.pdf').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!documentId) {
      return {
        relativePath: safeName,
        fileName: safeName,
        mimeType: 'application/pdf',
        storageReference: null,
      };
    }
    const doc = await this.db.documents.findOne({
      where: { id: documentId },
      relations: { section: true, versions: true },
    });
    const version = (doc?.versions ?? []).find((item) => item.versionNo === doc?.currentVersionNo)
      ?? (doc?.versions ?? [])[0];
    const storagePath = version?.storagePath?.replace(/\\/g, '/').replace(/\.\./g, '') || null;
    const sectionPath = (doc?.section?.relativePath || doc?.section?.name || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const code = doc?.code || 'document';
    const baseName = safeName.includes('.') ? safeName : `${safeName}.pdf`;

    let relativePath: string;
    if (storagePath) {
      // Show path from module folder onward when under a project repository tree.
      const marker = sectionPath ? `/${sectionPath}/` : null;
      const idx = marker ? storagePath.toLowerCase().indexOf(marker.toLowerCase()) : -1;
      relativePath = idx >= 0
        ? storagePath.slice(idx + 1)
        : storagePath.split('/').slice(-4).join('/');
    } else if (sectionPath) {
      relativePath = `${sectionPath}/${code}/${baseName}`;
    } else {
      relativePath = `${code}/${baseName}`;
    }

    return {
      relativePath: relativePath.replace(/\\/g, '/').replace(/\.\./g, ''),
      fileName: baseName,
      mimeType: version?.mimeType || 'application/pdf',
      storageReference: storagePath,
    };
  }

  /**
   * Link an already-imported repository document (or import job) to a workspace.
   * Used when MCP/ChatGPT imported without workspaceCode, or to attach PROR-PA-00x after the fact.
   */
  async attachRepositoryDocument(
    workspaceCode: string,
    input: {
      documentId?: string;
      documentCode?: string;
      importJobId?: string;
      fileName?: string;
    },
    user?: { id?: string } | null,
    source = WorkspaceActivitySource.API,
  ) {
    const userId = this.assertUser(user);
    const { workspace } = await this.requireWorkspace(workspaceCode, userId);

    let documentId = input.documentId?.trim() || undefined;
    let fileName = input.fileName?.trim() || undefined;
    let importJobId = input.importJobId?.trim() || undefined;

    if (!documentId && input.documentCode?.trim()) {
      const doc = await this.db.documents.findOne({
        where: { code: input.documentCode.trim() },
        relations: { project: true },
      });
      if (!doc) throw new NotFoundException(`Document ${input.documentCode} was not found`);
      if (doc.project?.id && workspace.project?.id && doc.project.id !== workspace.project.id) {
        throw new BadRequestException(
          `Document ${doc.code} belongs to a different project than workspace ${workspaceCode}`,
        );
      }
      documentId = doc.id;
      fileName = fileName || doc.title;
    }

    if (!documentId && importJobId) {
      const job = await this.db.importJobs.findOne({
        where: { id: importJobId },
        relations: { document: true },
      });
      if (!job) throw new NotFoundException(`Import job ${importJobId} was not found`);
      documentId = job.document?.id;
      fileName = fileName || job.fileName;
    }

    if (!documentId && !importJobId) {
      throw new BadRequestException('Provide documentId, documentCode, or importJobId');
    }

    const pathInfo = await this.resolveWorkspaceRelativePath(documentId, fileName || 'document.pdf');

    if (documentId) {
      const existing = await this.db.workspaceDocuments.findOne({
        where: { workspace: { id: workspace.id }, document: { id: documentId } },
        relations: { document: true, importJob: true },
      });
      if (existing) {
        // Backfill path for rows attached before MCP set relativePath.
        if (!existing.relativePath) {
          existing.relativePath = pathInfo.relativePath;
          existing.storageReference = existing.storageReference || pathInfo.storageReference;
          existing.mimeType = existing.mimeType || pathInfo.mimeType;
          existing.fileName = existing.fileName || pathInfo.fileName;
          await this.db.workspaceDocuments.save(existing);
        }
        return {
          alreadyAttached: true,
          workspaceCode,
          document: this.serializeDocument(existing),
        };
      }
    }

    const docRow = await this.db.workspaceDocuments.save(this.db.workspaceDocuments.create({
      workspace,
      fileName: pathInfo.fileName,
      originalFileName: pathInfo.fileName,
      relativePath: pathInfo.relativePath,
      storageReference: pathInfo.storageReference,
      mimeType: pathInfo.mimeType,
      fileExtension: pathInfo.fileName.includes('.') ? pathInfo.fileName.split('.').pop()! : 'pdf',
      checksum: null,
      metadataJson: null,
      status: documentId ? WorkspaceDocumentStatus.IMPORTED : WorkspaceDocumentStatus.PENDING,
      importJob: importJobId ? ({ id: importJobId } as never) : null,
      document: documentId ? ({ id: documentId } as never) : null,
    }));

    if (importJobId) {
      const job = await this.db.importJobs.findOne({ where: { id: importJobId } });
      if (job) {
        job.workspace = workspace;
        await this.db.importJobs.save(job);
      }
    }

    if (
      workspace.status === WorkspaceStatus.DRAFT
      || workspace.currentStep === WorkspaceStep.UPLOAD
    ) {
      workspace.status = WorkspaceStatus.METADATA_REVIEW;
      workspace.currentStep = WorkspaceStep.METADATA;
      await this.db.workspaces.save(workspace);
    }
    await this.refreshProgress(workspace.id);
    await this.recordActivity(workspace, 'WORKSPACE_DOCUMENT_ATTACHED', source, userId, {
      documentId,
      documentCode: input.documentCode,
      importJobId,
    });

    const saved = await this.db.workspaceDocuments.findOne({
      where: { id: docRow.id },
      relations: { document: true, importJob: true },
    });
    return {
      alreadyAttached: false,
      workspaceCode,
      document: this.serializeDocument(saved!),
      workspace: await this.get(workspaceCode, user),
    };
  }

  /**
   * Called from ImportsService after ZIP extraction / import linkage.
   * Creates or reuses a workspace and attaches WorkspaceDocument rows.
   */
  async attachImportJob(options: {
    workspaceId?: string | null;
    workspaceCode?: string | null;
    createIfMissing?: { name: string; projectId: string };
    importJobId: string;
    userId?: string;
    source?: WorkspaceActivitySource;
    members?: Array<{
      fileName: string;
      relativePath?: string;
      mimeType?: string;
      checksum?: string;
      storageReference?: string;
      documentId?: string;
      status?: WorkspaceDocumentStatus;
    }>;
  }) {
    let workspace: RepositoryWorkspace | null = null;
    if (options.workspaceCode) {
      workspace = await this.db.workspaces.findOne({
        where: { workspaceCode: options.workspaceCode },
        relations: { project: true },
      });
    } else if (options.workspaceId) {
      workspace = await this.db.workspaces.findOne({
        where: { id: options.workspaceId },
        relations: { project: true },
      });
    } else if (options.createIfMissing && options.userId) {
      const created = await this.create({
        name: options.createIfMissing.name,
        projectId: options.createIfMissing.projectId,
        source: options.source ?? WorkspaceActivitySource.SYSTEM,
      }, { id: options.userId });
      workspace = await this.db.workspaces.findOne({
        where: { id: created.id },
        relations: { project: true },
      });
    }
    if (!workspace) return null;

    const job = await this.db.importJobs.findOne({ where: { id: options.importJobId } });
    if (job) {
      job.workspace = workspace;
      await this.db.importJobs.save(job);
    }

    for (const member of options.members ?? []) {
      const pathInfo = member.relativePath?.trim()
        ? {
            relativePath: member.relativePath.replace(/\\/g, '/').replace(/\.\./g, ''),
            fileName: member.fileName,
            mimeType: member.mimeType ?? null,
            storageReference: member.storageReference ?? null,
          }
        : await this.resolveWorkspaceRelativePath(member.documentId, member.fileName);
      await this.db.workspaceDocuments.save(this.db.workspaceDocuments.create({
        workspace,
        fileName: pathInfo.fileName || member.fileName,
        originalFileName: member.fileName,
        relativePath: pathInfo.relativePath,
        mimeType: pathInfo.mimeType ?? member.mimeType ?? null,
        checksum: member.checksum ?? null,
        storageReference: pathInfo.storageReference ?? member.storageReference ?? null,
        status: member.status ?? WorkspaceDocumentStatus.EXTRACTED,
        importJob: job ?? null,
        document: member.documentId ? ({ id: member.documentId } as never) : null,
      }));
    }

    workspace.status = WorkspaceStatus.METADATA_REVIEW;
    workspace.currentStep = WorkspaceStep.METADATA;
    await this.db.workspaces.save(workspace);
    await this.refreshProgress(workspace.id);
    await this.recordActivity(
      workspace,
      'IMPORT_ATTACHED',
      options.source ?? WorkspaceActivitySource.SYSTEM,
      options.userId,
      { importJobId: options.importJobId, members: options.members?.length ?? 0 },
    );
    return workspace.workspaceCode;
  }
}
