import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { Brackets } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { DatabaseService } from '../database/database.service';
import {
  ApprovalStatus,
  Document,
  DocumentRelationship,
  DocumentStatus,
  DocumentVersion,
  ImportJob,
  ImportStatus,
  ProjectSection,
  RelationshipType,
  SourceSystem,
  User,
} from '../database/entities';
import { VpsStorageService } from '../storage/vps-storage.service';
import { ImportBusinessException } from './import.exception';
import { compareVersions, suggestNextVersion } from './version.util';

interface ImportMetadata {
  projectId: string;
  sourceSystemId: string;
  title: string;
  documentCode?: string;
  documentType: string;
  description?: string;
  owner?: string;
  versionNo: string;
  approvalStatus?: string;
  approvedBy?: string;
  approvalDate: string;
  sectionKey?: string;
  metadataJson?: string;
  relationshipsJson?: string;
  mode?: 'NEW' | 'NEW_VERSION';
  existingDocumentId?: string;
}

interface RelationshipInput {
  toDocumentId: string;
  type?: RelationshipType;
  description?: string;
}

interface StoredMetadata extends ImportMetadata {
  customMetadata?: Record<string, unknown>;
  relationships?: RelationshipInput[];
}

const getId = (entity: { id?: string } | null | undefined) => entity?.id ?? '';

