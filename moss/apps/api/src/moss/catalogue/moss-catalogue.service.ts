import { Injectable, NotFoundException } from '@nestjs/common';
import { MossCatalogueStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MossCatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async requirePublished(version = '3.0') {
    const catalogue = await this.prisma.mossCatalogueVersion.findFirst({
      where: { status: MossCatalogueStatus.PUBLISHED, version },
    });
    if (!catalogue) {
      throw new NotFoundException(`Published MOSS Master Catalogue v${version} was not found.`);
    }
    return catalogue;
  }

  async summary() {
    const catalogue = await this.requirePublished();
    const [domainCount, controlCount] = await Promise.all([
      this.prisma.mossDomain.count({ where: { catalogueVersionId: catalogue.id } }),
      this.prisma.mossControl.count({ where: { catalogueVersionId: catalogue.id } }),
    ]);
    return {
      version: catalogue.version,
      status: catalogue.status,
      title: catalogue.title,
      domainCount,
      controlCount,
      // aliases kept for existing local UI clients
      domains: domainCount,
      controls: controlCount,
      publishedAt: catalogue.publishedAt,
    };
  }

  async listDomains() {
    const catalogue = await this.requirePublished();
    const domains = await this.prisma.mossDomain.findMany({
      where: { catalogueVersionId: catalogue.id },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { controls: true } } },
    });
    return domains.map((d) => ({
      id: d.id,
      domainCode: d.domainCode,
      name: d.name,
      description: d.description,
      sortOrder: d.sortOrder,
      controlCount: d._count.controls,
    }));
  }

  async getDomain(domainCode: string) {
    const catalogue = await this.requirePublished();
    const domain = await this.prisma.mossDomain.findUnique({
      where: {
        catalogueVersionId_domainCode: {
          catalogueVersionId: catalogue.id,
          domainCode: domainCode.toUpperCase(),
        },
      },
      include: { controls: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!domain) throw new NotFoundException(`Domain ${domainCode} not found.`);
    return {
      id: domain.id,
      domainCode: domain.domainCode,
      name: domain.name,
      description: domain.description,
      sortOrder: domain.sortOrder,
      controls: domain.controls.map((c) => ({
        id: c.id,
        controlCode: c.controlCode,
        name: c.name,
        controlFunction: c.controlFunction,
        owner: c.owner,
        frequency: c.frequency,
        metric: c.metric,
        thresholdText: c.thresholdText,
        sortOrder: c.sortOrder,
      })),
    };
  }

  async getControl(controlCode: string) {
    const catalogue = await this.requirePublished();
    const control = await this.prisma.mossControl.findUnique({
      where: {
        catalogueVersionId_controlCode: {
          catalogueVersionId: catalogue.id,
          controlCode: controlCode.toUpperCase(),
        },
      },
      include: { domain: true },
    });
    if (!control) throw new NotFoundException(`Control ${controlCode} not found.`);
    return this.mapControlDetail(control);
  }

  mapControlDetail(c: {
    id: string;
    controlCode: string;
    name: string;
    controlFunction: string | null;
    owner: string | null;
    frequency: string | null;
    metric: string | null;
    thresholdText: string | null;
    sortOrder: number;
    evidenceStandards: Prisma.JsonValue;
    inspectionMethodology: Prisma.JsonValue;
    failureConditions: Prisma.JsonValue;
    fraudIndicators: Prisma.JsonValue;
    mossScoringRules: Prisma.JsonValue;
    financialRelevance: string | null;
    eventUnit: string | null;
    costCategory: string | null;
    leakageQuantification: Prisma.JsonValue;
    formulaReference: string | null;
    slaPenaltyLogic: Prisma.JsonValue;
    incidentToCostConversion: Prisma.JsonValue;
    technologySubstitutionLogic: string | null;
    manpowerOptimisationLogic: string | null;
    domain?: { id: string; domainCode: string; name: string };
  }) {
    return {
      id: c.id,
      controlCode: c.controlCode,
      name: c.name,
      domain: c.domain
        ? { id: c.domain.id, domainCode: c.domain.domainCode, name: c.domain.name }
        : null,
      domainCode: c.domain?.domainCode,
      domainName: c.domain?.name,
      controlFunction: c.controlFunction,
      owner: c.owner,
      frequency: c.frequency,
      metric: c.metric,
      thresholdText: c.thresholdText,
      threshold: c.thresholdText,
      sortOrder: c.sortOrder,
      evidenceStandards: c.evidenceStandards,
      inspectionMethodology: c.inspectionMethodology,
      failureConditions: c.failureConditions,
      fraudIndicators: c.fraudIndicators,
      mossScoringRules: c.mossScoringRules,
      technologySubstitutionLogic: c.technologySubstitutionLogic,
      manpowerOptimisationLogic: c.manpowerOptimisationLogic,
      eventUnit: c.eventUnit,
      costCategory: c.costCategory,
      financialRelevance: c.financialRelevance,
      leakageQuantification: c.leakageQuantification,
      formulaReference: c.formulaReference,
      slaPenaltyLogic: c.slaPenaltyLogic,
      incidentToCostConversion: c.incidentToCostConversion,
      financialMapping: {
        label: 'Methodology Metadata',
        financialRelevance: c.financialRelevance,
        eventUnit: c.eventUnit,
        costCategory: c.costCategory,
        leakageQuantification: c.leakageQuantification,
        formulaReference: c.formulaReference,
        slaPenaltyLogic: c.slaPenaltyLogic,
        incidentToCostConversion: c.incidentToCostConversion,
      },
    };
  }
}
