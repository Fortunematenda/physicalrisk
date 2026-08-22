import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { IsNull, Not } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { verifyStoredBinaryIntegrity } from '../common/binary-integrity.util';
import { VpsStorageService } from '../storage/vps-storage.service';
import { DatabaseService } from '../database/database.service';
import {
  Document,
  DocumentRelationship,
  DocumentStatus,
  DocumentVersion,
  RelationshipType,
} from '../database/entities';

const RECYCLE_BIN_RETENTION_DAYS = 30;

@Injectable()
export class DocumentsService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService, private readonly storage: VpsStorageService) {}

  private recycleBinPurgeAfter(from = new Date()) {
    return new Date(from.getTime() + RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  }

  private assertNotInBin(document: Document) {
    if (document.deletedAt) {
      throw new NotFoundException('Document not found (it is in the recycle bin)');
    }
  }

  async list(filters: { projectId?: string; sectionId?: string; search?: string; status?: string }) {
    // Heal Index/Explorer drift: DB rows whose files were wiped by older deletes.
    await this.purgeMissingStorage(filters.projectId).catch(() => undefined);

    const qb = this.db.documents.createQueryBuilder('document')
      .leftJoinAndSelect('document.project', 'project')
      .leftJoinAndSelect('document.section', 'section')
      .leftJoinAndSelect('document.versions', 'versions')
      .where('document.deletedAt IS NULL')
      .orderBy('document.updatedAt', 'DESC');
    if (filters.projectId) qb.andWhere('project.id = :projectId', { projectId: filters.projectId });
    if (filters.sectionId) qb.andWhere('section.id = :sectionId', { sectionId: filters.sectionId });
    if (filters.status) qb.andWhere('document.status = :status', { status: filters.status });
    if (filters.search) qb.andWhere('(document.title ILIKE :search OR document.code ILIKE :search OR document.documentType ILIKE :search)', { search: `%${filters.search}%` });
    const documents = await qb.getMany();
    return Promise.all(documents.map(async (document) => {
      const [outgoing, incoming] = await Promise.all([
        this.db.documentRelationships.count({ where: { fromDocument: { id: document.id } } }),
        this.db.documentRelationships.count({ where: { toDocument: { id: document.id } } }),
      ]);
      const versions = [...(document.versions ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return {
        ...document,
        versions,
        _count: { versions: versions.length, outgoingRelationships: outgoing, incomingRelationships: incoming },
      };
    }));
  }

  async listBin(filters: { projectId?: string; search?: string } = {}) {
    const qb = this.db.documents.createQueryBuilder('document')
      .leftJoinAndSelect('document.project', 'project')
      .leftJoinAndSelect('document.section', 'section')
      .leftJoinAndSelect('document.deletedBy', 'deletedBy')
      .leftJoinAndSelect('document.versions', 'versions')
      .where('document.deletedAt IS NOT NULL')
      .orderBy('document.deletedAt', 'DESC');
    if (filters.projectId) qb.andWhere('project.id = :projectId', { projectId: filters.projectId });
    if (filters.search) {
      qb.andWhere(
        '(document.title ILIKE :search OR document.code ILIKE :search OR document.binOriginalCode ILIKE :search OR document.documentType ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }
    const documents = await qb.getMany();
    const now = Date.now();
    return documents.map((document) => {
      const displayCode = document.binOriginalCode || document.code;
      const purgeAfter = document.purgeAfter ? new Date(document.purgeAfter) : null;
      const daysRemaining = purgeAfter
        ? Math.max(0, Math.ceil((purgeAfter.getTime() - now) / (24 * 60 * 60 * 1000)))
        : null;
      return {
        id: document.id,
        code: displayCode,
        binCode: document.code,
        title: document.title,
        documentType: document.documentType,
        status: document.status,
        currentVersionNo: document.currentVersionNo,
        deletedAt: document.deletedAt,
        purgeAfter: document.purgeAfter,
        daysRemaining,
        deletedBy: document.deletedBy
          ? { id: document.deletedBy.id, name: document.deletedBy.name, email: document.deletedBy.email }
          : null,
        project: document.project
          ? { id: document.project.id, code: document.project.code, name: document.project.name }
          : null,
        section: document.section
          ? { id: document.section.id, name: document.section.name }
          : null,
        versionCount: document.versions?.length ?? 0,
      };
    });
  }

  async get(id: string) {
    const document = await this.db.documents.findOne({
      where: { id },
      relations: {
        project: true,
        section: true,
        versions: { createdBy: true },
        noteEntries: { createdBy: true },
        outgoingRelationships: { toDocument: { project: true, section: true }, createdBy: true },
        incomingRelationships: { fromDocument: { project: true, section: true }, createdBy: true },
        importJobs: { sourceSystem: true, initiatedBy: true },
      },
      order: {
        noteEntries: { createdAt: 'ASC' },
      },
    });
    if (!document || document.deletedAt) throw new NotFoundException('Document not found');
    document.versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    document.importJobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    document.noteEntries = [...(document.noteEntries ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    // One-time migration: legacy single notes field → trail entry.
    if (document.notes?.trim() && document.noteEntries.length === 0) {
      const migrated = this.db.documentNotes.create({
        document,
        body: document.notes.trim(),
        createdBy: null,
      });
      await this.db.documentNotes.save(migrated);
      document.notes = null;
      await this.db.documents.save(document);
      document.noteEntries = [await this.db.documentNotes.findOneOrFail({
        where: { id: migrated.id },
        relations: { createdBy: true },
      })];
    }

    return document;
  }

  async update(
    id: string,
    input: {
      title?: string;
      documentType?: string;
      owner?: string | null;
      description?: string | null;
      notes?: string | null;
      status?: DocumentStatus;
      code?: string;
      projectId?: string;
      sectionId?: string;
      versionNo?: string;
      approvedBy?: string;
      approvalDate?: string;
    },
    file?: Express.Multer.File,
    userId?: string,
  ) {
    const document = await this.db.documents.findOne({
      where: { id },
      relations: { project: true, section: true, versions: true, currentVersion: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    this.assertNotInBin(document);

    const before = {
      title: document.title,
      documentType: document.documentType,
      owner: document.owner,
      description: document.description,
      notes: document.notes,
      status: document.status,
      code: document.code,
      projectId: document.project.id,
      sectionId: document.section.id,
      currentVersionNo: document.currentVersionNo,
    };

    const title = input.title !== undefined ? String(input.title ?? '').trim() : document.title;
    if (!title) throw new BadRequestException('Document Title is required');

    const documentTypeName = input.documentType !== undefined
      ? String(input.documentType ?? '').trim()
      : document.documentType;
    if (!documentTypeName) throw new BadRequestException('Document Type is required');
    const documentType = await this.db.documentTypes.createQueryBuilder('documentType')
      .where('LOWER(documentType.name) = LOWER(:value) OR LOWER(documentType.code) = LOWER(:value)', { value: documentTypeName })
      .getOne();
    if (!documentType || !documentType.active) {
      throw new BadRequestException(`Document Type '${documentTypeName}' is not an active type in the database`);
    }

    const code = input.code !== undefined ? String(input.code ?? '').trim().toUpperCase() : document.code;
    if (!code) throw new BadRequestException('Document code is required');

    let project = document.project;
    if (input.projectId && input.projectId !== document.project.id) {
      const nextProject = await this.db.projects.findOne({
        where: { id: input.projectId },
        relations: { sections: true },
      });
      if (!nextProject || nextProject.status !== 'ACTIVE') {
        throw new BadRequestException('Select an active project');
      }
      project = nextProject;
    }

    let section = document.section;
    if (input.sectionId) {
      const nextSection = await this.db.projectSections.findOne({
        where: { id: input.sectionId },
        relations: { project: true },
      });
      if (!nextSection || !nextSection.active) {
        throw new BadRequestException('Select an active repository section');
      }
      if (nextSection.project.id !== project.id) {
        throw new BadRequestException('Repository section must belong to the selected project');
      }
      section = nextSection;
    } else if (project.id !== document.project.id) {
      const sections = await this.db.projectSections.find({ where: { project: { id: project.id }, active: true } });
      const byKey = sections.find((item) => item.sectionKey === document.section.sectionKey);
      const byName = sections.find((item) => item.name.trim().toLowerCase() === document.section.name.trim().toLowerCase());
      section = byKey ?? byName ?? sections[0];
      if (!section) throw new BadRequestException('Selected project has no active repository sections');
    }

    if (code !== document.code || project.id !== document.project.id) {
      const duplicate = await this.db.documents.findOne({
        where: { project: { id: project.id }, code, deletedAt: IsNull() },
      });
      if (duplicate && duplicate.id !== document.id) {
        throw new BadRequestException(`Document code ${code} already exists in this project`);
      }
    }

    if (input.status !== undefined && !Object.values(DocumentStatus).includes(input.status)) {
      throw new BadRequestException('Invalid document status');
    }

    const currentVersion = document.currentVersion
      ?? document.versions?.find((version) => version.isCurrent)
      ?? document.versions?.[0]
      ?? null;

    const nextVersionNo = input.versionNo !== undefined
      ? String(input.versionNo ?? '').trim()
      : (currentVersion?.versionNo ?? document.currentVersionNo);
    if (!nextVersionNo) throw new BadRequestException('Version is required');

    if (currentVersion && nextVersionNo !== currentVersion.versionNo) {
      const clash = await this.db.documentVersions.findOne({
        where: { document: { id: document.id }, versionNo: nextVersionNo },
      });
      if (clash && clash.id !== currentVersion.id) {
        throw new BadRequestException(`Version ${nextVersionNo} already exists for this document`);
      }
    }

    const approvedBy = input.approvedBy !== undefined
      ? String(input.approvedBy ?? '').trim()
      : (currentVersion?.approvedBy ?? '');
    if (currentVersion && !approvedBy) throw new BadRequestException('Approved By is required');

    let approvalDate = currentVersion?.approvalDate ?? null;
    if (input.approvalDate !== undefined) {
      const parsed = new Date(String(input.approvalDate).trim());
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Approval date is invalid');
      approvalDate = parsed;
    }

    document.title = title;
    document.documentType = documentType.name;
    document.owner = input.owner !== undefined ? (String(input.owner ?? '').trim() || null) : document.owner;
    document.description = input.description !== undefined
      ? (String(input.description ?? '').trim() || null)
      : document.description;
    if (input.notes !== undefined) {
      document.notes = String(input.notes ?? '').trim() || null;
    }
    if (input.status !== undefined) document.status = input.status;
    document.code = code;
    document.project = project;
    document.section = section;
    document.currentVersionNo = nextVersionNo;

    const oldDocumentDir = currentVersion
      ? dirname(dirname(currentVersion.storagePath.replace(/\\/g, '/')))
      : null;

    if (currentVersion) {
      const previousPath = currentVersion.storagePath;
      let nextFileName = currentVersion.originalFileName;
      let nextMime = currentVersion.mimeType;
      let nextSize = currentVersion.fileSize;
      let nextChecksum = currentVersion.checksum;
      let fileBuffer: Buffer | null = null;

      if (file) {
        const extension = file.originalname.includes('.')
          ? file.originalname.split('.').pop()!.toLowerCase()
          : '';
        const fileType = extension
          ? await this.db.fileTypes.findOne({ where: { extension } })
          : null;
        if (!fileType || !fileType.active) {
          throw new BadRequestException(`.${extension || 'unknown'} files are not enabled in the database`);
        }
        if (file.size > fileType.maxSizeMb * 1024 * 1024) {
          throw new BadRequestException(`File exceeds the ${fileType.maxSizeMb} MB limit`);
        }
        fileBuffer = file.buffer;
        nextFileName = file.originalname;
        nextMime = file.mimetype || 'application/octet-stream';
        nextSize = file.size;
        nextChecksum = createHash('sha256').update(file.buffer).digest('hex');

        const checksumClash = await this.db.documentVersions.findOne({
          where: { document: { id: document.id }, checksum: nextChecksum },
        });
        if (checksumClash && checksumClash.id !== currentVersion.id) {
          throw new BadRequestException('This file content already exists as another version of this document');
        }
      }

      const nextPath = this.storage.versionRelativePath(
        project,
        section.relativePath,
        code,
        nextVersionNo,
        nextFileName,
      );

      if (fileBuffer) {
        await this.storage.writeRepositoryFile(nextPath, fileBuffer);
        if (previousPath !== nextPath) await this.storage.remove(previousPath);
      } else if (previousPath !== nextPath) {
        await this.storage.moveRepositoryFile(previousPath, nextPath);
      }

      currentVersion.versionNo = nextVersionNo;
      currentVersion.approvedBy = approvedBy;
      if (approvalDate) currentVersion.approvalDate = approvalDate;
      currentVersion.originalFileName = nextFileName;
      currentVersion.storedFileName = nextFileName;
      currentVersion.mimeType = nextMime;
      currentVersion.fileSize = nextSize;
      currentVersion.checksum = nextChecksum;
      currentVersion.storagePath = nextPath;
      await this.db.documentVersions.save(currentVersion);
      document.currentVersion = currentVersion;
    }

    // Relocate non-current versions if project/section/code changed.
    const pathChanged = project.id !== before.projectId
      || section.id !== before.sectionId
      || code !== before.code;
    if (pathChanged) {
      for (const version of document.versions ?? []) {
        if (currentVersion && version.id === currentVersion.id) continue;
        const nextPath = this.storage.versionRelativePath(
          project,
          section.relativePath,
          code,
          version.versionNo,
          version.originalFileName,
        );
        if (version.storagePath !== nextPath) {
          await this.storage.moveRepositoryFile(version.storagePath, nextPath);
          version.storagePath = nextPath;
          await this.db.documentVersions.save(version);
        }
      }
      if (oldDocumentDir) {
        const stillUsed = (document.versions ?? []).some((version) =>
          version.storagePath.replace(/\\/g, '/').startsWith(`${oldDocumentDir}/`),
        );
        if (!stillUsed) await this.storage.removeDirectory(oldDocumentDir);
      }
    }

    await this.db.documents.save(document);
    await this.storage.refreshRegisters(project.id).catch(() => undefined);
    if (before.projectId !== project.id) {
      await this.storage.refreshRegisters(before.projectId).catch(() => undefined);
    }

    await this.audit.record({
      userId,
      action: 'DOCUMENT_UPDATE',
      entityType: 'Document',
      entityId: document.id,
      message: `Updated document ${document.code}`,
      before,
      after: {
        title: document.title,
        documentType: document.documentType,
        owner: document.owner,
        description: document.description,
        notes: document.notes,
        status: document.status,
        code: document.code,
        projectId: project.id,
        sectionId: section.id,
        currentVersionNo: document.currentVersionNo,
        fileReplaced: Boolean(file),
      },
    });
    return this.get(id);
  }

  async updateNotes(id: string, notes: string | null | undefined, userId?: string) {
    const body = String(notes ?? '').trim();
    if (!body) throw new BadRequestException('Note text is required');

    const document = await this.db.documents.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    this.assertNotInBin(document);

    const createdBy = userId
      ? await this.db.users.findOne({ where: { id: userId } })
      : null;

    const entry = this.db.documentNotes.create({
      document,
      body,
      createdBy: createdBy ?? null,
    });
    await this.db.documentNotes.save(entry);

    await this.audit.record({
      userId,
      action: 'DOCUMENT_NOTE_ADDED',
      entityType: 'Document',
      entityId: document.id,
      message: `Added note to document ${document.code}`,
      after: { noteId: entry.id, body },
    });

    return this.get(id);
  }

  /**
   * Move a document to the recycle bin (kept for 30 days). Storage files stay on disk.
   * Pass { permanent: true } to hard-delete immediately (admin / purge).
   */
  async remove(id: string, userId?: string, options?: { skipPurge?: boolean; permanent?: boolean }) {
    if (options?.permanent) {
      return this.hardRemove(id, userId, { skipPurge: options.skipPurge });
    }

    const document = await this.db.documents.findOne({
      where: { id },
      relations: { project: true, section: true, versions: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (document.deletedAt) {
      return {
        deleted: true,
        softDeleted: true,
        id,
        code: document.binOriginalCode || document.code,
        projectId: document.project.id,
        purgeAfter: document.purgeAfter,
      };
    }

    const deletedAt = new Date();
    const purgeAfter = this.recycleBinPurgeAfter(deletedAt);
    const originalCode = document.code;
    const deletedBy = userId
      ? await this.db.users.findOne({ where: { id: userId } })
      : null;

    document.binOriginalCode = originalCode;
    document.code = `${originalCode}__bin__${document.id.replace(/-/g, '').slice(0, 8)}`;
    document.deletedAt = deletedAt;
    document.purgeAfter = purgeAfter;
    document.deletedBy = deletedBy;
    await this.db.documents.save(document);

    await this.storage.refreshRegisters(document.project.id).catch(() => undefined);

    await this.audit.record({
      userId,
      action: 'DOCUMENT_BIN',
      entityType: 'Document',
      entityId: id,
      message: `Moved document ${originalCode} to recycle bin (purge after ${purgeAfter.toISOString().slice(0, 10)})`,
      before: {
        id: document.id,
        code: originalCode,
        title: document.title,
        projectId: document.project.id,
        versionCount: document.versions?.length ?? 0,
      },
      after: { purgeAfter, binCode: document.code },
    });

    return {
      deleted: true,
      softDeleted: true,
      id,
      code: originalCode,
      projectId: document.project.id,
      purgeAfter,
      retentionDays: RECYCLE_BIN_RETENTION_DAYS,
    };
  }

  async restore(id: string, userId?: string) {
    const document = await this.db.documents.findOne({
      where: { id },
      relations: { project: true, section: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    if (!document.deletedAt) {
      throw new BadRequestException('Document is not in the recycle bin');
    }

    const restoreCode = (document.binOriginalCode || document.code.replace(/__bin__[a-f0-9]+$/i, '')).trim().toUpperCase();
    if (!restoreCode) throw new BadRequestException('Cannot restore: original document code is missing');

    const clash = await this.db.documents.findOne({
      where: { project: { id: document.project.id }, code: restoreCode, deletedAt: IsNull() },
    });
    if (clash && clash.id !== document.id) {
      throw new BadRequestException(
        `Cannot restore: document code ${restoreCode} is already used by another document in this project`,
      );
    }

    const before = {
      code: document.binOriginalCode,
      deletedAt: document.deletedAt,
      purgeAfter: document.purgeAfter,
    };

    document.code = restoreCode;
    document.binOriginalCode = null;
    document.deletedAt = null;
    document.purgeAfter = null;
    document.deletedBy = null;
    await this.db.documents.save(document);

    await this.storage.refreshRegisters(document.project.id).catch(() => undefined);

    await this.audit.record({
      userId,
      action: 'DOCUMENT_RESTORE',
      entityType: 'Document',
      entityId: id,
      message: `Restored document ${restoreCode} from recycle bin`,
      before,
      after: { code: restoreCode },
    });

    return this.get(id);
  }

  /** Permanently delete DB rows and storage files (admin / expired bin purge). */
  async hardRemove(id: string, userId?: string, options?: { skipPurge?: boolean }) {
    const document = await this.db.documents.findOne({
      where: { id },
      relations: { project: true, section: true, versions: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    const displayCode = document.binOriginalCode || document.code;
    const before = {
      id: document.id,
      code: displayCode,
      title: document.title,
      projectId: document.project.id,
      versionCount: document.versions?.length ?? 0,
      softDeleted: Boolean(document.deletedAt),
    };

    const versions = document.versions ?? [];
    const storagePaths = versions.map((version) => version.storagePath).filter(Boolean) as string[];
    const isZipPack = versions.some((version) => {
      const meta = version.metadata as Record<string, unknown> | null | undefined;
      return meta?.zipPack === true || Boolean(meta?.zipEntry);
    });

    const documentDirectories = new Set<string>();
    if (!isZipPack) {
      for (const path of storagePaths) {
        const normalised = path.replace(/\\/g, '/');
        const match = normalised.match(/^(.*\/[^/]+)\/v[^/]+\/[^/]+$/);
        if (match?.[1]) documentDirectories.add(match[1]);
      }
    }

    await this.db.dataSource.transaction(async (manager) => {
      await manager.query(
        'UPDATE import_jobs SET document_id = NULL, version_id = NULL WHERE document_id = $1',
        [document.id],
      );
      await manager.query(
        'UPDATE documents SET current_version_id = NULL WHERE id = $1',
        [document.id],
      );
      await manager.getRepository(DocumentRelationship).delete({ fromDocument: { id: document.id } });
      await manager.getRepository(DocumentRelationship).delete({ toDocument: { id: document.id } });
      await manager.getRepository(DocumentVersion).delete({ document: { id: document.id } });
      await manager.getRepository(Document).delete({ id: document.id });
    });

    for (const path of storagePaths) await this.storage.remove(path);

    if (isZipPack) {
      const sectionStop = [
        this.storage.projectRelativeRoot(document.project),
        this.storage.normaliseRelativePath(document.section.relativePath),
      ].join('/').replace(/\\/g, '/');
      for (const path of storagePaths) {
        await this.storage.removeEmptyParents(path, sectionStop);
      }
    } else {
      for (const directory of documentDirectories) {
        await this.storage.removeDirectory(directory);
      }
    }

    await this.storage.refreshRegisters(document.project.id).catch(() => undefined);

    await this.audit.record({
      userId,
      action: 'DOCUMENT_DELETE',
      entityType: 'Document',
      entityId: id,
      message: `Permanently deleted document ${before.code}`,
      before,
    });

    if (!options?.skipPurge) {
      await this.purgeMissingStorage(document.project.id, userId).catch(() => undefined);
    }

    return { deleted: true, permanent: true, id, code: before.code, projectId: before.projectId };
  }

  /** Hard-delete recycle-bin items whose retention window has expired. */
  async purgeExpiredBin(userId?: string) {
    const now = new Date();
    const candidates = await this.db.documents.find({
      where: { deletedAt: Not(IsNull()) },
      select: { id: true, deletedAt: true, purgeAfter: true, code: true, binOriginalCode: true },
    });

    const toPurge = candidates.filter((row) => {
      if (!row.deletedAt) return false;
      const due = row.purgeAfter ?? this.recycleBinPurgeAfter(row.deletedAt);
      return due.getTime() <= now.getTime();
    });

    const purged: Array<{ id: string; code: string }> = [];
    for (const row of toPurge) {
      try {
        const result = await this.hardRemove(row.id, userId, { skipPurge: true });
        purged.push({ id: result.id, code: result.code });
      } catch {
        // continue remaining items
      }
    }

    return {
      purged: purged.length,
      retentionDays: RECYCLE_BIN_RETENTION_DAYS,
      documents: purged,
    };
  }

  /**
   * Soft-delete every active document under a repository folder into the recycle bin.
   * Files stay on disk until permanent purge so admins can restore.
   */
  async deleteRepositoryFolder(projectId: string, folderPath: string, userId?: string) {
    const project = await this.db.projects.findOne({
      where: { id: projectId },
      relations: { sections: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const root = this.storage.projectRelativeRoot(project).replace(/\\/g, '/');
    const normalised = folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalised || normalised === root) {
      throw new BadRequestException('Cannot delete the project repository root');
    }
    if (normalised !== root && !normalised.startsWith(`${root}/`)) {
      throw new BadRequestException('Folder path is outside this project repository');
    }

    const section = (project.sections ?? []).find((item) => {
      const sectionPath = `${root}/${this.storage.normaliseRelativePath(item.relativePath)}`
        .replace(/\\/g, '/')
        .replace(/\/+$/, '');
      return sectionPath === normalised;
    });

    if (
      section
      && (section.sectionKey === 'MASTER_DOCUMENT_INDEX' || section.sectionKey === 'VERSION_REGISTER')
    ) {
      throw new BadRequestException('System register folders cannot be deleted from the explorer');
    }

    const documents = await this.db.documents.find({
      where: { project: { id: projectId }, deletedAt: IsNull() },
      relations: { versions: true, section: true, project: true },
    });
    const prefix = `${normalised}/`;
    const toDelete = documents.filter((document) => {
      if (section && document.section?.id === section.id) return true;

      const sectionPath = document.section
        ? `${root}/${this.storage.normaliseRelativePath(document.section.relativePath)}`
          .replace(/\\/g, '/')
          .replace(/\/+$/, '')
        : '';
      if (sectionPath === normalised || sectionPath.startsWith(prefix)) return true;

      return (document.versions ?? []).some((version) => {
        const path = version.storagePath?.replace(/\\/g, '/');
        return Boolean(path && (path === normalised || path.startsWith(prefix)));
      });
    });

    for (const document of toDelete) {
      await this.remove(document.id, userId);
    }

    await this.storage.refreshRegisters(projectId).catch(() => undefined);
    await this.audit.record({
      userId,
      action: 'DOCUMENT_BIN',
      entityType: section ? 'ProjectSection' : 'RepositoryFolder',
      entityId: section?.id ?? normalised,
      message: section
        ? `Moved module folder ${section.name} contents to recycle bin (${toDelete.length} document(s))`
        : `Moved folder ${normalised} contents to recycle bin (${toDelete.length} document(s))`,
      before: {
        path: normalised,
        sectionId: section?.id ?? null,
        sectionName: section?.name ?? null,
        documentsBinned: toDelete.map((document) => document.code),
        retentionDays: RECYCLE_BIN_RETENTION_DAYS,
      },
    });

    return {
      deleted: true,
      softDeleted: true,
      path: normalised,
      documentsDeleted: toDelete.length,
      sectionDeleted: false,
      sectionId: section?.id ?? null,
      retentionDays: RECYCLE_BIN_RETENTION_DAYS,
    };
  }

  /** Remove documents whose version files are no longer on disk (orphans vs Explorer tree). */
  async purgeMissingStorage(projectId?: string, userId?: string) {
    const documents = await this.db.documents.find({
      where: projectId
        ? { project: { id: projectId }, deletedAt: IsNull() }
        : { deletedAt: IsNull() },
      relations: { versions: true, project: true, section: true },
    });
    const purged: Array<{ id: string; code: string }> = [];
    for (const document of documents) {
      const paths = (document.versions ?? [])
        .map((version) => version.storagePath)
        .filter(Boolean) as string[];
      if (!paths.length) {
        await this.hardRemove(document.id, userId, { skipPurge: true });
        purged.push({ id: document.id, code: document.code });
        continue;
      }
      let anyExists = false;
      for (const path of paths) {
        if (await this.storage.exists(path)) {
          anyExists = true;
          break;
        }
      }
      if (!anyExists) {
        await this.hardRemove(document.id, userId, { skipPurge: true });
        purged.push({ id: document.id, code: document.code });
      }
    }
    return { purged: purged.length, documents: purged };
  }

  async versionRegister(projectId?: string) {
    const qb = this.db.documentVersions.createQueryBuilder('version')
      .leftJoinAndSelect('version.document', 'document')
      .leftJoinAndSelect('document.project', 'project')
      .leftJoinAndSelect('document.section', 'section')
      .leftJoinAndSelect('version.createdBy', 'createdBy')
      .where('version.document_id IS NOT NULL')
      .andWhere('document.deletedAt IS NULL')
      .orderBy('version.createdAt', 'DESC');
    if (projectId) qb.andWhere('project.id = :projectId', { projectId });
    return qb.getMany();
  }

  async relationships(projectId?: string) {
    const qb = this.db.documentRelationships.createQueryBuilder('relationship')
      .leftJoinAndSelect('relationship.fromDocument', 'fromDocument')
      .leftJoinAndSelect('fromDocument.project', 'fromProject')
      .leftJoinAndSelect('fromDocument.section', 'fromSection')
      .leftJoinAndSelect('relationship.toDocument', 'toDocument')
      .leftJoinAndSelect('toDocument.project', 'toProject')
      .leftJoinAndSelect('toDocument.section', 'toSection')
      .leftJoinAndSelect('relationship.createdBy', 'createdBy')
      .where('fromDocument.deletedAt IS NULL AND toDocument.deletedAt IS NULL')
      .orderBy('relationship.createdAt', 'DESC');
    if (projectId) qb.andWhere('fromProject.id = :projectId OR toProject.id = :projectId', { projectId });
    return qb.getMany();
  }

  async createRelationship(input: { fromDocumentId: string; toDocumentId: string; type?: RelationshipType; description?: string }, userId?: string) {
    if (input.fromDocumentId === input.toDocumentId) throw new BadRequestException('A document cannot be related to itself');
    const [fromDocument, toDocument, createdBy] = await Promise.all([
      this.db.documents.findOne({ where: { id: input.fromDocumentId, deletedAt: IsNull() } }),
      this.db.documents.findOne({ where: { id: input.toDocumentId, deletedAt: IsNull() } }),
      userId ? this.db.users.findOne({ where: { id: userId } }) : Promise.resolve(null),
    ]);
    if (!fromDocument || !toDocument) throw new BadRequestException('Both documents must exist');
    const type = input.type ?? RelationshipType.RELATED_TO;
    let relationship = await this.db.documentRelationships.findOne({ where: { fromDocument: { id: fromDocument.id }, toDocument: { id: toDocument.id }, type }, relations: { fromDocument: true, toDocument: true } });
    if (!relationship) relationship = this.db.documentRelationships.create({ fromDocument, toDocument, type, description: input.description ?? null, createdBy });
    else relationship.description = input.description ?? null;
    relationship = await this.db.documentRelationships.save(relationship);
    await this.audit.record({ userId, action: 'RELATIONSHIP_UPSERT', entityType: 'DocumentRelationship', entityId: relationship.id, message: `Linked ${fromDocument.code} to ${toDocument.code} as ${type}` });
    return this.db.documentRelationships.findOne({ where: { id: relationship.id }, relations: { fromDocument: true, toDocument: true } });
  }

  async deleteRelationship(id: string, userId?: string) {
    const existing = await this.db.documentRelationships.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Relationship not found');
    await this.db.documentRelationships.remove(existing);
    await this.audit.record({ userId, action: 'DELETE', entityType: 'DocumentRelationship', entityId: id, message: 'Removed document relationship', before: existing });
    return { deleted: true };
  }

  auditLogs(entityType?: string, entityId?: string, scope?: string, limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const qb = this.db.auditLogs.createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .take(take);

    if (entityType) qb.andWhere('log.entityType = :entityType', { entityType });
    if (entityId) qb.andWhere('log.entityId = :entityId', { entityId });

    if (scope === 'system') {
      qb.andWhere(`log.action NOT LIKE 'IMPORT_%'`)
        .andWhere(`log.action NOT LIKE 'MCP_REQUEST%'`)
        .andWhere(`log.action NOT IN (:...noisy)`, {
          noisy: ['MCP_PDF_FALLBACK', 'MCP_AUTO_IMPORT_FALLBACK'],
        });
    } else if (scope === 'imports') {
      qb.andWhere(`(log.action LIKE 'IMPORT_%' OR log.entityType = :importEntity)`, {
        importEntity: 'ImportJob',
      });
    }

    return qb.getMany();
  }

  async versionFile(versionId: string) {
    const version = await this.db.documentVersions.findOne({ where: { id: versionId }, relations: { document: true } });
    if (!version || version.document?.deletedAt) throw new NotFoundException('Document version not found');
    const absolutePath = this.storage.resolveStoragePath(version.storagePath);
    if (!(await this.storage.exists(absolutePath))) {
      throw new NotFoundException('Stored file is missing on the server');
    }
    return { version, absolutePath };
  }

  /**
   * Resolve a version file and verify binary integrity before any download/stream.
   * APPROVED/IMPORTED alone is not sufficient — checksum (+ ZIP EOCD) must pass.
   */
  async prepareBinaryDownload(versionId: string) {
    const { version, absolutePath } = await this.versionFile(versionId);
    const integrity = await verifyStoredBinaryIntegrity({
      absolutePath,
      expectedSha256: version.checksum,
      fileName: version.originalFileName,
      mimeType: version.mimeType,
    });
    return { version, absolutePath, integrity };
  }
}
