import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FindingSeverity, ProductCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';

const MANUAL_SEVERITIES = new Set<FindingSeverity>([
  FindingSeverity.INFORMATIONAL,
  FindingSeverity.LOW,
  FindingSeverity.MEDIUM,
  FindingSeverity.HIGH,
  FindingSeverity.CRITICAL,
]);

const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  INFORMATIONAL: 'Informational',
  LOW: 'Low',
  MEDIUM: 'Medium',
  MODERATE: 'Moderate',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

@Injectable()
export class MossFindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: MossAssessmentsService,
    private readonly audit: AuditService,
  ) {}

  private async nextReference(assessmentId: string) {
    const count = await this.prisma.finding.count({ where: { assessmentId, productCode: ProductCode.MOSS } });
    return `MOSS-F-${String(count + 1).padStart(4, '0')}`;
  }

  private severityDisplay(severity: FindingSeverity | null | undefined) {
    if (!severity) return 'Not classified';
    return SEVERITY_LABELS[severity] || severity;
  }

  /** Assessor-chosen severity only — no score→severity auto-mapping in v1. */
  private parseSeverity(raw: unknown, { allowClear = false }: { allowClear?: boolean } = {}) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '' || raw === 'NOT_CLASSIFIED') {
      return allowClear ? null : undefined;
    }
    const value = String(raw).trim().toUpperCase();
    if (value === 'MODERATE') {
      return FindingSeverity.MEDIUM;
    }
    if (!MANUAL_SEVERITIES.has(value as FindingSeverity)) {
      throw new BadRequestException(
        'severity must be one of INFORMATIONAL, LOW, MEDIUM, HIGH, CRITICAL, or empty for Not classified.',
      );
    }
    return value as FindingSeverity;
  }

  async list(assessmentId: string, user: AuthUser) {
    await this.assessments.requireMossAssessment(assessmentId, user);
    const findings = await this.prisma.finding.findMany({
      where: { assessmentId, productCode: ProductCode.MOSS },
      orderBy: { createdAt: 'desc' },
      include: {
        mossControlAssessment: {
          select: { controlCode: true, assessorScore: true, score: true, status: true },
        },
      },
    });
    return findings.map((f) => ({
      id: f.id,
      reference: f.reference,
      title: f.title,
      description: f.description,
      controlCode: f.mossControlAssessment?.controlCode || null,
      domainCode: (f.relatedQuestionCodes as any)?.domainCode || null,
      score: f.mossControlAssessment?.assessorScore ?? f.mossControlAssessment?.score ?? null,
      severity: f.severity,
      severityDisplay: this.severityDisplay(f.severity),
      status: f.status,
      assessorComment: f.managementResponse,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  async create(
    assessmentId: string,
    body: {
      controlCode?: string;
      title: string;
      description?: string;
      assessorComment?: string;
      promoteFindingText?: boolean;
      severity?: string | null;
    },
    user: AuthUser,
  ) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    if (!body.title?.trim()) {
      throw new BadRequestException('title is required.');
    }

    let mcaId: string | null = null;
    let controlCode: string | null = body.controlCode?.toUpperCase() || null;
    let domainCode: string | null = null;
    let score: number | null = null;
    let description = body.description?.trim() || '';
    const severity = this.parseSeverity(body.severity, { allowClear: true }) ?? null;

    if (controlCode) {
      const control = await this.prisma.mossControl.findUnique({
        where: {
          catalogueVersionId_controlCode: {
            catalogueVersionId: access.mossCatalogueVersionId,
            controlCode,
          },
        },
        include: { domain: true },
      });
      if (!control) throw new NotFoundException(`Control ${controlCode} not found.`);
      domainCode = control.domain.domainCode;
      let mca = await this.prisma.mossControlAssessment.findUnique({
        where: { assessmentId_mossControlId: { assessmentId, mossControlId: control.id } },
      });
      if (!mca && body.promoteFindingText) {
        mca = await this.prisma.mossControlAssessment.create({
          data: { assessmentId, mossControlId: control.id, controlCode },
        });
      }
      if (mca) {
        mcaId = mca.id;
        score = mca.assessorScore ?? mca.score;
        if (body.promoteFindingText && mca.findingText?.trim() && !description) {
          description = mca.findingText.trim();
        }
      }
    }

    if (!description) {
      throw new BadRequestException(
        body.promoteFindingText
          ? 'No control finding text to promote. Enter a finding on the control first.'
          : 'title and description are required.',
      );
    }

    const finding = await this.prisma.finding.create({
      data: {
        assessmentId,
        productCode: ProductCode.MOSS,
        mossControlAssessmentId: mcaId,
        reference: await this.nextReference(assessmentId),
        title: body.title.trim(),
        category: domainCode || 'MOSS',
        description,
        severity,
        analystId: user.id,
        managementResponse: body.assessorComment?.trim() || null,
        relatedQuestionCodes: domainCode || controlCode ? { domainCode, controlCode } : undefined,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_FINDING_CREATED',
      entityType: 'Finding',
      entityId: finding.id,
      organisationId: access.organisationId,
      metadata: { assessmentId, controlCode, domainCode, severity },
    });

    return {
      ...finding,
      controlCode,
      domainCode,
      score,
      severityDisplay: this.severityDisplay(finding.severity),
    };
  }

  async update(
    assessmentId: string,
    findingId: string,
    body: {
      title?: string;
      description?: string;
      assessorComment?: string;
      status?: string;
      severity?: string | null;
    },
    user: AuthUser,
  ) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    const existing = await this.prisma.finding.findFirst({
      where: { id: findingId, assessmentId, productCode: ProductCode.MOSS },
    });
    if (!existing) throw new NotFoundException('Finding not found.');

    const severity = this.parseSeverity(body.severity, { allowClear: true });

    const updated = await this.prisma.finding.update({
      where: { id: findingId },
      data: {
        title: body.title?.trim() || undefined,
        description: body.description?.trim() || undefined,
        managementResponse:
          body.assessorComment === undefined ? undefined : body.assessorComment?.trim() || null,
        status: (body.status as any) || undefined,
        ...(severity !== undefined ? { severity } : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_FINDING_UPDATED',
      entityType: 'Finding',
      entityId: findingId,
      organisationId: access.organisationId,
      metadata: severity !== undefined ? { severity } : undefined,
    });

    return { ...updated, severityDisplay: this.severityDisplay(updated.severity) };
  }

  async remove(assessmentId: string, findingId: string, user: AuthUser) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    const existing = await this.prisma.finding.findFirst({
      where: { id: findingId, assessmentId, productCode: ProductCode.MOSS },
      select: { id: true, reference: true, title: true },
    });
    if (!existing) throw new NotFoundException('Finding not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.evidenceDocument.updateMany({
        where: { findingId },
        data: { findingId: null },
      });
      await tx.actionItem.updateMany({
        where: { findingId },
        data: { findingId: null },
      });
      await tx.finding.delete({ where: { id: findingId } });
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_FINDING_DELETED',
      entityType: 'Finding',
      entityId: findingId,
      organisationId: access.organisationId,
      metadata: { assessmentId, reference: existing.reference, title: existing.title },
    });

    return { id: findingId, deleted: true, message: 'Finding deleted.' };
  }
}
