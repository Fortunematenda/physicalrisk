import { Injectable } from '@nestjs/common';
import { formatMossScoreDisplay } from '@moss/shared';
import { ProductCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { ANALYST_ROLES, hasRole } from '../../common/roles';
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

    const rawDomainScores = (snapshot?.domainScores as any[]) || evaluated?.domainScores || [];
    // Snapshot stores domainName; PDF historically read name — expose both.
    const domainScores = [...rawDomainScores]
      .map((d: any) => ({
        ...d,
        name: d.name || d.domainName || d.domainCode,
        domainName: d.domainName || d.name || d.domainCode,
      }))
      .sort((a: any, b: any) => String(a.domainCode || '').localeCompare(String(b.domainCode || '')));
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
      select: {
        id: true,
        controlCode: true,
        name: true,
        evidenceStandards: true,
        domain: { select: { domainCode: true, name: true } },
      },
      orderBy: [{ domain: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });
    const mcas = await this.prisma.mossControlAssessment.findMany({
      where: { assessmentId },
      select: { id: true, controlCode: true, mossControlId: true },
    });
    const mcaByControl = new Map(mcas.map((m) => [m.mossControlId, m]));
    const mcaById = new Map(mcas.map((m) => [m.id, m]));

    const evidenceDocs = await this.prisma.evidenceDocument.findMany({
      where: {
        assessmentId,
        mossControlAssessmentId: { not: null },
        status: { not: 'OUTDATED' },
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
        uploadedById: true,
        mossControlAssessmentId: true,
        description: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });
    const uploaderIds = [...new Set(evidenceDocs.map((e) => e.uploadedById).filter(Boolean))];
    const uploaders = uploaderIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: uploaderIds as string[] } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const uploaderById = new Map(uploaders.map((u) => [u.id, u]));

    const evidenceByMca = new Map<string, typeof evidenceDocs>();
    for (const doc of evidenceDocs) {
      const key = doc.mossControlAssessmentId as string;
      const list = evidenceByMca.get(key) || [];
      list.push(doc);
      evidenceByMca.set(key, list);
    }

    const controlByCode = new Map(controls.map((c) => [c.controlCode, c]));

    const evidenceUploaded = evidenceDocs.map((doc) => {
      const mca = mcaById.get(doc.mossControlAssessmentId as string);
      const control = mca ? controlByCode.get(mca.controlCode) : undefined;
      const uploader = doc.uploadedById ? uploaderById.get(doc.uploadedById) : undefined;
      return {
        id: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        uploadedAt: doc.uploadedAt,
        description: doc.description,
        controlCode: mca?.controlCode || null,
        controlName: control?.name || null,
        domainCode: control?.domain.domainCode || null,
        domainName: control?.domain.name || null,
        uploadedByName: uploader
          ? [uploader.firstName, uploader.lastName].filter(Boolean).join(' ') || uploader.email
          : null,
      };
    });

    const evidenceGaps = controls
      .map((c) => {
        const standards = c.evidenceStandards;
        const hasStandards =
          (Array.isArray(standards) && standards.length > 0) ||
          (standards && typeof standards === 'object' && Object.keys(standards as object).length > 0);
        if (!hasStandards) return null;
        const mca = mcaByControl.get(c.id);
        const uploaded = mca ? evidenceByMca.get(mca.id)?.length || 0 : 0;
        if (uploaded > 0) return null;
        const standardLabels = Array.isArray(standards)
          ? standards.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).slice(0, 8)
          : typeof standards === 'object' && standards
            ? Object.values(standards as object)
                .map((s) => (typeof s === 'string' ? s : JSON.stringify(s)))
                .slice(0, 8)
            : [];
        return {
          controlCode: c.controlCode,
          controlName: c.name,
          domainCode: c.domain.domainCode,
          domainName: c.domain.name,
          label: 'Evidence not yet uploaded',
          requiredStandards: standardLabels,
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

    const locked = Boolean(assessment?.lockedAt);
    const submittedAt = assessment?.submittedAt ?? null;
    const status = assessment?.status;

    return {
      productCode: ProductCode.MOSS,
      assessmentId,
      reference: assessment?.reference,
      organisation: assessment?.organisation,
      site: assessment?.site,
      catalogueVersion: assessment?.mossCatalogueVersion?.version || '3.0',
      status,
      submittedAt,
      reviewedAt: assessment?.reviewedAt ?? null,
      approvedAt: assessment?.approvedAt ?? null,
      lockedAt: assessment?.lockedAt ?? null,
      configurationStatus,
      scoringMethodology: `${config.domainAggregation} v${config.version}`,
      overallScore,
      overallScoreDisplay: formatMossScoreDisplay(overallScore, configurationStatus),
      overallScoreOutOf: 4,
      domainMaturityDisplay: formatMossScoreDisplay(domainMaturityAvg, configurationStatus),
      domainScores,
      controlScores,
      findings,
      evidenceGaps,
      evidenceUploaded,
      recommendations: recommendations.items,
      automaticRecommendationRules: recommendations.automaticRecommendationRules,
      completenessPercent,
      scoreDistribution: distribution,
      calculatedAt: snapshot?.calculatedAt || evaluated?.calculatedAt || null,
      workflow: {
        isEditable:
          !locked && ['DRAFT', 'IN_PROGRESS', 'AWAITING_CONTRIBUTOR'].includes(String(status)),
        isLocked: locked,
        canSubmit:
          completenessPercent >= 100 &&
          !submittedAt &&
          !locked &&
          !['REVIEWED', 'APPROVED', 'CLOSED', 'ARCHIVED'].includes(String(status)),
        canMarkReviewed:
          hasRole(user, ANALYST_ROLES) &&
          !locked &&
          Boolean(submittedAt) &&
          status !== 'REVIEWED' &&
          status !== 'APPROVED',
        canApprove:
          hasRole(user, ANALYST_ROLES) && !locked && status === 'REVIEWED',
        canReturn:
          hasRole(user, ANALYST_ROLES) &&
          !locked &&
          (status === 'SUBMITTED' || status === 'REVIEWED'),
        reviewGuide:
          status === 'APPROVED' || locked
            ? 'This assessment is approved and locked. Generate an Approved Executive Report from Results.'
            : status === 'REVIEWED'
              ? 'Analyst review is complete. Use Approve & lock when ready, then generate the Approved Executive Report.'
              : submittedAt
                ? 'Assessment is submitted for review. Use Mark reviewed, then Approve & lock. Preliminary PDFs stay marked preliminary until approval.'
                : completenessPercent >= 100
                  ? 'All controls are scored. Submit for review from Controls when ready — scoring completion is not approval.'
                  : 'Score controls and upload evidence on the Controls tab, then submit for review.',
      },
    };
  }
}
