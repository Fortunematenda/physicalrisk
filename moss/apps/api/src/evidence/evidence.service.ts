import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EvidenceStatus, ProductCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { ANALYST_ROLES, INTERNAL_ROLES, requireRole } from '../common/roles';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/octet-stream',
]);

/** Evidence is shared across Cost Leakage, Triage, and Advisory engagements. */
const EVIDENCE_PRODUCTS = new Set<string>([
  ProductCode.SCLI_COST_LEAKAGE,
  ProductCode.EXECUTIVE_GOVERNANCE_TRIAGE,
  ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
  ProductCode.CONTRACT_SLA_ASSURANCE,
  ProductCode.VENDOR_PERFORMANCE_ASSURANCE,
  ProductCode.GOVERNANCE_EXECUTIVE_ASSURANCE,
  ProductCode.CYBER_PHYSICAL_DEPENDENCY,
  // LEGACY ONLY — historical Shield 360 evidence remains accessible.
  ProductCode.SHIELD360,
]);

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async assertEvidenceAccess(assessmentId: string, user: AuthUser) {
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: { organisationId: true, productCode: true, lockedAt: true },
    });
    if (!assessment || !EVIDENCE_PRODUCTS.has(String(assessment.productCode))) {
      throw new NotFoundException('Assessment not found.');
    }
    if (INTERNAL_ROLES.has(user.role)) return assessment;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId: assessment.organisationId } },
    });
    if (!membership) throw new ForbiddenException('You do not have access to this assessment.');
    return assessment;
  }

  async upload(
    assessmentId: string,
    file: Express.Multer.File,
    input: {
      title?: string;
      questionCode?: string;
      questionId?: string;
      inputDefinitionId?: string;
      documentType?: string;
      description?: string;
      evidencePeriod?: string;
      evidenceSource?: string;
      moduleCode?: string;
    },
    user: AuthUser,
  ) {
    const assessment = await this.assertEvidenceAccess(assessmentId, user);
    if (!file) throw new BadRequestException('A file is required.');
    if (file.size > 25 * 1024 * 1024) throw new BadRequestException('File exceeds the 25 MB limit.');
    const mime = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);
    if (assessment.lockedAt) throw new BadRequestException('Assessment is locked.');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const moduleCode = input.moduleCode?.trim() || null;
    const key = moduleCode
      ? `assessments/${assessmentId}/evidence/${moduleCode}/${Date.now()}-${safeName}`
      : `assessments/${assessmentId}/evidence/${Date.now()}-${safeName}`;
    await this.storage.put(key, file.buffer, mime);
    const record = await this.prisma.evidenceDocument.create({
      data: {
        assessmentId,
        title: input.title || file.originalname,
        questionCode: input.questionCode,
        questionId: input.questionId,
        inputDefinitionId: input.inputDefinitionId,
        documentType: input.documentType,
        description: input.description,
        evidencePeriod: input.evidencePeriod,
        evidenceSource: input.evidenceSource,
        moduleCode,
        uploadedById: user.id,
        fileName: file.originalname,
        mimeType: mime,
        sizeBytes: file.size,
        storageKey: key,
        status: EvidenceStatus.PENDING,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'UPLOAD_EVIDENCE',
      entityType: 'EvidenceDocument',
      entityId: record.id,
      metadata: { assessmentId, questionCode: input.questionCode, moduleCode },
    });
    return record;
  }

  async list(assessmentId: string, user: AuthUser, moduleCode?: string) {
    await this.assertEvidenceAccess(assessmentId, user);
    return this.prisma.evidenceDocument.findMany({
      where: {
        assessmentId,
        ...(moduleCode ? { moduleCode } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async updateStatus(
    id: string,
    input: { status: EvidenceStatus; reviewerNote?: string; findingId?: string },
    user: AuthUser,
  ) {
    requireRole(user, ANALYST_ROLES, 'Analyst or reviewer permission required.');
    const existing = await this.prisma.evidenceDocument.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Evidence not found.');
    await this.assertEvidenceAccess(existing.assessmentId, user);
    const record = await this.prisma.evidenceDocument.update({
      where: { id },
      data: {
        status: input.status,
        reviewerNote: input.reviewerNote,
        findingId: input.findingId,
        reviewerId: user.id,
        reviewedAt: new Date(),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'REVIEW_EVIDENCE',
      entityType: 'EvidenceDocument',
      entityId: id,
      metadata: { status: input.status, previous: existing.status },
    });
    return record;
  }

  async downloadUrl(id: string, user: AuthUser) {
    const record = await this.prisma.evidenceDocument.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Evidence not found.');
    await this.assertEvidenceAccess(record.assessmentId, user);
    return {
      url: await this.storage.signedDownloadUrl(record.storageKey),
      fileName: record.fileName,
      mimeType: record.mimeType,
      previewable: record.mimeType.startsWith('image/') || record.mimeType === 'application/pdf',
    };
  }

  async remove(id: string, user: AuthUser) {
    const record = await this.prisma.evidenceDocument.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Evidence not found.');
    const assessment = await this.assertEvidenceAccess(record.assessmentId, user);
    requireRole(user, ANALYST_ROLES, 'Analyst or reviewer permission required.');
    if (assessment.lockedAt) throw new BadRequestException('Assessment is locked.');
    await this.prisma.evidenceDocument.delete({ where: { id } });
    try {
      await this.storage.delete(record.storageKey);
    } catch {
      // Best-effort storage cleanup; DB row is already removed.
    }
    await this.audit.record({
      userId: user.id,
      action: 'DELETE_EVIDENCE',
      entityType: 'EvidenceDocument',
      entityId: id,
      metadata: {
        assessmentId: record.assessmentId,
        moduleCode: record.moduleCode,
        fileName: record.fileName,
      },
    });
    return { ok: true };
  }
}
