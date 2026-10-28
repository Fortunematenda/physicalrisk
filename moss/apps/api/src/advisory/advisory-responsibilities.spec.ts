import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvisoryService } from './advisory.service';
import type { AuthUser } from '../common/current-user.decorator';

type Row = { id: string; assessmentId: string; userId: string; role: string; status: string };

const ADMIN: AuthUser = { id: 'admin', email: 'admin@x', role: 'SUPER_ADMIN' };
const ANALYST: AuthUser = { id: 'analyst', email: 'analyst@x', role: 'ANALYST' };
const AUDITOR: AuthUser = { id: 'auditor', email: 'auditor@x', role: 'AUDITOR' };
const CLIENT: AuthUser = { id: 'client', email: 'client@x', role: 'CLIENT_EXECUTIVE' };

function build(options: { productCode?: string; users?: Record<string, { systemRole: string; isActive?: boolean }>; rows?: Row[] } = {}) {
  const rows: Row[] = [...(options.rows || [])];
  const users = options.users || {};
  const prisma = {
    assessmentSession: {
      findUnique: vi.fn(async () => ({
        organisationId: 'org-1',
        productCode: options.productCode || 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
        status: 'IN_PROGRESS',
        parentAssessmentId: null,
      })),
    },
    membership: { findUnique: vi.fn(async () => ({ id: 'm1' })) },
    publicLead: { findFirst: vi.fn(async () => null), update: vi.fn() },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = users[where.id];
        return u ? { id: where.id, email: `${where.id}@x`, isActive: u.isActive ?? true, systemRole: u.systemRole } : null;
      }),
      findMany: vi.fn(async () => []),
    },
    assessmentAssignment: {
      findFirst: vi.fn(async ({ where }: { where: { role?: string } }) =>
        rows.find((r) => r.role === where.role && ['ASSIGNED', 'IN_PROGRESS'].includes(r.status)) || null,
      ),
      findMany: vi.fn(async ({ where }: { where: { userId?: string } }) =>
        rows
          .filter((r) => ['ASSIGNED', 'IN_PROGRESS'].includes(r.status) && (!where.userId || r.userId === where.userId))
          .map((r) => ({ ...r, user: { id: r.userId } })),
      ),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'status'> }) => {
        const row = { id: `a${rows.length + 1}`, status: 'ASSIGNED', ...data };
        rows.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; role?: string } }) => {
        for (const r of rows) {
          if (where.id?.in.includes(r.id) || (where.role && r.role === where.role)) r.status = 'CANCELLED';
        }
        return { count: 1 };
      }),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new AdvisoryService(prisma as never, audit as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma, rows, audit };
}

describe('Engagement responsibility permissions (server-side)', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build({
      users: { reviewer: { systemRole: 'REVIEWER' }, analyst2: { systemRole: 'ANALYST' }, sales: { systemRole: 'SALES' } },
      rows: [{ id: 'lead', assessmentId: 'e1', userId: 'analyst2', role: 'PRIMARY_ANALYST', status: 'ASSIGNED' }],
    });
  });

  it('only administrators can change responsibilities', async () => {
    await expect(ctx.service.setResponsibilities('e1', 'reviewer', ['REVIEWER'], ANALYST)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(ctx.service.setResponsibilities('e1', 'reviewer', ['REVIEWER'], AUDITOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(ctx.prisma.assessmentAssignment.create).not.toHaveBeenCalled();
  });

  it('assigns several independent responsibilities to one eligible person', async () => {
    await ctx.service.setResponsibilities('e1', 'reviewer', ['REVIEWER', 'APPROVER'], ADMIN);
    const created = ctx.prisma.assessmentAssignment.create.mock.calls.map((c) => c[0].data.role);
    expect(created).toEqual(['SENIOR_REVIEWER', 'APPROVER']);
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADVISORY_RESPONSIBILITIES_UPDATED' }));
  });

  it('rejects responsibilities the person is not eligible for', async () => {
    await expect(ctx.service.setResponsibilities('e1', 'analyst2', ['ENGAGEMENT_LEAD', 'APPROVER'], ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(ctx.service.setResponsibilities('e1', 'sales', ['CONSULTANT'], ADMIN)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not allow an engagement to lose its lead', async () => {
    await expect(ctx.service.setResponsibilities('e1', 'analyst2', [], ADMIN)).rejects.toThrow(/engagement lead/i);
    expect(ctx.rows.find((r) => r.id === 'lead')?.status).toBe('ASSIGNED');
  });

  it('removes only the unticked responsibilities', async () => {
    await ctx.service.setResponsibilities('e1', 'reviewer', ['REVIEWER', 'CONSULTANT'], ADMIN);
    await ctx.service.setResponsibilities('e1', 'reviewer', ['CONSULTANT'], ADMIN);
    const active = ctx.rows.filter((r) => r.userId === 'reviewer' && r.status === 'ASSIGNED').map((r) => r.role);
    expect(active).toEqual(['CONTRIBUTOR']);
  });

  it('keeps the legacy assign endpoint from granting reviewer/approver duties to non-admins', async () => {
    await expect(
      ctx.service.assign('e1', { userId: 'reviewer', role: 'SENIOR_REVIEWER' as never }, ANALYST),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      ctx.service.assign('e1', { userId: 'analyst2', role: 'PRIMARY_ANALYST' as never }, AUDITOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps clients out of engagement responsibility data', async () => {
    await expect(ctx.service.listResponsibilities('e1', CLIENT)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose non-advisory sessions through these endpoints', async () => {
    const other = build({ productCode: 'SCLI_COST_LEAKAGE', users: { reviewer: { systemRole: 'REVIEWER' } } });
    await expect(other.service.setResponsibilities('x', 'reviewer', ['REVIEWER'], ADMIN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
