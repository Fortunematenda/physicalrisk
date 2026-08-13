/**
 * MOSS M2 — import Master Catalogue v3.0 into MossCatalogueVersion / MossDomain / MossControl.
 *
 * - Does NOT touch SCLI questionnaire / scoring / leakage / opportunity
 * - Does NOT invent formula references; formula text comes from leakage_quantification.formula
 * - Published versions are immutable (skip if 3.0 already PUBLISHED with 14×100)
 * - DRAFT may be refreshed, then published
 *
 * Run: pnpm --filter @moss/api prisma:import-moss-catalogue
 */
import { MossCatalogueStatus, Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prisma = new PrismaClient();

const TARGET_VERSION = '3.0';
const EXPECTED_DOMAINS = 14;
const EXPECTED_CONTROLS = 100;

interface CatalogueFile {
  metadata: {
    title: string;
    version: string;
    purpose?: string;
    control_count?: number;
    domain_count?: number;
    status?: string;
  };
  domains: Array<{
    domain_id: string;
    domain_name: string;
    description?: string;
  }>;
  controls: Array<{
    domain_id: string;
    domain_name?: string;
    control_id: string;
    control_name: string;
    control_function?: string;
    owner?: string;
    frequency?: string;
    metric?: string;
    threshold?: string;
    event_unit?: string;
    cost_category?: string;
    evidence_standards?: unknown;
    inspection_methodology?: unknown;
    failure_conditions?: unknown;
    fraud_indicators?: unknown;
    moss_scoring_rules?: unknown;
    leakage_quantification?: { formula?: string; [key: string]: unknown };
    sla_penalty_logic?: unknown;
    incident_to_cost_conversion?: unknown;
    technology_substitution_logic?: string;
    manpower_optimisation_logic?: string;
    financial_relevance?: string | boolean | null;
  }>;
}

function resolveCataloguePath(): string {
  if (process.env.MOSS_CATALOGUE_PATH) return process.env.MOSS_CATALOGUE_PATH;
  const packaged = path.join(__dirname, 'data', 'moss-master-catalogue-v3.json');
  if (fs.existsSync(packaged)) return packaged;
  const source = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'docs',
    'source',
    '20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json',
  );
  if (fs.existsSync(source)) return source;
  throw new Error(`MOSS catalogue file not found. Tried:\n- ${packaged}\n- ${source}`);
}

function asJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function formulaReferenceFromLeakage(leakage: CatalogueFile['controls'][0]['leakage_quantification']): string | null {
  const formula = leakage?.formula;
  return typeof formula === 'string' && formula.trim() ? formula.trim() : null;
}

function validateCatalogue(data: CatalogueFile): string[] {
  const errors: string[] = [];
  if (data.metadata?.version !== TARGET_VERSION) {
    errors.push(`metadata.version must be ${TARGET_VERSION}, got ${data.metadata?.version}`);
  }
  if (!Array.isArray(data.domains) || data.domains.length !== EXPECTED_DOMAINS) {
    errors.push(`expected ${EXPECTED_DOMAINS} domains, got ${data.domains?.length ?? 0}`);
  }
  if (!Array.isArray(data.controls) || data.controls.length !== EXPECTED_CONTROLS) {
    errors.push(`expected ${EXPECTED_CONTROLS} controls, got ${data.controls?.length ?? 0}`);
  }
  const domainIds = new Set(data.domains.map((d) => d.domain_id));
  const controlIds = data.controls.map((c) => c.control_id);
  if (new Set(controlIds).size !== controlIds.length) errors.push('duplicate control_id values');
  if (controlIds.some((id) => !id)) errors.push('empty control_id values');
  const domainIdList = data.domains.map((d) => d.domain_id);
  if (new Set(domainIdList).size !== domainIdList.length) errors.push('duplicate domain_id values');
  const orphans = data.controls.filter((c) => !domainIds.has(c.domain_id));
  if (orphans.length) errors.push(`${orphans.length} orphan controls (domain_id not in domains)`);
  // Each control must belong to exactly one domain (by domain_id membership).
  for (const c of data.controls) {
    if (!c.domain_id) errors.push(`control ${c.control_id} missing domain_id`);
  }
  return errors;
}

