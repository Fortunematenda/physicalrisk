import { describe, expect, it, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MossEvidenceService } from './moss-evidence.service';
import type { AuthUser } from '../../common/current-user.decorator';

type Doc = {
  id: string;
  assessmentId: string;
  mossControlAssessmentId: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedById: string | null;
  status: string;
  uploadedAt: Date;
  documentType?: string;
  description?: string;
};

const CATALOGUE = 'cat-v3';
const controls = [
  { id: 'ctl-gov01', controlCode: 'GOV-01', catalogueVersionId: CATALOGUE, evidenceStandards: ['Policy'], domain: { domainCode: 'D01' } },
  { id: 'ctl-gov02', controlCode: 'GOV-02', catalogueVersionId: CATALOGUE, evidenceStandards: ['Minutes'], domain: { domainCode: 'D01' } },
  { id: 'ctl-ops01', controlCode: 'OPS-01', catalogueVersionId: CATALOGUE, evidenceStandards: ['Roster'], domain: { domainCode: 'D02' } },
];

const analyst: AuthUser = { id: 'u-analyst', email: 'analyst@x', role: 'ANALYST' } as AuthUser;
const clientA: AuthUser = { id: 'u-client-a', email: 'a@org-a', role: 'CLIENT_CONTRIBUTOR' } as AuthUser;
const clientA2: AuthUser = { id: 'u-client-a2', email: 'a2@org-a', role: 'CLIENT_CONTRIBUTOR' } as AuthUser;
const clientB: AuthUser = { id: 'u-client-b', email: 'b@org-b', role: 'CLIENT_CONTRIBUTOR' } as AuthUser;

function setup() {
  const assessments = new Map([
    ['asm-a', { id: 'asm-a', organisationId: 'org-a', status: 'IN_PROGRESS', lockedAt: null as Date | null, mossCatalogueVersionId: CATALOGUE }],
    ['asm-a2', { id: 'asm-a2', organisationId: 'org-a', status: 'IN_PROGRESS', lockedAt: null as Date | null, mossCatalogueVersionId: CATALOGUE }],
    ['asm-b', { id: 'asm-b', organisationId: 'org-b', status: 'IN_PROGRESS', lockedAt: null as Date | null, mossCatalogueVersionId: CATALOGUE }],
  ]);
  const memberships = new Map([
    ['u-client-a', 'org-a'],
    ['u-client-a2', 'org-a'],
    ['u-client-b', 'org-b'],
  ]);
  const mcas: Array<{ id: string; assessmentId: string; mossControlId: string; controlCode: string }> = [];
  const docs: Doc[] = [];
  const stored: string[] = [];
  const audits: string[] = [];
  let seq = 0;

  const mcaById = (id: string | null) => mcas.find((m) => m.id === id);
  const matchesDoc = (doc: Doc, where: any) => {
    if (where.id && doc.id !== where.id) return false;
    if (where.assessmentId && doc.assessmentId !== where.assessmentId) return false;
    if (where.status?.not && doc.status === where.status.not) return false;
    if (where.mossControlAssessment) {
      const mca = mcaById(doc.mossControlAssessmentId);
      if (!mca) return false;
      if (where.mossControlAssessment.mossControlId && mca.mossControlId !== where.mossControlAssessment.mossControlId) return false;
      if (where.mossControlAssessment.assessmentId && mca.assessmentId !== where.mossControlAssessment.assessmentId) return false;
    }
    return true;
  };

  const prisma = {
    mossControl: {
      findUnique: async ({ where }: any) =>
        controls.find(
          (c) =>
            c.catalogueVersionId === where.catalogueVersionId_controlCode.catalogueVersionId &&
            c.controlCode === where.catalogueVersionId_controlCode.controlCode,
        ) ?? null,
    },
    mossControlAssessment: {
      findUnique: async ({ where }: any) =>
        mcas.find(
          (m) =>
            m.assessmentId === where.assessmentId_mossControlId.assessmentId &&
            m.mossControlId === where.assessmentId_mossControlId.mossControlId,
        ) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `mca-${++seq}`, ...data };
        mcas.push(row);
        return row;
      },
    },
    evidenceDocument: {
      findMany: async ({ where }: any) =>
        docs.filter((d) => matchesDoc(d, where)).sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()),
      findFirst: async ({ where }: any) => docs.find((d) => matchesDoc(d, where)) ?? null,
      create: async ({ data }: any) => {
        const row: Doc = { id: `ev-${++seq}`, status: 'PENDING', uploadedAt: new Date(Date.now() + seq), ...data };
        docs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = docs.find((d) => d.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    user: {
      findMany: async ({ where }: any) =>
        [
          { id: 'u-analyst', firstName: 'Ana', lastName: 'Lyst', email: 'analyst@x' },
          { id: 'u-client-a', firstName: 'Client', lastName: 'A', email: 'a@org-a' },
          { id: 'u-client-a2', firstName: null, lastName: null, email: 'a2@org-a' },
        ].filter((u) => where.id.in.includes(u.id)),
    },
  };

  const assessmentsService = {
    requireMossAssessment: async (id: string, user: AuthUser) => {
      const a = assessments.get(id);
      if (!a) throw new NotFoundException('MOSS assessment not found.');
      if (user.role.startsWith('CLIENT') && memberships.get(user.id) !== a.organisationId) {
        throw new ForbiddenException('You do not have access to this assessment.');
      }
      return a;
    },
  };

  const storage = {
    put: async (key: string) => {
      stored.push(key);
    },
    signedDownloadUrl: async (key: string) => `https://storage.test/${key}?sig=1`,
  };
  const audit = { record: async (entry: { action: string }) => audits.push(entry.action) };

  const service = new MossEvidenceService(prisma as any, storage as any, audit as any, assessmentsService as any);
  return { service, assessments, docs, stored, audits };
}

