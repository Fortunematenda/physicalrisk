import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionItemStatus, FindingSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AssessmentsService } from '../assessments/assessments.service';
import type { AuthUser } from '../common/current-user.decorator';
import { ANALYST_ROLES, REVIEWER_ROLES, requireRole, hasRole, isInternal } from '../common/roles';

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assessments: AssessmentsService,
  ) {}

  async dashboard(user: AuthUser) {
    const where = isInternal(user)
      ? {}
      : { organisation: { memberships: { some: { userId: user.id } } } };
    const items = await this.prisma.actionItem.findMany({
      where,
      include: {
        organisation: { select: { id: true, name: true } },
        assessment: { select: { id: true, reference: true, title: true } },
        ownerUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    const now = Date.now();
    return {
      all: items,
      overdue: items.filter((i) => i.dueDate && i.dueDate.getTime() < now && !['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(i.status)),
      upcoming: items.filter((i) => i.dueDate && i.dueDate.getTime() >= now && !['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(i.status)),
      byStatus: groupBy(items, (i) => i.status),
      byPriority: groupBy(items, (i) => i.priority),
      byOwner: groupBy(items, (i) => i.ownerName || i.ownerUser?.email || 'Unassigned'),
      expectedVsRealised: {
        expected: items.reduce((s, i) => s + Number(i.expectedBenefit || 0), 0),
        actual: items.reduce((s, i) => s + Number(i.actualBenefit || 0), 0),
      },
    };
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
    },
    user: AuthUser,
  ) {
    const item = await this.prisma.actionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Action item not found.');
    await this.assessments.checkAccess(item.assessmentId, user);

    if (input.status === ActionItemStatus.VERIFIED) {
      requireRole(user, [...ANALYST_ROLES, ...REVIEWER_ROLES], 'Only analysts or reviewers may verify completion.');
    }

    const updated = await this.prisma.actionItem.update({
      where: { id },
      data: {
        status: input.status,
        progressPercent: input.progressPercent,
        comments: input.comments,
        actualBenefit: input.actualBenefit,
        completionEvidence: input.completionEvidence,
        ownerName: input.ownerName,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
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
      metadata: input,
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
  ) {
    requireRole(user, ANALYST_ROLES);
    await this.assessments.checkAccess(assessmentId, user);
    const assessment = await this.prisma.assessmentSession.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException('Assessment not found.');
    const count = await this.prisma.actionItem.count({ where: { assessmentId } });
    const reference = `MOSS-${assessment.reference}-A${String(count + 1).padStart(3, '0')}`;
    const row = await this.prisma.actionItem.create({
      data: {
        reference,
        assessmentId,
        organisationId: assessment.organisationId,
        title: input.title,
        description: input.description,
        priority: input.priority || FindingSeverity.MEDIUM,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        findingId: input.findingId,
        recommendationId: input.recommendationId,
        ownerName: input.ownerName,
        status: ActionItemStatus.PLANNED,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ACTION_ITEM_CREATED',
      entityType: 'ActionItem',
      entityId: row.id,
      metadata: { assessmentId },
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
