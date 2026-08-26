import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Default industry catalogue (aligned with SCLI C2 calibration options). */
const DEFAULT_INDUSTRIES = [
  'Telecommunications',
  'Mining',
  'Energy / Utilities',
  'Ports and Logistics',
  'Manufacturing',
  'Retail',
  'Financial Services',
  'Enterprise Management Systems Providers',
  'Data Centres',
  'Government / Public Infrastructure',
  'Healthcare',
  'Other',
] as const;

const INDUSTRIES_SETTING_KEY = 'organisation.industries';

@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeIndustryName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  private asIndustryList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? this.normalizeIndustryName(item) : ''))
      .filter(Boolean);
  }

  async listIndustries() {
    const [setting, orgRows] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: INDUSTRIES_SETTING_KEY } }),
      this.prisma.organisation.findMany({
        where: { industry: { not: null } },
        select: { industry: true },
        distinct: ['industry'],
      }),
    ]);
    const stored = this.asIndustryList(setting?.value);
    const fromOrgs = orgRows
      .map((row) => (row.industry ? this.normalizeIndustryName(row.industry) : ''))
      .filter(Boolean);
    const industries = [...new Set([...DEFAULT_INDUSTRIES, ...stored, ...fromOrgs])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    return { industries };
  }

  async addIndustry(name: string) {
    const cleaned = this.normalizeIndustryName(name || '');
    if (cleaned.length < 2) {
      throw new BadRequestException('Industry name must be at least 2 characters.');
    }

    const current = await this.listIndustries();
    const existing = current.industries.find((item) => item.toLowerCase() === cleaned.toLowerCase());
    if (existing) {
      return { industry: existing, industries: current.industries, created: false };
    }

    const setting = await this.prisma.systemSetting.findUnique({ where: { key: INDUSTRIES_SETTING_KEY } });
    const stored = this.asIndustryList(setting?.value);
    const nextValue = [...stored, cleaned];
    await this.prisma.systemSetting.upsert({
      where: { key: INDUSTRIES_SETTING_KEY },
      create: { key: INDUSTRIES_SETTING_KEY, value: nextValue },
      update: { value: nextValue },
    });

    const refreshed = await this.listIndustries();
    return { industry: cleaned, industries: refreshed.industries, created: true };
  }

  async list() {
    const organisations = await this.prisma.organisation.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assessments: true, memberships: true } },
        assessments: {
          where: { productCode: 'SCLI_COST_LEAKAGE' },
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
        _count: {
          select: {
            assessments: true,
            memberships: true,
            somodAssessments: true,
          },
        },
        assessments: {
          where: { productCode: 'SCLI_COST_LEAKAGE' },
          orderBy: { updatedAt: 'desc' },
          include: {
            questionnaireVersion: {
              include: {
                questionnaire: true,
                _count: { select: { inputDefinitions: true, questions: true } },
              },
            },
            scoreSnapshots: { orderBy: { createdAt: 'desc' }, take: 1 },
            _count: {
              select: {
                evidence: true,
                recommendations: true,
                reports: true,
                responses: true,
                inputValues: true,
              },
            },
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                systemRole: true,
              },
            },
          },
        },
      },
    });
    if (!organisation) throw new NotFoundException('Organisation not found.');

    const [leads, mossAssessments, somodAssessments] = await Promise.all([
      this.prisma.publicLead.findMany({
        where: { organisationId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.assessmentSession.findMany({
        where: { organisationId: id, productCode: 'MOSS' },
        orderBy: { updatedAt: 'desc' },
        include: {
          mossCatalogueVersion: { select: { id: true, version: true, title: true, status: true } },
          site: { select: { id: true, name: true, siteCode: true } },
          _count: { select: { mossControlAssessments: true } },
        },
      }),
      this.prisma.somodAssessment.findMany({
        where: { organisationId: id },
        orderBy: { updatedAt: 'desc' },
        include: {
          site: { select: { id: true, name: true, siteCode: true } },
          mossAssessment: { select: { id: true, reference: true, title: true } },
        },
      }),
    ]);

    const leadByAssessment = new Map(
      leads.filter((l) => l.assessmentId).map((l) => [l.assessmentId as string, l]),
    );

    const costLeakageAssessments = organisation.assessments.map((assessment) => {
      const lead = leadByAssessment.get(assessment.id);
      const inputsTotal = assessment.questionnaireVersion?._count?.inputDefinitions || 0;
      const questionsTotal = assessment.questionnaireVersion?._count?.questions || 0;
      const inputsAnswered = assessment._count.inputValues;
      const questionsAnswered = assessment._count.responses;
      const computedPercent =
        inputsTotal + questionsTotal
          ? Math.round(((inputsAnswered + questionsAnswered) / (inputsTotal + questionsTotal)) * 100)
          : 0;
      const isComplete =
        lead?.status === 'COMPLETED' ||
        ['SUBMITTED', 'AUTOMATED_EVALUATION_COMPLETE', 'APPROVED'].includes(assessment.status);
      const progressPercent = isComplete ? 100 : (lead?.progressPercent ?? computedPercent);
      const progressLabel = isComplete
        ? 'Submitted'
        : lead?.progressLabel ||
          (questionsAnswered
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
          phase: isComplete
            ? 'completed'
            : lead?.progressPhase || (questionsAnswered ? 'questions' : 'calibration'),
          inputsAnswered,
          inputsTotal,
          questionsAnswered,
          questionsTotal,
          lastProgressAt: lead?.lastProgressAt || assessment.updatedAt,
        },
      };
    });

    return {
      ...organisation,
      publicLeads: leads,
      /** @deprecated Prefer costLeakageAssessments — kept for older clients. */
      assessments: costLeakageAssessments,
      costLeakageAssessments,
      mossAssessments,
      somodAssessments,
      productCounts: {
        costLeakage: costLeakageAssessments.length,
        moss: mossAssessments.length,
        somod: somodAssessments.length,
      },
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
      await tx.crmSyncRecord.deleteMany({ where: { organisationId: id } });
      await tx.actionItem.deleteMany({ where: { organisationId: id } });

      const somodIds = await tx.somodAssessment.findMany({
        where: { organisationId: id },
        select: { id: true },
      });
      for (const somod of somodIds) {
        await tx.somodAssessment.delete({ where: { id: somod.id } });
      }

      // Break parent/child assessment links before delete (Restrict by default).
      await tx.assessmentSession.updateMany({
        where: { organisationId: id },
        data: { parentAssessmentId: null },
      });

      const assessments = await tx.assessmentSession.findMany({
        where: { organisationId: id },
        select: { id: true },
      });
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

  async listSites(organisationId: string) {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Organisation not found.');
    return this.prisma.site.findMany({
      where: { organisationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createSite(
    organisationId: string,
    data: { name: string; siteCode: string; address?: string; region?: string; description?: string },
  ) {
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Organisation not found.');
    const siteCode = data.siteCode.trim().toUpperCase();
    if (!siteCode) throw new BadRequestException('siteCode is required.');
    if (!data.name?.trim()) throw new BadRequestException('name is required.');
    try {
      return await this.prisma.site.create({
        data: {
          organisationId,
          name: data.name.trim(),
          siteCode,
          address: data.address?.trim() || null,
          region: data.region?.trim() || null,
          description: data.description?.trim() || null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A site with this siteCode already exists for the organisation.');
      }
      throw error;
    }
  }
}
