import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertAssessmentInScope,
  assertLeadInScope,
  assessmentScopeWhere,
  isAssignmentScoped,
  loadAssignmentScope,
} from './assignment-scope';
import type { AuthUser } from './current-user.decorator';

const ADMIN: AuthUser = { id: 'admin', email: 'a@x', role: 'SUPER_ADMIN' };
const METHODOLOGY: AuthUser = { id: 'm', email: 'm@x', role: 'METHODOLOGY_ADMIN' };
const ANALYST: AuthUser = { id: 'an1', email: 'an1@x', role: 'ANALYST' };
const REVIEWER: AuthUser = { id: 'rv1', email: 'rv1@x', role: 'REVIEWER' };
const CLIENT: AuthUser = { id: 'c1', email: 'c1@x', role: 'CLIENT_EXECUTIVE' };

function prismaFor() {
  return {
    assessmentSession: {
      findMany: vi.fn(async ({ where }: { where: { OR?: Array<Record<string, any>> } }) => {
        const assigned = where.OR?.find((clause) => clause.assignments);
        if (assigned) return assigned.assignments.some.userId === 'an1' ? [{ id: 'eng-assigned' }] : [];
        const ids: string[] = where.OR?.find((clause) => clause.id)?.id.in || [];
        const spawned = where.OR?.some((clause) => clause.sourceProposal) ? [{ id: 'l3-from-lead', organisationId: 'org-2' }] : [];
        return [...ids.map((id) => ({ id, organisationId: id === 'eng-assigned' ? 'org-1' : 'org-2' })), ...spawned];
      }),
    },
    publicLead: {
      findMany: vi.fn(async ({ where }: { where: { OR?: Array<Record<string, any>>; organisationId?: unknown } }) => {
        if (where.organisationId) return [];
        const owned = where.OR?.some((clause) => clause.assignedAnalystId === 'an1');
        return owned
          ? [{ id: 'lead-1', assessmentId: 'triage-1', convertedAssessmentId: null, organisationId: 'org-2' }]
          : [];
      }),
    },
    somodAssessment: { findMany: vi.fn(async () => []) },
    organisation: { findMany: vi.fn(async () => [{ id: 'org-empty' }]) },
  };
}

describe('assignment scope', () => {
  it('only limits internal non-admin roles', () => {
    expect(isAssignmentScoped(ADMIN)).toBe(false);
    expect(isAssignmentScoped(METHODOLOGY)).toBe(false);
    expect(isAssignmentScoped(CLIENT)).toBe(false);
    expect(isAssignmentScoped(ANALYST)).toBe(true);
    expect(isAssignmentScoped(REVIEWER)).toBe(true);
  });

  it('collects assigned engagements, owned leads and their linked engagements', async () => {
    const scope = await loadAssignmentScope(prismaFor() as never, 'an1');
    expect(scope.assessmentIds.sort()).toEqual(['eng-assigned', 'l3-from-lead', 'triage-1']);
    expect(scope.leadIds).toEqual(['lead-1']);
    expect(scope.organisationIds.sort()).toEqual(['org-1', 'org-2', 'org-empty']);
  });

  it('gives administrators an unfiltered query', async () => {
    const prisma = prismaFor();
    await expect(assessmentScopeWhere(prisma as never, ADMIN)).resolves.toEqual({});
    expect(prisma.assessmentSession.findMany).not.toHaveBeenCalled();
  });

  it('reports records outside the assignment as not found', async () => {
    const prisma = prismaFor();
    await expect(assertAssessmentInScope(prisma as never, ANALYST, 'eng-assigned')).resolves.toBeUndefined();
    await expect(assertAssessmentInScope(prisma as never, ANALYST, 'eng-other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertLeadInScope(prisma as never, ANALYST, 'lead-other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(assertLeadInScope(prisma as never, ADMIN, 'lead-other')).resolves.toBeUndefined();
  });
});
