import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActionItemStatus, FindingSeverity, ProductCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { requireRole, isInternal } from '../common/roles';

const ACTION_WRITE_ROLES = new Set([
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
]);

type ProductFilter = typeof ProductCode.SCLI_COST_LEAKAGE | typeof ProductCode.MOSS;

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertAssessmentAccess(
    assessmentId: string,
    user: AuthUser,
    productCode: ProductFilter,
  ) {
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        organisationId: true,
        productCode: true,
        reference: true,
        title: true,
      },
    });
    if (!assessment || assessment.productCode !== productCode) {
      throw new NotFoundException('Assessment not found.');
    }
    if (!isInternal(user)) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organisationId: {
            userId: user.id,
            organisationId: assessment.organisationId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException('You do not have access to this assessment.');
      }
    }
    return assessment;
  }

  private async assertActionAccess(actionId: string, user: AuthUser) {
    const item = await this.prisma.actionItem.findUnique({
      where: { id: actionId },
      include: {
        assessment: {
          select: {
            id: true,
            organisationId: true,
            productCode: true,
            reference: true,
          },
        },
      },
    });
    if (!item?.assessment) throw new NotFoundException('Action item not found.');
    await this.assertAssessmentAccess(
      item.assessmentId,
      user,
      item.assessment.productCode as ProductFilter,
    );
    return item;
  }

  async dashboard(user: AuthUser, productCode: ProductFilter = ProductCode.SCLI_COST_LEAKAGE) {
    const where = {
      assessment: { productCode },
      ...(isInternal(user)
        ? {}
        : { organisation: { memberships: { some: { userId: user.id } } } }),
    };
    const items = await this.prisma.actionItem.findMany({
      where,
      include: {
        organisation: { select: { id: true, name: true } },
        assessment: {
          select: {
            id: true,
            reference: true,
            title: true,
            productCode: true,
          },
        },
        finding: {
          select: {
            id: true,
            reference: true,
            title: true,
            mossControlAssessment: { select: { controlCode: true } },
          },
        },
        recommendation: { select: { id: true, title: true, controlCode: true } },
        ownerUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    const now = Date.now();
    const closed = new Set(['COMPLETED', 'VERIFIED', 'CANCELLED']);
    const mapped = items.map((i) => ({
      ...i,
      finding: i.finding
        ? {
            id: i.finding.id,
            reference: i.finding.reference,
            title: i.finding.title,
            controlCode: i.finding.mossControlAssessment?.controlCode || null,
          }
        : null,
    }));
    return {
      productCode,
      all: mapped,
      overdue: mapped.filter(
        (i) => i.dueDate && i.dueDate.getTime() < now && !closed.has(i.status),
      ),
      upcoming: mapped.filter(
        (i) => i.dueDate && i.dueDate.getTime() >= now && !closed.has(i.status),
      ),
      byStatus: groupBy(mapped, (i) => i.status),
      byPriority: groupBy(mapped, (i) => i.priority),
      byOwner: groupBy(mapped, (i) => i.ownerName || i.ownerUser?.email || 'Unassigned'),
      expectedVsRealised: {
        expected: mapped.reduce((s, i) => s + Number(i.expectedBenefit || 0), 0),
        actual: mapped.reduce((s, i) => s + Number(i.actualBenefit || 0), 0),
      },
    };
  }

  async listForAssessment(assessmentId: string, user: AuthUser, productCode: ProductFilter) {
    await this.assertAssessmentAccess(assessmentId, user, productCode);
    const items = await this.prisma.actionItem.findMany({
      where: { assessmentId },
      include: {
        finding: {
          select: {
            id: true,
            reference: true,
            title: true,
            mossControlAssessment: { select: { controlCode: true } },
          },
        },
        recommendation: { select: { id: true, title: true, controlCode: true } },
        ownerUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return items.map((i) => ({
      ...i,
      finding: i.finding
        ? {
            id: i.finding.id,
            reference: i.finding.reference,
            title: i.finding.title,
            controlCode: i.finding.mossControlAssessment?.controlCode || null,
          }
        : null,
    }));
  }

  async update(
    id: string,
    input: {
      status?: ActionItemStatus;
      progressPercent?: number;
      comments?: string;
      actualBenefit?: number;
      completionEvidence?: string;
      ownerName?: string;
      dueDate?: string;
      priority?: FindingSeverity;
      title?: string;
      description?: string;
    },
    user: AuthUser,
  ) {
    const item = await this.assertActionAccess(id, user);

    if (input.status === ActionItemStatus.VERIFIED) {
      requireRole(
        user,
        ACTION_WRITE_ROLES,
        'Only analysts or reviewers may verify completion.',
      );
    }

    if (input.progressPercent != null) {
      if (input.progressPercent < 0 || input.progressPercent > 100) {
        throw new BadRequestException('progressPercent must be between 0 and 100.');
      }
    }

    const updated = await this.prisma.actionItem.update({
      where: { id: item.id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.progressPercent !== undefined ? { progressPercent: input.progressPercent } : {}),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
        ...(input.actualBenefit !== undefined ? { actualBenefit: input.actualBenefit } : {}),
        ...(input.completionEvidence !== undefined
          ? { completionEvidence: input.completionEvidence }
          : {}),
        ...(input.ownerName !== undefined ? { ownerName: input.ownerName } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
        ...(input.status === ActionItemStatus.VERIFIED
          ? { verifiedById: user.id, verifiedAt: new Date(), verificationStatus: 'VERIFIED' }
          : {}),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ACTION_ITEM_UPDATED',
      entityType: 'ActionItem',
      entityId: id,
      organisationId: item.organisationId,
      metadata: { ...input, productCode: item.assessment.productCode },
    });
    return updated;
  }

  async create(
    assessmentId: string,
    input: {
      title: string;
      description?: string;
      priority?: FindingSeverity;
      dueDate?: string;
      findingId?: string;
      recommendationId?: string;
      ownerName?: string;
    },
    user: AuthUser,
    productCode: ProductFilter = ProductCode.SCLI_COST_LEAKAGE,
  ) {
    requireRole(user, ACTION_WRITE_ROLES);
    const assessment = await this.assertAssessmentAccess(assessmentId, user, productCode);

    if (input.findingId) {
      const finding = await this.prisma.finding.findFirst({
        where: { id: input.findingId, assessmentId },
        select: { id: true },
      });
      if (!finding) throw new BadRequestException('Finding not found on this assessment.');
    }
    if (input.recommendationId) {
      const recommendation = await this.prisma.recommendation.findFirst({
        where: { id: input.recommendationId, assessmentId },
        select: { id: true },
      });
      if (!recommendation) {
        throw new BadRequestException('Recommendation not found on this assessment.');
      }
    }

    const count = await this.prisma.actionItem.count({ where: { assessmentId } });
    const prefix = productCode === ProductCode.MOSS ? 'MOSS' : 'SCLI';
    const reference = `${prefix}-${assessment.reference}-A${String(count + 1).padStart(3, '0')}`;

    const row = await this.prisma.actionItem.create({
      data: {
        reference,
        assessmentId,
        organisationId: assessment.organisationId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        priority: input.priority || FindingSeverity.MEDIUM,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        findingId: input.findingId || null,
        recommendationId: input.recommendationId || null,
        ownerName: input.ownerName?.trim() || null,
        status: ActionItemStatus.PLANNED,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ACTION_ITEM_CREATED',
      entityType: 'ActionItem',
      entityId: row.id,
      organisationId: assessment.organisationId,
      metadata: { assessmentId, productCode, reference },
    });
    return row;
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}
