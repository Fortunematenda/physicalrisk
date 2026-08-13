import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MossRecommendationSource, ProductCode, RecommendationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';

@Injectable()
export class MossRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: MossAssessmentsService,
    private readonly audit: AuditService,
  ) {}

  async list(assessmentId: string, user: AuthUser) {
    await this.assessments.requireMossAssessment(assessmentId, user);
    const items = await this.prisma.recommendation.findMany({
      where: { assessmentId, productCode: ProductCode.MOSS },
      orderBy: { createdAt: 'desc' },
    });
    return {
      automaticRecommendationRules: 'PENDING CLIENT METHODOLOGY',
      ruleEngineEnabled: false,
      items,
    };
  }

  async create(
    assessmentId: string,
    body: {
      title: string;
      recommendation: string;
      controlCode?: string;
      domainCode?: string;
      source?: 'MANUAL' | 'CATALOGUE_TEMPLATE';
      useCatalogueTemplate?: 'technologySubstitutionLogic' | 'manpowerOptimisationLogic';
    },
    user: AuthUser,
  ) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    if (!body.title?.trim()) throw new BadRequestException('title is required.');

    let summary = body.recommendation?.trim() || '';
    let source: MossRecommendationSource = MossRecommendationSource.MANUAL;
    let controlCode = body.controlCode?.toUpperCase() || null;
    let domainCode = body.domainCode?.toUpperCase() || null;

    if (body.source === 'CATALOGUE_TEMPLATE' || body.useCatalogueTemplate) {
      if (!controlCode) throw new BadRequestException('controlCode required for catalogue template.');
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
      const field = body.useCatalogueTemplate || 'technologySubstitutionLogic';
      const text = (control as any)[field];
      if (typeof text !== 'string' || !text.trim()) {
        throw new BadRequestException(`Catalogue field ${field} is empty for ${controlCode}.`);
      }
      summary = text.trim();
      source = MossRecommendationSource.CATALOGUE_TEMPLATE;
    }

    if (!summary) throw new BadRequestException('recommendation text is required.');
    // RULE_ENGINE intentionally disabled
    if (body.source === ('RULE_ENGINE' as string)) {
      throw new BadRequestException('Automatic recommendation rules: PENDING CLIENT METHODOLOGY');
    }

    const rec = await this.prisma.recommendation.create({
      data: {
        assessmentId,
        productCode: ProductCode.MOSS,
        controlCode,
        domainCode,
        source,
        title: body.title.trim(),
        category: domainCode || 'MOSS',
        priority: null,
        summary,
        status: RecommendationStatus.PROPOSED,
        createdById: user.id,
        recommendationRuleId: null,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_RECOMMENDATION_CREATED',
      entityType: 'Recommendation',
      entityId: rec.id,
      organisationId: access.organisationId,
      metadata: { assessmentId, source, controlCode, domainCode },
    });

    return {
      ...rec,
      automaticRecommendationRules: 'PENDING CLIENT METHODOLOGY',
    };
  }

  async update(
    assessmentId: string,
    recommendationId: string,
    body: { title?: string; recommendation?: string; status?: string },
    user: AuthUser,
  ) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    const existing = await this.prisma.recommendation.findFirst({
      where: { id: recommendationId, assessmentId, productCode: ProductCode.MOSS },
    });
    if (!existing) throw new NotFoundException('Recommendation not found.');

    const updated = await this.prisma.recommendation.update({
      where: { id: recommendationId },
      data: {
        title: body.title?.trim() || undefined,
        summary: body.recommendation?.trim() || undefined,
        status: body.status as RecommendationStatus | undefined,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_RECOMMENDATION_UPDATED',
      entityType: 'Recommendation',
      entityId: recommendationId,
      organisationId: access.organisationId,
    });

    return updated;
  }

  async remove(assessmentId: string, recommendationId: string, user: AuthUser) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    const existing = await this.prisma.recommendation.findFirst({
      where: { id: recommendationId, assessmentId, productCode: ProductCode.MOSS },
      select: { id: true, title: true },
    });
    if (!existing) throw new NotFoundException('Recommendation not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.actionItem.updateMany({
        where: { recommendationId },
        data: { recommendationId: null },
      });
      await tx.recommendation.delete({ where: { id: recommendationId } });
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_RECOMMENDATION_DELETED',
      entityType: 'Recommendation',
      entityId: recommendationId,
      organisationId: access.organisationId,
      metadata: { assessmentId, title: existing.title },
    });

    return { id: recommendationId, deleted: true, message: 'Recommendation deleted.' };
  }
}
