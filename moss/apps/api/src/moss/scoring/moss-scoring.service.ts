import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  evaluateMossScores,
  defaultUnconfiguredMossScoringConfig,
  formatMossScoreDisplay,
  isUnconfigured,
  MOSS_SCORING_CONFIG_V1_VERSION,
  type MossScoringConfig,
  type MossScoringResult,
} from '@moss/shared';
import { MossAggregationMode, MossScoringConfigStatus, Prisma, ProductCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';

@Injectable()
export class MossScoringService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MossAssessmentsService))
    private readonly assessments: MossAssessmentsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Publish live v1.0.0 MEAN methodology (idempotent).
   * Domain = unweighted mean of scored controls; overall = unweighted mean of domain scores.
   */
  async ensurePublishedMeanV1(catalogueVersionId?: string | null) {
    const version = MOSS_SCORING_CONFIG_V1_VERSION;
    const notes =
      'Client-accepted recommended defaults (2026-08-13): unweighted MEAN domain + overall. ' +
      'No critical overrides; no auto severity; no auto recommendations in v1.';

    return this.prisma.mossScoringConfiguration.upsert({
      where: { version },
      update: {
        status: MossScoringConfigStatus.PUBLISHED,
        domainAggregation: MossAggregationMode.MEAN,
        overallAggregation: MossAggregationMode.MEAN,
        publishedAt: new Date(),
        notes,
        ...(catalogueVersionId ? { catalogueVersionId } : {}),
      },
      create: {
        version,
        status: MossScoringConfigStatus.PUBLISHED,
        domainAggregation: MossAggregationMode.MEAN,
        overallAggregation: MossAggregationMode.MEAN,
        catalogueVersionId: catalogueVersionId || null,
        publishedAt: new Date(),
        notes,
      },
    });
  }

  /** Load published config if present and not UNCONFIGURED; otherwise default unconfigured. */
  async resolveActiveConfig(catalogueVersionId: string): Promise<{
    config: MossScoringConfig;
    row: { id: string; version: string } | null;
  }> {
    await this.ensurePublishedMeanV1(catalogueVersionId);

    const row = await this.prisma.mossScoringConfiguration.findFirst({
      where: {
        status: MossScoringConfigStatus.PUBLISHED,
        domainAggregation: { not: MossAggregationMode.UNCONFIGURED },
        overallAggregation: { not: MossAggregationMode.UNCONFIGURED },
        OR: [{ catalogueVersionId }, { catalogueVersionId: null }],
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (!row) {
      return { config: defaultUnconfiguredMossScoringConfig(), row: null };
    }

    const config: MossScoringConfig = {
      version: row.version,
      status: 'PUBLISHED',
      domainAggregation: row.domainAggregation as MossScoringConfig['domainAggregation'],
      overallAggregation: row.overallAggregation as MossScoringConfig['overallAggregation'],
      domainWeights: (row.domainWeights as Record<string, number> | null) || undefined,
      criticalControlPolicy: row.criticalControlPolicy,
      severityMapping: row.severityMapping,
      recommendationPolicy: row.recommendationPolicy,
    };

    if (isUnconfigured(config)) {
      return {
        config: defaultUnconfiguredMossScoringConfig(row.version),
        row: { id: row.id, version: row.version },
      };
    }

    return { config, row: { id: row.id, version: row.version } };
  }

  /** Live score compute without persisting a snapshot (workspace/dashboard). */
  async computeScores(assessmentId: string, catalogueVersionId: string): Promise<{
    result: MossScoringResult;
    config: MossScoringConfig;
    configRow: { id: string; version: string } | null;
    overallMossScore: string;
    domainMaturity: string;
  }> {
    const controls = await this.prisma.mossControl.findMany({
      where: { catalogueVersionId },
      include: { domain: true },
      orderBy: [{ domain: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });
    const rows = await this.prisma.mossControlAssessment.findMany({
      where: { assessmentId },
    });
    const byControlId = new Map(rows.map((r) => [r.mossControlId, r]));

    const inputs = controls.map((c) => {
      const row = byControlId.get(c.id);
      return {
        controlCode: c.controlCode,
        domainCode: c.domain.domainCode,
        assessorScore: row?.assessorScore ?? row?.score ?? null,
        finalScore: null as number | null,
        status: row?.status ?? 'NOT_STARTED',
      };
    });

    const domainOrder = [...new Set(controls.map((c) => c.domain.domainCode))];
    const { config, row: configRow } = await this.resolveActiveConfig(catalogueVersionId);
    const result = evaluateMossScores(inputs, config, domainOrder);

    return {
      result,
      config,
      configRow,
      overallMossScore: formatMossScoreDisplay(result.overallScore, result.configurationStatus),
      domainMaturity: formatMossScoreDisplay(result.overallScore, result.configurationStatus),
    };
  }

  async evaluate(assessmentId: string, user: AuthUser) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);
    const catalogueVersionId = access.mossCatalogueVersionId;

    const { result, config, configRow } = await this.computeScores(assessmentId, catalogueVersionId);

    const domainMeta = await this.prisma.mossDomain.findMany({
      where: { catalogueVersionId },
      select: { domainCode: true, name: true },
    });
    const nameByCode = new Map(domainMeta.map((d) => [d.domainCode, d.name]));

    const domainScores = result.domainScores.map((d) => ({
      ...d,
      domainName: nameByCode.get(d.domainCode) || d.domainCode,
    }));

    const snapshot = await this.prisma.mossScoreSnapshot.create({
      data: {
        assessmentId,
        catalogueVersionId,
        configurationId: configRow?.id ?? null,
        configurationVersion: configRow?.version ?? config.version,
        overallScore:
          result.overallScore == null ? null : new Prisma.Decimal(result.overallScore),
        domainScores: domainScores as unknown as Prisma.InputJsonValue,
        controlScores: result.controlScores as unknown as Prisma.InputJsonValue,
        completenessPercent: new Prisma.Decimal(result.completenessPercent),
        calculationTrace: result.calculationTrace as Prisma.InputJsonValue,
        calculatedAt: new Date(),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_EVALUATED',
      entityType: 'MossScoreSnapshot',
      entityId: snapshot.id,
      organisationId: access.organisationId,
      metadata: {
        assessmentId,
        configurationStatus: result.configurationStatus,
        completenessPercent: result.completenessPercent,
        overallScore: result.overallScore,
      },
    });

    return {
      snapshotId: snapshot.id,
      productCode: ProductCode.MOSS,
      assessmentId,
      configurationStatus: result.configurationStatus,
      overallScore: result.overallScore,
      domainScores,
      controlScores: result.controlScores,
      completenessPercent: result.completenessPercent,
      calculatedAt: snapshot.calculatedAt,
      aggregation: result.aggregation,
      calculationTrace: result.calculationTrace,
    };
  }

  /** Ensure a sentinel UNCONFIGURED draft exists (idempotent). */
  async ensureUnconfiguredSentinel(catalogueVersionId?: string) {
    const version = '0.0.0-unconfigured';
    return this.prisma.mossScoringConfiguration.upsert({
      where: { version },
      update: {},
      create: {
        version,
        status: MossScoringConfigStatus.DRAFT,
        domainAggregation: MossAggregationMode.UNCONFIGURED,
        overallAggregation: MossAggregationMode.UNCONFIGURED,
        catalogueVersionId: catalogueVersionId || null,
        notes: 'Historical sentinel — superseded by published MEAN v1.0.0 after client confirmation.',
      },
    });
  }

  /**
   * Admin read-only view of the published scoring methodology (MEAN v1.0.0).
   * Ensures the published config exists, then returns it with catalogue binding.
   */
  async adminSummary() {
    const catalogue = await this.prisma.mossCatalogueVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        version: true,
        title: true,
        status: true,
        publishedAt: true,
      },
    });

    const row = await this.ensurePublishedMeanV1(catalogue?.id || null);
    const published = await this.prisma.mossScoringConfiguration.findUnique({
      where: { id: row.id },
      include: {
        catalogueVersion: {
          select: { id: true, version: true, title: true, status: true },
        },
      },
    });

    const history = await this.prisma.mossScoringConfiguration.findMany({
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        version: true,
        status: true,
        domainAggregation: true,
        overallAggregation: true,
        publishedAt: true,
        createdAt: true,
        notes: true,
      },
      take: 10,
    });

    const configured =
      published != null
      && published.status === MossScoringConfigStatus.PUBLISHED
      && published.domainAggregation !== MossAggregationMode.UNCONFIGURED
      && published.overallAggregation !== MossAggregationMode.UNCONFIGURED;

    return {
      readOnly: true,
      immutable: true,
      note:
        'Published MEAN v1.0.0 is read-only in this release. Weighting, critical overrides, auto severity, and auto recommendations are not enabled.',
      configurationStatus: configured ? 'CONFIGURED' : 'PENDING_METHODOLOGY',
      catalogue: catalogue
        ? {
            id: catalogue.id,
            version: catalogue.version,
            title: catalogue.title,
            status: catalogue.status,
            publishedAt: catalogue.publishedAt,
          }
        : null,
      active: published
        ? {
            id: published.id,
            version: published.version,
            status: published.status,
            domainAggregation: published.domainAggregation,
            overallAggregation: published.overallAggregation,
            domainWeights: published.domainWeights,
            criticalControlPolicy: published.criticalControlPolicy,
            severityMapping: published.severityMapping,
            recommendationPolicy: published.recommendationPolicy,
            notes: published.notes,
            publishedAt: published.publishedAt,
            createdAt: published.createdAt,
            updatedAt: published.updatedAt,
            catalogueVersion: published.catalogueVersion,
          }
        : null,
      methodology: {
        controlScale: '0–4 maturity',
        domainAggregationLabel: 'Unweighted mean of scored controls in the domain',
        overallAggregationLabel: 'Unweighted mean of domain scores',
        scoreLabels: {
          '0': 'Non-existent',
          '1': 'Ad hoc',
          '2': 'Basic',
          '3': 'Effective',
          '4': 'Optimised',
        },
        deferred: [
          'Domain / overall weighting',
          'Critical control overrides',
          'Automatic score → severity mapping',
          'Automatic recommendation generation',
        ],
      },
      history,
    };
  }
}
