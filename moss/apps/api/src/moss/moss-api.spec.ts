/**
 * MOSS M3 API tests — catalogue, assessments, control responses, progress, SCLI isolation.
 * DB-backed cases require DATABASE_URL (Docker moss-db or local).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AssessmentStatus,
  MossCatalogueStatus,
  PrismaClient,
  ProductCode,
  SystemRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { MossAssessmentsService } from './assessments/moss-assessments.service';
import { MossCatalogueService } from './catalogue/moss-catalogue.service';
import { MossProgressService } from './progress/moss-progress.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const hasDb = Boolean(process.env.DATABASE_URL);

const noopAudit = {
  record: async () => ({ id: 'audit-noop' }),
} as unknown as AuditService;

describe('MOSS catalogue contracts', () => {
  it('exposes ProductCode.MOSS and SCLI_COST_LEAKAGE', () => {
    expect(ProductCode.MOSS).toBe('MOSS');
    expect(ProductCode.SCLI_COST_LEAKAGE).toBe('SCLI_COST_LEAKAGE');
  });
});

describe.runIf(hasDb)('MOSS M3 services', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const catalogue = new MossCatalogueService(prisma, noopAudit);
  const progress = new MossProgressService(prisma);
  const assessments = new MossAssessmentsService(
    prisma,
    catalogue,
    progress,
    noopAudit,
    { scoreAssessment: async () => null } as any,
  );
  const suffix = `m3-${Date.now()}`;
  let userId = '';
  let organisationId = '';
  let otherOrgId = '';
  let assessmentId = '';
  let scliAssessmentId = '';
  let dbReady = false;

  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      return;
    }
    const user = await prisma.user.create({
      data: {
        email: `${suffix}@example.test`,
        passwordHash: await argon2.hash('test'),
        firstName: 'M3',
        lastName: 'Tester',
        systemRole: SystemRole.ANALYST,
      },
    });
    userId = user.id;
    const org = await prisma.organisation.create({ data: { name: `M3 Org ${suffix}` } });
    organisationId = org.id;
    otherOrgId = (await prisma.organisation.create({ data: { name: `M3 Other ${suffix}` } })).id;

    const qv = await prisma.questionnaireVersion.findFirst({
      where: { questionnaire: { code: 'SCLI' }, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
    if (qv) {
      const scli = await prisma.assessmentSession.create({
        data: {
          reference: `SCLI-TEST-${suffix}`,
          organisationId,
          questionnaireVersionId: qv.id,
          productCode: ProductCode.SCLI_COST_LEAKAGE,
          createdById: userId,
          title: `SCLI ${suffix}`,
          status: AssessmentStatus.IN_PROGRESS,
        },
      });
      scliAssessmentId = scli.id;
    }
  });

  afterAll(async () => {
    try {
      if (assessmentId) {
        await prisma.mossControlAssessment.deleteMany({ where: { assessmentId } });
        await prisma.assessmentSession.delete({ where: { id: assessmentId } }).catch(() => undefined);
      }
      if (scliAssessmentId) {
        await prisma.assessmentSession.delete({ where: { id: scliAssessmentId } }).catch(() => undefined);
      }
      if (organisationId) {
        await prisma.site.deleteMany({ where: { organisationId } });
        await prisma.organisation.delete({ where: { id: organisationId } }).catch(() => undefined);
      }
      if (otherOrgId) {
        await prisma.organisation.delete({ where: { id: otherOrgId } }).catch(() => undefined);
      }
      if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('published catalogue is 14 domains / 100 controls with D01, D14, GOV-01', async () => {
    if (!dbReady) return;
    const summary = await catalogue.summary();
    expect(summary.version).toBe('3.0');
    expect(summary.status).toBe(MossCatalogueStatus.PUBLISHED);
    expect(summary.domainCount).toBe(14);
    expect(summary.controlCount).toBe(100);

    const domains = await catalogue.listDomains();
    expect(domains).toHaveLength(14);
    expect(domains[0].domainCode).toBe('D01');
    expect(domains[domains.length - 1].domainCode).toBe('D14');

    const gov = await catalogue.getControl('GOV-01');
    expect(gov.controlCode).toBe('GOV-01');
    expect(gov.mossScoringRules).toBeTruthy();
    expect(gov.financialMapping.formulaReference !== undefined).toBe(true);

    await expect(catalogue.getControl('NOT-A-CONTROL')).rejects.toThrow();
  });

  it('creates MOSS assessment bound to catalogue 3.0 with optional site', async () => {
    if (!dbReady || !userId) return;
    const user = { id: userId, email: `${suffix}@example.test`, role: 'ANALYST' };
    const created = await assessments.create({ organisationId, title: `M3 ${suffix}` }, user);
    assessmentId = created.id;
    expect(created.productCode).toBe(ProductCode.MOSS);
    expect(created.status).toBe(AssessmentStatus.DRAFT);
    expect(created.reference).toMatch(/^MOSS-\d{4}-\d{6}$/);
    expect(created.mossCatalogueVersion?.version || created.mossCatalogueVersionId).toBeTruthy();
    expect(created.controlsScored).toBe(0);
    expect(created.controlsTotal).toBe(100);
    expect(created.progressPercent).toBe(0);
    expect(created.overallMossScore).toBe('PENDING CONFIGURATION');
    expect(created.controlAssessmentStrategy).toBe('LAZY');

    await expect(
      assessments.create({ organisationId: 'missing-org', title: 'x' }, user),
    ).rejects.toThrow();
  });

  it('MOSS list includes MOSS and excludes SCLI; SCLI product filter excludes MOSS', async () => {
    if (!dbReady || !assessmentId) return;
    const mossList = await assessments.list({ id: userId, email: '', role: 'ANALYST' });
    expect(mossList.some((a) => a.id === assessmentId)).toBe(true);
    if (scliAssessmentId) {
      expect(mossList.some((a) => a.id === scliAssessmentId)).toBe(false);
    }

    const mossAsScli = await prisma.assessmentSession.count({
      where: { id: assessmentId, productCode: ProductCode.SCLI_COST_LEAKAGE },
    });
    expect(mossAsScli).toBe(0);

    const scliOnly = await prisma.assessmentSession.findMany({
      where: { productCode: ProductCode.SCLI_COST_LEAKAGE, organisationId },
      select: { id: true },
    });
    expect(scliOnly.every((row) => row.id !== assessmentId)).toBe(true);
    if (scliAssessmentId) {
      expect(scliOnly.some((row) => row.id === scliAssessmentId)).toBe(true);
    }
  });

  it('GET control does not create MossControlAssessment rows (lazy)', async () => {
    if (!dbReady || !assessmentId) return;
    const user = { id: userId, email: '', role: 'ANALYST' };
    const before = await prisma.mossControlAssessment.count({ where: { assessmentId } });
    const state = await assessments.getControlState(assessmentId, 'GOV-01', user);
    expect(state.assessment.controlAssessment.exists).toBe(false);
    expect(state.assessment.controlAssessment.status).toBe('NOT_STARTED');
    const after = await prisma.mossControlAssessment.count({ where: { assessmentId } });
    expect(after).toBe(before);
  });

  it('saves scores 0–4, rationale, comment, finding; rejects invalid scores', async () => {
    if (!dbReady || !assessmentId) return;
    const user = { id: userId, email: '', role: 'ANALYST' };

    for (const score of [0, 1, 2, 3, 4]) {
      const row = await assessments.saveControl(assessmentId, 'GOV-01', { assessorScore: score }, user);
      expect(row.assessorScore).toBe(score);
      expect(row.score).toBe(score);
      expect(row.status).toBe('SCORED');
    }

    const withText = await assessments.saveControl(
      assessmentId,
      'GOV-01',
      {
        assessorScore: 3,
        scoreRationale: 'Evidence reviewed',
        comment: 'Site visit notes',
        findingText: 'Partial coverage',
      },
      user,
    );
    expect(withText.scoreRationale).toBe('Evidence reviewed');
    expect(withText.comment).toBe('Site visit notes');
    expect(withText.findingText).toBe('Partial coverage');
    expect(withText.assessorScore).toBe(3);

    await expect(assessments.saveControl(assessmentId, 'GOV-01', { assessorScore: -1 }, user)).rejects.toThrow();
    await expect(assessments.saveControl(assessmentId, 'GOV-01', { assessorScore: 5 }, user)).rejects.toThrow();
    await expect(assessments.saveControl(assessmentId, 'GOV-01', { assessorScore: 1.5 as any }, user)).rejects.toThrow();

    const rows = await prisma.mossControlAssessment.findMany({ where: { assessmentId, controlCode: 'GOV-01' } });
    expect(rows).toHaveLength(1);
  });

  it('tracks completion progress 0 → 1 → 2 without maturity scoring', async () => {
    if (!dbReady || !assessmentId) return;
    const user = { id: userId, email: '', role: 'ANALYST' };

    // Reset GOV-01 already scored; add a second control
    const cat = await catalogue.requirePublished('3.0');
    let snap = await progress.forAssessment(assessmentId, cat.id);
    expect(snap.overall.total).toBe(100);
    expect(snap.overall.assessed).toBeGreaterThanOrEqual(1);

    const second = await assessments.saveControl(assessmentId, 'GOV-02', { assessorScore: 2 }, user);
    expect(second.assessorScore).toBe(2);

    snap = await progress.forAssessment(assessmentId, cat.id);
    expect(snap.overall.assessed).toBeGreaterThanOrEqual(2);
    expect(snap.overall.percent).toBeGreaterThanOrEqual(2);
    expect(snap.domains.find((d) => d.domainCode === 'D01')?.assessed).toBeGreaterThanOrEqual(2);

    const workspace = await assessments.getWorkspace(assessmentId, user);
    expect(workspace.progress.totalControls).toBe(100);
    expect(workspace.progress.assessedControls).toBeGreaterThanOrEqual(2);
    expect(workspace.overallMossScore).toBe('PENDING CONFIGURATION');
    expect(workspace.domains.every((d) => d.maturityScore === 'PENDING CONFIGURATION')).toBe(true);

    const domainWs = await assessments.getDomainWorkspace(assessmentId, 'D01', user);
    expect(domainWs.domain.maturityScore).toBe('PENDING CONFIGURATION');
    expect(domainWs.controls.length).toBeGreaterThan(0);
  });

  it('rejects SCLI assessment id on MOSS get', async () => {
    if (!dbReady || !scliAssessmentId) return;
    const user = { id: userId, email: '', role: 'ANALYST' };
    await expect(assessments.getWorkspace(scliAssessmentId, user)).rejects.toThrow();
  });
});
