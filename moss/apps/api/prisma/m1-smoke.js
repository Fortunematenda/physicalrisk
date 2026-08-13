/**
 * Local M1 foundation smoke (run inside moss-api container):
 *   node prisma/m1-smoke.js
 */
const {
  PrismaClient,
  ProductCode,
  MossCatalogueStatus,
  MossControlAssessmentStatus,
  SiteStatus,
  SystemRole,
  Prisma,
} = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();
const suffix = `smoke-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const sessions = await prisma.assessmentSession.groupBy({ by: ['productCode'], _count: true });
  assert(sessions.every((s) => s.productCode === ProductCode.SCLI_COST_LEAKAGE), 'existing sessions must be SCLI');
  assert((await prisma.mossDomain.count()) === 0, 'domains must be empty before M2');
  assert((await prisma.mossControl.count()) === 0, 'controls must be empty before M2');
  assert((await prisma.question.count()) === 20, 'SCLI Q1-Q20 must remain');

  const org = await prisma.organisation.create({ data: { name: `Smoke Org ${suffix}` } });
  const user = await prisma.user.create({
    data: {
      email: `${suffix}@example.test`,
      passwordHash: await argon2.hash('smoke-pass'),
      firstName: 'Smoke',
      lastName: 'Tester',
      systemRole: SystemRole.ANALYST,
    },
  });
  const qv = await prisma.questionnaireVersion.findFirst({ orderBy: { createdAt: 'desc' } });
  assert(qv, 'need a questionnaire version');

  const assessment = await prisma.assessmentSession.create({
    data: {
      reference: `SCLI-${suffix}`,
      organisationId: org.id,
      questionnaireVersionId: qv.id,
      createdById: user.id,
      title: `Smoke ${suffix}`,
    },
  });
  assert(assessment.productCode === ProductCode.SCLI_COST_LEAKAGE, 'new session defaults to SCLI');

  await prisma.site.create({
    data: { organisationId: org.id, name: 'Site A', siteCode: `A-${suffix}`, status: SiteStatus.ACTIVE },
  });
  let dupSiteRejected = false;
  try {
    await prisma.site.create({
      data: { organisationId: org.id, name: 'Site A2', siteCode: `A-${suffix}` },
    });
  } catch (e) {
    dupSiteRejected = e instanceof Prisma.PrismaClientKnownRequestError;
  }
  assert(dupSiteRejected, 'duplicate siteCode must be rejected');

  const cat = await prisma.mossCatalogueVersion.create({
    data: { version: `draft-${suffix}`, status: MossCatalogueStatus.DRAFT, title: 'Empty smoke' },
  });
  const domain = await prisma.mossDomain.create({
    data: { catalogueVersionId: cat.id, domainCode: 'D01', name: 'Governance', sortOrder: 1 },
  });
  let dupDomainRejected = false;
  try {
    await prisma.mossDomain.create({
      data: { catalogueVersionId: cat.id, domainCode: 'D01', name: 'Dup', sortOrder: 2 },
    });
  } catch (e) {
    dupDomainRejected = e instanceof Prisma.PrismaClientKnownRequestError;
  }
  assert(dupDomainRejected, 'duplicate domainCode must be rejected');

  const control = await prisma.mossControl.create({
    data: {
      catalogueVersionId: cat.id,
      domainId: domain.id,
      controlCode: 'GOV-01',
      name: 'Fixture',
      sortOrder: 1,
      formulaReference: null,
    },
  });
  let dupControlRejected = false;
  try {
    await prisma.mossControl.create({
      data: {
        catalogueVersionId: cat.id,
        domainId: domain.id,
        controlCode: 'GOV-01',
        name: 'Dup',
        sortOrder: 2,
      },
    });
  } catch (e) {
    dupControlRejected = e instanceof Prisma.PrismaClientKnownRequestError;
  }
  assert(dupControlRejected, 'duplicate controlCode must be rejected');

  const mca = await prisma.mossControlAssessment.create({
    data: {
      assessmentId: assessment.id,
      mossControlId: control.id,
      controlCode: 'GOV-01',
      score: 3,
      assessorScore: 3,
      status: MossControlAssessmentStatus.SCORED,
    },
  });
  let badScoreRejected = false;
  try {
    await prisma.mossControlAssessment.update({ where: { id: mca.id }, data: { score: 5 } });
  } catch {
    badScoreRejected = true;
  }
  assert(badScoreRejected, 'score 5 must be rejected');

  let dupMcaRejected = false;
  try {
    await prisma.mossControlAssessment.create({
      data: {
        assessmentId: assessment.id,
        mossControlId: control.id,
        controlCode: 'GOV-01',
      },
    });
  } catch (e) {
    dupMcaRejected = e instanceof Prisma.PrismaClientKnownRequestError;
  }
  assert(dupMcaRejected, 'duplicate control assessment must be rejected');

  const snap = await prisma.mossScoreSnapshot.create({
    data: {
      assessmentId: assessment.id,
      catalogueVersionId: cat.id,
      overallScore: null,
      domainScores: {},
      controlScores: {},
      completenessPercent: 0,
    },
  });
  assert(snap.overallScore === null, 'overallScore may be null in M1');

  // cleanup smoke rows (leave production SCLI data intact)
  await prisma.mossScoreSnapshot.delete({ where: { id: snap.id } });
  await prisma.mossControlAssessment.delete({ where: { id: mca.id } });
  await prisma.mossControl.deleteMany({ where: { catalogueVersionId: cat.id } });
  await prisma.mossDomain.deleteMany({ where: { catalogueVersionId: cat.id } });
  await prisma.mossCatalogueVersion.delete({ where: { id: cat.id } });
  await prisma.assessmentSession.delete({ where: { id: assessment.id } });
  await prisma.site.deleteMany({ where: { organisationId: org.id } });
  await prisma.organisation.delete({ where: { id: org.id } });
  await prisma.user.delete({ where: { id: user.id } });

  // confirm catalogue still empty after cleanup
  assert((await prisma.mossDomain.count()) === 0, 'cleanup left domains');
  assert((await prisma.mossControl.count()) === 0, 'cleanup left controls');

  console.log(JSON.stringify({
    ok: true,
    localM1Smoke: 'PASS',
    existingSessions: sessions,
    scliQuestions: 20,
  }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('LOCAL M1 SMOKE FAILED:', e);
  await prisma.$disconnect();
  process.exit(1);
});
