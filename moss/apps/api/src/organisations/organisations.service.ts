import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const organisations = await this.prisma.organisation.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assessments: true, memberships: true } },
        assessments: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            reference: true,
            status: true,
            updatedAt: true,
            scoreSnapshots: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { overallRiskScore: true, riskBand: true },
            },
          },
        },
      },
    });

    const orgIds = organisations.map((o) => o.id);
    const leads = orgIds.length
      ? await this.prisma.publicLead.findMany({
          where: { organisationId: { in: orgIds } },
          select: { organisationId: true, assessmentId: true, status: true },
        })
      : [];
    const leadByAssessment = new Map(
      leads.filter((l) => l.assessmentId).map((l) => [l.assessmentId as string, l]),
    );

    const submittedStatuses = new Set([
      'SUBMITTED',
      'AUTOMATED_EVALUATION_COMPLETE',
      'EVIDENCE_REVIEW',
      'ANALYST_REVIEW',
      'REVIEWED',
      'APPROVED',
      'REPORT_GENERATED',
      'REPORT_ISSUED',
    ]);
    const completedStatuses = new Set([
      'APPROVED',
      'REPORT_GENERATED',
      'REPORT_ISSUED',
    ]);

    return organisations.map((org) => {
      let submitted = 0;
      let inProgress = 0;
      let completed = 0;
      for (const assessment of org.assessments) {
        const lead = leadByAssessment.get(assessment.id);
        if (lead?.status === 'COMPLETED' || completedStatuses.has(assessment.status)) {
          completed += 1;
          submitted += 1;
        } else if (submittedStatuses.has(assessment.status)) {
          submitted += 1;
        } else {
          inProgress += 1;
        }
      }
      const latest = org.assessments[0] || null;
      return {
        ...org,
        assessments: latest ? [latest] : [],
        latestAssessment: latest,
        submissionSummary: {
          total: org._count.assessments,
          submitted,
          inProgress,
          completed,
        },
      };
    });
  }

  create(data: {
    name: string;
    industry?: string;
    registrationNo?: string;
    website?: string;
    primaryEmail?: string;
    primaryPhone?: string;
  }) {
    return this.prisma.organisation.create({ data });
  }

  async get(id: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id },
      include: {
        _count: { select: { assessments: true, memberships: true } },
        assessments: {
          orderBy: { updatedAt: 'desc' },
          include: {
            questionnaireVersion: {
              include: {
                questionnaire: true,
                _count: { select: { inputDefinitions: true, questions: true } },
              },
            },
            scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
            _count: { select: { evidence: true, recommendations: true, reports: true, responses: true, inputValues: true } },
          },
        },
        memberships: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true, systemRole: true } },
          },
        },
      },
    });
    if (!organisation) throw new NotFoundException('Organisation not found.');

    const leads = await this.prisma.publicLead.findMany({
      where: { organisationId: id },
      orderBy: { createdAt: 'desc' },
    });

    const leadByAssessment = new Map(leads.filter((l) => l.assessmentId).map((l) => [l.assessmentId as string, l]));

    return {
      ...organisation,
      publicLeads: leads,
      assessments: organisation.assessments.map((assessment) => {
        const lead = leadByAssessment.get(assessment.id);
        const inputsTotal = assessment.questionnaireVersion?._count?.inputDefinitions || 0;
        const questionsTotal = assessment.questionnaireVersion?._count?.questions || 0;
        const inputsAnswered = assessment._count.inputValues;
        const questionsAnswered = assessment._count.responses;
        const computedPercent = inputsTotal + questionsTotal
          ? Math.round(((inputsAnswered + questionsAnswered) / (inputsTotal + questionsTotal)) * 100)
          : 0;
        const isComplete = lead?.status === 'COMPLETED' || ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'APPROVED'].includes(assessment.status);
        const progressPercent = isComplete ? 100 : (lead?.progressPercent ?? computedPercent);
        const progressLabel = isComplete
          ? 'Submitted'
          : lead?.progressLabel
            || (questionsAnswered
              ? `Questions answered ${questionsAnswered}/${questionsTotal}`
              : inputsAnswered
                ? `Calibration ${inputsAnswered}/${inputsTotal}`
                : 'Details captured');
        return {
          ...assessment,
          source: lead ? 'PUBLIC' : 'INTERNAL',
          publicLead: lead
            ? {
                id: lead.id,
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email,
                status: lead.status,
                source: lead.source,
                completedAt: lead.completedAt,
                progressLabel: lead.progressLabel,
                progressPercent: lead.progressPercent,
                lastProgressAt: lead.lastProgressAt,
              }
            : null,
          progress: {
            percent: progressPercent,
            label: progressLabel,
            phase: isComplete ? 'completed' : (lead?.progressPhase || (questionsAnswered ? 'questions' : 'calibration')),
            inputsAnswered,
            inputsTotal,
            questionsAnswered,
            questionsTotal,
            lastProgressAt: lead?.lastProgressAt || assessment.updatedAt,
          },
        };
      }),
    };
  }

  async update(
    id: string,
    data: {
      name?: string;
      industry?: string;
      registrationNo?: string;
      website?: string;
      primaryEmail?: string;
      primaryPhone?: string;
    },
  ) {
    const existing = await this.prisma.organisation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Organisation not found.');
    const cleaned = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value]),
    );
    if (cleaned.name !== undefined && (!cleaned.name || String(cleaned.name).trim().length < 2)) {
      throw new BadRequestException('Organisation name is required.');
    }
    return this.prisma.organisation.update({
      where: { id },
      data: {
        ...(cleaned.name !== undefined ? { name: String(cleaned.name).trim() } : {}),
        ...(cleaned.industry !== undefined ? { industry: cleaned.industry as string | null } : {}),
        ...(cleaned.registrationNo !== undefined ? { registrationNo: cleaned.registrationNo as string | null } : {}),
        ...(cleaned.website !== undefined ? { website: cleaned.website as string | null } : {}),
        ...(cleaned.primaryEmail !== undefined ? { primaryEmail: cleaned.primaryEmail as string | null } : {}),
        ...(cleaned.primaryPhone !== undefined ? { primaryPhone: cleaned.primaryPhone as string | null } : {}),
      },
    });
  }

  async remove(id: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id },
      include: { _count: { select: { assessments: true } } },
    });
    if (!organisation) throw new NotFoundException('Organisation not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.publicLead.deleteMany({ where: { organisationId: id } });
      const assessments = await tx.assessmentSession.findMany({ where: { organisationId: id }, select: { id: true } });
      for (const assessment of assessments) {
        await tx.assessmentSession.delete({ where: { id: assessment.id } });
      }
      await tx.organisation.delete({ where: { id } });
    });

    return {
      id,
      deleted: true,
      assessmentsRemoved: organisation._count.assessments,
      message: 'Organisation and related assessments deleted.',
    };
  }
}
