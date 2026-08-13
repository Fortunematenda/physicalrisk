import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { StorageService } from '../../evidence/storage.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';

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

@Injectable()
export class MossEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly assessments: MossAssessmentsService,
  ) {}

  private async requireControl(assessmentId: string, controlCode: string, user: AuthUser) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    const control = await this.prisma.mossControl.findUnique({
      where: {
        catalogueVersionId_controlCode: {
          catalogueVersionId: access.mossCatalogueVersionId,
          controlCode: controlCode.toUpperCase(),
        },
      },
      include: { domain: true },
    });
    if (!control) throw new NotFoundException(`Control ${controlCode} not found.`);
    return { access, control };
  }

  async list(assessmentId: string, controlCode: string, user: AuthUser) {
    const { control } = await this.requireControl(assessmentId, controlCode, user);
    const mca = await this.prisma.mossControlAssessment.findUnique({
      where: { assessmentId_mossControlId: { assessmentId, mossControlId: control.id } },
    });
    const evidence = await this.prisma.evidenceDocument.findMany({
      where: {
        assessmentId,
        OR: [
          mca ? { mossControlAssessmentId: mca.id } : undefined,
          // also match by questionCode misuse prevention: only mossControlAssessmentId for MOSS
        ].filter(Boolean) as any,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    // If no MCA yet, return empty (lazy) — no SCLI question evidence.
    return {
      controlCode: control.controlCode,
      evidenceStandards: control.evidenceStandards,
      evidence: mca
        ? evidence
        : await this.prisma.evidenceDocument.findMany({
            where: { assessmentId, mossControlAssessmentId: { not: null }, mossControlAssessment: { mossControlId: control.id } },
            orderBy: { uploadedAt: 'desc' },
          }),
    };
  }

  async upload(
    assessmentId: string,
    controlCode: string,
    file: Express.Multer.File,
    user: AuthUser,
    meta?: { title?: string; description?: string },
  ) {
    const { access, control } = await this.requireControl(assessmentId, controlCode, user);
    if (access.lockedAt) throw new BadRequestException('Assessment is locked.');
    if (!file) throw new BadRequestException('A file is required.');
    if (file.size > 25 * 1024 * 1024) throw new BadRequestException('File exceeds the 25 MB limit.');
    const mime = file.mimetype || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    // Ensure MCA exists (lazy) so evidence can link.
    let mca = await this.prisma.mossControlAssessment.findUnique({
      where: { assessmentId_mossControlId: { assessmentId, mossControlId: control.id } },
    });
    if (!mca) {
      mca = await this.prisma.mossControlAssessment.create({
        data: {
          assessmentId,
          mossControlId: control.id,
          controlCode: control.controlCode,
        },
      });
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `assessments/${assessmentId}/moss/${control.controlCode}/${Date.now()}-${safeName}`;
    await this.storage.put(key, file.buffer, mime);

    const record = await this.prisma.evidenceDocument.create({
      data: {
        assessmentId,
        mossControlAssessmentId: mca.id,
        title: meta?.title || file.originalname,
        description: meta?.description,
        documentType: 'MOSS_CONTROL_EVIDENCE',
        uploadedById: user.id,
        fileName: file.originalname,
        mimeType: mime,
        sizeBytes: file.size,
        storageKey: key,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_EVIDENCE_ADDED',
      entityType: 'EvidenceDocument',
      entityId: record.id,
      organisationId: access.organisationId,
      metadata: { assessmentId, controlCode: control.controlCode, productCode: ProductCode.MOSS },
    });

    return {
      ...record,
      evidenceStandards: control.evidenceStandards,
      labelNote: 'Catalogue lists expected evidence standards separately from uploaded files.',
    };
  }

  async downloadUrl(assessmentId: string, controlCode: string, evidenceId: string, user: AuthUser) {
    const { control } = await this.requireControl(assessmentId, controlCode, user);
    const doc = await this.prisma.evidenceDocument.findFirst({
      where: {
        id: evidenceId,
        assessmentId,
        mossControlAssessment: { mossControlId: control.id },
      },
    });
    if (!doc) throw new NotFoundException('Evidence not found for this MOSS control.');
    if (!doc.storageKey) throw new NotFoundException('Evidence file is missing.');
    const url = await this.storage.signedDownloadUrl(doc.storageKey);
    return {
      url,
      downloadUrl: url,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      previewable: Boolean(
        doc.mimeType?.startsWith('image/') || doc.mimeType === 'application/pdf',
      ),
    };
  }

  async archive(assessmentId: string, controlCode: string, evidenceId: string, user: AuthUser) {
    const { access, control } = await this.requireControl(assessmentId, controlCode, user);
    const doc = await this.prisma.evidenceDocument.findFirst({
      where: {
        id: evidenceId,
        assessmentId,
        mossControlAssessment: { mossControlId: control.id },
      },
    });
    if (!doc) throw new NotFoundException('Evidence not found for this MOSS control.');
    const updated = await this.prisma.evidenceDocument.update({
      where: { id: evidenceId },
      data: { status: 'OUTDATED' },
    });
    await this.audit.record({
      userId: user.id,
      action: 'MOSS_EVIDENCE_ARCHIVED',
      entityType: 'EvidenceDocument',
      entityId: evidenceId,
      organisationId: access.organisationId,
      metadata: { assessmentId, controlCode },
    });
    return updated;
  }
}