@Injectable()
export class ImportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly storage: VpsStorageService,
  ) {}

  list(status?: ImportStatus) {
    return this.db.importJobs.find({
      where: status ? { status } : {},
      relations: { project: true, sourceSystem: true, resolvedSection: true, document: true, version: true, initiatedBy: true },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    const job = await this.db.importJobs.findOne({
      where: { id },
      relations: {
        project: { sections: true }, sourceSystem: true, resolvedSection: true,
        document: true, version: true, initiatedBy: true,
      },
    });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.project?.sections) job.project.sections.sort((a, b) => a.position - b.position);
    return job;
  }

  async upload(
    file: Express.Multer.File | undefined,
    input: ImportMetadata & { draftJobId?: string },
    userId?: string,
    userEmail?: string,
  ) {
    const draftJobId = input.draftJobId?.trim();
    const draftJob = draftJobId
      ? await this.db.importJobs.findOne({
          where: { id: draftJobId },
          relations: { project: true, sourceSystem: true, initiatedBy: true },
        })
      : null;
    if (draftJobId && !draftJob) throw new BadRequestException('Draft import was not found');
    if (draftJob?.status === ImportStatus.IMPORTED) {
      throw new BadRequestException('Completed imports cannot be continued');
    }

    const user = await this.resolveActor(userId, userEmail);
    if (!input.approvedBy?.trim()) {
      input.approvedBy = user?.name || user?.email || userEmail || '';
    }

    const reuseDraftFile = Boolean(!file && draftJob?.incomingPath);
    const validated = await this.assertImportRequirements(input, {
      hasFile: Boolean(file) || reuseDraftFile,
      fileName: file?.originalname || draftJob?.fileName,
      fileSize: file?.size ?? draftJob?.fileSize,
      mimeType: file?.mimetype || draftJob?.mimeType,
    });

    const { project, source, fileType, approvalDate, customMetadata, relationships } = validated;
    const fileName = file?.originalname || draftJob!.fileName;
    const fileSize = file?.size ?? draftJob!.fileSize;
    if (fileSize > fileType.maxSizeMb * 1024 * 1024) throw new BadRequestException(`File exceeds the ${fileType.maxSizeMb} MB limit`);

    let incomingPath = draftJob?.incomingPath || '';
    let mimeType = draftJob?.mimeType || 'application/octet-stream';
    let checksum = draftJob?.checksum || '';

    if (file) {
      if (draftJob?.incomingPath) {
        await this.storage.remove(draftJob.incomingPath).catch(() => undefined);
      }
      const staged = await this.storage.stageIncoming(file.originalname, file.buffer);
      incomingPath = staged.relativePath;
      mimeType = file.mimetype || 'application/octet-stream';
      checksum = createHash('sha256').update(file.buffer).digest('hex');
    }

    const metadata: StoredMetadata = {
      ...input,
      approvalStatus: ApprovalStatus.APPROVED,
      approvalDate: approvalDate.toISOString(),
      customMetadata,
      relationships,
    };

    let job = draftJob;
    if (job) {
      job.sourceSystem = source;
      job.project = project;
      job.resolvedSection = null;
      job.document = null;
      job.version = null;
      job.fileName = fileName;
      job.incomingPath = incomingPath;
      job.mimeType = mimeType;
      job.fileSize = fileSize;
      job.checksum = checksum;
      job.status = ImportStatus.RECEIVED;
      job.metadata = metadata as unknown as Record<string, unknown>;
      job.errorMessage = null;
      job.routingDecision = null;
      job.storageResult = null;
      job.completedAt = null;
      if (user) job.initiatedBy = user;
    } else {
      job = this.db.importJobs.create({
        sourceSystem: source,
        project,
        resolvedSection: null,
        document: null,
        version: null,
        fileName,
        incomingPath,
        mimeType,
        fileSize,
        checksum,
        status: ImportStatus.RECEIVED,
        metadata: metadata as unknown as Record<string, unknown>,
        errorMessage: null,
        routingDecision: null,
        storageResult: null,
        initiatedBy: user,
        completedAt: null,
      });
    }

    const saved = await this.db.importJobs.save(job);
    await this.audit.record({
      userId, action: 'IMPORT_RECEIVED', entityType: 'ImportJob', entityId: saved.id,
      message: reuseDraftFile
        ? `Continued draft import using staged file ${fileName}`
        : `Received approved document ${fileName}`,
      after: { project: project.code, source: source.code, checksum, reusedDraftFile: reuseDraftFile },
    });
    return this.process(saved.id, userId);
  }

  async saveDraft(
    file: Express.Multer.File | undefined,
    input: ImportMetadata & { draftJobId?: string },
    userId?: string,
    userEmail?: string,
  ) {
    if (!input.projectId?.trim()) throw new BadRequestException('Select a project before saving a draft');
    if (!input.sourceSystemId?.trim()) throw new BadRequestException('Select a source system before saving a draft');

    const [project, source, user] = await Promise.all([
      this.db.projects.findOne({ where: { id: input.projectId.trim() }, relations: { sections: true } }),
      this.db.sourceSystems.findOne({ where: { id: input.sourceSystemId.trim() } }),
      this.resolveActor(userId, userEmail),
    ]);
    if (!project) throw new BadRequestException('Select a valid project');
    if (!source) throw new BadRequestException('Select a valid source system');

    let customMetadata: Record<string, unknown> = {};
    let relationships: RelationshipInput[] = [];
    try { customMetadata = input.metadataJson ? JSON.parse(input.metadataJson) as Record<string, unknown> : {}; }
    catch { customMetadata = {}; }
    try {
      relationships = input.relationshipsJson ? JSON.parse(input.relationshipsJson) as RelationshipInput[] : [];
      if (!Array.isArray(relationships)) relationships = [];
    } catch { relationships = []; }

    const approvalDateRaw = input.approvalDate?.trim();
    const approvalDate = approvalDateRaw ? new Date(approvalDateRaw) : new Date();
    const metadata: StoredMetadata = {
      ...input,
      approvalStatus: ApprovalStatus.APPROVED,
      approvalDate: Number.isNaN(approvalDate.getTime()) ? new Date().toISOString() : approvalDate.toISOString(),
      approvedBy: input.approvedBy?.trim() || user?.name || user?.email || userEmail || 'Draft',
      customMetadata,
      relationships,
    };

    let fileName = 'Untitled draft';
    let incomingPath = '';
    let mimeType = 'application/octet-stream';
    let fileSize = 0;
    let checksum = 'draft';

    if (file) {
      const extension = extname(file.originalname).replace('.', '').toLowerCase();
      const fileType = await this.db.fileTypes.findOne({ where: { extension } });
      if (fileType && fileType.active && file.size > fileType.maxSizeMb * 1024 * 1024) {
        throw new BadRequestException(`File exceeds the ${fileType.maxSizeMb} MB limit`);
      }
      const staged = await this.storage.stageIncoming(file.originalname, file.buffer);
      fileName = file.originalname;
      incomingPath = staged.relativePath;
      mimeType = file.mimetype || 'application/octet-stream';
      fileSize = file.size;
      checksum = createHash('sha256').update(file.buffer).digest('hex');
    }

    const draftJobId = input.draftJobId?.trim();
    let job = draftJobId
      ? await this.db.importJobs.findOne({
          where: { id: draftJobId },
          relations: { project: true, sourceSystem: true, initiatedBy: true },
        })
      : null;

    if (job) {
      if (job.status === ImportStatus.IMPORTED) {
        throw new BadRequestException('Completed imports cannot be saved as drafts');
      }
      if (job.incomingPath && file) {
        await this.storage.remove(job.incomingPath).catch(() => undefined);
      }
      if (!file) {
        fileName = job.fileName || fileName;
        incomingPath = job.incomingPath || incomingPath;
        mimeType = job.mimeType || mimeType;
        fileSize = job.fileSize || fileSize;
        checksum = job.checksum || checksum;
      }
      job.project = project;
      job.sourceSystem = source;
      job.fileName = fileName;
      job.incomingPath = incomingPath;
      job.mimeType = mimeType;
      job.fileSize = fileSize;
      job.checksum = checksum;
      job.status = ImportStatus.DRAFT;
      job.metadata = metadata as unknown as Record<string, unknown>;
      job.errorMessage = null;
      job.routingDecision = null;
      job.storageResult = null;
      job.resolvedSection = null;
      job.completedAt = null;
      if (user) job.initiatedBy = user;
    } else {
      job = this.db.importJobs.create({
        sourceSystem: source,
        project,
        resolvedSection: null,
        document: null,
        version: null,
        fileName,
        incomingPath,
        mimeType,
        fileSize,
        checksum,
        status: ImportStatus.DRAFT,
        metadata: metadata as unknown as Record<string, unknown>,
        errorMessage: null,
        routingDecision: null,
        storageResult: null,
        initiatedBy: user,
        completedAt: null,
      });
    }

    const saved = await this.db.importJobs.save(job);
    await this.audit.record({
      userId,
      action: 'IMPORT_DRAFT_SAVED',
      entityType: 'ImportJob',
      entityId: saved.id,
      message: `Saved draft import ${saved.fileName}`,
      after: { project: project.code, source: source.code, status: saved.status },
    });
    return this.get(saved.id);
  }

  async retry(id: string, userId?: string) {
    const job = await this.get(id);
    if (job.status !== ImportStatus.FAILED) throw new BadRequestException('Only failed imports can be retried');
    job.status = ImportStatus.RECEIVED;
    job.errorMessage = null;
    job.completedAt = null;
    await this.db.importJobs.save(job);
    return this.process(id, userId);
  }

  async dismiss(id: string, userId?: string) {
    const job = await this.get(id);
    if (job.status === ImportStatus.IMPORTED) {
      throw new BadRequestException('Completed imports cannot be dismissed');
    }
    if (job.incomingPath) {
      await this.storage.remove(job.incomingPath).catch(() => undefined);
    }
    await this.db.importJobs.remove(job);
    await this.audit.record({
      userId,
      action: 'IMPORT_DISMISSED',
      entityType: 'ImportJob',
      entityId: id,
      message: `Dismissed draft import ${job.fileName}`,
      before: { status: job.status, fileName: job.fileName },
    });
    return { id, dismissed: true };
  }

  async process(id: string, userId?: string) {
    const job = await this.get(id);
    const metadata = job.metadata as unknown as StoredMetadata;
    let repositoryPath: string | undefined;
    try {
      job.status = ImportStatus.VALIDATING;
      job.errorMessage = null;
      await this.db.importJobs.save(job);

      const extension = extname(job.fileName).replace('.', '').toLowerCase();
      const section = await this.resolveSection(job.project.id, job.sourceSystem.id, extension, metadata);
      job.status = ImportStatus.ROUTING;
      job.resolvedSection = section;
      job.routingDecision = {
        projectId: job.project.id,
        projectCode: job.project.code,
        sectionId: section.id,
        sectionKey: section.sectionKey,
        sectionName: section.name,
        configured: true,
      };
      await this.db.importJobs.save(job);

      const { document, documentCode, mode } = await this.resolveLogicalDocument(job.project.id, section, metadata);
      const existingVersions = document?.versions ?? [];
      const currentVersion = existingVersions.find((version) => version.isCurrent);
      const currentVersionNo = currentVersion?.versionNo;

      // SCENARIO 4: submitted version is lower than current version
      if (currentVersionNo && compareVersions(metadata.versionNo, currentVersionNo) < 0) {
        const details = this.buildErrorDetails(document, currentVersion, metadata.versionNo, section);
        await this.audit.record({
          userId, action: 'OLDER_VERSION_REJECTED', entityType: 'ImportJob', entityId: job.id,
          message: `Submitted version ${metadata.versionNo} is older than current version ${currentVersionNo} for ${document?.code}`,
          before: { submittedVersion: metadata.versionNo, currentVersion: currentVersionNo },
          after: details,
        });
        throw new ImportBusinessException(
          'VERSION_NOT_NEWER',
          `The submitted version ${metadata.versionNo} is older than the current version ${currentVersionNo}. Historical versions cannot be imported through the standard import workflow.`,
          { ...details, currentVersion: currentVersionNo, submittedVersion: metadata.versionNo },
        );
      }

      // SCENARIO 3: same version number already exists with different checksum
      const existingVersionWithSameNumber = existingVersions.find((version) => compareVersions(version.versionNo, metadata.versionNo) === 0);
      if (existingVersionWithSameNumber && existingVersionWithSameNumber.checksum !== job.checksum) {
        const details = this.buildErrorDetails(document, existingVersionWithSameNumber, metadata.versionNo, section);
        await this.audit.record({
          userId, action: 'DUPLICATE_VERSION_REJECTED', entityType: 'ImportJob', entityId: job.id,
          message: `Version ${metadata.versionNo} already exists for ${document?.code} with different content`,
          before: { submittedVersion: metadata.versionNo },
          after: details,
        });
        throw new ImportBusinessException(
          'DUPLICATE_VERSION_NUMBER',
          `A version ${metadata.versionNo} already exists for this document. Enter the correct approved version number or select the existing version.`,
          details,
        );
      }

      // SCENARIO 1: same document + same checksum + different version number
      const duplicateChecksum = existingVersions.find((version) => version.checksum === job.checksum);
      if (duplicateChecksum && compareVersions(duplicateChecksum.versionNo, metadata.versionNo) !== 0) {
        const details = this.buildErrorDetails(document, duplicateChecksum, metadata.versionNo, section);
        await this.audit.record({
          userId, action: 'DUPLICATE_CONTENT_REJECTED', entityType: 'ImportJob', entityId: job.id,
          message: `Identical file content uploaded as version ${metadata.versionNo} already exists as version ${duplicateChecksum.versionNo} for ${document?.code}`,
          before: { submittedVersion: metadata.versionNo, existingVersion: duplicateChecksum.versionNo, checksum: job.checksum },
          after: details,
        });
        throw new ImportBusinessException(
          'DUPLICATE_DOCUMENT_CONTENT',
          `This file is identical to version ${duplicateChecksum.versionNo} already stored for this document. Changing the version number does not create a new document version.`,
          details,
        );
      }

      // If exact same version + checksum is being re-submitted, treat it as duplicate content too
      if (duplicateChecksum) {
        const details = this.buildErrorDetails(document, duplicateChecksum, metadata.versionNo, section);
        await this.audit.record({
          userId, action: 'DUPLICATE_CONTENT_REJECTED', entityType: 'ImportJob', entityId: job.id,
          message: `Re-submitted identical file for version ${metadata.versionNo} of ${document?.code}`,
          before: { submittedVersion: metadata.versionNo, checksum: job.checksum },
          after: details,
        });
        throw new ImportBusinessException(
          'DUPLICATE_DOCUMENT_CONTENT',
          `This file is identical to version ${duplicateChecksum.versionNo} already stored for this document.`,
          details,
        );
      }

      const storedFileName = job.fileName;
      const effectiveDocumentCode = document?.code ?? await this.nextDocumentCode(job.project.code, section.code, job.project.id);
      const targetDocument = document ?? this.db.documents.create({
        project: job.project,
        section,
        code: effectiveDocumentCode,
        title: metadata.title.trim(),
        documentType: metadata.documentType.trim(),
        description: metadata.description?.trim() || null,
        owner: metadata.owner?.trim() || null,
        status: DocumentStatus.CURRENT,
        currentVersionNo: metadata.versionNo.trim(),
        currentVersion: null,
      });

      repositoryPath = this.storage.versionRelativePath(
        job.project,
        section.relativePath,
        effectiveDocumentCode,
        metadata.versionNo,
        storedFileName,
      );

      const copiedFile = await this.storage.copyToRepository(job.incomingPath, repositoryPath);

      let result: { document: Document; version: DocumentVersion } | null = null;
      try {
        result = await this.db.dataSource.transaction(async (manager) => {
          const documentRepo = manager.getRepository(Document);
          const versionRepo = manager.getRepository(DocumentVersion);
          const relationshipRepo = manager.getRepository(DocumentRelationship);
          const importRepo = manager.getRepository(ImportJob);
          const userRepo = manager.getRepository(User);

          let documentRecord = targetDocument;
          documentRecord = await documentRepo.save(documentRecord);
          const freshDocument = await documentRepo.findOne({
            where: { id: documentRecord.id },
            relations: { project: true, section: true },
          });
          if (!freshDocument) throw new Error('Document was lost during transaction');
          documentRecord = freshDocument;

          // Supersede previous current version within this transaction
          if (currentVersion) {
            await versionRepo.createQueryBuilder()
              .update(DocumentVersion)
              .set({ isCurrent: false })
              .where('document_id = :documentId AND is_current = true', { documentId: documentRecord.id })
              .execute();
          }

          const createdBy = userId ? await userRepo.findOne({ where: { id: userId } }) : null;
          const version = await versionRepo.save(versionRepo.create({
            document: documentRecord,
            versionNo: metadata.versionNo.trim(),
            originalFileName: job.fileName,
            storedFileName,
            mimeType: job.mimeType,
            fileSize: job.fileSize,
            checksum: job.checksum,
            storagePath: repositoryPath,
            approvalStatus: ApprovalStatus.APPROVED,
            approvedBy: String(metadata.approvedBy ?? '').trim(),
            approvalDate: new Date(metadata.approvalDate),
            isCurrent: true,
            metadata: metadata.customMetadata ?? {},
            createdBy,
          }));

          // Update parent document to point to the new current version
          documentRecord.title = metadata.title.trim();
          documentRecord.documentType = metadata.documentType.trim();
          documentRecord.description = metadata.description?.trim() || null;
          documentRecord.owner = metadata.owner?.trim() || null;
          documentRecord.section = section;
          documentRecord.status = DocumentStatus.CURRENT;
          documentRecord.currentVersionNo = metadata.versionNo.trim();
          documentRecord.currentVersion = version;
          await documentRepo.save(documentRecord);

          for (const relationshipInput of metadata.relationships ?? []) {
            if (!relationshipInput.toDocumentId || relationshipInput.toDocumentId === documentRecord.id) continue;
            const target = await documentRepo.findOne({ where: { id: relationshipInput.toDocumentId } });
            if (!target) continue;
            const type = relationshipInput.type ?? RelationshipType.RELATED_TO;
            let relationship = await relationshipRepo.findOne({
              where: { fromDocument: { id: documentRecord.id }, toDocument: { id: target.id }, type },
              relations: { fromDocument: true, toDocument: true },
            });
            if (!relationship) relationship = relationshipRepo.create({ fromDocument: documentRecord, toDocument: target, type, createdBy, description: null });
            relationship.description = relationshipInput.description?.trim() || null;
            await relationshipRepo.save(relationship);
          }

          const transactionJob = await importRepo.findOne({ where: { id }, relations: { project: true, sourceSystem: true } });
          if (!transactionJob) throw new NotFoundException('Import job not found during transaction');
          transactionJob.document = documentRecord;
          transactionJob.version = version;
          transactionJob.resolvedSection = section;
          await importRepo.save(transactionJob);

          return { document: documentRecord, version };
        });
      } catch (transactionError) {
        // Remove partially copied repository file if transaction failed
        if (copiedFile) await this.storage.remove(repositoryPath).catch(() => undefined);
        throw transactionError;
      }

      if (!result) throw new BadRequestException('Import transaction did not produce a document version');

      const registerResult = await this.storage.refreshRegisters(job.project.id);
      const storageResult: Record<string, unknown> = {
        mode: 'VPS_LOCAL_FILESYSTEM',
        repositoryPath,
        registers: registerResult,
      };

      const finalJob = await this.db.importJobs.findOne({ where: { id }, relations: { project: true, sourceSystem: true, resolvedSection: true, document: true, version: true, initiatedBy: true } });
      if (!finalJob) throw new NotFoundException('Import job not found');
      finalJob.status = ImportStatus.IMPORTED;
      finalJob.completedAt = new Date();
      finalJob.storageResult = storageResult;
      await this.db.importJobs.save(finalJob);
      await this.storage.remove(job.incomingPath);

      const priorVersionNo = currentVersion?.versionNo;
      await this.audit.record({
        userId, action: 'DOCUMENT_VERSION_IMPORTED', entityType: 'DocumentVersion', entityId: result.version.id,
        message: `Imported ${result.document.code} version ${result.version.versionNo} into ${section.name}`,
        after: { repositoryPath, storageResult, previousVersion: priorVersionNo },
      });
      if (priorVersionNo) {
        await this.audit.record({
          userId, action: 'DOCUMENT_VERSION_SUPERSEDED', entityType: 'DocumentVersion', entityId: result.version.id,
          message: `Version ${priorVersionNo} of ${result.document.code} superseded by version ${result.version.versionNo}`,
          before: { versionNo: priorVersionNo, isCurrent: true },
          after: { versionNo: result.version.versionNo, isCurrent: true },
        });
      }
      await this.audit.record({
        userId, action: 'MASTER_INDEX_UPDATED', entityType: 'Document', entityId: result.document.id,
        message: `Master Document Index updated for ${result.document.code} with current version ${result.version.versionNo}`,
        after: { currentVersionNo: result.version.versionNo, repositoryPath },
      });
      await this.audit.record({
        userId, action: 'VERSION_REGISTER_UPDATED', entityType: 'DocumentVersion', entityId: result.version.id,
        message: `Version Register updated for ${result.document.code} version ${result.version.versionNo}`,
        after: { currentVersionNo: result.version.versionNo },
      });

      return this.get(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown import error';
      const failed = await this.db.importJobs.findOne({ where: { id } });
      if (failed) {
        failed.status = ImportStatus.FAILED;
        failed.errorMessage = message;
        failed.completedAt = new Date();
        await this.db.importJobs.save(failed);
      }
      await this.audit.record({ userId, action: 'IMPORT_FAILED', entityType: 'ImportJob', entityId: id, message });
      throw error;
    }
  }

  private async assertImportRequirements(
    input: ImportMetadata,
    fileContext: { hasFile: boolean; fileName?: string; fileSize?: number; mimeType?: string },
  ) {
    const missing: string[] = [];
    if (!input.projectId?.trim()) missing.push('Project');
    if (!input.sourceSystemId?.trim()) missing.push('Source system');
    if (!fileContext.hasFile) missing.push('Approved file');
    if (input.mode === 'NEW_VERSION' && !input.existingDocumentId?.trim()) missing.push('Existing document');

    let customMetadata: Record<string, unknown> = {};
    let relationships: RelationshipInput[] = [];
    try {
      customMetadata = input.metadataJson ? JSON.parse(input.metadataJson) as Record<string, unknown> : {};
      if (!customMetadata || typeof customMetadata !== 'object' || Array.isArray(customMetadata)) {
        customMetadata = {};
      }
    } catch {
      throw new BadRequestException('metadataJson must be valid JSON');
    }
    try {
      const rawRelationships = input.relationshipsJson?.trim();
      if (!rawRelationships || rawRelationships === 'null' || rawRelationships === 'undefined') {
        relationships = [];
      } else {
        const parsed = JSON.parse(rawRelationships) as unknown;
        relationships = Array.isArray(parsed) ? parsed as RelationshipInput[] : [];
      }
    } catch {
      // Relationships are optional — never block a first/solo import on bad/empty payload.
      relationships = [];
    }
    relationships = relationships.filter((item) => Boolean(item?.toDocumentId?.trim()));

    const approvalStatus = String(input.approvalStatus ?? '').trim().toUpperCase() || ApprovalStatus.APPROVED;
    if (approvalStatus !== ApprovalStatus.APPROVED) {
      throw new BadRequestException(
        `Only APPROVED documents may enter the official repository (received: ${approvalStatus}). Rejected, draft, or pending assets must be approved before import.`,
      );
    }

    const mandatoryFields = await this.db.metadataFields.find({
      where: { required: true, active: true },
      order: { position: 'ASC' },
    });
    const activeFields = await this.db.metadataFields.find({
      where: { active: true },
      order: { position: 'ASC' },
    });
    const combined: Record<string, unknown> = {
      ...customMetadata,
      ...input,
      approvalStatus: ApprovalStatus.APPROVED,
      fileName: fileContext.fileName ?? '',
      relationships,
    };
    const skipRequiredKeys = new Set([
      'approvalStatus',
      'relationships',
      'relationshipsJson',
      'metadataJson',
      'customMetadata',
      'draftJobId',
      'mode',
      'existingDocumentId',
      'sectionKey',
    ]);
    for (const field of mandatoryFields) {
      if (skipRequiredKeys.has(field.key)) continue;
      if (!String(combined[field.key] ?? '').trim()) missing.push(field.label);
    }
    if (missing.length) {
      throw new BadRequestException(
        `Import blocked. Required fields missing from database validation: ${[...new Set(missing)].join(', ')}`,
      );
    }

    for (const field of activeFields) {
      if (!field.validationRule?.trim()) continue;
      if (skipRequiredKeys.has(field.key)) continue;
      const raw = combined[field.key];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      this.assertMetadataValidationRule(field.label, String(raw), field.validationRule.trim());
    }

    const approvalDate = new Date(String(input.approvalDate).trim());
    if (Number.isNaN(approvalDate.getTime())) throw new BadRequestException('Approval date is invalid');

    const extension = extname(fileContext.fileName || '').replace('.', '').toLowerCase();
    const [project, source, fileType, documentType] = await Promise.all([
      this.db.projects.findOne({ where: { id: input.projectId.trim() }, relations: { sections: true } }),
      this.db.sourceSystems.findOne({ where: { id: input.sourceSystemId.trim() } }),
      this.db.fileTypes.findOne({ where: { extension } }),
      this.db.documentTypes.createQueryBuilder('documentType')
        .where('LOWER(documentType.name) = LOWER(:value) OR LOWER(documentType.code) = LOWER(:value)', {
          value: input.documentType.trim(),
        })
        .getOne(),
    ]);

    if (!project || project.status !== 'ACTIVE') {
      throw new BadRequestException('Select an active project configured in the database');
    }
    if (!source || !source.active) {
      throw new BadRequestException('Select an active source system configured in the database');
    }
    if (!fileType || !fileType.active) {
      throw new BadRequestException(`.${extension || 'unknown'} files are not enabled in the database`);
    }
    if (!documentType || !documentType.active) {
      throw new BadRequestException(
        `Document Type '${input.documentType.trim()}' is not an active type in the database`,
      );
    }

    const declaredMime = String(fileContext.mimeType || '').trim().toLowerCase().split(';')[0].trim();
    const allowedMimes = (fileType.mimeTypes ?? []).map((item) => String(item).trim().toLowerCase().split(';')[0].trim()).filter(Boolean);
    if (allowedMimes.length && declaredMime && declaredMime !== 'application/octet-stream') {
      const mimeAllowed = allowedMimes.some((allowed) => {
        if (allowed.endsWith('/*')) return declaredMime.startsWith(allowed.slice(0, -1));
        return allowed === declaredMime;
      });
      if (!mimeAllowed) {
        throw new BadRequestException(
          `MIME type '${declaredMime}' is not allowed for .${extension} files (allowed: ${allowedMimes.join(', ')})`,
        );
      }
    }

    return { project, source, fileType, documentType, approvalDate, customMetadata, relationships };
  }

  private assertMetadataValidationRule(label: string, value: string, rule: string) {
    const trimmed = rule.trim();
    if (trimmed.startsWith('regex:')) {
      const pattern = trimmed.slice('regex:'.length);
      try {
        if (!new RegExp(pattern).test(value)) {
          throw new BadRequestException(`${label} failed validation rule regex:/${pattern}/`);
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(`${label} has an invalid validation regex configured`);
      }
      return;
    }
    if (trimmed.startsWith('maxLength:')) {
      const max = Number(trimmed.slice('maxLength:'.length));
      if (Number.isFinite(max) && value.length > max) {
        throw new BadRequestException(`${label} exceeds maximum length of ${max}`);
      }
      return;
    }
    if (trimmed.startsWith('minLength:')) {
      const min = Number(trimmed.slice('minLength:'.length));
      if (Number.isFinite(min) && value.length < min) {
        throw new BadRequestException(`${label} must be at least ${min} characters`);
      }
      return;
    }
    if (trimmed.startsWith('enum:')) {
      const options = trimmed.slice('enum:'.length).split('|').map((item) => item.trim()).filter(Boolean);
      if (options.length && !options.includes(value)) {
        throw new BadRequestException(`${label} must be one of: ${options.join(', ')}`);
      }
    }
  }

  private async resolveSection(projectId: string, sourceSystemId: string, extension: string, metadata: StoredMetadata) {
    const project = await this.db.projects.findOne({ where: { id: projectId }, relations: { sections: true } });
    if (!project) throw new NotFoundException('Project not found');
    const activeSections = (project.sections ?? []).filter((section) => section.active).sort((a, b) => a.position - b.position);
    if (metadata.sectionKey) {
      const explicit = activeSections.find((section) => section.sectionKey === metadata.sectionKey?.trim().toUpperCase());
      if (!explicit) throw new BadRequestException(`Configured section ${metadata.sectionKey} was not found for this project`);
      return explicit;
    }

    const rules = await this.db.routingRules.createQueryBuilder('rule')
      .leftJoinAndSelect('rule.project', 'project')
      .leftJoinAndSelect('rule.sourceSystem', 'sourceSystem')
      .where('rule.active = true')
      .andWhere(new Brackets((where) => where.where('project.id = :projectId', { projectId }).orWhere('project.id IS NULL')))
      .orderBy('rule.priority', 'ASC')
      .getMany();
    const normalizedType = metadata.documentType.trim().toLowerCase();
    const selected = rules.find((rule) => {
      if (rule.sourceSystem && getId(rule.sourceSystem) !== sourceSystemId) return false;
      if (rule.fileExtension && rule.fileExtension.toLowerCase() !== extension) return false;
      if (rule.documentType && rule.documentType.trim().toLowerCase() !== normalizedType) return false;
      if (rule.metadataKey && String(metadata.customMetadata?.[rule.metadataKey] ?? '') !== String(rule.metadataValue ?? '')) return false;
      return true;
    });
    const targetKey = selected?.targetSectionKey ?? metadata.documentType.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    const section = activeSections.find((item) => item.sectionKey === targetKey)
      ?? activeSections.find((item) => item.name.trim().toLowerCase() === normalizedType);
    if (!section) {
      throw new BadRequestException(`No routing rule resolved '${metadata.documentType}' to an active section. Configure a routing rule or choose a section explicitly.`);
    }
    return section;
  }

  private async nextDocumentCode(projectCode: string, sectionCode: string, projectId: string) {
    let sequence = await this.db.documents.count({ where: { project: { id: projectId } } }) + 1;
    while (true) {
      const code = `${projectCode}-${sectionCode}-${String(sequence).padStart(3, '0')}`;
      if (!(await this.db.documents.findOne({ where: { project: { id: projectId }, code } }))) return code;
      sequence += 1;
    }
  }

  private async resolveLogicalDocument(
    projectId: string,
    section: ProjectSection,
    metadata: StoredMetadata,
  ): Promise<{ document: Document | null; documentCode: string | undefined; mode: 'NEW' | 'NEW_VERSION' }> {
    const mode = metadata.mode === 'NEW_VERSION' ? 'NEW_VERSION' : 'NEW';
    const documentCode = metadata.documentCode?.trim().toUpperCase();

    if (mode === 'NEW_VERSION' && metadata.existingDocumentId?.trim()) {
      const document = await this.db.documents.findOne({
        where: { id: metadata.existingDocumentId.trim(), project: { id: projectId } },
        relations: { project: true, section: true, versions: { createdBy: true } },
      });
      if (!document) throw new BadRequestException('Selected existing document was not found');
      document.versions = (document.versions ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { document, documentCode: document.code, mode };
    }

    if (documentCode) {
      const document = await this.db.documents.findOne({
        where: { project: { id: projectId }, code: documentCode },
        relations: { project: true, section: true, versions: { createdBy: true } },
      });
      if (document) {
        document.versions = (document.versions ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return { document, documentCode, mode: 'NEW_VERSION' };
      }
    }

    return { document: null, documentCode, mode };
  }

  private buildErrorDetails(
    document: Document | null,
    existingVersion: DocumentVersion,
    submittedVersion: string,
    section: ProjectSection,
  ) {
    return {
      documentId: document?.id ?? '',
      documentTitle: document?.title ?? '',
      documentCode: document?.code ?? '',
      existingVersionId: existingVersion?.id ?? '',
      existingVersion: existingVersion?.versionNo ?? '',
      submittedVersion,
      existingFileName: existingVersion?.originalFileName ?? '',
      existingImportDate: existingVersion?.createdAt ? existingVersion.createdAt.toISOString() : '',
      repositoryPath: existingVersion?.storagePath ?? section?.relativePath ?? '',
      repositorySection: section?.name ?? '',
      checksum: existingVersion?.checksum ?? '',
    };
  }

  /** Keycloak `sub` is not the local users.id — prefer email, then id. */
  private async resolveActor(userId?: string, userEmail?: string): Promise<User | null> {
    const email = userEmail?.trim();
    if (email) {
      const byEmail = await this.db.users.findOne({ where: { email } });
      if (byEmail) return byEmail;
    }
    if (userId) {
      return this.db.users.findOne({ where: { id: userId } });
    }
    return null;
  }
}