export async function importMossCatalogue(options?: { publish?: boolean; forceRefreshDraft?: boolean }) {
  const publish = options?.publish !== false;
  const forceRefreshDraft = options?.forceRefreshDraft === true;
  const filePath = resolveCataloguePath();
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as CatalogueFile;

  const validationErrors = validateCatalogue(data);
  if (validationErrors.length) {
    throw new Error(`Catalogue validation failed:\n- ${validationErrors.join('\n- ')}`);
  }

  const existing = await prisma.mossCatalogueVersion.findUnique({ where: { version: TARGET_VERSION } });
  if (existing?.status === MossCatalogueStatus.PUBLISHED) {
    const [domains, controls] = await Promise.all([
      prisma.mossDomain.count({ where: { catalogueVersionId: existing.id } }),
      prisma.mossControl.count({ where: { catalogueVersionId: existing.id } }),
    ]);
    if (domains === EXPECTED_DOMAINS && controls === EXPECTED_CONTROLS) {
      return {
        action: 'skipped_already_published' as const,
        catalogueVersionId: existing.id,
        version: TARGET_VERSION,
        domains,
        controls,
        filePath,
      };
    }
    throw new Error(
      `Published catalogue ${TARGET_VERSION} exists but counts are domains=${domains} controls=${controls}; refusing to mutate published data.`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    let catalogue =
      existing ??
      (await tx.mossCatalogueVersion.create({
        data: {
          version: TARGET_VERSION,
          status: MossCatalogueStatus.DRAFT,
          title: data.metadata.title,
          description: data.metadata.purpose ?? null,
          notes: JSON.stringify({
            sourceFile: path.basename(filePath),
            metadataStatus: data.metadata.status ?? null,
            control_count: data.metadata.control_count ?? EXPECTED_CONTROLS,
            domain_count: data.metadata.domain_count ?? EXPECTED_DOMAINS,
          }),
        },
      }));

    if (existing) {
      catalogue = await tx.mossCatalogueVersion.update({
        where: { id: existing.id },
        data: {
          status: MossCatalogueStatus.DRAFT,
          title: data.metadata.title,
          description: data.metadata.purpose ?? null,
          notes: JSON.stringify({
            sourceFile: path.basename(filePath),
            metadataStatus: data.metadata.status ?? null,
            control_count: data.metadata.control_count ?? EXPECTED_CONTROLS,
            domain_count: data.metadata.domain_count ?? EXPECTED_DOMAINS,
            refreshedAt: new Date().toISOString(),
          }),
          publishedAt: null,
        },
      });
      if (forceRefreshDraft || existing.status === MossCatalogueStatus.DRAFT) {
        await tx.mossControl.deleteMany({ where: { catalogueVersionId: catalogue.id } });
        await tx.mossDomain.deleteMany({ where: { catalogueVersionId: catalogue.id } });
      }
    }

    const domainIdByCode = new Map<string, string>();
    for (let i = 0; i < data.domains.length; i++) {
      const d = data.domains[i];
      const domain = await tx.mossDomain.create({
        data: {
          catalogueVersionId: catalogue.id,
          domainCode: d.domain_id,
          name: d.domain_name,
          description: d.description ?? null,
          sortOrder: i + 1,
        },
      });
      domainIdByCode.set(d.domain_id, domain.id);
    }

    const controlsByDomain = new Map<string, number>();
    for (const c of data.controls) {
      const domainId = domainIdByCode.get(c.domain_id);
      if (!domainId) throw new Error(`Control ${c.control_id} references missing domain ${c.domain_id}`);
      const nextSort = (controlsByDomain.get(c.domain_id) ?? 0) + 1;
      controlsByDomain.set(c.domain_id, nextSort);

      await tx.mossControl.create({
        data: {
          catalogueVersionId: catalogue.id,
          domainId,
          controlCode: c.control_id,
          name: c.control_name,
          controlFunction: c.control_function ?? null,
          owner: c.owner ?? null,
          frequency: c.frequency ?? null,
          metric: c.metric ?? null,
          thresholdText: c.threshold ?? null,
          thresholdJson: Prisma.JsonNull,
          sortOrder: nextSort,
          evidenceStandards: asJson(c.evidence_standards),
          inspectionMethodology: asJson(c.inspection_methodology),
          failureConditions: asJson(c.failure_conditions),
          fraudIndicators: asJson(c.fraud_indicators),
          mossScoringRules: asJson(c.moss_scoring_rules),
          financialRelevance:
            c.financial_relevance === undefined || c.financial_relevance === null
              ? null
              : String(c.financial_relevance),
          eventUnit: c.event_unit ?? null,
          costCategory: c.cost_category ?? null,
          leakageQuantification: asJson(c.leakage_quantification),
          // Map formula text from leakage_quantification.formula only — do not invent references.
          formulaReference: formulaReferenceFromLeakage(c.leakage_quantification),
          slaPenaltyLogic: asJson(c.sla_penalty_logic),
          incidentToCostConversion: asJson(c.incident_to_cost_conversion),
          technologySubstitutionLogic: c.technology_substitution_logic ?? null,
          manpowerOptimisationLogic: c.manpower_optimisation_logic ?? null,
        },
      });
    }

    const domainCount = await tx.mossDomain.count({ where: { catalogueVersionId: catalogue.id } });
    const controlCount = await tx.mossControl.count({ where: { catalogueVersionId: catalogue.id } });
    if (domainCount !== EXPECTED_DOMAINS || controlCount !== EXPECTED_CONTROLS) {
      throw new Error(`Post-import counts invalid: domains=${domainCount} controls=${controlCount}`);
    }

    const orphanCount = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "MossControl" c
      LEFT JOIN "MossDomain" d
        ON d.id = c."domainId" AND d."catalogueVersionId" = c."catalogueVersionId"
      WHERE c."catalogueVersionId" = ${catalogue.id} AND d.id IS NULL
    `;
    if (Number(orphanCount[0]?.count ?? 0) !== 0) {
      throw new Error('Post-import orphan controls detected');
    }

    let published = catalogue;
    if (publish) {
      published = await tx.mossCatalogueVersion.update({
        where: { id: catalogue.id },
        data: {
          status: MossCatalogueStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
    }

    return {
      action: publish ? ('imported_and_published' as const) : ('imported_draft' as const),
      catalogueVersionId: published.id,
      version: published.version,
      status: published.status,
      domains: domainCount,
      controls: controlCount,
      filePath,
    };
  });

  return result;
}

async function main() {
  const result = await importMossCatalogue({ publish: true, forceRefreshDraft: true });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => prisma.$disconnect());
}
