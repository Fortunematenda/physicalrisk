/**
 * MOSS M1 data-foundation tests.
 *
 * Requires DATABASE_URL pointing at a Postgres instance that has:
 * - existing SCLI schema (or empty DB + prior baseline), and
 * - M1 migration applied (`pnpm --filter @moss/api prisma:migrate`).
 *
 * Skips the suite when DATABASE_URL is unset (CI/unit-only environments).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MossCatalogueStatus,
  MossControlAssessmentStatus,
  Prisma,
  PrismaClient,
  ProductCode,
  SiteStatus,
  SystemRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

const hasDb = Boolean(process.env.DATABASE_URL);

async function canReachDb(client: PrismaClient): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasDb)('MOSS M1 data foundation', () => {
  const prisma = new PrismaClient();
  const suffix = `m1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let organisationId: string;
  let userId: string;
  let questionnaireVersionId: string;
  let assessmentId: string;
  let catalogueVersionId: string;
  let domainId: string;
  let controlId: string;
  let dbReady = false;

  beforeAll(async () => {
    dbReady = await canReachDb(prisma);
    if (!dbReady) {
      console.warn('DATABASE_URL set but DB unreachable from this host — skipping M1 DB tests (use docker network / m1-smoke.js).');
      return;
    }
    await prisma.$connect();

    const org = await prisma.organisation.create({
      data: { name: `M1 Test Org ${suffix}` },
    });
    organisationId = org.id;

    const user = await prisma.user.create({
      data: {
        email: `m1-${suffix}@example.test`,
        passwordHash: await argon2.hash('test-password-m1'),
        firstName: 'M1',
        lastName: 'Tester',
        systemRole: SystemRole.ANALYST,
      },
    });
    userId = user.id;

    let questionnaire = await prisma.questionnaire.findUnique({ where: { code: 'SCLI' } });
    if (!questionnaire) {
      questionnaire = await prisma.questionnaire.create({
        data: { code: `SCLI-M1-${suffix}`, name: 'SCLI fixture' },
      });
    }
    let version = await prisma.questionnaireVersion.findFirst({
      where: { questionnaireId: questionnaire.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!version) {
      version = await prisma.questionnaireVersion.create({
        data: {
          questionnaireId: questionnaire.id,
          version: `m1-fixture-${suffix}`,
          status: 'DRAFT',
        },
      });
    }
    questionnaireVersionId = version.id;

    const assessment = await prisma.assessmentSession.create({
      data: {
        reference: `SCLI-M1-${suffix}`,
        organisationId,
        questionnaireVersionId,
        createdById: userId,
        title: `SCLI fixture ${suffix}`,
      },
    });
    assessmentId = assessment.id;
  });

  afterAll(async () => {
    if (!dbReady) {
      await prisma.$disconnect().catch(() => undefined);
      return;
    }
    try {
      if (assessmentId) {
        await prisma.mossScoreSnapshot.deleteMany({ where: { assessmentId } });
        await prisma.mossControlAssessment.deleteMany({ where: { assessmentId } });
        await prisma.assessmentSession.delete({ where: { id: assessmentId } }).catch(() => undefined);
      }
      if (catalogueVersionId) {
        await prisma.mossControl.deleteMany({ where: { catalogueVersionId } });
        await prisma.mossDomain.deleteMany({ where: { catalogueVersionId } });
        await prisma.mossCatalogueVersion.delete({ where: { id: catalogueVersionId } }).catch(() => undefined);
      }
      if (organisationId) {
        await prisma.site.deleteMany({ where: { organisationId } });
        await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('existing AssessmentSession rows map to SCLI_COST_LEAKAGE by default', async ({ skip }) => {
    if (!dbReady) return skip();
    const row = await prisma.assessmentSession.findUniqueOrThrow({ where: { id: assessmentId } });
    expect(row.productCode).toBe(ProductCode.SCLI_COST_LEAKAGE);
    expect(row.mossCatalogueVersionId).toBeNull();
    expect(row.siteId).toBeNull();
  });

  it('Site belongs to Organisation and rejects duplicate siteCode in same org', async ({ skip }) => {
    if (!dbReady) return skip();
    const site = await prisma.site.create({
      data: {
        organisationId,
        name: 'Plant A',
        siteCode: `SITE-${suffix}`,
        status: SiteStatus.ACTIVE,
      },
    });
    expect(site.organisationId).toBe(organisationId);

    await expect(
      prisma.site.create({
        data: {
          organisationId,
          name: 'Plant A duplicate',
          siteCode: `SITE-${suffix}`,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('MossCatalogueVersion can be created empty (no domains/controls)', async ({ skip }) => {
    if (!dbReady) return skip();
    const catalogue = await prisma.mossCatalogueVersion.create({
      data: {
        version: `draft-${suffix}`,
        status: MossCatalogueStatus.DRAFT,
        title: 'Empty M1 shell',
      },
    });
    catalogueVersionId = catalogue.id;
    const domains = await prisma.mossDomain.count({ where: { catalogueVersionId } });
    const controls = await prisma.mossControl.count({ where: { catalogueVersionId } });
    expect(domains).toBe(0);
    expect(controls).toBe(0);
  });

  it('MossDomain uniqueness (catalogueVersionId + domainCode)', async ({ skip }) => {
    if (!dbReady) return skip();
    const domain = await prisma.mossDomain.create({
      data: {
        catalogueVersionId,
        domainCode: 'D01',
        name: 'Governance fixture',
        sortOrder: 1,
      },
    });
    domainId = domain.id;

    await expect(
      prisma.mossDomain.create({
        data: {
          catalogueVersionId,
          domainCode: 'D01',
          name: 'Duplicate',
          sortOrder: 2,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('MossControl uniqueness (catalogueVersionId + controlCode) and same-version domain FK', async ({ skip }) => {
    if (!dbReady) return skip();
    const control = await prisma.mossControl.create({
      data: {
        catalogueVersionId,
        domainId,
        controlCode: 'GOV-01',
        name: 'Board-Approved Security Mandate (fixture)',
        sortOrder: 1,
        thresholdText: 'Approval date <= 12 months',
        leakageQuantification: { formula: 'fixture only — not calculated' },
        formulaReference: null,
      },
    });
    controlId = control.id;

    await expect(
      prisma.mossControl.create({
        data: {
          catalogueVersionId,
          domainId,
          controlCode: 'GOV-01',
          name: 'Duplicate control',
          sortOrder: 2,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('MossControlAssessment accepts scores 0–4 and rejects out of range', async ({ skip }) => {
    if (!dbReady) return skip();
    const ok = await prisma.mossControlAssessment.create({
      data: {
        assessmentId,
        mossControlId: controlId,
        controlCode: 'GOV-01',
        score: 3,
        assessorScore: 3,
        status: MossControlAssessmentStatus.SCORED,
      },
    });
    expect(ok.score).toBe(3);

    await expect(
      prisma.mossControlAssessment.update({
        where: { id: ok.id },
        data: { score: 5 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.mossControlAssessment.update({
        where: { id: ok.id },
        data: { assessorScore: -1 },
      }),
    ).rejects.toThrow();
  });

  it('same control cannot be assessed twice in one assessment', async ({ skip }) => {
    if (!dbReady) return skip();
    await expect(
      prisma.mossControlAssessment.create({
        data: {
          assessmentId,
          mossControlId: controlId,
          controlCode: 'GOV-01',
          score: 2,
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('MossScoreSnapshot can exist with null overallScore (no aggregation in M1)', async ({ skip }) => {
    if (!dbReady) return skip();
    const snap = await prisma.mossScoreSnapshot.create({
      data: {
        assessmentId,
        catalogueVersionId,
        overallScore: null,
        domainScores: {},
        controlScores: {},
        completenessPercent: 0,
        calculationTrace: Prisma.DbNull,
      },
    });
    expect(snap.overallScore).toBeNull();
    expect(snap.domainScores).toEqual({});
  });
});

describe('MOSS M1 schema contracts (no DB)', () => {
  it('exposes ProductCode SCLI_COST_LEAKAGE and MOSS only', () => {
    expect(ProductCode.SCLI_COST_LEAKAGE).toBe('SCLI_COST_LEAKAGE');
    expect(ProductCode.MOSS).toBe('MOSS');
    expect(Object.keys(ProductCode).sort()).toEqual(['MOSS', 'SCLI_COST_LEAKAGE']);
  });

  it('exposes MossControlAssessmentStatus values required by M1', () => {
    expect(MossControlAssessmentStatus.NOT_STARTED).toBe('NOT_STARTED');
    expect(MossControlAssessmentStatus.COMPLETE).toBe('COMPLETE');
  });
});
