/**
 * SCL vs MOSS assessment reference + list isolation.
 * DB-backed cases require DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AssessmentStatus,
  PrismaClient,
  ProductCode,
  SystemRole,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { AssessmentsService } from './assessments.service';
import { MossAssessmentsService } from '../moss/assessments/moss-assessments.service';
import { MossCatalogueService } from '../moss/catalogue/moss-catalogue.service';
import { MossProgressService } from '../moss/progress/moss-progress.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { assessmentReferencePrefix } from '../common/assessment-reference';

const hasDb = Boolean(process.env.DATABASE_URL);

const noopAudit = {
  record: async () => ({ id: 'audit-noop' }),
} as unknown as AuditService;

describe('SCL reference prefix mapping', () => {
  it('uses SCL for SCLI_COST_LEAKAGE and MOSS for MOSS', () => {
    expect(assessmentReferencePrefix(ProductCode.SCLI_COST_LEAKAGE)).toBe('SCL');
    expect(assessmentReferencePrefix(ProductCode.MOSS)).toBe('MOSS');
    expect(assessmentReferencePrefix(ProductCode.SCLI_COST_LEAKAGE)).not.toBe('MOSS');
    expect(assessmentReferencePrefix(ProductCode.SCLI_COST_LEAKAGE)).not.toBe('SCLI');
  });
});

describe.runIf(hasDb)('SCL / MOSS create + list isolation', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const scl = new AssessmentsService(prisma, noopAudit);
  const catalogue = new MossCatalogueService(prisma, noopAudit);
  const progress = new MossProgressService(prisma);
  const moss = new MossAssessmentsService(
    prisma,
    catalogue,
    progress,
    noopAudit,
    { scoreAssessment: async () => null } as any,
  );
  const suffix = `scl-moss-${Date.now()}`;
  let userId = '';
  let organisationId = '';
  let sclId = '';
  let mossId = '';
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
        firstName: 'SCL',
        lastName: 'Tester',
        systemRole: SystemRole.ANALYST,
      },
    });
    userId = user.id;
    organisationId = (await prisma.organisation.create({ data: { name: `Org ${suffix}` } })).id;
  });

  afterAll(async () => {
    if (!dbReady) {
      await prisma.$disconnect();
      return;
    }
    if (sclId) await prisma.assessmentSession.deleteMany({ where: { id: sclId } }).catch(() => undefined);
    if (mossId) await prisma.assessmentSession.deleteMany({ where: { id: mossId } }).catch(() => undefined);
    await prisma.assessmentSession.deleteMany({ where: { organisationId } }).catch(() => undefined);
    await prisma.organisation.deleteMany({ where: { id: organisationId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates SCL assessment with SCL-YYYY-###### reference', async () => {
    if (!dbReady) return;
    const user = { id: userId, email: `${suffix}@example.test`, role: 'ANALYST' };
    const created = await scl.create({ organisationId, title: `SCL ${suffix}` }, user);
    sclId = created.id;
    expect(created.productCode).toBe(ProductCode.SCLI_COST_LEAKAGE);
    expect(created.reference).toMatch(/^SCL-\d{4}-\d{6}$/);
    expect(created.reference.startsWith('MOSS-')).toBe(false);
    expect(created.reference.startsWith('SCLI-')).toBe(false);
  });

  it('creates MOSS assessment with MOSS-YYYY-###### reference', async () => {
    if (!dbReady) return;
    const user = { id: userId, email: `${suffix}@example.test`, role: 'ANALYST' };
    const created = await moss.create({ organisationId, title: `MOSS ${suffix}` }, user);
    mossId = created.id;
    expect(created.productCode).toBe(ProductCode.MOSS);
    expect(created.reference).toMatch(/^MOSS-\d{4}-\d{6}$/);
  });

  it('keeps SCL and MOSS references non-colliding for same year', async () => {
    if (!dbReady || !sclId || !mossId) return;
    const a = await prisma.assessmentSession.findUnique({ where: { id: sclId } });
    const b = await prisma.assessmentSession.findUnique({ where: { id: mossId } });
    expect(a?.reference).not.toEqual(b?.reference);
    expect(a?.reference.startsWith('SCL-')).toBe(true);
    expect(b?.reference.startsWith('MOSS-')).toBe(true);
  });

  it('GET list SCL-only vs MOSS-only by productCode', async () => {
    if (!dbReady || !sclId || !mossId) return;
    const user = { id: userId, email: `${suffix}@example.test`, role: 'ANALYST' };
    const sclList = await scl.list(user);
    const mossList = await moss.list(user);
    expect(sclList.some((row) => row.id === sclId)).toBe(true);
    expect(sclList.some((row) => row.id === mossId)).toBe(false);
    expect(mossList.some((row) => row.id === mossId)).toBe(true);
    expect(mossList.some((row) => row.id === sclId)).toBe(false);
  });

  it('Cost Leakage review queue excludes submitted MOSS assessments', async () => {
    if (!dbReady || !mossId) return;
    await prisma.assessmentSession.update({
      where: { id: mossId },
      data: {
        status: AssessmentStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
    const queued = await prisma.assessmentSession.findMany({
      where: {
        productCode: ProductCode.SCLI_COST_LEAKAGE,
        status: {
          in: [
            AssessmentStatus.SUBMITTED,
            AssessmentStatus.REVIEWED,
            AssessmentStatus.AUTOMATED_EVALUATION_COMPLETE,
            AssessmentStatus.EVIDENCE_REVIEW,
            AssessmentStatus.ANALYST_REVIEW,
            AssessmentStatus.QUALITY_ASSURANCE,
          ],
        },
      },
      select: { id: true, productCode: true },
    });
    expect(queued.some((row) => row.id === mossId)).toBe(false);
    expect(queued.every((row) => row.productCode === ProductCode.SCLI_COST_LEAKAGE)).toBe(true);
  });
});