const file = (name: string, mimetype = 'application/pdf', size = 1024) =>
  ({ originalname: name, mimetype, size, buffer: Buffer.from('x') }) as Express.Multer.File;

describe('MossEvidenceService control scoping', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    await ctx.service.upload('asm-a', 'GOV-01', file('gov01-policy.pdf'), clientA);
    await ctx.service.upload('asm-a', 'GOV-02', file('gov02-minutes.pdf'), analyst);
    await ctx.service.upload('asm-a', 'OPS-01', file('d02-roster.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), clientA);
    await ctx.service.upload('asm-a2', 'GOV-01', file('other-assessment.pdf'), clientA);
    await ctx.service.upload('asm-b', 'GOV-01', file('other-org.pdf'), clientB);
  });

  it('lists only the selected control evidence for the selected assessment', async () => {
    const gov01 = await ctx.service.list('asm-a', 'GOV-01', clientA);
    expect(gov01.evidence.map((e) => e.fileName)).toEqual(['gov01-policy.pdf']);
    const gov02 = await ctx.service.list('asm-a', 'gov-02', clientA);
    expect(gov02.evidence.map((e) => e.fileName)).toEqual(['gov02-minutes.pdf']);
    const ops01 = await ctx.service.list('asm-a', 'OPS-01', clientA);
    expect(ops01.evidence.map((e) => e.fileName)).toEqual(['d02-roster.xlsx']);
    const otherAssessment = await ctx.service.list('asm-a2', 'GOV-01', clientA);
    expect(otherAssessment.evidence.map((e) => e.fileName)).toEqual(['other-assessment.pdf']);
  });

  it('returns uploader names and never exposes storage keys', async () => {
    const res = await ctx.service.list('asm-a', 'GOV-02', analyst);
    expect(res.evidence[0].uploadedByName).toBe('Ana Lyst');
    expect(res.evidence[0]).not.toHaveProperty('storageKey');
    expect(res.evidenceStandards).toEqual(['Minutes']);
  });

  it('stores files under the assessment and control they were uploaded for', () => {
    expect(ctx.stored[0]).toMatch(/^assessments\/asm-a\/moss\/GOV-01\/\d+-gov01-policy\.pdf$/);
    expect(ctx.stored[2]).toMatch(/^assessments\/asm-a\/moss\/OPS-01\//);
  });

  it('refuses to download evidence through a different control or assessment', async () => {
    const gov01 = ctx.docs.find((d) => d.fileName === 'gov01-policy.pdf')!;
    await expect(ctx.service.downloadUrl('asm-a', 'GOV-02', gov01.id, clientA)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctx.service.downloadUrl('asm-a2', 'GOV-01', gov01.id, clientA)).rejects.toBeInstanceOf(NotFoundException);
    const ok = await ctx.service.downloadUrl('asm-a', 'GOV-01', gov01.id, clientA);
    expect(ok.url).toContain('assessments/asm-a/moss/GOV-01/');
  });

  it('blocks users from another organisation from listing, downloading, uploading or removing', async () => {
    const gov01 = ctx.docs.find((d) => d.fileName === 'gov01-policy.pdf')!;
    await expect(ctx.service.list('asm-a', 'GOV-01', clientB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctx.service.downloadUrl('asm-a', 'GOV-01', gov01.id, clientB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctx.service.upload('asm-a', 'GOV-01', file('x.pdf'), clientB)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctx.service.archive('asm-a', 'GOV-01', gov01.id, clientB)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('MossEvidenceService upload validation', () => {
  it('rejects unsupported types, oversized files, missing files and locked assessments', async () => {
    const ctx = setup();
    await expect(ctx.service.upload('asm-a', 'GOV-01', file('clip.mp4', 'video/mp4'), clientA)).rejects.toThrow(/Unsupported file type/);
    await expect(
      ctx.service.upload('asm-a', 'GOV-01', file('big.pdf', 'application/pdf', 26 * 1024 * 1024), clientA),
    ).rejects.toThrow(/25 MB/);
    await expect(ctx.service.upload('asm-a', 'GOV-01', undefined as any, clientA)).rejects.toThrow(/file is required/);
    ctx.assessments.get('asm-a')!.lockedAt = new Date();
    await expect(ctx.service.upload('asm-a', 'GOV-01', file('ok.pdf'), clientA)).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.docs).toHaveLength(0);
    expect(ctx.stored).toHaveLength(0);
  });

  it('rejects unknown controls', async () => {
    const ctx = setup();
    await expect(ctx.service.list('asm-a', 'NOPE-99', clientA)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MossEvidenceService removal', () => {
  it('lets the uploader remove their own evidence and keeps the record for audit', async () => {
    const ctx = setup();
    const uploaded = await ctx.service.upload('asm-a', 'GOV-01', file('mine.pdf'), clientA);
    const listed = await ctx.service.list('asm-a', 'GOV-01', clientA);
    expect(listed.evidence[0].canRemove).toBe(true);

    await ctx.service.archive('asm-a', 'GOV-01', uploaded.id, clientA);
    expect((await ctx.service.list('asm-a', 'GOV-01', clientA)).evidence).toHaveLength(0);
    expect(ctx.docs.find((d) => d.id === uploaded.id)?.status).toBe('OUTDATED');
    expect(ctx.audits).toContain('MOSS_EVIDENCE_ARCHIVED');
  });

  it('stops other client users removing evidence they did not upload, but allows analysts', async () => {
    const ctx = setup();
    const uploaded = await ctx.service.upload('asm-a', 'GOV-01', file('mine.pdf'), clientA);
    const asOther = await ctx.service.list('asm-a', 'GOV-01', clientA2);
    expect(asOther.evidence[0].canRemove).toBe(false);
    await expect(ctx.service.archive('asm-a', 'GOV-01', uploaded.id, clientA2)).rejects.toBeInstanceOf(ForbiddenException);
    await ctx.service.archive('asm-a', 'GOV-01', uploaded.id, analyst);
    expect(ctx.docs.find((d) => d.id === uploaded.id)?.status).toBe('OUTDATED');
  });

  it('cannot remove through another control, or once the assessment is submitted', async () => {
    const ctx = setup();
    const uploaded = await ctx.service.upload('asm-a', 'GOV-01', file('mine.pdf'), clientA);
    await expect(ctx.service.archive('asm-a', 'GOV-02', uploaded.id, analyst)).rejects.toBeInstanceOf(NotFoundException);
    ctx.assessments.get('asm-a')!.status = 'SUBMITTED';
    expect((await ctx.service.list('asm-a', 'GOV-01', analyst)).evidence[0].canRemove).toBe(false);
    await expect(ctx.service.archive('asm-a', 'GOV-01', uploaded.id, analyst)).rejects.toThrow(/while the assessment is editable/);
    expect(ctx.docs.find((d) => d.id === uploaded.id)?.status).toBe('PENDING');
  });
});
