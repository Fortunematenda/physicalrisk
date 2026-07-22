import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { EspoCrmService } from '../crm/espocrm.service';

type LeadContact = {
  organisationName: string;
  industry?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  website?: string;
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
          label: o.label,
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
      },
    });

    try {
      // Create EspoCRM Lead immediately when the contact form is completed
      await this.crm.syncLeadFromContactForm(lead.id);
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
      message: 'Welcome back. You can continue where you left off.',
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
      data: { status: 'SUBMITTING', lastProgressAt: new Date() },
    });
    if (claimed.count !== 1) throw new BadRequestException('This assessment has already been submitted.');

    let evaluated = false;
    try {
      await this.assessments.submit(lead.assessmentId, authUser);
      evaluated = true;
    } catch (error) {
      await this.prisma.publicLead.updateMany({
        where: { id: lead.id, status: 'SUBMITTING' },
        data: { status: 'IN_PROGRESS' },
      });
      throw error;
    }

    const thankYouSent = await this.sendThankYouEmail(lead);

    try {
      await this.crm.queueAssessmentSync(lead.assessmentId);
    } catch {
      // CRM unavailable must not block public submission
    }

    const updated = await this.prisma.publicLead.update({
      where: { id: lead.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        thankYouSentAt: thankYouSent ? new Date() : null,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || lead.phone,
        industry: input.industry?.trim() || lead.industry,
        progressPhase: 'completed',
        progressLabel: 'Submitted & evaluated',
        progressPercent: 100,
        lastProgressAt: new Date(),
      },
    });

    try {
      await this.crm.syncLeadFromContactForm(lead.id);
    } catch {
      // Existing CRM retry handling keeps submission non-blocking.
    }

    await this.audit.record({
      userId: systemUser.id,
      action: 'PUBLIC_ASSESSMENT_COMPLETED',
      entityType: 'PublicLead',
      entityId: lead.id,
      metadata: {
        assessmentId: lead.assessmentId,
        evaluated,
        thankYouSent,
        inputCount: (input.inputs || []).length,
        responseCount: (input.responses || []).length,
      },
    });

    return {
      leadId: updated.id,
      assessmentId: lead.assessmentId,
      status: updated.status,
      evaluated,
      thankYouSent,
      message: 'Thank you for finishing. Our experts will be in contact with you.',
    };
  }

  private async getSystemUser() {
    const user = await this.prisma.user.findFirst({
      where: { systemRole: 'SUPER_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!user) throw new BadRequestException('System is not ready to accept public assessments yet.');
    return user;
  }

  private async sendThankYouEmail(lead: { email: string; firstName: string; organisationName: string; assessmentId?: string | null }) {
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
        },
      });
      const notify = this.config.get<string>('LEAD_NOTIFY_EMAIL') || this.config.get<string>('SEED_ADMIN_EMAIL');
      if (notify) {
        await this.email.enqueue({
          recipient: notify,
          subject: `New MOSS assessment submitted: ${lead.organisationName}`,
          template: 'internal_submission',
          relatedType: 'AssessmentSession',
          relatedId: lead.assessmentId || undefined,
          payload: {
            organisationName: lead.organisationName,
            reference: lead.assessmentId || '',
          },
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}
