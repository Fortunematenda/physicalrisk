import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { EspoCrmService } from '../crm/espocrm.service';
import { ReportsService } from '../reports/reports.service';
import {
  buildPriorityActionText,
  resolveSclClassificationVisual,
} from '../reports/scl-report-visual';

type LeadAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  series?: string;
  article?: string;
  cta?: string;
  referrer?: string;
  landingPage?: string;
  country?: string;
  primaryConcern?: string;
  insightsOptIn?: boolean;
  totalSites?: string;
  securityExpenditure?: string;
};

type LeadContact = {
  organisationName: string;
  industry?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  website?: string;
  attribution?: LeadAttribution;
};

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessments: AssessmentsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly crm: EspoCrmService,
    private readonly reports: ReportsService,
  ) {}

  async getPublishedQuestionnaire(code = 'SCLI') {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { code },
      include: {
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
          take: 1,
          include: {
            inputDefinitions: { orderBy: { sortOrder: 'asc' } },
            questions: {
              orderBy: { sortOrder: 'asc' },
              include: { options: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });
    if (!questionnaire?.versions[0]) throw new NotFoundException('Published questionnaire not found.');
    const version = questionnaire.versions[0];
    return {
      code: questionnaire.code,
      name: questionnaire.name,
      description: questionnaire.description,
      version: version.version,
      inputDefinitions: version.inputDefinitions.map((def) => ({
        code: def.code,
        label: def.label,
        guidance: def.guidance,
        valueType: def.valueType,
        unit: def.unit,
        required: def.required,
        sortOrder: def.sortOrder,
        options: def.options,
        defaultValue: def.defaultValue ?? undefined,
      })),
      questions: version.questions.map((q) => ({
        code: q.code,
        category: q.category,
        text: q.text,
        required: q.required,
        evidenceHint: q.evidenceHint,
        sortOrder: q.sortOrder,
        options: q.options.map((o) => ({
          id: o.id,
          label: String(o.label || '').replace(/^[\s\u00A0\u200B\uFEFF]*[-–—•·]\s+/, ''),
          sortOrder: o.sortOrder,
        })),
      })),
    };
  }

  async captureLead(input: LeadContact, source: 'wordpress') {
    const email = input.email.trim().toLowerCase();
    const organisationName = input.organisationName.trim();

    const organisation = await this.prisma.organisation.create({
      data: {
        name: organisationName,
        industry: input.industry?.trim() || null,
        primaryEmail: email,
        primaryPhone: input.phone?.trim() || null,
      },
    });

    const systemUser = await this.getSystemUser();
    const assessment = await this.assessments.create(
      {
        organisationId: organisation.id,
        questionnaireCode: 'SCLI',
        title: `${organisation.name} Security Cost Leakage Assessment`,
      },
      { id: systemUser.id, email: systemUser.email, role: String(systemUser.systemRole) },
    );

    const lead = await this.prisma.publicLead.create({
      data: {
        organisationName,
        industry: input.industry?.trim() || null,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        phone: input.phone?.trim() || null,
        source,
        status: 'IN_PROGRESS',
        organisationId: organisation.id,
        assessmentId: assessment.id,
        progressPhase: 'calibration',
        progressLabel: 'Details captured · Starting calibration',
        progressPercent: 5,
        progressCalStep: 0,
        lastProgressAt: new Date(),
      },
    });

    await this.audit.record({
      userId: systemUser.id,
      action: 'PUBLIC_LEAD_CAPTURED',
      entityType: 'PublicLead',
      entityId: lead.id,
      metadata: {
        source: lead.source,
        email: lead.email,
        organisationId: organisation.id,
        assessmentId: assessment.id,
        crmReady: true,
        jobTitle: input.jobTitle || null,
        attribution: input.attribution || null,
      },
    });

    try {
      // Create EspoCRM Lead immediately when the contact form is completed
      await this.crm.syncLeadFromContactForm(lead.id, {
        jobTitle: input.jobTitle,
        attribution: input.attribution,
      });
      await this.crm.queueAccountSync(organisation.id);
    } catch {
      // CRM downtime must not block public lead capture
    }

    return this.resumeSession(lead.id);
  }

  async resumeSession(leadId?: string) {
    if (!leadId) throw new NotFoundException('No assessment is associated with this session.');
    const lead = await this.prisma.publicLead.findUnique({ where: { id: leadId } });

    if (!lead || !lead.assessmentId) {
      throw new NotFoundException('No in-progress assessment found for this email.');
    }
    if (lead.status === 'COMPLETED') {
      throw new BadRequestException(
        'This assessment was already completed. Start again with a new submission if needed.',
      );
    }

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: lead.assessmentId },
      include: {
        inputValues: { include: { inputDefinition: true } },
        responses: { include: { question: true } },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment linked to this lead was not found.');

    const inputs: Record<string, unknown> = {};
    for (const row of assessment.inputValues) {
      let value = row.value as unknown;
      // Legacy PERCENT was stored as 0–1 fraction — expose 0–100 for display.
      // Structured range objects are returned as-is for the range selector.
      if (row.inputDefinition.valueType === 'PERCENT' && typeof value === 'number') {
        value = Number((value * 100).toFixed(4));
      }
      inputs[row.inputDefinition.code] = value;
    }

    const responses: Record<string, string> = {};
    for (const row of assessment.responses) {
      if (row.responseOptionId) responses[row.question.code] = row.responseOptionId;
    }

    const phase = lead.progressPhase === 'questions' ? 'questions' : 'calibration';
    const calStep = Math.max(0, Math.min(3, lead.progressCalStep ?? 0));
    const questionIndex = Math.max(0, lead.progressQuestionIndex ?? 0);

    return {
      resumed: true,
      leadId: lead.id,
      assessmentId: lead.assessmentId,
      status: lead.status,
      details: {
        organisationName: lead.organisationName,
        industry: lead.industry || '',
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone || '',
      },
      progress: {
        phase,
        calStep,
        questionIndex,
        label: lead.progressLabel || 'In progress',
        percent: lead.progressPercent || 0,
      },
      inputs,
      responses,
    };
  }

  async saveProgress(input: {
    leadId: string;
    phase: 'calibration' | 'questions';
    calStep?: number;
    questionIndex?: number;
    progressLabel?: string;
    progressPercent?: number;
    inputs?: Array<{ code: string; value: unknown }>;
    responses?: Array<{ questionCode: string; responseOptionId: string }>;
  }) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id: input.leadId } });
    if (!lead || !lead.assessmentId) throw new NotFoundException('Lead not found.');
    if (lead.status === 'COMPLETED') {
      return { leadId: lead.id, status: lead.status, message: 'Assessment already completed.' };
    }

    const systemUser = await this.getSystemUser();
    const authUser = { id: systemUser.id, email: systemUser.email, role: String(systemUser.systemRole) };

    for (const item of input.inputs || []) {
      if (item.value === undefined || item.value === null || item.value === '') continue;
      await this.assessments.saveInput(lead.assessmentId, item.code, item.value, authUser);
    }
    for (const item of input.responses || []) {
      if (!item.responseOptionId) continue;
      await this.assessments.saveResponse(lead.assessmentId, item.questionCode, item.responseOptionId, undefined, authUser);
    }

    const updated = await this.prisma.publicLead.update({
      where: { id: lead.id },
      data: {
        status: 'IN_PROGRESS',
        progressPhase: input.phase,
        progressLabel: input.progressLabel || lead.progressLabel,
        progressPercent: Math.max(0, Math.min(99, Number(input.progressPercent ?? lead.progressPercent ?? 0))),
        progressCalStep: input.calStep ?? lead.progressCalStep,
        progressQuestionIndex: input.questionIndex ?? lead.progressQuestionIndex,
        lastProgressAt: new Date(),
      },
    });

    return {
      leadId: updated.id,
      assessmentId: lead.assessmentId,
      progressPercent: updated.progressPercent,
      progressLabel: updated.progressLabel,
      status: updated.status,
    };
  }

  async completeAssessment(input: LeadContact & {
    leadId: string;
    inputs?: Array<{ code: string; value: unknown }>;
    responses?: Array<{ questionCode: string; responseOptionId: string }>;
  }) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id: input.leadId } });
    if (!lead || !lead.assessmentId) throw new NotFoundException('Lead not found. Please start again from your details.');
    if (lead.status === 'COMPLETED' || lead.status === 'SUBMITTING') {
      throw new BadRequestException('This assessment has already been submitted.');
    }

    const systemUser = await this.getSystemUser();
    const authUser = { id: systemUser.id, email: systemUser.email, role: String(systemUser.systemRole) };

    for (const item of input.inputs || []) {
      if (item.value === undefined || item.value === null || item.value === '') continue;
      await this.assessments.saveInput(lead.assessmentId, item.code, item.value, authUser);
    }

    for (const item of input.responses || []) {
      if (!item.responseOptionId) continue;
      await this.assessments.saveResponse(lead.assessmentId, item.questionCode, item.responseOptionId, undefined, authUser);
    }

    const claimed = await this.prisma.publicLead.updateMany({
      where: { id: lead.id, status: 'IN_PROGRESS' },
      data: {
        status: 'SUBMITTING',
        lastProgressAt: new Date(),
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('This assessment has already been submitted.');

    let evaluated = false;
    try {
      await this.assessments.submit(lead.assessmentId, authUser, { allowIncompleteQuestions: true });
      evaluated = true;
    } catch (error) {
      await this.prisma.publicLead.updateMany({
        where: { id: lead.id, status: 'SUBMITTING' },
        data: { status: 'IN_PROGRESS' },
      });
      throw error;
    }

    // Generate PDF before responding so the results page can offer Download.
    // Failure still allows completion; email path retries via existing queue.
    const reportAttachment = await this.generatePreliminaryReportAttachment(lead.assessmentId, authUser);
    void this.sendThankYouEmail(
      { ...lead, firstName: input.firstName.trim(), organisationName: input.organisationName.trim() || lead.organisationName },
      reportAttachment,
    )
      .then(async (sent) => {
        if (sent) {
          await this.prisma.publicLead.update({
            where: { id: lead.id },
            data: { thankYouSentAt: new Date() },
          }).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    const updated = await this.prisma.publicLead.update({
      where: { id: lead.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        organisationName: input.organisationName.trim() || lead.organisationName,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email.trim().toLowerCase() || lead.email,
        phone: input.phone?.trim() || lead.phone,
        industry: input.industry?.trim() || lead.industry,
        progressPhase: 'completed',
        progressLabel: 'Submitted & evaluated',
        progressPercent: 100,
        lastProgressAt: new Date(),
      },
    });

    if (updated.organisationId) {
      await this.prisma.organisation
        .update({
          where: { id: updated.organisationId },
          data: {
            name: updated.organisationName,
            industry: updated.industry,
            primaryEmail: updated.email,
            primaryPhone: updated.phone,
          },
        })
        .catch(() => undefined);
    }

    let crmLeadSync: { synced: boolean; reason?: string; leadId?: string } = {
      synced: false,
      reason: 'not_attempted',
    };
    try {
      crmLeadSync = await this.syncPublicSubmissionToCrm(updated, input, lead.assessmentId);
    } catch (error) {
      // CRM unavailable must not block public submission
      crmLeadSync = {
        synced: false,
        reason: error instanceof Error ? error.message : 'crm_sync_failed',
      };
    }

    const assessment = await this.prisma.assessmentSession.findUnique({
      where: { id: lead.assessmentId },
      include: {
        scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
        recommendations: { orderBy: { createdAt: 'asc' }, take: 5 },
      },
    });
    const snapshot = assessment?.scoreSnapshots?.[0];
    const visual = snapshot
      ? resolveSclClassificationVisual(Number(snapshot.overallRiskScore))
      : null;
    const diagnosis =
      visual?.band === 'Controlled'
        ? 'Controlled cost leakage profile indicated'
        : visual?.band === 'Moderate'
          ? 'Moderate cost leakage exposure indicated'
          : visual?.band === 'High'
            ? 'Significant cost leakage exposure indicated'
            : visual?.band === 'Critical'
              ? 'Critical cost leakage exposure indicated'
              : 'Preliminary indication complete';
    const recommendedAction = buildPriorityActionText({
      recommendations: assessment?.recommendations || [],
      shortName: 'Physical Risk',
    });
    const attr = (input.attribution || {}) as LeadAttribution;
    const campaignSummary = [attr.source, attr.campaign, attr.medium].filter(Boolean).join(' / ') || updated.source || 'Direct';

    await this.audit.record({
      userId: systemUser.id,
      action: 'PUBLIC_ASSESSMENT_COMPLETED',
      entityType: 'PublicLead',
      entityId: lead.id,
      metadata: {
        assessmentId: lead.assessmentId,
        evaluated,
        thankYouQueued: true,
        inputCount: (input.inputs || []).length,
        responseCount: (input.responses || []).length,
        hasReport: Boolean(reportAttachment?.url),
        jobTitle: input.jobTitle || null,
        attribution: input.attribution || null,
        crmLeadSynced: crmLeadSync.synced,
        crmLeadSyncReason: crmLeadSync.reason || null,
        espocrmLeadId: crmLeadSync.leadId || null,
      },
    });

    return {
      leadId: updated.id,
      assessmentId: lead.assessmentId,
      status: updated.status,
      evaluated,
      thankYouSent: true,
      crmLeadSynced: crmLeadSync.synced,
      crmLeadSyncReason: crmLeadSync.reason || null,
      message: 'Thank you for finishing. Our experts will be in contact with you.',
      downloadUrl: reportAttachment?.url || null,
      fileName: reportAttachment?.attachmentFileName || null,
      reference: assessment?.reference || reportAttachment?.reference || lead.assessmentId,
      result: {
        assessmentId: lead.assessmentId,
        reference: assessment?.reference || lead.assessmentId,
        organisationName: updated.organisationName,
        prospectName: `${updated.firstName} ${updated.lastName}`.trim(),
        assessmentDateLabel: new Date(updated.completedAt || Date.now()).toLocaleString('en-ZA', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        riskBand: visual?.band || snapshot?.riskBand || '—',
        accessibleLabel: visual?.accessibleLabel || String(snapshot?.riskBand || 'Result recorded'),
        colourName: visual?.colourName || '',
        bandIndex: visual?.bandIndex ?? 2,
        overallRiskScore: snapshot ? Number(snapshot.overallRiskScore) : null,
        categoryScores: ((snapshot?.categoryScores as Array<{ category?: string; score?: number }>) || []).map(
          (c) => ({
            category: String(c.category || ''),
            score: Number(c.score || 0),
          }),
        ),
        diagnosis,
        recommendedAction,
        campaignSummary,
        downloadUrl: reportAttachment?.url || null,
        fileName: reportAttachment?.attachmentFileName || null,
        reportId: null,
      },
    };
  }

  private async syncPublicSubmissionToCrm(
    lead: {
      id: string;
      organisationId: string | null;
      assessmentId: string | null;
      organisationName: string;
      industry: string | null;
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
    },
    input: { jobTitle?: string; attribution?: LeadAttribution },
    assessmentId: string,
  ): Promise<{ synced: boolean; reason?: string; leadId?: string }> {
    if (lead.organisationId) {
      await this.crm.queueAccountSync(lead.organisationId);
    }
    const leadSync = await this.crm.syncLeadFromContactForm(lead.id, {
      jobTitle: input.jobTitle,
      attribution: {
        ...(input.attribution || {}),
        // Ensure company contact fields travel with the EspoCRM Lead payload.
        organisationName: lead.organisationName,
        industry: lead.industry || undefined,
        phone: lead.phone || undefined,
      },
    });
    await this.crm.queueAssessmentSync(assessmentId);
    await this.crm.queueReportUpdate(assessmentId);
    return leadSync;
  }

  private async getSystemUser() {
    const user = await this.prisma.user.findFirst({
      where: { systemRole: 'SUPER_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new BadRequestException('System is not ready to accept public assessments yet.');
    return user;
  }

  private async generatePreliminaryReportAttachment(
    assessmentId: string,
    authUser: { id: string; email: string; role: string },
  ): Promise<{
    attachmentStorageKey?: string;
    attachmentFileName?: string;
    attachmentContentType?: string;
    url?: string;
    reference?: string;
  } | null> {
    try {
      const report = await this.reports.generate(assessmentId, authUser, {
        reportType: ReportType.PRELIMINARY_EXECUTIVE,
      });
      if (!report?.storageKey) return null;
      const assessment = await this.prisma.assessmentSession.findUnique({
        where: { id: assessmentId },
        select: { reference: true },
      });
      return {
        attachmentStorageKey: report.storageKey,
        attachmentFileName: report.fileName || undefined,
        attachmentContentType: 'application/pdf',
        url: report.downloadUrl,
        reference: assessment?.reference,
      };
    } catch {
      // Submission must succeed even if PDF generation fails; email still goes out.
      return null;
    }
  }

  private async sendThankYouEmail(
    lead: { email: string; firstName: string; organisationName: string; assessmentId?: string | null },
    reportAttachment?: {
      attachmentStorageKey?: string;
      attachmentFileName?: string;
      attachmentContentType?: string;
      url?: string;
      reference?: string;
    } | null,
  ) {
    try {
      await this.email.enqueue({
        recipient: lead.email,
        subject: 'Thank you for completing the Cost Leakage Questionnaire',
        template: 'submission_confirmation',
        relatedType: 'AssessmentSession',
        relatedId: lead.assessmentId || undefined,
        payload: {
          firstName: lead.firstName,
          organisationName: lead.organisationName,
          reference: reportAttachment?.reference,
          url: reportAttachment?.url,
          attachmentStorageKey: reportAttachment?.attachmentStorageKey,
          attachmentFileName: reportAttachment?.attachmentFileName,
          attachmentContentType: reportAttachment?.attachmentContentType || 'application/pdf',
        },
      });
      const notify = this.config.get<string>('LEAD_NOTIFY_EMAIL') || this.config.get<string>('SEED_ADMIN_EMAIL');
      if (notify) {
        await this.email.enqueue({
          recipient: notify,
          subject: `New Cost Leakage assessment submitted: ${lead.organisationName}`,
          template: 'internal_submission',
          relatedType: 'AssessmentSession',
          relatedId: lead.assessmentId || undefined,
          payload: {
            organisationName: lead.organisationName,
            reference: reportAttachment?.reference || lead.assessmentId || '',
          },
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}
