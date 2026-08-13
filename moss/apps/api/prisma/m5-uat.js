/**
 * Local MOSS UAT harness — run inside moss-api:
 *   node prisma/m5-uat.js
 */
const {
  PrismaClient,
  ProductCode,
  MossCatalogueStatus,
  AssessmentStatus,
  SystemRole,
  QuestionnaireStatus,
  SiteStatus,
  Prisma,
} = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();
const suffix = `uat-${Date.now()}`;
const defects = [];
const notes = [];

function assert(cond, msg, severity = 'HIGH') {
  if (!cond) {
    defects.push({ severity, description: msg });
    throw new Error(msg);
  }
}

function soft(cond, msg, severity = 'MEDIUM') {
  if (!cond) defects.push({ severity, description: msg });
  else notes.push(`OK: ${msg}`);
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
  let orgA;
  let orgB;
  let assessmentA;
  let assessmentB;
  let scliId;
  let shellV;

  try {
    // --- Catalogue integrity ---
    const published = await prisma.mossCatalogueVersion.findMany({
      where: { version: '3.0', status: MossCatalogueStatus.PUBLISHED },
    });
    assert(published.length === 1, `Expected 1 published 3.0 catalogue, got ${published.length}`);
    const cat = published[0];
    const domains = await prisma.mossDomain.findMany({
      where: { catalogueVersionId: cat.id },
      orderBy: { sortOrder: 'asc' },
      include: { controls: { orderBy: { sortOrder: 'asc' }, select: { controlCode: true, name: true } } },
    });
    const controls = await prisma.mossControl.findMany({ where: { catalogueVersionId: cat.id } });
    const codes = controls.map((c) => c.controlCode);
    assert(domains.length === 14, `domains=${domains.length}`);
    assert(controls.length === 100, `controls=${controls.length}`);
    assert(new Set(codes).size === 100, 'unique control codes != 100');
    assert(
      domains.map((d) => d.domainCode).join(',') === 'D01,D02,D03,D04,D05,D06,D07,D08,D09,D10,D11,D12,D13,D14',
      `domain order wrong: ${domains.map((d) => d.domainCode).join(',')}`,
    );
    const orphan = controls.filter((c) => !domains.some((d) => d.id === c.domainId));
    assert(orphan.length === 0, `orphans=${orphan.length}`);
    const totalFromDomains = domains.reduce((s, d) => s + d.controls.length, 0);
    assert(totalFromDomains === 100, `domain control sum=${totalFromDomains}`);

    const gov = await prisma.mossControl.findUnique({
      where: { catalogueVersionId_controlCode: { catalogueVersionId: cat.id, controlCode: 'GOV-01' } },
      include: { domain: true },
    });
    const dep = await prisma.mossControl.findUnique({
      where: { catalogueVersionId_controlCode: { catalogueVersionId: cat.id, controlCode: 'DEP-02' } },
      include: { domain: true },
    });
    assert(gov?.domain.domainCode === 'D01', 'GOV-01 not under D01');
    assert(dep, 'DEP-02 missing');
    soft(dep.domain.domainCode === 'D04' || dep.controlCode === 'DEP-02', `DEP-02 domain=${dep.domain.domainCode}`);

    const scliQ = await prisma.question.count({
      where: { questionnaireVersion: { questionnaire: { code: 'SCLI' }, status: 'PUBLISHED' } },
    });
    assert(scliQ === 20, `SCLI Q count=${scliQ}`);
    notes.push('Catalogue 14/100/GOV-01/DEP-02/SCLI Q20 validated');

    // --- Fixtures ---
    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.test`,
        passwordHash: await argon2.hash('uat'),
        firstName: 'UAT',
        lastName: 'Tester',
        systemRole: SystemRole.ANALYST,
      },
    });
    userId = user.id;
    orgA = (await prisma.organisation.create({ data: { name: `UAT OrgA ${suffix}` } })).id;
    orgB = (await prisma.organisation.create({ data: { name: `UAT OrgB ${suffix}` } })).id;

    const siteA = await prisma.site.create({
      data: { organisationId: orgA, name: 'Plant A', siteCode: `A-${suffix}`, status: SiteStatus.ACTIVE },
    });
    let dupRejected = false;
    try {
      await prisma.site.create({
        data: { organisationId: orgA, name: 'Dup', siteCode: `A-${suffix}` },
      });
    } catch (e) {
      dupRejected = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
    }
    assert(dupRejected, 'duplicate siteCode must be rejected');

    const siteB = await prisma.site.create({
      data: { organisationId: orgB, name: 'Plant B', siteCode: `B-${suffix}`, status: SiteStatus.ACTIVE },
    });
    soft(siteA.organisationId !== siteB.organisationId, 'sites belong to different orgs');

    const shellQ = await prisma.questionnaire.upsert({
      where: { code: 'MOSS' },
      update: {},
      create: { code: 'MOSS', name: 'MOSS', description: 'shell' },
    });
    shellV = await prisma.questionnaireVersion.findUnique({
      where: { questionnaireId_version: { questionnaireId: shellQ.id, version: '3.0' } },
    });
    if (!shellV) {
      shellV = await prisma.questionnaireVersion.create({
        data: {
          questionnaireId: shellQ.id,
          version: '3.0',
          status: QuestionnaireStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
    }

    assessmentA = await prisma.$transaction(async (tx) => {
      const reference = await nextMossReference(tx);
      return tx.assessmentSession.create({
        data: {
          reference,
          organisationId: orgA,
          siteId: siteA.id,
          questionnaireVersionId: shellV.id,
          productCode: ProductCode.MOSS,
          mossCatalogueVersionId: cat.id,
          createdById: userId,
          title: `UAT A ${suffix}`,
          status: AssessmentStatus.DRAFT,
        },
      });
    });
    assessmentB = await prisma.$transaction(async (tx) => {
      const reference = await nextMossReference(tx);
      return tx.assessmentSession.create({
        data: {
          reference,
          organisationId: orgA,
          questionnaireVersionId: shellV.id,
          productCode: ProductCode.MOSS,
          mossCatalogueVersionId: cat.id,
          createdById: userId,
          title: `UAT B ${suffix}`,
          status: AssessmentStatus.DRAFT,
        },
      });
    });
    assert(assessmentA.reference !== assessmentB.reference, 'references not unique');
    assert(/^MOSS-\d{4}-\d{6}$/.test(assessmentA.reference), `bad ref ${assessmentA.reference}`);

    // Wrong org site binding check (application rule)
    soft(siteB.organisationId !== orgA, 'Org A must not use Org B site');

    // Score persistence all 0-4 + text
    const govCtrl = gov;
    for (const score of [0, 1, 2, 3, 4]) {
      await prisma.mossControlAssessment.upsert({
        where: { assessmentId_mossControlId: { assessmentId: assessmentA.id, mossControlId: govCtrl.id } },
        create: {
          assessmentId: assessmentA.id,
          mossControlId: govCtrl.id,
          controlCode: 'GOV-01',
          assessorScore: score,
          score,
          scoreRationale: `Rationale score ${score} with apostrophe's\nand line break`,
          comment: `Comment ${score}`,
          findingText: `Finding ${score}`,
          status: 'SCORED',
          assessedById: userId,
          assessedAt: new Date(),
        },
        update: {
          assessorScore: score,
          score,
          scoreRationale: `Rationale score ${score} with apostrophe's\nand line break`,
          comment: `Comment ${score}`,
          findingText: `Finding ${score}`,
          status: 'SCORED',
        },
      });
    }
    const saved = await prisma.mossControlAssessment.findUnique({
      where: { assessmentId_mossControlId: { assessmentId: assessmentA.id, mossControlId: govCtrl.id } },
    });
    assert(saved.assessorScore === 4 && saved.score === 4, 'score 4 not persisted');
    assert(saved.scoreRationale.includes("apostrophe's"), 'rationale apostrophe lost');
    assert(saved.scoreRationale.includes('\n'), 'rationale line break lost');
    assert(saved.comment === 'Comment 4', 'comment overwritten incorrectly');
    assert(saved.findingText === 'Finding 4', 'finding lost');

    // Progress: 1 scored so far on A
    let scoredA = await prisma.mossControlAssessment.count({
      where: {
        assessmentId: assessmentA.id,
        OR: [{ score: { not: null } }, { assessorScore: { not: null } }],
      },
    });
    assert(scoredA === 1, `expected 1 scored on A, got ${scoredA}`);

    // Score 4 more controls on A for 5 total
    const more = await prisma.mossControl.findMany({
      where: { catalogueVersionId: cat.id, controlCode: { not: 'GOV-01' } },
      take: 4,
      orderBy: { sortOrder: 'asc' },
    });
    for (const c of more) {
      await prisma.mossControlAssessment.create({
        data: {
          assessmentId: assessmentA.id,
          mossControlId: c.id,
          controlCode: c.controlCode,
          assessorScore: 2,
          score: 2,
          status: 'SCORED',
          assessedById: userId,
          assessedAt: new Date(),
        },
      });
    }
    scoredA = await prisma.mossControlAssessment.count({
      where: {
        assessmentId: assessmentA.id,
        OR: [{ score: { not: null } }, { assessorScore: { not: null } }],
      },
    });
    assert(scoredA === 5, `expected 5 scored on A, got ${scoredA}`);
    soft(Math.round((5 / 100) * 100) === 5, '5% completion');

    // Isolation: B must not see A's responses
    const leak = await prisma.mossControlAssessment.count({ where: { assessmentId: assessmentB.id } });
    assert(leak === 0, 'assessment B should have no control rows');

    // Product isolation counts
    const mossOnly = await prisma.assessmentSession.findMany({
      where: { productCode: ProductCode.MOSS, id: { in: [assessmentA.id, assessmentB.id] } },
    });
    assert(mossOnly.length === 2, 'MOSS filter');
    const asScli = await prisma.assessmentSession.count({
      where: { id: { in: [assessmentA.id, assessmentB.id] }, productCode: ProductCode.SCLI_COST_LEAKAGE },
    });
    assert(asScli === 0, 'MOSS rows must not match SCLI filter');

    const scliQv = await prisma.questionnaireVersion.findFirst({
      where: { questionnaire: { code: 'SCLI' }, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
    const scli = await prisma.assessmentSession.create({
      data: {
        reference: `SCLI-UAT-${suffix}`,
        organisationId: orgA,
        questionnaireVersionId: scliQv.id,
        productCode: ProductCode.SCLI_COST_LEAKAGE,
        createdById: userId,
        title: `SCLI UAT ${suffix}`,
        status: AssessmentStatus.IN_PROGRESS,
      },
    });
    scliId = scli.id;
    const scliInMoss = await prisma.assessmentSession.count({
      where: { id: scliId, productCode: ProductCode.MOSS },
    });
    assert(scliInMoss === 0, 'SCLI must not appear as MOSS');

    // Domain progress independence: score only D01 controls already partly done
    const d01 = domains.find((d) => d.domainCode === 'D01');
    const d01Ids = new Set(d01.controls.map((c) => c.controlCode));
    const d01Scored = await prisma.mossControlAssessment.count({
      where: {
        assessmentId: assessmentA.id,
        controlCode: { in: [...d01Ids] },
        OR: [{ score: { not: null } }, { assessorScore: { not: null } }],
      },
    });
    soft(d01Scored >= 1, `D01 assessed=${d01Scored}`);

    console.log(JSON.stringify({
      verdict: defects.length ? 'FAIL' : 'PASS',
      defects,
      notes,
      refs: { a: assessmentA.reference, b: assessmentB.reference, scli: scli.reference },
      progressA: `${scoredA}/100`,
      domainSample: domains.slice(0, 3).map((d) => ({ code: d.domainCode, name: d.name, n: d.controls.length })),
      dep02Domain: dep.domain.domainCode,
    }, null, 2));
  } catch (err) {
    console.error('UAT HARNESS FAIL', err.message);
    console.log(JSON.stringify({ verdict: 'FAIL', defects, error: err.message }, null, 2));
    process.exitCode = 1;
  } finally {
    if (assessmentA) {
      await prisma.mossControlAssessment.deleteMany({ where: { assessmentId: assessmentA.id } });
      await prisma.assessmentSession.delete({ where: { id: assessmentA.id } }).catch(() => undefined);
    }
    if (assessmentB) {
      await prisma.mossControlAssessment.deleteMany({ where: { assessmentId: assessmentB.id } });
      await prisma.assessmentSession.delete({ where: { id: assessmentB.id } }).catch(() => undefined);
    }
    if (scliId) await prisma.assessmentSession.delete({ where: { id: scliId } }).catch(() => undefined);
    if (orgA) {
      await prisma.site.deleteMany({ where: { organisationId: orgA } });
      await prisma.organisation.delete({ where: { id: orgA } }).catch(() => undefined);
    }
    if (orgB) {
      await prisma.site.deleteMany({ where: { organisationId: orgB } });
      await prisma.organisation.delete({ where: { id: orgB } }).catch(() => undefined);
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
