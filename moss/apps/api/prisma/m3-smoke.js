/**
 * Local M3 smoke (run inside moss-api container or with DATABASE_URL):
 *   node prisma/m3-smoke.js
 *
 * Verifies catalogue 14/100, MOSS assessment create, control score, progress,
 * product isolation vs SCLI. Cleans up created rows.
 */
const {
  PrismaClient,
  ProductCode,
  MossCatalogueStatus,
  AssessmentStatus,
  SystemRole,
  QuestionnaireStatus,
} = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();
const suffix = `m3smoke-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function nextMossReference(tx) {
  const year = new Date().getFullYear();
  const prefix = `MOSS-${year}-`;
  const latest = await tx.assessmentSession.findFirst({
    where: { productCode: ProductCode.MOSS, reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const seq = latest ? Number(latest.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

(async () => {
  let userId;
  let organisationId;
  let assessmentId;
  let scliId;

  try {
    const published = await prisma.mossCatalogueVersion.findFirst({
      where: { status: MossCatalogueStatus.PUBLISHED, version: '3.0' },
    });
    assert(published, 'published MOSS catalogue 3.0 required');
    const domainCount = await prisma.mossDomain.count({ where: { catalogueVersionId: published.id } });
    const controlCount = await prisma.mossControl.count({ where: { catalogueVersionId: published.id } });
    assert(domainCount === 14, `expected 14 domains, got ${domainCount}`);
    assert(controlCount === 100, `expected 100 controls, got ${controlCount}`);
    console.log('OK catalogue 14/100');

    const d01 = await prisma.mossDomain.findUnique({
      where: { catalogueVersionId_domainCode: { catalogueVersionId: published.id, domainCode: 'D01' } },
    });
    const d14 = await prisma.mossDomain.findUnique({
      where: { catalogueVersionId_domainCode: { catalogueVersionId: published.id, domainCode: 'D14' } },
    });
    const gov01 = await prisma.mossControl.findUnique({
      where: { catalogueVersionId_controlCode: { catalogueVersionId: published.id, controlCode: 'GOV-01' } },
    });
    assert(d01 && d14 && gov01, 'D01, D14, GOV-01 must exist');

    const org = await prisma.organisation.create({ data: { name: `M3 Smoke Org ${suffix}` } });
    organisationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.test`,
        passwordHash: await argon2.hash('smoke'),
        firstName: 'M3',
        lastName: 'Smoke',
        systemRole: SystemRole.ANALYST,
      },
    });
    userId = user.id;

    // Shell questionnaire for FK
    const shellQ = await prisma.questionnaire.upsert({
      where: { code: 'MOSS' },
      update: {},
      create: {
        code: 'MOSS',
        name: 'MOSS Master Catalogue',
        description: 'Shell for AssessmentSession FK',
      },
    });
    let shellV = await prisma.questionnaireVersion.findUnique({
      where: { questionnaireId_version: { questionnaireId: shellQ.id, version: '3.0' } },
    });
    if (!shellV) {
      shellV = await prisma.questionnaireVersion.create({
        data: {
          questionnaireId: shellQ.id,
          version: '3.0',
          status: QuestionnaireStatus.PUBLISHED,
          methodologyNote: 'Empty shell',
          publishedAt: new Date(),
        },
      });
    }

    const assessment = await prisma.$transaction(async (tx) => {
      const reference = await nextMossReference(tx);
      return tx.assessmentSession.create({
        data: {
          reference,
          organisationId,
          questionnaireVersionId: shellV.id,
          productCode: ProductCode.MOSS,
          mossCatalogueVersionId: published.id,
          createdById: userId,
          title: `M3 Smoke ${suffix}`,
          status: AssessmentStatus.DRAFT,
        },
      });
    });
    assessmentId = assessment.id;
    assert(assessment.productCode === ProductCode.MOSS, 'productCode must be MOSS');
    assert(/^MOSS-\d{4}-\d{6}$/.test(assessment.reference), `bad reference ${assessment.reference}`);
    console.log('OK MOSS assessment', assessment.reference);

    const beforeRows = await prisma.mossControlAssessment.count({ where: { assessmentId } });
    assert(beforeRows === 0, 'lazy: no control rows until save');

    await prisma.mossControlAssessment.create({
      data: {
        assessmentId,
        mossControlId: gov01.id,
        controlCode: 'GOV-01',
        assessorScore: 3,
        score: 3,
        scoreRationale: 'smoke rationale',
        status: 'SCORED',
        assessedById: userId,
        assessedAt: new Date(),
      },
    });

    const scored = await prisma.mossControlAssessment.count({
      where: {
        assessmentId,
        OR: [{ score: { not: null } }, { assessorScore: { not: null } }],
      },
    });
    assert(scored === 1, 'expected 1 scored control');
    const percent = Math.round((scored / 100) * 1000) / 10;
    assert(percent === 1, `expected 1% progress, got ${percent}`);
    console.log('OK control score + progress 1/100 (1%)');

    // SCLI isolation fixture
    const scliQv = await prisma.questionnaireVersion.findFirst({
      where: { questionnaire: { code: 'SCLI' }, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
    assert(scliQv, 'published SCLI questionnaire required');
    const scli = await prisma.assessmentSession.create({
      data: {
        reference: `SCLI-SMOKE-${suffix}`,
        organisationId,
        questionnaireVersionId: scliQv.id,
        productCode: ProductCode.SCLI_COST_LEAKAGE,
        createdById: userId,
        title: `SCLI smoke ${suffix}`,
        status: AssessmentStatus.IN_PROGRESS,
      },
    });
    scliId = scli.id;

    const mossOnly = await prisma.assessmentSession.findMany({
      where: { productCode: ProductCode.MOSS, organisationId },
      select: { id: true },
    });
    const scliOnly = await prisma.assessmentSession.findMany({
      where: { productCode: ProductCode.SCLI_COST_LEAKAGE, organisationId },
      select: { id: true },
    });
    assert(mossOnly.some((r) => r.id === assessmentId), 'MOSS list includes MOSS');
    assert(!mossOnly.some((r) => r.id === scliId), 'MOSS filter excludes SCLI');
    assert(scliOnly.some((r) => r.id === scliId), 'SCLI list includes SCLI');
    assert(!scliOnly.some((r) => r.id === assessmentId), 'SCLI filter excludes MOSS');
    console.log('OK SCLI/MOSS isolation');

    console.log('M3 SMOKE PASS');
  } catch (err) {
    console.error('M3 SMOKE FAIL', err);
    process.exitCode = 1;
  } finally {
    if (assessmentId) {
      await prisma.mossControlAssessment.deleteMany({ where: { assessmentId } });
      await prisma.assessmentSession.delete({ where: { id: assessmentId } }).catch(() => undefined);
    }
    if (scliId) {
      await prisma.assessmentSession.delete({ where: { id: scliId } }).catch(() => undefined);
    }
    if (organisationId) {
      await prisma.site.deleteMany({ where: { organisationId } });
      await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
