import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdvisoryRoutePriority,
  AssignmentRole,
  AssessmentStatus,
  ProductCode,
  ProposalStatus,
  ReportStatus,
  ReportType,
  SystemRole,
} from '@prisma/client';
import {
  EAD_ROUTING_PRODUCT_CODES,
  EXECUTIVE_ADVISORY_MODULES,
  FOCUSED_ASSURANCE_MODULES,
  PRODUCT_LABELS,
  SHIELD360_RETIRED_MESSAGE,
  buildEadDiagnosticSnapshot,
  formatBusinessConsequencesForLegacyReport,
  hasValidBusinessConsequences,
  isEadBusinessConsequenceCode,
  isEadDiagnosticModuleCode,
  isEadLikertValue,
  isLegacyShield360ProductCode,
  isRichTextFilled,
  normalizeOtherBusinessConsequence,
  parseBusinessConsequenceCodes,
  parseDiagnosticResponses,
  richTextToPlainText,
  sanitizeRichText,
  scoreEadDiagnostic,
  scoreEadDiagnosticCriteria,
  type EadDiagnosticAnswers,
  type EadLikertValue,
} from '@moss/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { generateAssessmentReference } from '../common/assessment-reference';
import { generateL3ProposalReference } from '../common/l3-proposal-reference';
import { assertManualLevel3CreationAllowed, resolveManualCreatePolicy } from '../common/l3-governance';
import { INTERNAL_ROLES } from '../common/roles';
import { StorageService } from '../evidence/storage.service';
import { renderAdvisoryPdf } from './advisory-report-pdf';
import { EadDiagnosticQuestionsService } from './ead-diagnostic-questions.service';
import { resolveSclReportBrandConfig } from '../reports/scl-report-branding';
import { ConfigService } from '@nestjs/config';
/** Active advisory products that may be created / recommended. */
const ADVISORY_PRODUCTS_ACTIVE = new Set<ProductCode>([
  ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
  ProductCode.CONTRACT_SLA_ASSURANCE,
  ProductCode.VENDOR_PERFORMANCE_ASSURANCE,
  ProductCode.GOVERNANCE_EXECUTIVE_ASSURANCE,
  ProductCode.CYBER_PHYSICAL_DEPENDENCY,
]);

/** Includes retired Shield 360 so historical engagements remain readable. */
const ADVISORY_PRODUCTS = new Set<ProductCode>([
  ...ADVISORY_PRODUCTS_ACTIVE,
  ProductCode.SHIELD360,
]);

const L3_ROUTING_PRODUCTS = new Set<string>(EAD_ROUTING_PRODUCT_CODES);

const L3_COMMERCIAL_ACTIONS = new Set([
  'INITIATE',
  'PREPARE',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRE',
  'CANCELLED',
  'SAVE_NOTES',
]);

const ENGAGEMENT_FINISHED_STATUSES = new Set<AssessmentStatus>([
  AssessmentStatus.SUBMITTED,
  AssessmentStatus.REVIEWED,
  AssessmentStatus.APPROVED,
  AssessmentStatus.REPORT_GENERATED,
  AssessmentStatus.REPORT_ISSUED,
  AssessmentStatus.AUTOMATED_EVALUATION_COMPLETE,
  AssessmentStatus.EVIDENCE_REVIEW,
  AssessmentStatus.ANALYST_REVIEW,
  AssessmentStatus.QUALITY_ASSURANCE,
  AssessmentStatus.REMEDIATION_IN_PROGRESS,
  AssessmentStatus.REASSESSMENT_DUE,
]);

export type ConfirmedRouteInput = {
  productCode: string;
  priority?: AdvisoryRoutePriority;
  rationale?: string;
  sourceModuleCode?: string;
  sourceModuleName?: string;
};

