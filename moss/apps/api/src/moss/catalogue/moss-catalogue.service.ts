import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MossCatalogueStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/current-user.decorator';

@Injectable()
export class MossCatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Latest published catalogue, or a specific version if provided. */
  async requirePublished(version?: string) {
    const catalogue = version
      ? await this.prisma.mossCatalogueVersion.findFirst({
          where: { status: MossCatalogueStatus.PUBLISHED, version },
        })
      : await this.prisma.mossCatalogueVersion.findFirst({
          where: { status: MossCatalogueStatus.PUBLISHED },
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        });
    if (!catalogue) {
      throw new NotFoundException(
        version
          ? `Published MOSS Master Catalogue v${version} was not found.`
          : 'No published MOSS Master Catalogue was found.',
      );
    }
    return catalogue;
  }

  async requireVersion(id: string) {
    const catalogue = await this.prisma.mossCatalogueVersion.findUnique({ where: { id } });
    if (!catalogue) throw new NotFoundException('Catalogue version not found.');
    return catalogue;
  }

  private async assertDraft(id: string) {
    const catalogue = await this.requireVersion(id);
    if (catalogue.status !== MossCatalogueStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT catalogue versions can be edited.');
    }
    return catalogue;
  }

  async summary(versionId?: string) {
    const catalogue = versionId
      ? await this.requireVersion(versionId)
      : await this.requirePublished();
    const [domainCount, controlCount] = await Promise.all([
      this.prisma.mossDomain.count({ where: { catalogueVersionId: catalogue.id } }),
      this.prisma.mossControl.count({ where: { catalogueVersionId: catalogue.id } }),
    ]);
    return {
      id: catalogue.id,
      version: catalogue.version,
      status: catalogue.status,
      title: catalogue.title,
      description: catalogue.description,
      notes: catalogue.notes,
      domainCount,
      controlCount,
      domains: domainCount,
      controls: controlCount,
      publishedAt: catalogue.publishedAt,
      readOnly: catalogue.status !== MossCatalogueStatus.DRAFT,
      editable: catalogue.status === MossCatalogueStatus.DRAFT,
    };
  }

  async listVersions() {
    const versions = await this.prisma.mossCatalogueVersion.findMany({
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const withCounts = await Promise.all(
      versions.map(async (v) => {
        const [domainCount, controlCount, assessmentCount] = await Promise.all([
          this.prisma.mossDomain.count({ where: { catalogueVersionId: v.id } }),
          this.prisma.mossControl.count({ where: { catalogueVersionId: v.id } }),
          this.prisma.assessmentSession.count({ where: { mossCatalogueVersionId: v.id } }),
        ]);
        return {
          id: v.id,
          version: v.version,
          status: v.status,
          title: v.title,
          description: v.description,
          publishedAt: v.publishedAt,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          domainCount,
          controlCount,
          assessmentCount,
          readOnly: v.status !== MossCatalogueStatus.DRAFT,
        };
      }),
    );
    return { versions: withCounts };
  }

  async listDomains(versionId?: string) {
    const catalogue = versionId
      ? await this.requireVersion(versionId)
      : await this.requirePublished();
    const domains = await this.prisma.mossDomain.findMany({
      where: { catalogueVersionId: catalogue.id },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { controls: true } } },
    });
    return domains.map((d) => ({
      id: d.id,
      catalogueVersionId: d.catalogueVersionId,
      domainCode: d.domainCode,
      name: d.name,
      description: d.description,
      sortOrder: d.sortOrder,
      controlCount: d._count.controls,
    }));
  }

  async getDomain(domainCode: string, versionId?: string) {
    const catalogue = versionId
      ? await this.requireVersion(versionId)
      : await this.requirePublished();
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
      catalogueVersionId: domain.catalogueVersionId,
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

  async getControl(controlCode: string, versionId?: string) {
    const catalogue = versionId
      ? await this.requireVersion(versionId)
      : await this.requirePublished();
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

  async getVersionWorkspace(versionId: string) {
    const summary = await this.summary(versionId);
    const domains = await this.listDomains(versionId);
    const controls = await this.prisma.mossControl.findMany({
      where: { catalogueVersionId: versionId },
      orderBy: [{ domain: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { domain: { select: { id: true, domainCode: true, name: true } } },
    });
    return {
      ...summary,
      note:
        summary.status === 'DRAFT'
          ? 'Draft catalogue — edit domains/controls, then publish. Existing assessments keep their bound version.'
          : summary.status === 'PUBLISHED'
            ? 'Published catalogue is immutable. Clone to a new version to make changes.'
            : 'Archived catalogue is read-only.',
      domains,
      controlRows: controls.map((c) => ({
        id: c.id,
        controlCode: c.controlCode,
        name: c.name,
        domainCode: c.domain.domainCode,
        domainName: c.domain.name,
        controlFunction: c.controlFunction,
        owner: c.owner,
        frequency: c.frequency,
        metric: c.metric,
        thresholdText: c.thresholdText,
        sortOrder: c.sortOrder,
      })),
    };
  }

  /**
   * Deep-clone a catalogue version into a new DRAFT.
   * Published/archived sources stay untouched; assessments keep their original version.
   */
  async cloneVersion(
    sourceVersionId: string,
    input: { version: string; title?: string },
    user: AuthUser,
  ) {
    const version = String(input.version || '').trim();
    if (!/^\d+(\.\d+)*$/.test(version)) {
      throw new BadRequestException('Version must look like 3.1 or 4.0.');
    }
    const source = await this.requireVersion(sourceVersionId);
    const existing = await this.prisma.mossCatalogueVersion.findUnique({ where: { version } });
    if (existing) {
      throw new BadRequestException(`Catalogue version ${version} already exists.`);
    }

    const openDraft = await this.prisma.mossCatalogueVersion.findFirst({
      where: { status: MossCatalogueStatus.DRAFT },
    });
    if (openDraft) {
      throw new BadRequestException(
        `A draft already exists (v${openDraft.version}). Publish or delete it before cloning another.`,
      );
    }

    const [domains, controls] = await Promise.all([
      this.prisma.mossDomain.findMany({
        where: { catalogueVersionId: source.id },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.mossControl.findMany({
        where: { catalogueVersionId: source.id },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const created = await this.prisma.$transaction(async (tx) => {
      const catalogue = await tx.mossCatalogueVersion.create({
        data: {
          version,
          status: MossCatalogueStatus.DRAFT,
          title: input.title?.trim() || source.title,
          description: source.description,
          notes: `Cloned from v${source.version} by ${user.email}`,
        },
      });

      const domainIdMap = new Map<string, string>();
      for (const d of domains) {
        const row = await tx.mossDomain.create({
          data: {
            catalogueVersionId: catalogue.id,
            domainCode: d.domainCode,
            name: d.name,
            description: d.description,
            sortOrder: d.sortOrder,
          },
        });
        domainIdMap.set(d.id, row.id);
      }

      for (const c of controls) {
        const newDomainId = domainIdMap.get(c.domainId);
        if (!newDomainId) {
          throw new BadRequestException(`Missing domain mapping for control ${c.controlCode}.`);
        }
        await tx.mossControl.create({
          data: {
            catalogueVersionId: catalogue.id,
            domainId: newDomainId,
            controlCode: c.controlCode,
            name: c.name,
            controlFunction: c.controlFunction,
            owner: c.owner,
            frequency: c.frequency,
            metric: c.metric,
            thresholdText: c.thresholdText,
            thresholdJson: c.thresholdJson ?? Prisma.JsonNull,
            sortOrder: c.sortOrder,
            evidenceStandards: c.evidenceStandards ?? Prisma.JsonNull,
            inspectionMethodology: c.inspectionMethodology ?? Prisma.JsonNull,
            failureConditions: c.failureConditions ?? Prisma.JsonNull,
            fraudIndicators: c.fraudIndicators ?? Prisma.JsonNull,
            mossScoringRules: c.mossScoringRules ?? Prisma.JsonNull,
            financialRelevance: c.financialRelevance,
            eventUnit: c.eventUnit,
            costCategory: c.costCategory,
            leakageQuantification: c.leakageQuantification ?? Prisma.JsonNull,
            formulaReference: c.formulaReference,
            slaPenaltyLogic: c.slaPenaltyLogic ?? Prisma.JsonNull,
            incidentToCostConversion: c.incidentToCostConversion ?? Prisma.JsonNull,
            technologySubstitutionLogic: c.technologySubstitutionLogic,
            manpowerOptimisationLogic: c.manpowerOptimisationLogic,
          },
        });
      }

      return catalogue;
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_CATALOGUE_CLONED',
      entityType: 'MossCatalogueVersion',
      entityId: created.id,
      metadata: {
        sourceVersionId: source.id,
        sourceVersion: source.version,
        newVersion: created.version,
        domains: domains.length,
        controls: controls.length,
      },
    });

    return this.getVersionWorkspace(created.id);
  }

  async updateDomain(
    domainId: string,
    input: { name?: string; description?: string | null; sortOrder?: number },
    user: AuthUser,
  ) {
    const domain = await this.prisma.mossDomain.findUnique({ where: { id: domainId } });
    if (!domain) throw new NotFoundException('Domain not found.');
    await this.assertDraft(domain.catalogueVersionId);

    if (input.name !== undefined && input.name.trim().length < 2) {
      throw new BadRequestException('Domain name must be at least 2 characters.');
    }

    const updated = await this.prisma.mossDomain.update({
      where: { id: domainId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_CATALOGUE_DOMAIN_UPDATED',
      entityType: 'MossDomain',
      entityId: domainId,
      metadata: { catalogueVersionId: domain.catalogueVersionId, ...input },
    });

    return updated;
  }

  async updateControl(
    controlId: string,
    input: {
      name?: string;
      controlFunction?: string | null;
      owner?: string | null;
      frequency?: string | null;
      metric?: string | null;
      thresholdText?: string | null;
      sortOrder?: number;
    },
    user: AuthUser,
  ) {
    const control = await this.prisma.mossControl.findUnique({ where: { id: controlId } });
    if (!control) throw new NotFoundException('Control not found.');
    await this.assertDraft(control.catalogueVersionId);

    if (input.name !== undefined && input.name.trim().length < 2) {
      throw new BadRequestException('Control name must be at least 2 characters.');
    }

    const updated = await this.prisma.mossControl.update({
      where: { id: controlId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.controlFunction !== undefined
          ? { controlFunction: input.controlFunction?.trim() || null }
          : {}),
        ...(input.owner !== undefined ? { owner: input.owner?.trim() || null } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency?.trim() || null } : {}),
        ...(input.metric !== undefined ? { metric: input.metric?.trim() || null } : {}),
        ...(input.thresholdText !== undefined
          ? { thresholdText: input.thresholdText?.trim() || null }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      include: { domain: { select: { id: true, domainCode: true, name: true } } },
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_CATALOGUE_CONTROL_UPDATED',
      entityType: 'MossControl',
      entityId: controlId,
      metadata: { catalogueVersionId: control.catalogueVersionId, controlCode: control.controlCode },
    });

    return this.mapControlDetail(updated);
  }

  /** Publish a draft: becomes the live catalogue; previous published versions are archived. */
  async publishVersion(versionId: string, user: AuthUser) {
    const draft = await this.assertDraft(versionId);
    const [domainCount, controlCount] = await Promise.all([
      this.prisma.mossDomain.count({ where: { catalogueVersionId: versionId } }),
      this.prisma.mossControl.count({ where: { catalogueVersionId: versionId } }),
    ]);
    if (domainCount < 1 || controlCount < 1) {
      throw new BadRequestException('Cannot publish an empty catalogue.');
    }

    const published = await this.prisma.$transaction(async (tx) => {
      await tx.mossCatalogueVersion.updateMany({
        where: { status: MossCatalogueStatus.PUBLISHED },
        data: { status: MossCatalogueStatus.ARCHIVED },
      });
      return tx.mossCatalogueVersion.update({
        where: { id: versionId },
        data: {
          status: MossCatalogueStatus.PUBLISHED,
          publishedAt: new Date(),
          notes: draft.notes
            ? `${draft.notes}\nPublished by ${user.email}`
            : `Published by ${user.email}`,
        },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'MOSS_CATALOGUE_PUBLISHED',
      entityType: 'MossCatalogueVersion',
      entityId: published.id,
      metadata: {
        version: published.version,
        domainCount,
        controlCount,
      },
    });

    return this.getVersionWorkspace(published.id);
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
    evidenceStandards?: Prisma.JsonValue;
    inspectionMethodology?: Prisma.JsonValue;
    failureConditions?: Prisma.JsonValue;
    fraudIndicators?: Prisma.JsonValue;
    mossScoringRules?: Prisma.JsonValue;
    financialRelevance?: string | null;
    eventUnit?: string | null;
    costCategory?: string | null;
    leakageQuantification?: Prisma.JsonValue;
    formulaReference?: string | null;
    slaPenaltyLogic?: Prisma.JsonValue;
    incidentToCostConversion?: Prisma.JsonValue;
    technologySubstitutionLogic?: string | null;
    manpowerOptimisationLogic?: string | null;
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
      evidenceStandards: c.evidenceStandards ?? null,
      inspectionMethodology: c.inspectionMethodology ?? null,
      failureConditions: c.failureConditions ?? null,
      fraudIndicators: c.fraudIndicators ?? null,
      mossScoringRules: c.mossScoringRules ?? null,
      technologySubstitutionLogic: c.technologySubstitutionLogic ?? null,
      manpowerOptimisationLogic: c.manpowerOptimisationLogic ?? null,
      eventUnit: c.eventUnit ?? null,
      costCategory: c.costCategory ?? null,
      financialRelevance: c.financialRelevance ?? null,
      leakageQuantification: c.leakageQuantification ?? null,
      formulaReference: c.formulaReference ?? null,
      slaPenaltyLogic: c.slaPenaltyLogic ?? null,
      incidentToCostConversion: c.incidentToCostConversion ?? null,
      financialMapping: {
        label: 'Methodology Metadata',
        financialRelevance: c.financialRelevance ?? null,
        eventUnit: c.eventUnit ?? null,
        costCategory: c.costCategory ?? null,
        leakageQuantification: c.leakageQuantification ?? null,
        formulaReference: c.formulaReference ?? null,
        slaPenaltyLogic: c.slaPenaltyLogic ?? null,
        incidentToCostConversion: c.incidentToCostConversion ?? null,
      },
    };
  }
}
