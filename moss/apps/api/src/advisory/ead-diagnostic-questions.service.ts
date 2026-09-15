import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EadTemplateVersionStatus, ProductCode, SystemRole } from '@prisma/client';
import {
  EAD_MODULE_CRITERIA,
  EXECUTIVE_ADVISORY_MODULES,
  buildEadDiagnosticSnapshot,
  isEadDiagnosticModuleCode,
  isEadLikertValue,
  parseDiagnosticResponses,
  scoreEadDiagnosticCriteria,
  type EadDiagnosticAnswers,
  type EadDiagnosticCriterion,
  type EadLikertValue,
} from '@moss/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { ADMIN_ROLES, INTERNAL_ROLES } from '../common/roles';

function slugCode(input: string) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'CUSTOM';
}

function toCriterion(row: {
  questionCode: string;
  title: string;
  questionText: string;
  helpText?: string | null;
  allowNa: boolean;
  isRequired: boolean;
}): EadDiagnosticCriterion {
  return {
    code: row.questionCode,
    title: row.title,
    question: row.questionText,
    helpText: row.helpText,
    allowNa: row.allowNa,
    isRequired: row.isRequired,
  };
}

@Injectable()
export class EadDiagnosticQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertInternal(user: AuthUser) {
    if (!INTERNAL_ROLES.has(user.role)) throw new ForbiddenException('Internal access required.');
  }

  private assertAdmin(user: AuthUser) {
    if (!ADMIN_ROLES.has(user.role) && user.role !== SystemRole.METHODOLOGY_ADMIN) {
      throw new ForbiddenException('Administrator access required for template management.');
    }
  }

  private assertConsultant(user: AuthUser) {
    this.assertInternal(user);
  }

  /** Seed published v1 from hard-coded Stage 1 criteria if none exists. */
  async ensurePublishedTemplate(userId?: string) {
    const published = await this.prisma.eadDiagnosticTemplateVersion.findFirst({
      where: { status: EadTemplateVersionStatus.PUBLISHED },
      orderBy: { versionNumber: 'desc' },
      include: { questions: true },
    });
    if (published?.questions.length) return published;

    const max = await this.prisma.eadDiagnosticTemplateVersion.aggregate({
      _max: { versionNumber: true },
    });
    const versionNumber = (max._max.versionNumber || 0) + 1;
    const now = new Date();
    const rows: Array<{
      moduleCode: string;
      questionCode: string;
      title: string;
      questionText: string;
      displayOrder: number;
      allowNa: boolean;
      isRequired: boolean;
    }> = [];
    for (const mod of EXECUTIVE_ADVISORY_MODULES) {
      const criteria = EAD_MODULE_CRITERIA[mod.code as keyof typeof EAD_MODULE_CRITERIA] || [];
      criteria.forEach((c, idx) => {
        rows.push({
          moduleCode: mod.code,
          questionCode: c.code,
          title: c.title,
          questionText: c.question,
          displayOrder: idx + 1,
          allowNa: c.allowNa,
          isRequired: true,
        });
      });
    }

    return this.prisma.eadDiagnosticTemplateVersion.create({
      data: {
        versionNumber,
        status: EadTemplateVersionStatus.PUBLISHED,
        label: `Executive Advisory Diagnostic v${versionNumber}.0`,
        changeNote: 'Initial template seeded from Stage 1 diagnostic criteria.',
        publishedAt: now,
        publishedById: userId || null,
        createdById: userId || null,
        questions: {
          create: rows.map((r) => ({
            ...r,
            isActive: true,
          })),
        },
      },
      include: { questions: true },
    });
  }

  /** Snapshot published template questions onto an assessment (idempotent). */
  async snapshotTemplateOntoAssessment(assessmentId: string, userId?: string) {
    const existing = await this.prisma.eadAssessmentDiagnosticQuestion.count({
      where: { assessmentId },
    });
    if (existing > 0) {
      return this.prisma.eadAssessmentDiagnosticQuestion.findMany({
        where: { assessmentId },
        orderBy: [{ moduleCode: 'asc' }, { displayOrder: 'asc' }],
      });
    }

    const template = await this.ensurePublishedTemplate(userId);
    const activeQuestions = template.questions.filter((q) => q.isActive);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.assessmentSession.update({
        where: { id: assessmentId },
        data: { eadTemplateVersionId: template.id },
      }),
      this.prisma.eadAssessmentDiagnosticQuestion.createMany({
        data: activeQuestions.map((q) => ({
          assessmentId,
          moduleCode: q.moduleCode,
          questionCode: q.questionCode,
          title: q.title,
          questionText: q.questionText,
          helpText: q.helpText,
          displayOrder: q.displayOrder,
          allowNa: q.allowNa,
          isRequired: q.isRequired,
          isActive: true,
          sourceTemplateQuestionId: q.id,
          createdAt: now,
          updatedAt: now,
        })),
      }),
    ]);

    return this.prisma.eadAssessmentDiagnosticQuestion.findMany({
      where: { assessmentId },
      orderBy: [{ moduleCode: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  /**
   * Backfill snapshots for legacy EAD assessments that pre-date Stage 4.
   * Uses current hard-coded wording; maps existing diagnosticResponses by questionCode.
   */
  async backfillLegacyAssessments(userId?: string) {
    const template = await this.ensurePublishedTemplate(userId);
    const sessions = await this.prisma.assessmentSession.findMany({
      where: {
        productCode: ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
        eadDiagnosticQuestions: { none: {} },
      },
      select: { id: true },
    });
    for (const session of sessions) {
      await this.snapshotTemplateOntoAssessment(session.id, userId);
    }
    return { templateVersionId: template.id, assessmentsBackfilled: sessions.length };
  }

  async listAssessmentQuestions(assessmentId: string, moduleCode: string | undefined, user: AuthUser) {
    this.assertInternal(user);
    await this.ensureAssessmentAccess(assessmentId, user);
    await this.snapshotTemplateOntoAssessment(assessmentId, user.id);
    return this.prisma.eadAssessmentDiagnosticQuestion.findMany({
      where: {
        assessmentId,
        ...(moduleCode ? { moduleCode } : {}),
      },
      orderBy: [{ moduleCode: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  async listActiveCriteriaForModule(assessmentId: string, moduleCode: string) {
    const rows = await this.prisma.eadAssessmentDiagnosticQuestion.findMany({
      where: { assessmentId, moduleCode, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    if (rows.length) return rows.map(toCriterion);
    const fallback = isEadDiagnosticModuleCode(moduleCode) ? EAD_MODULE_CRITERIA[moduleCode] : null;
    return fallback ? [...fallback] : [];
  }

  async addAssessmentQuestion(
    assessmentId: string,
    input: {
      moduleCode: string;
      title: string;
      questionText: string;
      helpText?: string;
      allowNa?: boolean;
      isRequired?: boolean;
    },
    user: AuthUser,
  ) {
    this.assertConsultant(user);
    await this.ensureAssessmentEditable(assessmentId, user);
    if (!isEadDiagnosticModuleCode(input.moduleCode)) {
      throw new BadRequestException('Unknown Executive Advisory module.');
    }
    const title = String(input.title || '').trim();
    const questionText = String(input.questionText || '').trim();
    if (!title || !questionText) throw new BadRequestException('Title and question text are required.');

    await this.snapshotTemplateOntoAssessment(assessmentId, user.id);
    const maxOrder = await this.prisma.eadAssessmentDiagnosticQuestion.aggregate({
      where: { assessmentId, moduleCode: input.moduleCode },
      _max: { displayOrder: true },
    });
    let questionCode = `CUSTOM_${slugCode(title)}`;
    const clash = await this.prisma.eadAssessmentDiagnosticQuestion.findUnique({
      where: {
        assessmentId_moduleCode_questionCode: {
          assessmentId,
          moduleCode: input.moduleCode,
          questionCode,
        },
      },
    });
    if (clash) questionCode = `CUSTOM_${Date.now().toString(36).toUpperCase()}`;

    const row = await this.prisma.eadAssessmentDiagnosticQuestion.create({
      data: {
        assessmentId,
        moduleCode: input.moduleCode,
        questionCode,
        title,
        questionText,
        helpText: String(input.helpText || '').trim() || null,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1,
        allowNa: Boolean(input.allowNa),
        isRequired: input.isRequired !== false,
        isActive: true,
      },
    });
    await this.recalculateModuleScore(assessmentId, input.moduleCode);
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_ADDED',
      entityType: 'EadAssessmentDiagnosticQuestion',
      entityId: row.id,
      metadata: {
        assessmentId,
        moduleCode: input.moduleCode,
        questionCode,
        title,
        questionText,
      },
    });
    return row;
  }

  async updateAssessmentQuestion(
    assessmentId: string,
    questionId: string,
    input: {
      title?: string;
      questionText?: string;
      helpText?: string | null;
      allowNa?: boolean;
      isRequired?: boolean;
    },
    user: AuthUser,
  ) {
    this.assertConsultant(user);
    await this.ensureAssessmentEditable(assessmentId, user);
    const existing = await this.prisma.eadAssessmentDiagnosticQuestion.findFirst({
      where: { id: questionId, assessmentId },
    });
    if (!existing) throw new NotFoundException('Diagnostic question not found.');

    const row = await this.prisma.eadAssessmentDiagnosticQuestion.update({
      where: { id: questionId },
      data: {
        title: input.title !== undefined ? String(input.title).trim() : undefined,
        questionText: input.questionText !== undefined ? String(input.questionText).trim() : undefined,
        helpText:
          input.helpText !== undefined ? String(input.helpText || '').trim() || null : undefined,
        allowNa: input.allowNa,
        isRequired: input.isRequired,
      },
    });
    await this.recalculateModuleScore(assessmentId, existing.moduleCode);
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_EDITED',
      entityType: 'EadAssessmentDiagnosticQuestion',
      entityId: row.id,
      metadata: {
        assessmentId,
        moduleCode: existing.moduleCode,
        questionCode: existing.questionCode,
        before: {
          title: existing.title,
          questionText: existing.questionText,
          helpText: existing.helpText,
          allowNa: existing.allowNa,
          isRequired: existing.isRequired,
        },
        after: {
          title: row.title,
          questionText: row.questionText,
          helpText: row.helpText,
          allowNa: row.allowNa,
          isRequired: row.isRequired,
        },
      },
    });
    return row;
  }

  async removeAssessmentQuestion(assessmentId: string, questionId: string, user: AuthUser) {
    this.assertConsultant(user);
    await this.ensureAssessmentEditable(assessmentId, user);
    const existing = await this.prisma.eadAssessmentDiagnosticQuestion.findFirst({
      where: { id: questionId, assessmentId },
    });
    if (!existing) throw new NotFoundException('Diagnostic question not found.');
    if (!existing.isActive) return existing;

    const snap = await this.getModuleAnswers(assessmentId, existing.moduleCode);
    const hadAnswer = Boolean(snap?.answers?.[existing.questionCode]);

    const row = await this.prisma.eadAssessmentDiagnosticQuestion.update({
      where: { id: questionId },
      data: {
        isActive: false,
        removedAt: new Date(),
        removedById: user.id,
      },
    });
    await this.recalculateModuleScore(assessmentId, existing.moduleCode);
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_REMOVED',
      entityType: 'EadAssessmentDiagnosticQuestion',
      entityId: row.id,
      metadata: {
        assessmentId,
        moduleCode: existing.moduleCode,
        questionCode: existing.questionCode,
        hadAnswer,
        title: existing.title,
      },
    });
    return { ...row, hadAnswer };
  }

  async restoreAssessmentQuestion(assessmentId: string, questionId: string, user: AuthUser) {
    this.assertConsultant(user);
    await this.ensureAssessmentEditable(assessmentId, user);
    const existing = await this.prisma.eadAssessmentDiagnosticQuestion.findFirst({
      where: { id: questionId, assessmentId },
    });
    if (!existing) throw new NotFoundException('Diagnostic question not found.');

    const row = await this.prisma.eadAssessmentDiagnosticQuestion.update({
      where: { id: questionId },
      data: { isActive: true, removedAt: null, removedById: null },
    });
    await this.recalculateModuleScore(assessmentId, existing.moduleCode);
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_RESTORED',
      entityType: 'EadAssessmentDiagnosticQuestion',
      entityId: row.id,
      metadata: {
        assessmentId,
        moduleCode: existing.moduleCode,
        questionCode: existing.questionCode,
      },
    });
    return row;
  }

  async duplicateAssessmentQuestion(assessmentId: string, questionId: string, user: AuthUser) {
    this.assertConsultant(user);
    await this.ensureAssessmentEditable(assessmentId, user);
    const existing = await this.prisma.eadAssessmentDiagnosticQuestion.findFirst({
      where: { id: questionId, assessmentId },
    });
    if (!existing) throw new NotFoundException('Diagnostic question not found.');

    const siblings = await this.prisma.eadAssessmentDiagnosticQuestion.findMany({
      where: { assessmentId, moduleCode: existing.moduleCode, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    await this.prisma.$transaction(
      siblings
        .filter((s) => s.displayOrder > existing.displayOrder)
        .map((s) =>
          this.prisma.eadAssessmentDiagnosticQuestion.update({
            where: { id: s.id },
            data: { displayOrder: s.displayOrder + 1 },
          }),
        ),
    );

    const questionCode = `CUSTOM_${Date.now().toString(36).toUpperCase()}`;
    const row = await this.prisma.eadAssessmentDiagnosticQuestion.create({
      data: {
        assessmentId,
        moduleCode: existing.moduleCode,
        questionCode,
        title: `${existing.title} (copy)`,
        questionText: existing.questionText,
        helpText: existing.helpText,
        displayOrder: existing.displayOrder + 1,
        allowNa: existing.allowNa,
        isRequired: existing.isRequired,
        isActive: true,
      },
    });
    await this.recalculateModuleScore(assessmentId, existing.moduleCode);
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_ADDED',
      entityType: 'EadAssessmentDiagnosticQuestion',
      entityId: row.id,
      metadata: {
        assessmentId,
        moduleCode: existing.moduleCode,
        questionCode,
        duplicatedFrom: existing.id,
      },
    });
    return row;
  }

  async reorderAssessmentQuestions(
    assessmentId: string,
    moduleCode: string,
    orderedIds: string[],
    user: AuthUser,
  ) {
    this.assertConsultant(user);
    await this.ensureAssessmentEditable(assessmentId, user);
    const rows = await this.prisma.eadAssessmentDiagnosticQuestion.findMany({
      where: { assessmentId, moduleCode, isActive: true },
    });
    if (orderedIds.length !== rows.length || orderedIds.some((id) => !rows.find((r) => r.id === id))) {
      throw new BadRequestException('Order list must include every active question exactly once.');
    }
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.eadAssessmentDiagnosticQuestion.update({
          where: { id },
          data: { displayOrder: index + 1 },
        }),
      ),
    );
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_REORDERED',
      entityType: 'AssessmentSession',
      entityId: assessmentId,
      metadata: { moduleCode, orderedIds },
    });
    return this.listAssessmentQuestions(assessmentId, moduleCode, user);
  }

  // ─── Template (admin) ─────────────────────────────────────────────

  async listTemplateVersions(user: AuthUser) {
    this.assertAdmin(user);
    await this.ensurePublishedTemplate(user.id);
    return this.prisma.eadDiagnosticTemplateVersion.findMany({
      orderBy: { versionNumber: 'desc' },
      include: { _count: { select: { questions: true, assessments: true } } },
    });
  }

  async getTemplateVersion(versionId: string, user: AuthUser) {
    this.assertAdmin(user);
    const row = await this.prisma.eadDiagnosticTemplateVersion.findUnique({
      where: { id: versionId },
      include: {
        questions: { orderBy: [{ moduleCode: 'asc' }, { displayOrder: 'asc' }] },
      },
    });
    if (!row) throw new NotFoundException('Template version not found.');
    return row;
  }

  async getLatestPublishedTemplate(user: AuthUser) {
    this.assertAdmin(user);
    return this.ensurePublishedTemplate(user.id);
  }

  /** Edit published template by cloning into a new DRAFT (or updating existing DRAFT). */
  async upsertDraftFromPublished(
    user: AuthUser,
    input?: { changeNote?: string; baseVersionId?: string },
  ) {
    this.assertAdmin(user);
    const existingDraft = await this.prisma.eadDiagnosticTemplateVersion.findFirst({
      where: { status: EadTemplateVersionStatus.DRAFT },
      include: { questions: true },
    });
    if (existingDraft) return existingDraft;

    const base =
      (input?.baseVersionId
        ? await this.prisma.eadDiagnosticTemplateVersion.findUnique({
            where: { id: input.baseVersionId },
            include: { questions: true },
          })
        : null) || (await this.ensurePublishedTemplate(user.id));

    const max = await this.prisma.eadDiagnosticTemplateVersion.aggregate({
      _max: { versionNumber: true },
    });
    const versionNumber = (max._max.versionNumber || 0) + 1;
    return this.prisma.eadDiagnosticTemplateVersion.create({
      data: {
        versionNumber,
        status: EadTemplateVersionStatus.DRAFT,
        label: `Executive Advisory Diagnostic v${versionNumber}.0 (draft)`,
        changeNote: input?.changeNote || `Draft based on v${base.versionNumber}`,
        createdById: user.id,
        questions: {
          create: base.questions.map((q) => ({
            moduleCode: q.moduleCode,
            questionCode: q.questionCode,
            title: q.title,
            questionText: q.questionText,
            helpText: q.helpText,
            displayOrder: q.displayOrder,
            allowNa: q.allowNa,
            isRequired: q.isRequired,
            isActive: q.isActive,
          })),
        },
      },
      include: { questions: { orderBy: [{ moduleCode: 'asc' }, { displayOrder: 'asc' }] } },
    });
  }

  async updateTemplateQuestion(
    versionId: string,
    questionId: string,
    input: {
      title?: string;
      questionText?: string;
      helpText?: string | null;
      allowNa?: boolean;
      isRequired?: boolean;
      isActive?: boolean;
    },
    user: AuthUser,
  ) {
    this.assertAdmin(user);
    const version = await this.prisma.eadDiagnosticTemplateVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException('Template version not found.');
    if (version.status !== EadTemplateVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft template versions can be edited. Create a draft first.');
    }
    const existing = await this.prisma.eadDiagnosticTemplateQuestion.findFirst({
      where: { id: questionId, templateVersionId: versionId },
    });
    if (!existing) throw new NotFoundException('Template question not found.');

    const row = await this.prisma.eadDiagnosticTemplateQuestion.update({
      where: { id: questionId },
      data: {
        title: input.title !== undefined ? String(input.title).trim() : undefined,
        questionText:
          input.questionText !== undefined ? String(input.questionText).trim() : undefined,
        helpText:
          input.helpText !== undefined ? String(input.helpText || '').trim() || null : undefined,
        allowNa: input.allowNa,
        isRequired: input.isRequired,
        isActive: input.isActive,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_EDITED',
      entityType: 'EadDiagnosticTemplateQuestion',
      entityId: row.id,
      metadata: {
        templateVersionId: versionId,
        before: { title: existing.title, questionText: existing.questionText },
        after: { title: row.title, questionText: row.questionText },
        scope: 'TEMPLATE_DRAFT',
      },
    });
    return row;
  }

  async addTemplateQuestion(
    versionId: string,
    input: {
      moduleCode: string;
      title: string;
      questionText: string;
      helpText?: string;
      allowNa?: boolean;
      isRequired?: boolean;
    },
    user: AuthUser,
  ) {
    this.assertAdmin(user);
    const version = await this.prisma.eadDiagnosticTemplateVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.status !== EadTemplateVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft template versions can be edited.');
    }
    if (!isEadDiagnosticModuleCode(input.moduleCode)) {
      throw new BadRequestException('Unknown module.');
    }
    const title = String(input.title || '').trim();
    const questionText = String(input.questionText || '').trim();
    if (!title || !questionText) throw new BadRequestException('Title and question are required.');

    const maxOrder = await this.prisma.eadDiagnosticTemplateQuestion.aggregate({
      where: { templateVersionId: versionId, moduleCode: input.moduleCode },
      _max: { displayOrder: true },
    });
    let questionCode = slugCode(title);
    const clash = await this.prisma.eadDiagnosticTemplateQuestion.findUnique({
      where: {
        templateVersionId_moduleCode_questionCode: {
          templateVersionId: versionId,
          moduleCode: input.moduleCode,
          questionCode,
        },
      },
    });
    if (clash) questionCode = `${questionCode}_${Date.now().toString(36).toUpperCase()}`;

    const row = await this.prisma.eadDiagnosticTemplateQuestion.create({
      data: {
        templateVersionId: versionId,
        moduleCode: input.moduleCode,
        questionCode,
        title,
        questionText,
        helpText: String(input.helpText || '').trim() || null,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1,
        allowNa: Boolean(input.allowNa),
        isRequired: input.isRequired !== false,
        isActive: true,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_ADDED',
      entityType: 'EadDiagnosticTemplateQuestion',
      entityId: row.id,
      metadata: { templateVersionId: versionId, moduleCode: input.moduleCode, scope: 'TEMPLATE_DRAFT' },
    });
    return row;
  }

  async archiveTemplateQuestion(versionId: string, questionId: string, user: AuthUser) {
    this.assertAdmin(user);
    const version = await this.prisma.eadDiagnosticTemplateVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.status !== EadTemplateVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft template versions can be edited.');
    }
    const row = await this.prisma.eadDiagnosticTemplateQuestion.update({
      where: { id: questionId },
      data: { isActive: false },
    });
    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_QUESTION_REMOVED',
      entityType: 'EadDiagnosticTemplateQuestion',
      entityId: row.id,
      metadata: { templateVersionId: versionId, scope: 'TEMPLATE_DRAFT_ARCHIVE' },
    });
    return row;
  }

  async publishDraftTemplate(versionId: string, user: AuthUser, changeNote?: string) {
    this.assertAdmin(user);
    const draft = await this.prisma.eadDiagnosticTemplateVersion.findUnique({
      where: { id: versionId },
      include: { questions: true },
    });
    if (!draft || draft.status !== EadTemplateVersionStatus.DRAFT) {
      throw new BadRequestException('Only draft versions can be published.');
    }
    if (!draft.questions.some((q) => q.isActive)) {
      throw new BadRequestException('Cannot publish a template with no active questions.');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.eadDiagnosticTemplateVersion.updateMany({
        where: { status: EadTemplateVersionStatus.PUBLISHED },
        data: { status: EadTemplateVersionStatus.ARCHIVED },
      }),
      this.prisma.eadDiagnosticTemplateVersion.update({
        where: { id: versionId },
        data: {
          status: EadTemplateVersionStatus.PUBLISHED,
          publishedAt: now,
          publishedById: user.id,
          changeNote: changeNote || draft.changeNote,
          label: `Executive Advisory Diagnostic v${draft.versionNumber}.0`,
        },
      }),
    ]);

    await this.audit.record({
      userId: user.id,
      action: 'DIAGNOSTIC_TEMPLATE_VERSION_PUBLISHED',
      entityType: 'EadDiagnosticTemplateVersion',
      entityId: versionId,
      metadata: { versionNumber: draft.versionNumber },
    });
    return this.getTemplateVersion(versionId, user);
  }

  // ─── helpers ──────────────────────────────────────────────────────

  private async ensureAssessmentAccess(assessmentId: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id: assessmentId },
      select: { id: true, productCode: true, organisationId: true },
    });
    if (!session || session.productCode !== ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC) {
      throw new NotFoundException('Executive Advisory Diagnostic not found.');
    }
    if (INTERNAL_ROLES.has(user.role)) return session;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId: session.organisationId } },
    });
    if (!membership) throw new ForbiddenException('No access.');
    return session;
  }

  private async ensureAssessmentEditable(assessmentId: string, user: AuthUser) {
    await this.ensureAssessmentAccess(assessmentId, user);
    const outcome = await this.prisma.advisoryDiagnosticOutcome.findUnique({
      where: { assessmentId },
    });
    if (outcome) {
      throw new BadRequestException('Diagnostic is locked after completion.');
    }
  }

  private async getModuleAnswers(assessmentId: string, moduleCode: string) {
    const review = await this.prisma.advisoryModuleReview.findUnique({
      where: { assessmentId_moduleCode: { assessmentId, moduleCode } },
      select: { diagnosticResponses: true },
    });
    return parseDiagnosticResponses(review?.diagnosticResponses);
  }

  async recalculateModuleScore(assessmentId: string, moduleCode: string) {
    const criteria = await this.listActiveCriteriaForModule(assessmentId, moduleCode);
    const snap = await this.getModuleAnswers(assessmentId, moduleCode);
    const answers = (snap?.answers || {}) as EadDiagnosticAnswers;
    const built = buildEadDiagnosticSnapshot(moduleCode, answers, new Date(), criteria);
    await this.prisma.advisoryModuleReview.update({
      where: { assessmentId_moduleCode: { assessmentId, moduleCode } },
      data: {
        diagnosticResponses: built as any,
        exposureRating:
          built.calculatedExposureIndicator == null
            ? null
            : Math.round(built.calculatedExposureIndicator),
      },
    });
    return scoreEadDiagnosticCriteria(criteria, answers);
  }
}
