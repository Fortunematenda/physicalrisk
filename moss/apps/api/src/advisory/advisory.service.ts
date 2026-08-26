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
  PHYSICAL_RISK_PRODUCTS,
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

const ADVISORY_PRODUCTS = new Set<ProductCode>([
  ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
  ProductCode.CONTRACT_SLA_ASSURANCE,
  ProductCode.VENDOR_PERFORMANCE_ASSURANCE,
  ProductCode.GOVERNANCE_EXECUTIVE_ASSURANCE,
  ProductCode.CYBER_PHYSICAL_DEPENDENCY,
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

const PRODUCT_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PHYSICAL_RISK_PRODUCTS).map(([code, value]) => [code, value.name]),
);

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

  private validateModulesComplete(
    modules: Array<{ moduleName: string; finding?: string | null; businessConsequence?: string | null; requiredDecision?: string | null; evidenceSummary?: string | null }>,
  ) {
    const incomplete = modules.filter(
      (m) => !m.finding?.trim() || !m.businessConsequence?.trim() || !m.requiredDecision?.trim(),
    );
    if (incomplete.length) {
      throw new BadRequestException(
        `Complete finding, business consequence and required decision for all product modules. Missing: ${incomplete
          .map((m) => m.moduleName)
          .join(', ')}`,
      );
    }
    const missingEvidence = modules.filter((m) => !m.evidenceSummary?.trim());
    if (missingEvidence.length) {
      throw new BadRequestException(
        `Record supporting evidence or an explicit limitation for every module. Missing: ${missingEvidence
          .map((m) => m.moduleName)
          .join(', ')}`,
      );
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
        String(m.analystNote || '').trim() ||
        String(m.finding || '').trim().slice(0, 280) ||
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
    input: { organisationId: string; productCode: ProductCode; title?: string; parentAssessmentId?: string },
    user: AuthUser,
  ) {
    if (!ADVISORY_PRODUCTS.has(input.productCode)) throw new BadRequestException('Unsupported advisory product.');
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

    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_CREATED',
      entityType: 'AssessmentSession',
      entityId: created.id,
      metadata: { productCode: input.productCode, reference: created.reference, parentAssessmentId: input.parentAssessmentId || null },
    });
    return created;
  }

  async get(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    const engagement = await this.prisma.assessmentSession.findUnique({
      where: { id },
      include: {
        organisation: true,
        parentAssessment: { select: { id: true, reference: true, productCode: true } },
        advisoryModuleReviews: { orderBy: { moduleCode: 'asc' } },
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
    const suggestedRoutes =
      engagement.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC && !engagement.diagnosticOutcome
        ? this.suggestRoutesFromModules(engagement.advisoryModuleReviews)
        : [];
    return {
      ...engagement,
      productLabel: PRODUCT_LABELS[engagement.productCode] || engagement.productCode,
      suggestedRoutes,
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
    const rating =
      input.exposureRating == null || input.exposureRating === ''
        ? null
        : Math.max(0, Math.min(100, Number(input.exposureRating)));
    const row = await this.prisma.advisoryModuleReview.update({
      where: { assessmentId_moduleCode: { assessmentId: id, moduleCode } },
      data: {
        exposureRating: Number.isFinite(rating as number) ? Math.round(rating as number) : null,
        finding: input.finding ?? undefined,
        evidenceSummary: input.evidenceSummary ?? undefined,
        businessConsequence: input.businessConsequence ?? undefined,
        accountableExecutive: input.accountableExecutive ?? undefined,
        requiredDecision: input.requiredDecision ?? undefined,
        recommendedProduct: input.recommendedProduct || null,
        analystNote: input.analystNote ?? undefined,
      },
    });
    await this.audit.record({
      userId: user.id,
      action: 'ADVISORY_MODULE_UPDATED',
      entityType: 'AdvisoryModuleReview',
      entityId: row.id,
      metadata: { assessmentId: id, moduleCode },
    });
    return row;
  }

  async assign(id: string, input: { userId: string; role?: AssignmentRole; notes?: string }, actor: AuthUser) {
    await this.assertAccess(id, actor);
    this.assertConsultant(actor);
    const assignee = await this.prisma.user.findUnique({ where: { id: input.userId } });
    const assignableRoles: SystemRole[] = [SystemRole.ANALYST, SystemRole.REVIEWER, SystemRole.SUPER_ADMIN];
    if (!assignee || !assignee.isActive || !assignableRoles.includes(assignee.systemRole)) {
      throw new BadRequestException('Select an active analyst or reviewer.');
    }
    const role = input.role || AssignmentRole.PRIMARY_ANALYST;
    if (role === AssignmentRole.PRIMARY_ANALYST) {
      await this.prisma.assessmentAssignment.updateMany({
        where: { assessmentId: id, role, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
    }
    const assignment = await this.prisma.assessmentAssignment.create({
      data: { assessmentId: id, userId: input.userId, role, assignedById: actor.id, notes: input.notes || null },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'ADVISORY_ASSIGNED',
      entityType: 'AssessmentAssignment',
      entityId: assignment.id,
      metadata: { assessmentId: id, assigneeId: input.userId, role },
    });
    return assignment;
  }

  async generateReport(id: string, user: AuthUser) {
    await this.assertAccess(id, user);
    this.assertConsultant(user);
    const engagement = await this.get(id, user);
    if (!engagement.advisoryModuleReviews?.length) {
      throw new BadRequestException('No approved product modules are configured for this engagement.');
    }
    this.validateModulesComplete(engagement.advisoryModuleReviews);
    const primary = engagement.assignments.find((a: any) => a.role === 'PRIMARY_ANALYST' && a.status !== 'CANCELLED');
    const consultant = primary?.user ? `${primary.user.firstName} ${primary.user.lastName}`.trim() : null;
    const reportType =
      engagement.productCode === ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC
        ? ReportType.EXECUTIVE_ADVISORY_BRIEF
        : engagement.productCode === ProductCode.GOVERNANCE_EXECUTIVE_ASSURANCE
          ? ReportType.COMMITTEE_ASSURANCE_REPORT
          : ReportType.FOCUSED_ASSURANCE_REPORT;
    const pdf = await renderAdvisoryPdf({
      reference: engagement.reference,
      title: engagement.title,
      organisation: engagement.organisation.name,
      productLabel: engagement.productLabel,
      status: engagement.status,
      consultant,
      modules: engagement.advisoryModuleReviews,
    });
    const existing = await this.prisma.report.findFirst({
      where: {
        assessmentId: id,
        reportType,
        status: { not: ReportStatus.SUPERSEDED },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
    const version = existing?.version ?? (await this.prisma.report.count({ where: { assessmentId: id, reportType } })) + 1;
    const safeRef = engagement.reference.replace(/[^A-Za-z0-9_-]/g, '_');
    const fileName = `${safeRef}-${reportType.toLowerCase()}-v${version}.pdf`;
    const storageKey = existing?.storageKey || `reports/advisory/${id}/${Date.now()}-${fileName}`;
    await this.storage.put(storageKey, pdf, 'application/pdf');

    await this.prisma.report.updateMany({
      where: {
        assessmentId: id,
        reportType,
        status: { not: ReportStatus.SUPERSEDED },
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      data: { status: ReportStatus.SUPERSEDED },
    });

    const report = existing
      ? await this.prisma.report.update({
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
        })
      : await this.prisma.report.create({
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
      action: existing ? 'ADVISORY_REPORT_REPLACED' : 'ADVISORY_REPORT_GENERATED',
      entityType: 'Report',
      entityId: report.id,
      metadata: { assessmentId: id, reportType, fileName, replaced: Boolean(existing) },
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

    this.validateModulesComplete(engagement.advisoryModuleReviews);

    const reportCount = await this.prisma.report.count({
      where: {
        assessmentId: id,
        reportType: ReportType.EXECUTIVE_ADVISORY_BRIEF,
        status: ReportStatus.GENERATED,
      },
    });
    if (reportCount === 0) {
      throw new BadRequestException(
        'Generate the Executive Advisory Brief PDF before completing the diagnostic.',
      );
    }

    const routesInput =
      input?.routes?.length ? input.routes : this.suggestRoutesFromModules(engagement.advisoryModuleReviews);
    if (!routesInput.length) {
      throw new BadRequestException(
        'Select at least one Level 3 focused assurance product to confirm routing before completing the diagnostic.',
      );
    }

    for (const route of routesInput) {
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
    this.validateModulesComplete(modules);
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
      return { created: false, engagement: route.createdAssessment };
    }

    const productCode = route.productCode;
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
}
