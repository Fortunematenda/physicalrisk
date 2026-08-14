import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssessmentStatus,
  MossControlAssessmentStatus,
  Prisma,
  ProductCode,
  QuestionnaireStatus,
} from '@prisma/client';
import { formatMossScoreDisplay } from '@moss/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';
import { generateAssessmentReference } from '../../common/assessment-reference';
import { INTERNAL_ROLES, ANALYST_ROLES, hasRole } from '../../common/roles';
import { MossCatalogueService } from '../catalogue/moss-catalogue.service';
import { MossProgressService } from '../progress/moss-progress.service';
import { MossScoringService } from '../scoring/moss-scoring.service';
import type { UpdateMossControlAssessmentDto } from './dto/moss-control.dto';

const SCORE_LABELS: Record<number, string> = {
  0: 'Non-existent',
  1: 'Ad hoc',
  2: 'Basic',
  3: 'Effective',
  4: 'Optimised',
};

/**
 * Control assessment strategy: LAZY
 * MossControlAssessment rows are created only on PATCH/save, never on GET/read.
 */
@Injectable()
export class MossAssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: MossCatalogueService,
    private readonly progress: MossProgressService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => MossScoringService))
    private readonly scoring: MossScoringService,
  ) {}

  async requireMossAssessment(assessmentId: string, user: AuthUser) {
    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        organisationId: true,
        productCode: true,
        mossCatalogueVersionId: true,
        lockedAt: true,
        siteId: true,
        title: true,
        status: true,
      },
    });
    if (!assessment || assessment.productCode !== ProductCode.MOSS) {
      throw new NotFoundException('MOSS assessment not found.');
    }
    if (!INTERNAL_ROLES.has(user.role)) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_organisationId: { userId: user.id, organisationId: assessment.organisationId } },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this assessment.');
    }
    if (!assessment.mossCatalogueVersionId) {
      throw new BadRequestException('MOSS assessment is not bound to a catalogue version.');
    }
    return assessment as typeof assessment & { mossCatalogueVersionId: string };
  }

  /** Shell questionnaire satisfies required AssessmentSession.questionnaireVersionId FK without using SCLI content. */
  private async ensureMossQuestionnaireVersionId(catalogueVersion: string): Promise<string> {
    const questionnaire = await this.prisma.questionnaire.upsert({
      where: { code: 'MOSS' },
      update: {
        name: 'MOSS Master Catalogue',
        description: 'Shell questionnaire for AssessmentSession FK only. Controls live in MossControl.',
      },
      create: {
        code: 'MOSS',
        name: 'MOSS Master Catalogue',
        description: 'Shell questionnaire for AssessmentSession FK only. Controls live in MossControl.',
      },
    });
    let version = await this.prisma.questionnaireVersion.findUnique({
      where: {
        questionnaireId_version: {
          questionnaireId: questionnaire.id,
          version: catalogueVersion,
        },
      },
    });
    if (!version) {
      version = await this.prisma.questionnaireVersion.create({
        data: {
          questionnaireId: questionnaire.id,
          version: catalogueVersion,
          status: QuestionnaireStatus.PUBLISHED,
          methodologyNote: 'MOSS controls are stored in the Master Catalogue.',
          publishedAt: new Date(),
        },
      });
    }
    return version.id;
  }

  private async nextReference(tx: Prisma.TransactionClient): Promise<string> {
    return generateAssessmentReference(tx, ProductCode.MOSS);
  }

  private emptyControlAssessment(controlCode: string) {
    return {
      id: null as string | null,
      exists: false,
      controlCode,
      score: null as number | null,
      assessorScore: null as number | null,
      scoreRationale: null as string | null,
      comment: null as string | null,
      findingText: null as string | null,
      status: MossControlAssessmentStatus.NOT_STARTED,
      assessedAt: null as Date | null,
      assessedById: null as string | null,
    };
  }

  private mapControlAssessment(row: {
    id: string;
    controlCode: string;
    score: number | null;
    assessorScore: number | null;
    scoreRationale: string | null;
    comment: string | null;
    findingText: string | null;
    status: MossControlAssessmentStatus;
    assessedAt: Date | null;
    assessedById: string | null;
  }) {
    return {
      id: row.id,
      exists: true,
      controlCode: row.controlCode,
      score: row.score,
      assessorScore: row.assessorScore,
      scoreRationale: row.scoreRationale,
      comment: row.comment,
      findingText: row.findingText,
      status: row.status,
      assessedAt: row.assessedAt,
      assessedById: row.assessedById,
    };
  }

  async create(input: { organisationId: string; siteId?: string; title?: string }, user: AuthUser) {
    const published = await this.catalogue.requirePublished();
    const organisation = await this.prisma.organisation.findUnique({ where: { id: input.organisationId } });
    if (!organisation) throw new BadRequestException('Organisation not found.');

    if (!INTERNAL_ROLES.has(user.role)) {
      const membership = await this.prisma.membership.findUnique({
        where: { userId_organisationId: { userId: user.id, organisationId: input.organisationId } },
      });
      if (!membership) throw new ForbiddenException('You cannot create an assessment for this organisation.');
    }

    if (input.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
      if (!site || site.organisationId !== input.organisationId) {
        throw new BadRequestException('Site not found for this organisation.');
      }
    }

    const questionnaireVersionId = await this.ensureMossQuestionnaireVersionId(published.version);
    const title = input.title?.trim() || `${organisation.name} MOSS Assessment`;

    const assessment = await this.prisma.$transaction(async (tx) => {
      const reference = await this.nextReference(tx);
      return tx.assessmentSession.create({
        data: {
          reference,
          organisationId: organisation.id,
          questionnaireVersionId,
          productCode: ProductCode.MOSS,
          mossCatalogueVersionId: published.id,
          siteId: input.siteId || null,
          createdById: user.id,
          title,
          status: AssessmentStatus.DRAFT,
        },
        include: {
          organisation: { select: { id: true, name: true } },
          site: true,
          mossCatalogueVersion: { select: { id: true, version: true, title: true, status: true } },
        },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_CREATED',
      entityType: 'AssessmentSession',
      entityId: assessment.id,
      organisationId: organisation.id,
      metadata: { reference: assessment.reference, catalogueVersion: published.version },
    });

    const progress = await this.progress.forAssessment(assessment.id, published.id);
    return {
      ...assessment,
      controlsScored: progress.overall.assessed,
      controlsTotal: progress.overall.total,
      progressPercent: progress.overall.percent,
      scoreLabels: SCORE_LABELS,
      domainMaturity: '—',
      overallMossScore: '—',
      configurationStatus: 'CONFIGURED',
      controlAssessmentStrategy: 'LAZY',
    };
  }

  async update(id: string, input: { title?: string; siteId?: string | null }, user: AuthUser) {
    const assessment = await this.requireMossAssessment(id, user);
    if (input.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: input.siteId } });
      if (!site || site.organisationId !== assessment.organisationId) {
        throw new BadRequestException('Site not found for this organisation.');
      }
    }
    const updated = await this.prisma.assessmentSession.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.siteId !== undefined ? { siteId: input.siteId || null } : {}),
      },
      include: {
        organisation: { select: { id: true, name: true } },
        site: true,
        mossCatalogueVersion: { select: { id: true, version: true, title: true, status: true } },
      },
    });
    return updated;
  }

  async remove(id: string, user: AuthUser) {
    if (!['SUPER_ADMIN', 'METHODOLOGY_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Admin permission required.');
    }
    const assessment = await this.requireMossAssessment(id, user);
    if (assessment.lockedAt) {
      throw new BadRequestException('Locked assessments cannot be deleted. Unlock or archive workflow first.');
    }

    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { id: true, reference: true, productCode: true },
    });
    if (!existing || existing.productCode !== ProductCode.MOSS) {
      throw new NotFoundException('MOSS assessment not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.updateMany({
        where: { parentAssessmentId: id },
        data: { parentAssessmentId: null },
      });
      await tx.assessmentSession.delete({ where: { id } });
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_DELETED',
      entityType: 'AssessmentSession',
      entityId: id,
      organisationId: assessment.organisationId,
      metadata: { reference: existing.reference, productCode: ProductCode.MOSS },
    });

    return {
      id,
      deleted: true,
      message: 'MOSS assessment deleted.',
    };
  }

  async list(user: AuthUser) {
    const where: Prisma.AssessmentSessionWhereInput = {
      productCode: ProductCode.MOSS,
      ...(INTERNAL_ROLES.has(user.role)
        ? {}
        : { organisation: { memberships: { some: { userId: user.id } } } }),
    };

    const items = await this.prisma.assessmentSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        organisation: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, siteCode: true } },
        mossCatalogueVersion: { select: { id: true, version: true, title: true, status: true } },
      },
    });

    return Promise.all(
      items.map(async (item) => {
        if (item.mossCatalogueVersionId) {
          // Only repair stuck 100% sessions still marked draft/in-progress.
          if (item.status === 'DRAFT' || item.status === 'IN_PROGRESS') {
            await this.syncSessionStatusFromProgress(item.id, item.mossCatalogueVersionId, item.status);
          }
        }
        const fresh = item.mossCatalogueVersionId
          ? await this.prisma.assessmentSession.findUnique({
              where: { id: item.id },
              select: { status: true, submittedAt: true },
            })
          : null;
        const progress = item.mossCatalogueVersionId
          ? await this.progress.forAssessment(item.id, item.mossCatalogueVersionId)
          : { overall: { assessed: 0, total: 100, percent: 0 } };
        return {
          id: item.id,
          reference: item.reference,
          title: item.title,
          productCode: item.productCode,
          status: fresh?.status ?? item.status,
          submittedAt: fresh?.submittedAt ?? item.submittedAt,
          organisation: item.organisation,
          site: item.site,
          catalogueVersion: item.mossCatalogueVersion,
          controlsScored: progress.overall.assessed,
          controlsTotal: progress.overall.total,
          progressPercent: progress.overall.percent,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      }),
    );
  }

  async dashboard(user: AuthUser) {
    const catalogue = await this.catalogue.summary();
    const assessments = await this.list(user);
    const draft = assessments.filter((a) => a.status === AssessmentStatus.DRAFT || a.status === AssessmentStatus.IN_PROGRESS).length;
    const completed = assessments.filter((a) =>
      ['SUBMITTED', 'APPROVED', 'REPORT_GENERATED', 'REPORT_ISSUED', 'CLOSED', 'ARCHIVED'].includes(a.status),
    ).length;

    // Ensure MEAN v1 is published; portfolio overall is assessment-scoped.
    const published = await this.catalogue.requirePublished();
    await this.scoring.ensurePublishedMeanV1(published.id);

    return {
      product: 'MOSS',
      productName: 'Management of Security Systems',
      catalogue,
      counts: { active: assessments.length, draft, completed },
      recent: assessments.slice(0, 8),
      domainMaturity: 'Unweighted mean of scored controls',
      overallMossScore: 'Unweighted mean of domain scores',
      configurationStatus: 'CONFIGURED',
      scoringMethodology: 'MEAN v1.0.0',
    };
  }

  async getWorkspace(id: string, user: AuthUser) {
    const access = await this.requireMossAssessment(id, user);
    // Repair assessments already at 100% completion but still marked IN_PROGRESS.
    await this.syncSessionStatusFromProgress(id, access.mossCatalogueVersionId, access.status);

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: {
        organisation: { select: { id: true, name: true } },
        site: true,
        mossCatalogueVersion: true,
        mossControlAssessments: true,
      },
    });
    if (!assessment) throw new NotFoundException('MOSS assessment not found.');

    const progress = await this.progress.forAssessment(id, access.mossCatalogueVersionId);
    const domains = await this.prisma.mossDomain.findMany({
      where: { catalogueVersionId: access.mossCatalogueVersionId },
      orderBy: { sortOrder: 'asc' },
      include: { controls: { orderBy: { sortOrder: 'asc' } } },
    });
    const byControlId = new Map(assessment.mossControlAssessments.map((row) => [row.mossControlId, row]));
    const scoredIds = new Set(
      assessment.mossControlAssessments
        .filter((row) => row.score != null || row.assessorScore != null)
        .map((row) => row.mossControlId),
    );

    // Resume: first unscored control in catalogue order; else most recently assessed.
    let resumeControlCode: string | null = null;
    let resumeDomainCode: string | null = null;
    for (const domain of domains) {
      for (const c of domain.controls) {
        if (!scoredIds.has(c.id)) {
          resumeControlCode = c.controlCode;
          resumeDomainCode = domain.domainCode;
          break;
        }
      }
      if (resumeControlCode) break;
    }
    if (!resumeControlCode) {
      const latest = [...assessment.mossControlAssessments]
        .filter((r) => r.assessedAt)
        .sort((a, b) => (b.assessedAt?.getTime() || 0) - (a.assessedAt?.getTime() || 0))[0];
      if (latest) {
        const domain = domains.find((d) => d.controls.some((c) => c.id === latest.mossControlId));
        const control = domain?.controls.find((c) => c.id === latest.mossControlId);
        resumeControlCode = control?.controlCode || domains.at(-1)?.controls.at(-1)?.controlCode || null;
        resumeDomainCode = domain?.domainCode || domains.at(-1)?.domainCode || null;
      } else {
        resumeControlCode = domains[0]?.controls[0]?.controlCode || null;
        resumeDomainCode = domains[0]?.domainCode || null;
      }
    }

    const scoreSummary = await this.scoring.computeScores(id, access.mossCatalogueVersionId);
    const domainScoreByCode = new Map(
      scoreSummary.result.domainScores.map((d) => [d.domainCode, d]),
    );

    return {
      assessment: {
        id: assessment.id,
        reference: assessment.reference,
        title: assessment.title,
        status: assessment.status,
        organisation: assessment.organisation,
        site: assessment.site,
        catalogueVersion: assessment.mossCatalogueVersion,
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
        submittedAt: assessment.submittedAt,
        lockedAt: assessment.lockedAt,
        reviewedAt: assessment.reviewedAt,
        reviewNote: assessment.reviewNote,
        returnReason: assessment.returnReason,
        approvedAt: assessment.approvedAt,
      },
      catalogue: {
        id: assessment.mossCatalogueVersion?.id,
        version: assessment.mossCatalogueVersion?.version,
        title: assessment.mossCatalogueVersion?.title,
        status: assessment.mossCatalogueVersion?.status,
      },
      progress: {
        assessedControls: progress.overall.assessed,
        totalControls: progress.overall.total,
        completionPercent: progress.overall.percent,
      },
      resume: {
        controlCode: resumeControlCode,
        domainCode: resumeDomainCode,
      },
      // aliases used by local workspace UI
      controlsScored: progress.overall.assessed,
      controlsTotal: progress.overall.total,
      progressPercent: progress.overall.percent,
      canSubmit:
        progress.overall.total > 0 &&
        progress.overall.assessed >= progress.overall.total &&
        !assessment.submittedAt &&
        !assessment.lockedAt &&
        !['REVIEWED', 'APPROVED', 'CLOSED', 'ARCHIVED'].includes(assessment.status),
      isSubmitted: Boolean(assessment.submittedAt),
      workflow: {
        isEditable:
          !assessment.lockedAt &&
          ['DRAFT', 'IN_PROGRESS', 'AWAITING_CONTRIBUTOR'].includes(assessment.status),
        isLocked: Boolean(assessment.lockedAt),
        canMarkReviewed:
          hasRole(user, ANALYST_ROLES) &&
          !assessment.lockedAt &&
          Boolean(assessment.submittedAt) &&
          assessment.status !== AssessmentStatus.REVIEWED &&
          assessment.status !== AssessmentStatus.APPROVED,
        canApprove:
          hasRole(user, ANALYST_ROLES) &&
          !assessment.lockedAt &&
          assessment.status === AssessmentStatus.REVIEWED,
        canReturn:
          hasRole(user, ANALYST_ROLES) &&
          !assessment.lockedAt &&
          (assessment.status === AssessmentStatus.SUBMITTED ||
            assessment.status === AssessmentStatus.REVIEWED),
      },
      domains: domains.map((domain) => {
        const domainProg = progress.domains.find((d) => d.domainCode === domain.domainCode);
        const domainScore = domainScoreByCode.get(domain.domainCode);
        return {
          id: domain.id,
          domainCode: domain.domainCode,
          name: domain.name,
          description: domain.description,
          sortOrder: domain.sortOrder,
          assessedControls: domainProg?.assessed ?? 0,
          totalControls: domainProg?.total ?? domain.controls.length,
          completionPercent: domainProg?.percent ?? 0,
          scored: domainProg?.assessed ?? 0,
          total: domainProg?.total ?? domain.controls.length,
          maturityScore: formatMossScoreDisplay(
            domainScore?.score,
            scoreSummary.result.configurationStatus,
          ),
          domainScore: domainScore?.score ?? null,
          controls: domain.controls.map((c) => {
            const row = byControlId.get(c.id);
            return {
              id: c.id,
              controlCode: c.controlCode,
              name: c.name,
              controlFunction: c.controlFunction,
              sortOrder: c.sortOrder,
              status: row?.status ?? MossControlAssessmentStatus.NOT_STARTED,
              assessorScore: row?.assessorScore ?? null,
              score: row?.score ?? null,
              hasScore: scoredIds.has(c.id),
            };
          }),
        };
      }),
      scoreLabels: SCORE_LABELS,
      domainMaturity: scoreSummary.domainMaturity,
      overallMossScore: scoreSummary.overallMossScore,
      overallScore: scoreSummary.result.overallScore,
      configurationStatus: scoreSummary.result.configurationStatus,
      scoringMethodology: `${scoreSummary.config.domainAggregation} v${scoreSummary.config.version}`,
      controlAssessmentStrategy: 'LAZY',
    };
  }

  /**
   * Submit MOSS assessment. Incomplete submit allowed only with confirmIncomplete=true.
   * Does not require 100/100. Does not run M4 aggregation.
   */
  async submit(
    id: string,
    user: AuthUser,
    opts?: { confirmIncomplete?: boolean },
  ) {
    const access = await this.requireMossAssessment(id, user);
    if (access.lockedAt) throw new BadRequestException('Assessment is locked.');

    const progress = await this.progress.forAssessment(id, access.mossCatalogueVersionId);
    const incomplete = progress.overall.total <= 0 || progress.overall.assessed < progress.overall.total;

    const controls = await this.prisma.mossControl.findMany({
      where: { catalogueVersionId: access.mossCatalogueVersionId },
      select: { controlCode: true },
      orderBy: { sortOrder: 'asc' },
    });
    const scored = await this.prisma.mossControlAssessment.findMany({
      where: {
        assessmentId: id,
        OR: [{ assessorScore: { not: null } }, { score: { not: null } }],
      },
      select: { controlCode: true },
    });
    const scoredSet = new Set(scored.map((s) => s.controlCode));
    const unscoredControls = controls.map((c) => c.controlCode).filter((code) => !scoredSet.has(code));

    if (incomplete && !opts?.confirmIncomplete) {
      throw new BadRequestException({
        message: 'Assessment is incomplete. Resubmit with confirmIncomplete=true to submit anyway.',
        code: 'MOSS_INCOMPLETE_SUBMIT_CONFIRMATION_REQUIRED',
        controlsScored: progress.overall.assessed,
        controlsTotal: progress.overall.total,
        completenessPercent: progress.overall.percent,
        unscoredControls,
      });
    }

    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { submittedAt: true },
    });
    if (existing?.submittedAt) {
      return this.getWorkspace(id, user);
    }

    await this.prisma.assessmentSession.update({
      where: { id },
      data: {
        status: AssessmentStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_SUBMITTED',
      entityType: 'AssessmentSession',
      entityId: id,
      organisationId: access.organisationId,
      metadata: {
        assessed: progress.overall.assessed,
        total: progress.overall.total,
        incomplete,
        confirmIncomplete: Boolean(opts?.confirmIncomplete),
        unscoredCount: unscoredControls.length,
      },
    });

    return this.getWorkspace(id, user);
  }

  /**
   * Analyst marks a submitted MOSS assessment as reviewed.
   * Does not require M4 aggregation / maturity scores.
   */
  async markReviewed(id: string, user: AuthUser, note?: string) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may mark MOSS assessments reviewed.');
    }
    const access = await this.requireMossAssessment(id, user);
    if (access.lockedAt) throw new BadRequestException('Assessment is locked.');

    const session = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { status: true, submittedAt: true, reviewNote: true },
    });
    if (!session) throw new NotFoundException('Assessment not found.');
    if (!session.submittedAt && session.status !== AssessmentStatus.SUBMITTED) {
      throw new BadRequestException('Submit the assessment before marking it reviewed.');
    }
    if (session.status === AssessmentStatus.REVIEWED) {
      return this.getWorkspace(id, user);
    }
    if (session.status === AssessmentStatus.APPROVED) {
      throw new BadRequestException('Assessment is already approved.');
    }
    if (
      session.status !== AssessmentStatus.SUBMITTED &&
      session.status !== AssessmentStatus.IN_PROGRESS
    ) {
      // Allow review from SUBMITTED primarily; IN_PROGRESS+submittedAt covers edge sync cases.
      if (!session.submittedAt) {
        throw new BadRequestException(`Cannot mark reviewed from status ${session.status}.`);
      }
    }

    await this.prisma.assessmentSession.update({
      where: { id },
      data: {
        status: AssessmentStatus.REVIEWED,
        reviewedAt: new Date(),
        reviewedById: user.id,
        reviewNote: note?.trim() || session.reviewNote,
        returnReason: null,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_REVIEWED',
      entityType: 'AssessmentSession',
      entityId: id,
      organisationId: access.organisationId,
      metadata: { note: note?.trim() || null },
    });

    return this.getWorkspace(id, user);
  }

  /**
   * Approve a reviewed MOSS assessment and lock further edits.
   * Does not invent maturity aggregation or generate MOSS PDFs.
   */
  async approve(id: string, user: AuthUser) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may approve MOSS assessments.');
    }
    const access = await this.requireMossAssessment(id, user);
    if (access.lockedAt && access.status === AssessmentStatus.APPROVED) {
      return this.getWorkspace(id, user);
    }

    const session = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { status: true, submittedAt: true },
    });
    if (!session) throw new NotFoundException('Assessment not found.');
    if (session.status !== AssessmentStatus.REVIEWED) {
      throw new BadRequestException('Mark the assessment as reviewed before approval.');
    }

    await this.prisma.assessmentSession.update({
      where: { id },
      data: {
        status: AssessmentStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: user.id,
        lockedAt: new Date(),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_APPROVED',
      entityType: 'AssessmentSession',
      entityId: id,
      organisationId: access.organisationId,
      metadata: {},
    });

    return this.getWorkspace(id, user);
  }

  /** Return a submitted/reviewed MOSS assessment to the assessor for more work. */
  async returnToClient(id: string, comment: string, user: AuthUser) {
    if (!hasRole(user, ANALYST_ROLES)) {
      throw new ForbiddenException('Only analysts or reviewers may return MOSS assessments.');
    }
    if (!comment?.trim()) {
      throw new BadRequestException('A comment is required when returning the assessment.');
    }
    const access = await this.requireMossAssessment(id, user);
    if (access.lockedAt) throw new BadRequestException('Assessment is locked.');

    const session = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!session) throw new NotFoundException('Assessment not found.');
    if (
      session.status !== AssessmentStatus.SUBMITTED &&
      session.status !== AssessmentStatus.REVIEWED
    ) {
      throw new BadRequestException(`Cannot return assessment from status ${session.status}.`);
    }

    await this.prisma.assessmentSession.update({
      where: { id },
      data: {
        status: AssessmentStatus.IN_PROGRESS,
        submittedAt: null,
        reviewedAt: null,
        reviewedById: null,
        returnReason: comment.trim(),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_ASSESSMENT_RETURNED',
      entityType: 'AssessmentSession',
      entityId: id,
      organisationId: access.organisationId,
      metadata: { comment: comment.trim() },
    });

    return this.getWorkspace(id, user);
  }

  async getDomainWorkspace(assessmentId: string, domainCode: string, user: AuthUser) {
    const access = await this.requireMossAssessment(assessmentId, user);
    const domain = await this.prisma.mossDomain.findUnique({
      where: {
        catalogueVersionId_domainCode: {
          catalogueVersionId: access.mossCatalogueVersionId,
          domainCode: domainCode.toUpperCase(),
        },
      },
      include: { controls: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!domain) throw new NotFoundException(`Domain ${domainCode} not found on this assessment catalogue.`);

    const rows = await this.prisma.mossControlAssessment.findMany({
      where: {
        assessmentId,
        mossControlId: { in: domain.controls.map((c) => c.id) },
      },
    });
    const byControlId = new Map(rows.map((r) => [r.mossControlId, r]));
    const progress = await this.progress.forAssessment(assessmentId, access.mossCatalogueVersionId);
    const domainProg = progress.domains.find((d) => d.domainCode === domain.domainCode);
    const scoreSummary = await this.scoring.computeScores(assessmentId, access.mossCatalogueVersionId);
    const domainScore = scoreSummary.result.domainScores.find((d) => d.domainCode === domain.domainCode);

    return {
      domain: {
        id: domain.id,
        domainCode: domain.domainCode,
        name: domain.name,
        description: domain.description,
        sortOrder: domain.sortOrder,
        assessedControls: domainProg?.assessed ?? 0,
        totalControls: domainProg?.total ?? domain.controls.length,
        completionPercent: domainProg?.percent ?? 0,
        maturityScore: formatMossScoreDisplay(
          domainScore?.score,
          scoreSummary.result.configurationStatus,
        ),
        domainScore: domainScore?.score ?? null,
      },
      controls: domain.controls.map((c) => {
        const row = byControlId.get(c.id);
        return {
          controlCode: c.controlCode,
          name: c.name,
          controlFunction: c.controlFunction,
          owner: c.owner,
          frequency: c.frequency,
          metric: c.metric,
          thresholdText: c.thresholdText,
          status: row?.status ?? MossControlAssessmentStatus.NOT_STARTED,
          assessment: row ? this.mapControlAssessment(row) : null,
        };
      }),
    };
  }

  /** Read-only: never creates MossControlAssessment rows. */
  async getControlState(assessmentId: string, controlCode: string, user: AuthUser) {
    const access = await this.requireMossAssessment(assessmentId, user);
    const control = await this.prisma.mossControl.findUnique({
      where: {
        catalogueVersionId_controlCode: {
          catalogueVersionId: access.mossCatalogueVersionId,
          controlCode: controlCode.toUpperCase(),
        },
      },
      include: { domain: true },
    });
    if (!control) throw new NotFoundException(`Control ${controlCode} not found on this assessment catalogue.`);

    const row = await this.prisma.mossControlAssessment.findUnique({
      where: { assessmentId_mossControlId: { assessmentId, mossControlId: control.id } },
    });

    const scoreSummary = await this.scoring.computeScores(assessmentId, access.mossCatalogueVersionId);

    return {
      control: this.catalogue.mapControlDetail(control),
      assessment: {
        controlAssessment: row ? this.mapControlAssessment(row) : this.emptyControlAssessment(control.controlCode),
      },
      scoreLabels: SCORE_LABELS,
      domainMaturity: scoreSummary.domainMaturity,
      overallMossScore: scoreSummary.overallMossScore,
      overallScore: scoreSummary.result.overallScore,
      configurationStatus: scoreSummary.result.configurationStatus,
      scoringMethodology: `${scoreSummary.config.domainAggregation} v${scoreSummary.config.version}`,
    };
  }

  async saveControl(assessmentId: string, controlCode: string, input: UpdateMossControlAssessmentDto, user: AuthUser) {
    const access = await this.requireMossAssessment(assessmentId, user);
    if (access.lockedAt) throw new BadRequestException('Assessment is locked.');
    if (
      access.status === AssessmentStatus.SUBMITTED ||
      access.status === AssessmentStatus.REVIEWED ||
      access.status === AssessmentStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Assessment is in review/approval and is read-only. Return it for edits to change scores.',
      );
    }

    if (input.assessorScore !== undefined && input.assessorScore !== null) {
      if (!Number.isInteger(input.assessorScore) || input.assessorScore < 0 || input.assessorScore > 4) {
        throw new BadRequestException('assessorScore must be an integer from 0 to 4.');
      }
    }

    const control = await this.prisma.mossControl.findUnique({
      where: {
        catalogueVersionId_controlCode: {
          catalogueVersionId: access.mossCatalogueVersionId,
          controlCode: controlCode.toUpperCase(),
        },
      },
    });
    if (!control) throw new NotFoundException(`Control ${controlCode} not found on this assessment catalogue.`);

    const existing = await this.prisma.mossControlAssessment.findUnique({
      where: { assessmentId_mossControlId: { assessmentId, mossControlId: control.id } },
    });

    const nextScore =
      input.assessorScore === undefined ? existing?.assessorScore ?? null : input.assessorScore;

    let status: MossControlAssessmentStatus =
      (input.status as MossControlAssessmentStatus) ||
      existing?.status ||
      MossControlAssessmentStatus.NOT_STARTED;

    if (input.status) {
      if (!Object.values(MossControlAssessmentStatus).includes(input.status as MossControlAssessmentStatus)) {
        throw new BadRequestException('Invalid control assessment status.');
      }
      status = input.status as MossControlAssessmentStatus;
    } else if (nextScore != null) {
      status = MossControlAssessmentStatus.SCORED;
    } else if (
      (input.scoreRationale && input.scoreRationale.trim()) ||
      (input.comment && input.comment.trim()) ||
      (input.findingText && input.findingText.trim())
    ) {
      status = MossControlAssessmentStatus.IN_PROGRESS;
    }

    const data = {
      assessmentId,
      mossControlId: control.id,
      controlCode: control.controlCode,
      assessorScore: nextScore,
      score: nextScore,
      scoreRationale:
        input.scoreRationale === undefined ? existing?.scoreRationale ?? null : input.scoreRationale,
      comment: input.comment === undefined ? existing?.comment ?? null : input.comment,
      findingText: input.findingText === undefined ? existing?.findingText ?? null : input.findingText,
      status,
      assessedById: nextScore != null ? user.id : existing?.assessedById ?? null,
      assessedAt: nextScore != null ? new Date() : existing?.assessedAt ?? null,
    };

    const row = await this.prisma.mossControlAssessment.upsert({
      where: { assessmentId_mossControlId: { assessmentId, mossControlId: control.id } },
      create: data,
      update: {
        assessorScore: data.assessorScore,
        score: data.score,
        scoreRationale: data.scoreRationale,
        comment: data.comment,
        findingText: data.findingText,
        status: data.status,
        assessedById: data.assessedById,
        assessedAt: data.assessedAt,
      },
    });

    // Completion progress drives session status: do not leave IN_PROGRESS at 100%.
    await this.syncSessionStatusFromProgress(
      assessmentId,
      access.mossCatalogueVersionId,
      access.status,
    );

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_CONTROL_UPDATED',
      entityType: 'MossControlAssessment',
      entityId: row.id,
      organisationId: access.organisationId,
      metadata: { assessmentId, controlCode: row.controlCode, assessorScore: row.assessorScore, status: row.status },
    });

    return this.mapControlAssessment(row);
  }

  /**
   * Session status from control completion only (not domain/overall maturity).
   * - Not all controls scored → IN_PROGRESS (unless already submitted/terminal)
   * - All controls scored → SUBMITTED
   * Does not overwrite locked/terminal/explicitly submitted workflow statuses.
   */
  private async syncSessionStatusFromProgress(
    assessmentId: string,
    catalogueVersionId: string,
    currentStatus: AssessmentStatus,
  ) {
    const terminal = new Set<AssessmentStatus>([
      AssessmentStatus.SUBMITTED,
      AssessmentStatus.APPROVED,
      AssessmentStatus.REPORT_GENERATED,
      AssessmentStatus.REPORT_ISSUED,
      AssessmentStatus.CLOSED,
      AssessmentStatus.ARCHIVED,
      AssessmentStatus.REVIEWED,
      AssessmentStatus.ANALYST_REVIEW,
      AssessmentStatus.QUALITY_ASSURANCE,
      AssessmentStatus.EVIDENCE_REVIEW,
      AssessmentStatus.AUTOMATED_EVALUATION_COMPLETE,
    ]);
    if (terminal.has(currentStatus)) return;

    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: { submittedAt: true, status: true },
    });
    // Explicit submit (including incomplete-with-confirmation) must not be downgraded.
    if (session?.submittedAt) return;

    const progress = await this.progress.forAssessment(assessmentId, catalogueVersionId);
    const allScored = progress.overall.total > 0 && progress.overall.assessed >= progress.overall.total;
    const nextStatus = allScored ? AssessmentStatus.SUBMITTED : AssessmentStatus.IN_PROGRESS;
    if (nextStatus === currentStatus) return;

    await this.prisma.assessmentSession.update({
      where: { id: assessmentId },
      data: { status: nextStatus },
    });
  }
}
