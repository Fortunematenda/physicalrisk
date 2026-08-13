import { Injectable } from '@nestjs/common';
import { formatMossScoreDisplay } from '@moss/shared';
import { ProductCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { MossAssessmentsService } from '../assessments/moss-assessments.service';
import { MossScoringService } from '../scoring/moss-scoring.service';
import { MossFindingsService } from '../findings/moss-findings.service';
import { MossRecommendationsService } from '../recommendations/moss-recommendations.service';

@Injectable()
export class MossResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: MossAssessmentsService,
    private readonly scoring: MossScoringService,
    private readonly findings: MossFindingsService,
    private readonly recommendations: MossRecommendationsService,
  ) {}

  async getResults(assessmentId: string, user: AuthUser) {
    const access = await this.assessments.requireMossAssessment(assessmentId, user);

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      include: {
        organisation: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, siteCode: true } },
        mossCatalogueVersion: { select: { version: true, status: true, title: true } },
      },
    });

    const { config } = await this.scoring.resolveActiveConfig(access.mossCatalogueVersionId);

    // Prefer latest snapshot; re-evaluate when missing or built under old UNCONFIGURED methodology.
    let snapshot = await this.prisma.mossScoreSnapshot.findFirst({
      where: { assessmentId },
      orderBy: { calculatedAt: 'desc' },
    });
    let evaluated = null as Awaited<ReturnType<MossScoringService['evaluate']>> | null;
    const snapshotPending =
      !snapshot ||
      (snapshot.calculationTrace as { pendingMethodology?: boolean } | null)?.pendingMethodology === true ||
      snapshot.configurationVersion !== config.version;

    if (snapshotPending) {
      evaluated = await this.scoring.evaluate(assessmentId, user);
      snapshot = await this.prisma.mossScoreSnapshot.findUnique({ where: { id: evaluated.snapshotId } });
    }

    const domainScores = (snapshot?.domainScores as any[]) || evaluated?.domainScores || [];
    const controlScores = (snapshot?.controlScores as any[]) || evaluated?.controlScores || [];
    const completenessPercent = Number(snapshot?.completenessPercent ?? evaluated?.completenessPercent ?? 0);
    const overallScore = snapshot?.overallScore == null ? null : Number(snapshot.overallScore);
    const configurationStatus =
      evaluated?.configurationStatus ||
      ((snapshot?.calculationTrace as { pendingMethodology?: boolean } | null)?.pendingMethodology === false
        ? 'CONFIGURED'
        : 'CONFIGURED');

    const findings = await this.findings.list(assessmentId, user);
    const recommendations = await this.recommendations.list(assessmentId, user);

    const controls = await this.prisma.mossControl.findMany({
      where: { catalogueVersionId: access.mossCatalogueVersionId },
      select: { id: true, controlCode: true, evidenceStandards: true },
    });
    const mcas = await this.prisma.mossControlAssessment.findMany({
      where: { assessmentId },
      select: { id: true, controlCode: true, mossControlId: true },
    });
    const mcaByControl = new Map(mcas.map((m) => [m.mossControlId, m]));
    const evidenceCounts = await this.prisma.evidenceDocument.groupBy({
      by: ['mossControlAssessmentId'],
      where: {
        assessmentId,
        mossControlAssessmentId: { not: null },
        status: { not: 'OUTDATED' },
      },
      _count: true,
    });
    const evidenceByMca = new Map(
      evidenceCounts.map((e) => [e.mossControlAssessmentId as string, e._count]),
    );

    const evidenceGaps = controls
      .map((c) => {
        const standards = c.evidenceStandards;
        const hasStandards =
          (Array.isArray(standards) && standards.length > 0) ||
          (standards && typeof standards === 'object' && Object.keys(standards as object).length > 0);
        if (!hasStandards) return null;
        const mca = mcaByControl.get(c.id);
        const uploaded = mca ? evidenceByMca.get(mca.id) || 0 : 0;
        if (uploaded > 0) return null;
        return {
          controlCode: c.controlCode,
          label: 'Evidence not yet uploaded',
          notComplianceFailure: true,
        };
      })
      .filter(Boolean);

    const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, unscored: 0 };
    for (const c of controlScores) {
      if (c.score == null) distribution.unscored += 1;
      else if (c.score >= 0 && c.score <= 4) (distribution as any)[c.score] += 1;
    }

    const scoredDomains = domainScores.filter((d: any) => d.score != null);
    const domainMaturityAvg =
      scoredDomains.length > 0
        ? scoredDomains.reduce((a: number, d: any) => a + Number(d.score), 0) / scoredDomains.length
        : null;

    return {
      productCode: ProductCode.MOSS,
      assessmentId,
      reference: assessment?.reference,
      organisation: assessment?.organisation,
      site: assessment?.site,
      catalogueVersion: assessment?.mossCatalogueVersion?.version || '3.0',
      status: assessment?.status,
      configurationStatus,
      scoringMethodology: `${config.domainAggregation} v${config.version}`,
      overallScore,
      overallScoreDisplay: formatMossScoreDisplay(overallScore, configurationStatus),
      domainMaturityDisplay: formatMossScoreDisplay(domainMaturityAvg, configurationStatus),
      domainScores,
      controlScores,
      findings,
      evidenceGaps,
      recommendations: recommendations.items,
      automaticRecommendationRules: recommendations.automaticRecommendationRules,
      completenessPercent,
      scoreDistribution: distribution,
      calculatedAt: snapshot?.calculatedAt || evaluated?.calculatedAt || null,
    };
  }
}