@Injectable()
export class AdvisoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly eadQuestions: EadDiagnosticQuestionsService,
    private readonly config: ConfigService,
  ) {}

  private assertConsultant(user: AuthUser) {
    if (!INTERNAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Consultant access required.');
    }
  }

  private async assertAccess(id: string, user: AuthUser) {
    const session = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { organisationId: true, productCode: true, status: true },
    });
    if (!session || !ADVISORY_PRODUCTS.has(session.productCode)) {
      throw new NotFoundException('Advisory engagement not found.');
    }
    if (INTERNAL_ROLES.has(user.role)) return session;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organisationId: { userId: user.id, organisationId: session.organisationId } },
    });
    if (!membership) throw new ForbiddenException('You do not have access to this engagement.');
    return session;
  }

  private async assertEditable(id: string) {
    const outcome = await this.prisma.advisoryDiagnosticOutcome.findUnique({ where: { assessmentId: id } });
    if (outcome) {
      throw new BadRequestException(
        'Diagnostic routing is confirmed. Module edits are locked. Reopen is not supported in this release.',
      );
    }
  }

  private async validateModulesComplete(
    modules: Array<{
      moduleCode?: string;
      moduleName: string;
      finding?: string | null;
      businessConsequence?: string | null;
      businessConsequences?: unknown;
      otherBusinessConsequence?: string | null;
      requiredDecision?: string | null;
      evidenceSummary?: string | null;
      diagnosticResponses?: unknown;
      assessmentId?: string;
    }>,
    assessmentId?: string,
  ) {
    const missingCore = modules.filter(
      (m) => !isRichTextFilled(m.finding) || !isRichTextFilled(m.requiredDecision),
    );
    if (missingCore.length) {
      throw new BadRequestException(
        `Complete finding, business consequence, and required decision for: ${missingCore.map((m) => m.moduleName).join(', ')}`,
      );
    }
    const missingConsequences = modules.filter((m) => {
      const codes = parseBusinessConsequenceCodes(m.businessConsequences);
      if (codes.length) {
        return !hasValidBusinessConsequences(codes, m.otherBusinessConsequence);
      }
      return true;
    });
    if (missingConsequences.length) {
      throw new BadRequestException(
        `Select at least one business consequence for: ${missingConsequences.map((m) => m.moduleName).join(', ')}`,
      );
    }
    const missingEvidence = modules.filter((m) => !isRichTextFilled(m.evidenceSummary));
    if (missingEvidence.length) {
      throw new BadRequestException(
        `Record supporting evidence or an explicit limitation for: ${missingEvidence.map((m) => m.moduleName).join(', ')}`,
      );
    }
    const aid = assessmentId || modules[0]?.assessmentId;
    for (const m of modules) {
      if (!m.moduleCode || !isEadDiagnosticModuleCode(m.moduleCode)) continue;
      const snap = parseDiagnosticResponses(m.diagnosticResponses);
      const criteria = aid
        ? await this.eadQuestions.listActiveCriteriaForModule(aid, m.moduleCode)
        : null;
      const scored = criteria?.length
        ? scoreEadDiagnosticCriteria(criteria, snap?.answers || {})
        : scoreEadDiagnostic(m.moduleCode, snap?.answers || {});
      if (!scored.allRequiredAnswered) {
        throw new BadRequestException(
          `Complete all diagnostic criteria for: ${m.moduleName}`,
        );
      }
    }
  }

  /** Suggest routes from module working papers (consultant confirms before complete). */
  suggestRoutesFromModules(
    modules: Array<{
      moduleCode: string;
      moduleName: string;
      recommendedProduct?: ProductCode | null;
      exposureRating?: number | null;
      analystNote?: string | null;
      finding?: string | null;
    }>,
  ): ConfirmedRouteInput[] {
    const byProduct = new Map<string, ConfirmedRouteInput & { maxExposure: number }>();
    for (const m of modules) {
      const code = String(m.recommendedProduct || '').trim();
      if (!code || !L3_ROUTING_PRODUCTS.has(code)) continue;
      const exposure = Number(m.exposureRating);
      const existing = byProduct.get(code);
      const priority: AdvisoryRoutePriority =
        Number.isFinite(exposure) && exposure >= 70 ? AdvisoryRoutePriority.HIGH : AdvisoryRoutePriority.RECOMMENDED;
      const rationale =
        richTextToPlainText(String(m.analystNote || '')).trim() ||
        richTextToPlainText(String(m.finding || '')).trim().slice(0, 280) ||
        undefined;
      if (!existing) {
        byProduct.set(code, {
          productCode: code,
          priority,
          rationale,
          sourceModuleCode: m.moduleCode,
          sourceModuleName: m.moduleName,
          maxExposure: Number.isFinite(exposure) ? exposure : 0,
        });
      } else {
        if (Number.isFinite(exposure) && exposure > existing.maxExposure) {
          existing.maxExposure = exposure;
          if (exposure >= 70) existing.priority = AdvisoryRoutePriority.HIGH;
          if (!existing.rationale && rationale) existing.rationale = rationale;
          existing.sourceModuleCode = m.moduleCode;
          existing.sourceModuleName = m.moduleName;
        }
      }
    }
    return [...byProduct.values()].map(({ maxExposure: _max, ...row }) => row);
  }

  list(user: AuthUser, productCode?: ProductCode) {
    const where: any = {
      productCode: productCode && ADVISORY_PRODUCTS.has(productCode) ? productCode : { in: [...ADVISORY_PRODUCTS] },
      ...(INTERNAL_ROLES.has(user.role) ? {} : { organisation: { memberships: { some: { userId: user.id } } } }),
    };
    return this.prisma.assessmentSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        organisation: { select: { id: true, name: true, industry: true } },
        assignments: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, systemRole: true } } },
        },
        advisoryModuleReviews: true,
        diagnosticOutcome: { select: { id: true, confirmedAt: true, commercialStatus: true, commercialReference: true } },
        _count: { select: { evidence: true, findings: true, recommendations: true, reports: true } },
      },
    });
  }

  async getManualCreatePolicy(organisationId: string, productCode: string, user: AuthUser) {
    this.assertConsultant(user);
    const organisation = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) throw new BadRequestException('Organisation not found.');
    return resolveManualCreatePolicy(this.prisma, organisationId, productCode);
  }

  async create(
    input: {
      organisationId: string;
      productCode: ProductCode;
      title?: string;
      parentAssessmentId?: string;
      primaryAnalystId?: string;
    },
    user: AuthUser,
  ) {
    if (!ADVISORY_PRODUCTS_ACTIVE.has(input.productCode)) {
      if (isLegacyShield360ProductCode(input.productCode)) {
        throw new BadRequestException(SHIELD360_RETIRED_MESSAGE);
      }
      throw new BadRequestException('Unsupported advisory product.');
    }
    this.assertConsultant(user);
    const organisation = await this.prisma.organisation.findUnique({ where: { id: input.organisationId } });
    if (!organisation) throw new BadRequestException('Organisation not found.');
    await assertManualLevel3CreationAllowed(
      this.prisma,
      input.organisationId,
      input.productCode,
      input.parentAssessmentId,
    );

    const q = await this.prisma.questionnaire.findUnique({
      where: { code: 'SCLI' },
      include: { versions: { where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } },
    });
    if (!q?.versions[0]) throw new BadRequestException('A published base questionnaire version is required.');

    const created = await this.prisma.$transaction(async (tx) => {
      const reference = await generateAssessmentReference(tx, input.productCode);
      const row = await tx.assessmentSession.create({
        data: {
          reference,
          organisationId: organisation.id,
          questionnaireVersionId: q.versions[0].id,
          productCode: input.productCode,
          createdById: user.id,
          title: input.title?.trim() || `${organisation.name} ${PRODUCT_LABELS[input.productCode] || 'Advisory Engagement'}`,
          status: AssessmentStatus.IN_PROGRESS,
          parentAssessmentId: input.parentAssessmentId || null,
        },
      });
      const modules =
        input.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC
          ? EXECUTIVE_ADVISORY_MODULES
          : FOCUSED_ASSURANCE_MODULES[String(input.productCode)] || [];
      if (modules.length) {
        await tx.advisoryModuleReview.createMany({
          data: modules.map((m) => ({
            assessmentId: row.id,
            moduleCode: m.code,
            moduleName: m.name,
            principalQuestion: m.principalQuestion,
          })),
        });
      }
      return row;
    });

    if (input.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC) {
      await this.eadQuestions.snapshotTemplateOntoAssessment(created.id, user.id);
    }

    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_CREATED',
      entityType: 'AssessmentSession',
      entityId: created.id,
      metadata: { productCode: input.productCode, reference: created.reference, parentAssessmentId: input.parentAssessmentId || null },
    });

    const inheritedAnalystId =
      input.primaryAnalystId || (await this.resolveLockedTriageAnalystId(created.id, created.parentAssessmentId));
    if (inheritedAnalystId) {
      await this.seedPrimaryAnalystIfMissing(created.id, inheritedAnalystId, user);
    }

    return created;
  }

  private isEngagementActive(status: AssessmentStatus) {
    return !ENGAGEMENT_FINISHED_STATUSES.has(status);
  }

  /** Level 1 triage analyst locked for this engagement and descendants. */
  private async resolveLockedTriageAnalystId(
    assessmentId: string,
    parentAssessmentId?: string | null,
  ): Promise<string | null> {
    const lead = await this.prisma.publicLead.findFirst({
      where: { convertedAssessmentId: assessmentId },
      select: { assignedAnalystId: true },
    });
    if (lead?.assignedAnalystId) return lead.assignedAnalystId;

    const parentId = parentAssessmentId
      ?? (await this.prisma.assessmentSession.findUnique({
        where: { id: assessmentId },
        select: { parentAssessmentId: true },
      }))?.parentAssessmentId;
    if (!parentId) return null;
    return this.resolveLockedTriageAnalystId(parentId);
  }

  private async seedPrimaryAnalystIfMissing(assessmentId: string, userId: string, actor: AuthUser) {
    const existing = await this.prisma.assessmentAssignment.findFirst({
      where: {
        assessmentId,
        role: AssignmentRole.PRIMARY_ANALYST,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
    });
    if (existing) return existing;

    const assignee = await this.prisma.user.findUnique({ where: { id: userId } });
    const assignableRoles: SystemRole[] = [SystemRole.ANALYST, SystemRole.REVIEWER, SystemRole.SUPER_ADMIN];
    if (!assignee || !assignee.isActive || !assignableRoles.includes(assignee.systemRole)) return null;

    const assignment = await this.prisma.assessmentAssignment.create({
      data: {
        assessmentId,
        userId,
        role: AssignmentRole.PRIMARY_ANALYST,
        assignedById: actor.id,
        notes: 'Inherited from Level 1 triage',
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'ADVISORY_ASSIGNED',
      entityType: 'AssessmentAssignment',
      entityId: assignment.id,
      metadata: { assessmentId, assigneeId: userId, role: AssignmentRole.PRIMARY_ANALYST, inheritedFromTriage: true },
    });
    return assignment;
  }

  async ensureInheritedPrimaryAnalyst(assessmentId: string, userId: string, actor: AuthUser) {
    return this.seedPrimaryAnalystIfMissing(assessmentId, userId, actor);
  }

  async get(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    const engagement = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: {
        organisation: true,
        parentAssessment: { select: { id: true, reference: true, productCode: true } },
        advisoryModuleReviews: { orderBy: { moduleCode: 'asc' } },
        eadTemplateVersion: { select: { id: true, versionNumber: true, label: true, status: true } },
        eadDiagnosticQuestions: {
          orderBy: [{ moduleCode: 'asc' }, { displayOrder: 'asc' }],
        },
        diagnosticOutcome: {
          include: {
            confirmedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            routes: {
              orderBy: [{ sortOrder: 'asc' }, { productCode: 'asc' }],
              include: {
                createdAssessment: { select: { id: true, reference: true, productCode: true, status: true, title: true } },
              },
            },
          },
        },
        assignments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, systemRole: true } },
            assignedBy: { select: { firstName: true, lastName: true } },
          },
        },
        evidence: { orderBy: { uploadedAt: 'desc' } },
        findings: { orderBy: { createdAt: 'desc' } },
        recommendations: { orderBy: { createdAt: 'desc' } },
        reports: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!engagement) throw new NotFoundException('Advisory engagement not found.');

    let eadDiagnosticQuestions = engagement.eadDiagnosticQuestions;
    if (
      engagement.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC &&
      !eadDiagnosticQuestions.length
    ) {
      eadDiagnosticQuestions = await this.eadQuestions.snapshotTemplateOntoAssessment(
        engagement.id,
        user.id,
      );
    }

    let parentTriageSubmissionId: string | null = null;
    if (engagement.parentAssessmentId) {
      const parentLead = await this.prisma.publicLead.findFirst({
        where: { assessmentId: engagement.parentAssessmentId },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
      });
      parentTriageSubmissionId = parentLead?.id || null;
    }
    const lockedTriageAnalystId = await this.resolveLockedTriageAnalystId(engagement.id, engagement.parentAssessmentId);
    const primaryAnalystLocked = Boolean(
      lockedTriageAnalystId && this.isEngagementActive(engagement.status),
    );
    const suggestedRoutes =
      engagement.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC && !engagement.diagnosticOutcome
        ? this.suggestRoutesFromModules(engagement.advisoryModuleReviews)
        : [];
    return {
      ...engagement,
      eadDiagnosticQuestions,
      parentAssessment: engagement.parentAssessment
        ? {
            ...engagement.parentAssessment,
            triageSubmissionId: parentTriageSubmissionId,
          }
        : null,
      productLabel: PRODUCT_LABELS[engagement.productCode] || engagement.productCode,
      suggestedRoutes,
      lockedTriageAnalystId,
      primaryAnalystLocked,
    };
  }

  async getOutcome(id: string, user: AuthUser) {
    const engagement = await this.get(id, user);
    if (engagement.productCode !== ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC) {
      throw new BadRequestException('Diagnostic outcome is only available for Executive Advisory Diagnostic engagements.');
    }
    if (!engagement.diagnosticOutcome) {
      throw new BadRequestException('Diagnostic routing has not been confirmed yet.');
    }
    return {
      engagement: {
        id: engagement.id,
        reference: engagement.reference,
        title: engagement.title,
        status: engagement.status,
        productLabel: engagement.productLabel,
        organisation: engagement.organisation,
        submittedAt: engagement.submittedAt,
        reports: engagement.reports,
        parentAssessment: engagement.parentAssessment,
        advisoryModuleReviews: engagement.advisoryModuleReviews,
      },
      outcome: engagement.diagnosticOutcome,
      permissions: {
        canManageCommercial: INTERNAL_ROLES.has(user.role),
      },
    };
  }

  async updateModule(id: string, moduleCode: string, input: any, user: AuthUser) {
    await this.assertAccess(id, user);
    this.assertConsultant(user);
    await this.assertEditable(id);
    const session = await this.prisma.assessmentSession.findUnique({ where: { id }, select: { productCode: true } });
    if (!session || !ADVISORY_PRODUCTS.has(session.productCode)) {
      throw new BadRequestException('Module review is unavailable for this product.');
    }

    const existing = await this.prisma.advisoryModuleReview.findUnique({
      where: { assessmentId_moduleCode: { assessmentId: id, moduleCode } },
    });
    if (!existing) throw new NotFoundException('Module review not found.');

    const data: Record<string, unknown> = {
      finding:
        input.finding !== undefined ? sanitizeRichText(String(input.finding ?? '')) || null : undefined,
      evidenceSummary:
        input.evidenceSummary !== undefined
          ? sanitizeRichText(String(input.evidenceSummary ?? '')) || null
          : undefined,
      accountableExecutive: input.accountableExecutive ?? undefined,
      requiredDecision:
        input.requiredDecision !== undefined
          ? sanitizeRichText(String(input.requiredDecision ?? '')) || null
          : undefined,
      recommendedProduct: input.recommendedProduct || null,
      analystNote:
        input.analystNote !== undefined
          ? sanitizeRichText(String(input.analystNote ?? '')) || null
          : undefined,
    };

    if (input.recommendedProduct !== undefined && input.recommendedProduct) {
      const code = String(input.recommendedProduct).trim();
      if (isLegacyShield360ProductCode(code) || !L3_ROUTING_PRODUCTS.has(code)) {
        if (isLegacyShield360ProductCode(code)) {
          throw new BadRequestException(SHIELD360_RETIRED_MESSAGE);
        }
        throw new BadRequestException(`Unsupported Level 3 product: ${code}`);
      }
      data.recommendedProduct = code as ProductCode;
    }

    let consequenceAudit:
      | {
          from: string[];
          to: string[];
          detailChanged: boolean;
        }
      | undefined;

    if (input.businessConsequences !== undefined) {
      if (!Array.isArray(input.businessConsequences)) {
        throw new BadRequestException('businessConsequences must be an array of consequence codes.');
      }
      const invalid = (input.businessConsequences as unknown[]).filter(
        (item) => typeof item !== 'string' || !isEadBusinessConsequenceCode(item),
      );
      if (invalid.length) {
        throw new BadRequestException(
          `Invalid business consequence value(s): ${invalid.map(String).join(', ')}`,
        );
      }
      const codes = parseBusinessConsequenceCodes(input.businessConsequences);
      const otherRaw =
        input.otherBusinessConsequence !== undefined
          ? input.otherBusinessConsequence
          : existing.otherBusinessConsequence;

      const otherNormalized = normalizeOtherBusinessConsequence(codes, otherRaw);
      let detail =
        input.businessConsequenceDetail !== undefined
          ? sanitizeRichText(String(input.businessConsequenceDetail ?? '')) || null
          : existing.businessConsequenceDetail;

      const existingCodes = parseBusinessConsequenceCodes(existing.businessConsequences);
      // Prefer migrating legacy free text into detail once structured selection starts.
      if (
        codes.length &&
        !existingCodes.length &&
        !detail &&
        existing.businessConsequence?.trim()
      ) {
        detail = sanitizeRichText(existing.businessConsequence.trim()) || existing.businessConsequence.trim();
      }

      data.businessConsequences = codes;
      data.otherBusinessConsequence = otherNormalized;
      data.businessConsequenceDetail = detail;
      data.businessConsequence = codes.length
        ? formatBusinessConsequencesForLegacyReport(codes, otherNormalized)
        : existing.businessConsequence;

      consequenceAudit = {
        from: existingCodes.map((c) =>
          c === 'OTHER' && existing.otherBusinessConsequence
            ? `Other: ${existing.otherBusinessConsequence}`
            : formatBusinessConsequencesForLegacyReport([c]),
        ),
        to: codes.map((c) =>
          c === 'OTHER' && otherNormalized
            ? `Other: ${otherNormalized}`
            : formatBusinessConsequencesForLegacyReport([c]),
        ),
        detailChanged:
          String(existing.businessConsequenceDetail || '') !== String(detail || ''),
      };
    } else {
      // Legacy clients still posting free-text only.
      if (input.businessConsequence !== undefined) {
        data.businessConsequence = input.businessConsequence ?? undefined;
      }
      if (input.businessConsequenceDetail !== undefined) {
        data.businessConsequenceDetail =
          sanitizeRichText(String(input.businessConsequenceDetail ?? '')) || null;
      }
      if (input.otherBusinessConsequence !== undefined) {
        data.otherBusinessConsequence =
          String(input.otherBusinessConsequence ?? '').trim() || null;
      }
    }

    // Structured diagnostic modules: answers calculate assurance; exposureRating is derived.
    if (isEadDiagnosticModuleCode(moduleCode) && input.diagnosticAnswers !== undefined) {
      const answers: EadDiagnosticAnswers = {};
      const raw = input.diagnosticAnswers && typeof input.diagnosticAnswers === 'object'
        ? (input.diagnosticAnswers as Record<string, unknown>)
        : {};
      for (const [key, value] of Object.entries(raw)) {
        if (value == null || value === '') {
          answers[key] = null;
          continue;
        }
        if (!isEadLikertValue(value)) {
          throw new BadRequestException(`Invalid diagnostic answer for ${key}.`);
        }
        answers[key] = value as EadLikertValue;
      }
      const criteria = await this.eadQuestions.listActiveCriteriaForModule(id, moduleCode);
      const snapshot = buildEadDiagnosticSnapshot(moduleCode, answers, new Date(), criteria);
      data.diagnosticResponses = snapshot;
      data.exposureRating =
        snapshot.calculatedExposureIndicator == null
          ? null
          : Math.round(snapshot.calculatedExposureIndicator);
    } else if (input.exposureRating !== undefined && !isEadDiagnosticModuleCode(moduleCode)) {
      const rating =
        input.exposureRating == null || input.exposureRating === ''
          ? null
          : Math.max(0, Math.min(100, Number(input.exposureRating)));
      data.exposureRating = Number.isFinite(rating as number) ? Math.round(rating as number) : null;
    } else if (input.exposureRating !== undefined && isEadDiagnosticModuleCode(moduleCode)) {
      // Ignore manual exposure overrides once structured scoring is in place.
      // Legacy assessments without diagnosticAnswers keep their existing exposureRating.
    }

    const row = await this.prisma.advisoryModuleReview.update({
      where: { assessmentId_moduleCode: { assessmentId: id, moduleCode } },
      data,
    });
    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_MODULE_UPDATED',
      entityType: 'AdvisoryModuleReview',
      entityId: row.id,
      metadata: {
        assessmentId: id,
        moduleCode,
        diagnosticCalculated: Boolean(data.diagnosticResponses),
        exposureRating: row.exposureRating,
        ...(consequenceAudit
          ? {
              businessConsequencesFrom: consequenceAudit.from,
              businessConsequencesTo: consequenceAudit.to,
              businessConsequenceDetailChanged: consequenceAudit.detailChanged,
            }
          : {}),
      },
    });
    return row;
  }

  async assign(id: string, input: { userId: string; role?: AssignmentRole; notes?: string }, actor: AuthUser) {
    await this.assertAccess(id, actor);
    this.assertConsultant(actor);
    const engagement = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: { status: true, parentAssessmentId: true },
    });
    if (!engagement) throw new NotFoundException('Advisory engagement not found.');

    const role = input.role || AssignmentRole.PRIMARY_ANALYST;
    const lockedTriageAnalystId = await this.resolveLockedTriageAnalystId(id, engagement.parentAssessmentId);
    const existingPrimary = await this.prisma.assessmentAssignment.findFirst({
      where: {
        assessmentId: id,
        role: AssignmentRole.PRIMARY_ANALYST,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
    });
    const isAdmin = actor.role === SystemRole.SUPER_ADMIN || actor.role === SystemRole.METHODOLOGY_ADMIN;
    if (
      role === AssignmentRole.PRIMARY_ANALYST
      && lockedTriageAnalystId
      && this.isEngagementActive(engagement.status)
      && input.userId !== lockedTriageAnalystId
      && !isAdmin
    ) {
      throw new BadRequestException(
        existingPrimary
          ? 'The primary consultant was assigned at Level 1 triage and cannot be changed until this engagement is completed.'
          : 'Assign the Level 1 triage analyst as the primary consultant.',
      );
    }

    const assignee = await this.prisma.user.findUnique({ where: { id: input.userId } });
    const assignableRoles: SystemRole[] = [SystemRole.ANALYST, SystemRole.REVIEWER, SystemRole.SUPER_ADMIN];
    if (!assignee || !assignee.isActive || !assignableRoles.includes(assignee.systemRole)) {
      throw new BadRequestException('Select an active analyst or reviewer.');
    }
    if (role === AssignmentRole.PRIMARY_ANALYST) {
      await this.prisma.assessmentAssignment.updateMany({
        where: { assessmentId: id, role, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
    }
    const assignment = await this.prisma.assessmentAssignment.create({
      data: { assessmentId: id, userId: input.userId, role, assignedById: actor.id, notes: input.notes || null },
    });
    if (role === AssignmentRole.PRIMARY_ANALYST) {
      await this.syncConvertedLeadAnalyst(id, input.userId);
    }
    await this.audit.record({
      userId: actor.id,
      action: 'ADVISORY_ASSIGNED',
      entityType: 'AssessmentAssignment',
      entityId: assignment.id,
      metadata: { assessmentId: id, assigneeId: input.userId, role },
    });
    return assignment;
  }

  /**
   * PublicLead.assignedAnalystId is the single source of truth for the triage â†’ Level 2(+)/3 chain.
   * Keep the converted lead in sync whenever a primary consultant is set on an engagement.
   */
  private async syncConvertedLeadAnalyst(assessmentId: string, analystId: string) {
    let currentId: string | null = assessmentId;
    while (currentId) {
      const lead = await this.prisma.publicLead.findFirst({
        where: { convertedAssessmentId: currentId },
        select: { id: true, assignedAnalystId: true },
      });
      if (lead) {
        if (lead.assignedAnalystId !== analystId) {
          await this.prisma.publicLead.update({
            where: { id: lead.id },
            data: { assignedAnalystId: analystId },
          });
        }
        return;
      }
      const parentRow: { parentAssessmentId: string | null } | null =
        await this.prisma.assessmentSession.findUnique({
          where: { id: currentId },
          select: { parentAssessmentId: true },
        });
      currentId = parentRow?.parentAssessmentId ?? null;
    }
  }

  async generateReport(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    this.assertConsultant(user);
    const engagement = await this.get(id, user);
    if (!engagement.advisoryModuleReviews?.length) {
      throw new BadRequestException('No approved product modules are configured for this engagement.');
    }
    await this.validateModulesComplete(engagement.advisoryModuleReviews, id);
    const primary = engagement.assignments.find((a: any) => a.role === 'PRIMARY_ANALYST' && a.status !== 'CANCELLED');
    const consultant = primary?.user ? `${primary.user.firstName} ${primary.user.lastName}`.trim() : null;
    const reportType =
      engagement.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC
        ? ReportType.EXECUTIVE_ADVISORY_BRIEF
        : engagement.productCode === ProductCode.GOVERNANCE_EXECUTIVE_ASSURANCE
          ? ReportType.COMMITTEE_ASSURANCE_REPORT
          : ReportType.FOCUSED_ASSURANCE_REPORT;

    const brand = resolveSclReportBrandConfig(this.config);
    const routes =
      engagement.diagnosticOutcome?.routes?.map((r: any) => ({
        productCode: r.productCode,
        priority: r.priority,
        rationale: r.rationale,
      })) || [];
    const evidence = (engagement.evidence || []).map((e: any) => ({
      id: e.id,
      fileName: e.fileName,
      title: e.title || e.fileName,
      moduleCode: e.moduleCode || null,
    }));
    const questions = (engagement.eadDiagnosticQuestions || []).map((q: any) => ({
      moduleCode: q.moduleCode,
      questionCode: q.questionCode,
      title: q.title,
      questionText: q.questionText,
      displayOrder: q.displayOrder,
      isActive: q.isActive,
      allowNa: q.allowNa,
    }));

    const existing = await this.prisma.report.findFirst({
      where: {
        assessmentId: id,
        reportType,
        status: { not: ReportStatus.SUPERSEDED },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    // Protect issued snapshots: never overwrite an ISSUED report file in place.
    const replaceExisting =
      existing &&
      existing.status !== ReportStatus.ISSUED &&
      existing.status !== ReportStatus.APPROVED;

    const version = replaceExisting
      ? existing!.version
      : existing
        ? existing.version + 1
        : (await this.prisma.report.count({ where: { assessmentId: id, reportType } })) + 1;

    const pdf = await renderAdvisoryPdf({
      reference: engagement.reference,
      title: engagement.title,
      organisation: engagement.organisation.name,
      productLabel: engagement.productLabel,
      status: engagement.status,
      consultant,
      reportVersion: version,
      templateLabel: engagement.eadTemplateVersion
        ? engagement.eadTemplateVersion.label ||
          `v${engagement.eadTemplateVersion.versionNumber}`
        : null,
      generatedAt: new Date(),
      salesEmail: brand.email,
      modules: engagement.advisoryModuleReviews,
      evidence,
      routes,
      questions,
    });

    const safeRef = engagement.reference.replace(/[^A-Za-z0-9_-]/g, '_');
    const fileName = `${safeRef}-${reportType.toLowerCase()}-v${version}.pdf`;
    const storageKey =
      replaceExisting && existing?.storageKey
        ? existing.storageKey
        : `reports/advisory/${id}/${Date.now()}-${fileName}`;
    await this.storage.put(storageKey, pdf, 'application/pdf');

    if (replaceExisting && existing) {
      await this.prisma.report.updateMany({
        where: {
          assessmentId: id,
          reportType,
          status: { not: ReportStatus.SUPERSEDED },
          id: { not: existing.id },
        },
        data: { status: ReportStatus.SUPERSEDED },
      });
      const report = await this.prisma.report.update({
        where: { id: existing.id },
        data: {
          title: `${engagement.productLabel} — ${engagement.organisation.name}`,
          status: ReportStatus.GENERATED,
          storageKey,
          fileName,
          generatedById: user.id,
          generatedAt: new Date(),
          issuedAt: null,
        },
      });
      await this.audit.record({
        userId: user.id,
        action: 'ADVISORY_REPORT_REPLACED',
        entityType: 'Report',
        entityId: report.id,
        metadata: { assessmentId: id, reportType, fileName, replaced: true },
      });
      return { ...report, downloadUrl: await this.storage.signedDownloadUrl(storageKey, 900, fileName) };
    }

    if (existing && (existing.status === ReportStatus.ISSUED || existing.status === ReportStatus.APPROVED)) {
      // Leave issued/approved snapshot immutable; new file becomes the active GENERATED version.
    } else {
      await this.prisma.report.updateMany({
        where: {
          assessmentId: id,
          reportType,
          status: { notIn: [ReportStatus.SUPERSEDED, ReportStatus.ISSUED, ReportStatus.APPROVED] },
        },
        data: { status: ReportStatus.SUPERSEDED },
      });
    }

    const report = await this.prisma.report.create({
      data: {
        assessmentId: id,
        reportType,
        version,
        status: ReportStatus.GENERATED,
        title: `${engagement.productLabel} — ${engagement.organisation.name}`,
        storageKey,
        fileName,
        generatedById: user.id,
        generatedAt: new Date(),
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_REPORT_GENERATED',
      entityType: 'Report',
      entityId: report.id,
      metadata: {
        assessmentId: id,
        reportType,
        fileName,
        preservedIssued: existing?.status === ReportStatus.ISSUED,
      },
    });
    return { ...report, downloadUrl: await this.storage.signedDownloadUrl(storageKey, 900, fileName) };
  }

  async completeDiagnostic(id: string, user: AuthUser, input?: { routes?: ConfirmedRouteInput[] }) {
    await this.assertAccess(id, user);
    this.assertConsultant(user);

    const engagement = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: { advisoryModuleReviews: true, diagnosticOutcome: { include: { routes: true } } },
    });
    if (!engagement) throw new NotFoundException('Advisory engagement not found.');
    if (engagement.productCode !== ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC) {
      return this.completeFocusedAssurance(id, engagement.advisoryModuleReviews, user);
    }

    if (engagement.diagnosticOutcome) {
      return {
        ok: true,
        alreadyCompleted: true,
        status: engagement.status,
        outcomeId: engagement.diagnosticOutcome.id,
        recommendedProducts: engagement.diagnosticOutcome.routes.map((r) => r.productCode),
      };
    }

    await this.validateModulesComplete(engagement.advisoryModuleReviews, id);

    const routesInput =
      input?.routes?.length ? input.routes : this.suggestRoutesFromModules(engagement.advisoryModuleReviews);
    if (!routesInput.length) {
      throw new BadRequestException(
        'Select at least one Level 3 focused assurance product to confirm routing before completing the diagnostic.',
      );
    }

    for (const route of routesInput) {
      if (isLegacyShield360ProductCode(route.productCode)) {
        throw new BadRequestException(SHIELD360_RETIRED_MESSAGE);
      }
      if (!L3_ROUTING_PRODUCTS.has(String(route.productCode))) {
        throw new BadRequestException(`Unsupported Level 3 product: ${route.productCode}`);
      }
    }

    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.assessmentSession.update({
        where: { id },
        data: { status: AssessmentStatus.SUBMITTED, submittedAt: now },
      });
      const row = await tx.advisoryDiagnosticOutcome.create({
        data: {
          assessmentId: id,
          confirmedAt: now,
          confirmedById: user.id,
          routes: {
            create: routesInput.map((route, index) => ({
              productCode: route.productCode as ProductCode,
              priority: route.priority || AdvisoryRoutePriority.RECOMMENDED,
              rationale: route.rationale?.trim() || null,
              sourceModuleCode: route.sourceModuleCode || null,
              sourceModuleName: route.sourceModuleName || null,
              sortOrder: index,
            })),
          },
        },
        include: { routes: { orderBy: { sortOrder: 'asc' } } },
      });
      return row;
    });

    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_DIAGNOSTIC_COMPLETED',
      entityType: 'AdvisoryDiagnosticOutcome',
      entityId: outcome.id,
      metadata: {
        assessmentId: id,
        reference: engagement.reference,
        routes: outcome.routes.map((r) => ({
          productCode: r.productCode,
          priority: r.priority,
        })),
      },
    });

    return {
      ok: true,
      alreadyCompleted: false,
      status: 'SUBMITTED',
      outcomeId: outcome.id,
      recommendedProducts: outcome.routes.map((r) => r.productCode),
    };
  }

  private async completeFocusedAssurance(
    id: string,
    modules: Array<{ moduleName: string; finding?: string | null; businessConsequence?: string | null; requiredDecision?: string | null; evidenceSummary?: string | null }>,
    user: AuthUser,
  ) {
    await this.validateModulesComplete(modules, id);
    const existing = await this.prisma.assessmentSession.findUnique({ where: { id }, select: { status: true, submittedAt: true } });
    if (existing?.status === AssessmentStatus.SUBMITTED && existing.submittedAt) {
      return { ok: true, alreadyCompleted: true, status: 'SUBMITTED' };
    }
    await this.prisma.assessmentSession.update({
      where: { id },
      data: { status: AssessmentStatus.SUBMITTED, submittedAt: new Date() },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_FOCUSED_ASSURANCE_COMPLETED',
      entityType: 'AssessmentSession',
      entityId: id,
      metadata: {},
    });
    return { ok: true, alreadyCompleted: false, status: 'SUBMITTED' };
  }

  async updateCommercialProposal(
    id: string,
    input: { action: string; commercialAdminNotes?: string },
    user: AuthUser,
  ) {
    await this.assertAccess(id, user);
    this.assertConsultant(user);

    const engagement = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: { diagnosticOutcome: true },
    });
    if (!engagement?.diagnosticOutcome) {
      throw new BadRequestException('Confirm diagnostic routing before managing Level 3 commercial proposal.');
    }

    const action = String(input.action || '').trim().toUpperCase();
    if (!L3_COMMERCIAL_ACTIONS.has(action)) throw new BadRequestException('Unsupported commercial action.');

    const outcome = engagement.diagnosticOutcome;
    const previous = outcome.commercialStatus;
    const now = new Date();
    const data: Record<string, unknown> = {};
    let auditAction = 'L3_COMMERCIAL_UPDATED';
    let next: ProposalStatus = previous;

    if (input.commercialAdminNotes !== undefined) {
      data.commercialAdminNotes = input.commercialAdminNotes.trim() || null;
    }

    if (action === 'INITIATE') {
      if (previous !== ProposalStatus.NOT_REQUESTED) {
        throw new BadRequestException('Commercial proposal has already been initiated.');
      }
      next = ProposalStatus.REQUESTED;
      data.commercialStatus = next;
      data.commercialRequestedAt = now;
      auditAction = 'L3_COMMERCIAL_REQUESTED';
    } else if (action === 'PREPARE') {
      const allowed: ProposalStatus[] = [ProposalStatus.REQUESTED, ProposalStatus.IN_PREPARATION];
      if (!allowed.includes(previous)) throw new BadRequestException('Start preparing only from a requested proposal.');
      next = ProposalStatus.IN_PREPARATION;
      data.commercialStatus = next;
      auditAction = 'L3_COMMERCIAL_PREPARATION_STARTED';
    } else if (action === 'SENT') {
      const allowed: ProposalStatus[] = [
        ProposalStatus.REQUESTED,
        ProposalStatus.IN_PREPARATION,
        ProposalStatus.SENT,
      ];
      if (!allowed.includes(previous)) throw new BadRequestException('Mark sent only after proposal preparation.');
      next = ProposalStatus.SENT;
      data.commercialStatus = next;
      data.commercialSentAt = outcome.commercialSentAt || now;
      auditAction = 'L3_COMMERCIAL_SENT';
    } else if (action === 'ACCEPTED') {
      const allowed: ProposalStatus[] = [
        ProposalStatus.SENT,
        ProposalStatus.ACCEPTED,
        ProposalStatus.IN_PREPARATION,
      ];
      if (!allowed.includes(previous)) throw new BadRequestException('Accept only after proposal has been sent or prepared.');
      next = ProposalStatus.ACCEPTED;
      data.commercialStatus = next;
      data.commercialAcceptedAt = outcome.commercialAcceptedAt || now;
      auditAction = 'L3_COMMERCIAL_ACCEPTED';
    } else if (action === 'DECLINED') {
      const allowed: ProposalStatus[] = [
        ProposalStatus.REQUESTED,
        ProposalStatus.IN_PREPARATION,
        ProposalStatus.SENT,
        ProposalStatus.DECLINED,
      ];
      if (!allowed.includes(previous)) throw new BadRequestException('Decline is not valid for this commercial state.');
      next = ProposalStatus.DECLINED;
      data.commercialStatus = next;
      data.commercialDeclinedAt = outcome.commercialDeclinedAt || now;
      auditAction = 'L3_COMMERCIAL_DECLINED';
    } else if (action === 'EXPIRE') {
      next = ProposalStatus.EXPIRED;
      data.commercialStatus = next;
      data.commercialExpiredAt = outcome.commercialExpiredAt || now;
      auditAction = 'L3_COMMERCIAL_EXPIRED';
    } else if (action === 'CANCELLED') {
      next = ProposalStatus.CANCELLED;
      data.commercialStatus = next;
      auditAction = 'L3_COMMERCIAL_CANCELLED';
    } else if (action === 'SAVE_NOTES') {
      auditAction = 'L3_COMMERCIAL_NOTES_UPDATED';
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (action === 'INITIATE' && !outcome.commercialReference) {
        data.commercialReference = await generateL3ProposalReference(tx);
      }
      if (action === 'SAVE_NOTES' && Object.keys(data).length === 0 && input.commercialAdminNotes === undefined) {
        throw new BadRequestException('No notes to save.');
      }
      return tx.advisoryDiagnosticOutcome.update({
        where: { id: outcome.id },
        data,
        include: { routes: { orderBy: { sortOrder: 'asc' }, include: { createdAssessment: true } } },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: auditAction,
      entityType: 'AdvisoryDiagnosticOutcome',
      entityId: outcome.id,
      metadata: {
        assessmentId: id,
        commercialReference: updated.commercialReference,
        previousStatus: previous,
        newStatus: next,
      },
    });

    return updated;
  }

  async createLevel3Engagement(id: string, routeId: string, user: AuthUser) {
    await this.assertAccess(id, user);
    this.assertConsultant(user);

    const engagement = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: {
        organisation: true,
        diagnosticOutcome: {
          include: {
            routes: {
              include: { createdAssessment: { select: { id: true, reference: true } } },
            },
          },
        },
      },
    });
    if (!engagement?.diagnosticOutcome) {
      throw new BadRequestException('Confirm diagnostic routing before creating Level 3 engagements.');
    }
    if (engagement.diagnosticOutcome.commercialStatus !== ProposalStatus.ACCEPTED) {
      throw new BadRequestException('Level 3 engagements can only be created after commercial proposal acceptance.');
    }

    const route = engagement.diagnosticOutcome.routes.find((r) => r.id === routeId);
    if (!route) throw new NotFoundException('Confirmed route not found.');
    if (route.createdAssessmentId && route.createdAssessment) {
      const inheritedId = await this.resolveLockedTriageAnalystId(route.createdAssessment.id, id);
      if (inheritedId) {
        await this.ensureInheritedPrimaryAnalyst(route.createdAssessment.id, inheritedId, user);
      }
      return { created: false, engagement: route.createdAssessment };
    }

    const productCode = route.productCode;
    if (isLegacyShield360ProductCode(productCode)) {
      throw new BadRequestException(SHIELD360_RETIRED_MESSAGE);
    }
    if (!ADVISORY_PRODUCTS_ACTIVE.has(productCode) && productCode !== ProductCode.SCLI_COST_LEAKAGE) {
      throw new BadRequestException(`Unsupported Level 3 product: ${productCode}`);
    }

    const orgId = engagement.organisationId;
    const title = `${engagement.organisation.name} ${PRODUCT_LABELS[productCode] || productCode}`;

    let created: { id: string; reference: string; productCode: ProductCode; status: AssessmentStatus; title: string };

    if (productCode === ProductCode.SCLI_COST_LEAKAGE) {
      const questionnaire = await this.prisma.questionnaire.findUnique({
        where: { code: 'SCLI' },
        include: { versions: { where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } },
      });
      if (!questionnaire?.versions[0]) throw new BadRequestException('No published SCLI questionnaire version is available.');
      created = await this.prisma.$transaction(async (tx) => {
        const reference = await generateAssessmentReference(tx, ProductCode.SCLI_COST_LEAKAGE);
        const row = await tx.assessmentSession.create({
          data: {
            reference,
            organisationId: orgId,
            questionnaireVersionId: questionnaire.versions[0].id,
            productCode: ProductCode.SCLI_COST_LEAKAGE,
            createdById: user.id,
            title,
            status: AssessmentStatus.IN_PROGRESS,
            parentAssessmentId: id,
          },
        });
        await tx.advisoryConfirmedRoute.update({
          where: { id: routeId },
          data: { createdAssessmentId: row.id },
        });
        return row;
      });
      await this.audit.record({
        userId: user.id,
        action: 'LEVEL3_ENGAGEMENT_CREATED',
        entityType: 'AssessmentSession',
        entityId: created.id,
        metadata: { productCode, reference: created.reference, sourceEadId: id, routeId },
      });
      const inheritedId = await this.resolveLockedTriageAnalystId(created.id, id);
      if (inheritedId) {
        await this.ensureInheritedPrimaryAnalyst(created.id, inheritedId, user);
      }
    } else if (ADVISORY_PRODUCTS.has(productCode) && productCode !== ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC) {
      const row = await this.create(
        { organisationId: orgId, productCode, title, parentAssessmentId: id },
        user,
      );
      await this.prisma.advisoryConfirmedRoute.update({
        where: { id: routeId },
        data: { createdAssessmentId: row.id },
      });
      created = row;
      await this.audit.record({
        userId: user.id,
        action: 'LEVEL3_ENGAGEMENT_CREATED',
        entityType: 'AssessmentSession',
        entityId: created.id,
        metadata: { productCode, reference: created.reference, sourceEadId: id, routeId },
      });
    } else {
      throw new BadRequestException(`Cannot create engagement for product ${productCode}.`);
    }

    return { created: true, engagement: created };
  }

  async update(id: string, data: { title?: string }, user: AuthUser) {
    if (!['SUPER_ADMIN', 'METHODOLOGY_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Admin permission required.');
    }
    await this.assertAccess(id, user);
    const title = data.title?.trim();
    if (!title || title.length < 2) throw new BadRequestException('Engagement title is required.');
    const engagement = await this.prisma.assessmentSession.update({
      where: { id },
      data: { title },
    });
    await this.audit.record({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'AssessmentSession',
      entityId: id,
      metadata: { title, productCode: engagement.productCode },
    });
    return engagement;
  }

  async remove(id: string, user: AuthUser) {
    if (!['SUPER_ADMIN', 'METHODOLOGY_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Admin permission required.');
    }
    await this.assertAccess(id, user);
    const existing = await this.prisma.assessmentSession.findUnique({
      where: { id },
      select: {
        id: true,
        reference: true,
        productCode: true,
        diagnosticOutcome: {
          select: {
            routes: {
              where: { createdAssessmentId: { not: null } },
              select: {
                createdAssessmentId: true,
                createdAssessment: { select: { reference: true, productCode: true } },
              },
            },
          },
        },
        reassessments: { select: { id: true, reference: true, productCode: true } },
      },
    });
    if (!existing || !ADVISORY_PRODUCTS.has(existing.productCode)) {
      throw new NotFoundException('Advisory engagement not found.');
    }

    const spawned = existing.diagnosticOutcome?.routes || [];
    if (spawned.length > 0) {
      const refs = spawned
        .map((r) => r.createdAssessment?.reference)
        .filter(Boolean)
        .join(', ');
      throw new BadRequestException(
        refs
          ? `Cannot delete this engagement because Level 3 work was created from it (${refs}). Delete or archive those engagements first.`
          : 'Cannot delete an engagement after Level 3 work has been created from it.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Soft-detach any child sessions that only pointed at this parent.
      await tx.assessmentSession.updateMany({
        where: { parentAssessmentId: id },
        data: { parentAssessmentId: null },
      });
      await tx.publicLead.updateMany({
        where: { convertedAssessmentId: id },
        data: { convertedAssessmentId: null, convertedAt: null },
      });
      await tx.publicLead.updateMany({
        where: { assessmentId: id },
        data: { assessmentId: null },
      });
      await tx.assessmentSession.delete({ where: { id } });
    });

    await this.audit.record({
      userId: user.id,
      action: 'DELETE',
      entityType: 'AssessmentSession',
      entityId: id,
      metadata: {
        reference: existing.reference,
        productCode: existing.productCode,
        unlinkedChildren: existing.reassessments.map((r) => r.reference),
      },
    });

    return {
      id,
      deleted: true,
      message: 'Advisory engagement deleted.',
    };
  }
}
