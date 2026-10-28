import { NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthUser } from './current-user.decorator';
import { hasRole, isInternal } from './roles';

/**
 * Platform roles that see every lead, engagement, report and organisation.
 * Every other internal role (analyst, reviewer, sales, auditor) only sees work
 * assigned to them. Client visibility is membership-based and handled separately.
 */
export const FULL_VISIBILITY_ROLES = new Set(['SUPER_ADMIN', 'METHODOLOGY_ADMIN']);

export function seesAllWork(user: AuthUser) {
  return hasRole(user, FULL_VISIBILITY_ROLES);
}

/** Internal user whose lists and records must be limited to their own assignments. */
export function isAssignmentScoped(user: AuthUser) {
  return isInternal(user) && !seesAllWork(user);
}

type ScopeClient = Pick<PrismaClient, 'assessmentSession' | 'publicLead' | 'somodAssessment' | 'organisation'>;

export type AssignmentScope = {
  assessmentIds: string[];
  leadIds: string[];
  somodAssessmentIds: string[];
  organisationIds: string[];
};

export function leadOwnerWhere(userId: string): Prisma.PublicLeadWhereInput[] {
  return [{ assignedAnalystId: userId }, { commercialOwnerId: userId }, { followUpOwnerId: userId }];
}

/**
 * Everything one user is assigned to:
 * - engagements they created or hold an active assignment on (any product),
 * - triage leads where they are analyst, commercial owner or follow-up owner,
 * - and the records linked to either (lead ↔ triage/converted engagement,
 *   proposal-spawned engagements, reassessments, linked SOMOD assessments).
 */
export async function loadAssignmentScope(prisma: ScopeClient, userId: string): Promise<AssignmentScope> {
  const direct = await prisma.assessmentSession.findMany({
    where: {
      OR: [
        { createdById: userId },
        { assignments: { some: { userId, status: { not: 'CANCELLED' } } } },
      ],
    },
    select: { id: true },
  });
  const directIds = direct.map((row) => row.id);

  const leads = await prisma.publicLead.findMany({
    where: {
      OR: [
        ...leadOwnerWhere(userId),
        ...(directIds.length
          ? [{ assessmentId: { in: directIds } }, { convertedAssessmentId: { in: directIds } }]
          : []),
      ],
    },
    select: { id: true, assessmentId: true, convertedAssessmentId: true, organisationId: true },
  });
  const leadIds = leads.map((lead) => lead.id);
  const leadAssessmentIds = leads
    .flatMap((lead) => [lead.assessmentId, lead.convertedAssessmentId])
    .filter((id): id is string => Boolean(id));

  const rootIds = [...new Set([...directIds, ...leadAssessmentIds])];
  const sessions = await prisma.assessmentSession.findMany({
    where: {
      OR: [
        ...(rootIds.length ? [{ id: { in: rootIds } }, { parentAssessmentId: { in: rootIds } }] : []),
        ...(leadIds.length ? [{ sourceProposal: { publicLeadId: { in: leadIds } } }] : []),
      ],
    },
    select: { id: true, organisationId: true },
  });
  const assessmentIds = sessions.map((row) => row.id);

  const somod = await prisma.somodAssessment.findMany({
    where: {
      OR: [
        { createdById: userId },
        ...(assessmentIds.length ? [{ mossAssessmentId: { in: assessmentIds } }] : []),
      ],
    },
    select: { id: true, organisationId: true },
  });

  // Organisations with no engagement or lead yet belong to nobody, so an analyst can
  // still pick a freshly created organisation when starting new work.
  const emptyOrgs = await prisma.organisation.findMany({
    where: { assessments: { none: {} }, somodAssessments: { none: {} } },
    select: { id: true },
  });
  const orgsWithLeads = emptyOrgs.length
    ? await prisma.publicLead.findMany({
        where: { organisationId: { in: emptyOrgs.map((org) => org.id) } },
        select: { organisationId: true },
      })
    : [];
  const leadOrgIds = new Set(orgsWithLeads.map((lead) => lead.organisationId));
  const unclaimedOrgIds = emptyOrgs.map((org) => org.id).filter((id) => !leadOrgIds.has(id));

  const organisationIds = [
    ...new Set(
      [
        ...sessions.map((row) => row.organisationId),
        ...somod.map((row) => row.organisationId),
        ...leads.map((lead) => lead.organisationId),
        ...unclaimedOrgIds,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    assessmentIds,
    leadIds,
    somodAssessmentIds: somod.map((row) => row.id),
    organisationIds,
  };
}

/** Prisma filter for AssessmentSession lists. Empty object when the user sees all work. */
export async function assessmentScopeWhere(
  prisma: ScopeClient,
  user: AuthUser,
): Promise<Prisma.AssessmentSessionWhereInput> {
  if (!isAssignmentScoped(user)) return {};
  const scope = await loadAssignmentScope(prisma, user.id);
  return { id: { in: scope.assessmentIds } };
}

export async function leadScopeWhere(prisma: ScopeClient, user: AuthUser): Promise<Prisma.PublicLeadWhereInput> {
  if (!isAssignmentScoped(user)) return {};
  const scope = await loadAssignmentScope(prisma, user.id);
  return { id: { in: scope.leadIds } };
}

export async function somodScopeWhere(
  prisma: ScopeClient,
  user: AuthUser,
): Promise<Prisma.SomodAssessmentWhereInput> {
  if (!isAssignmentScoped(user)) return {};
  const scope = await loadAssignmentScope(prisma, user.id);
  return { id: { in: scope.somodAssessmentIds } };
}

export async function organisationScopeWhere(
  prisma: ScopeClient,
  user: AuthUser,
): Promise<Prisma.OrganisationWhereInput> {
  if (!isAssignmentScoped(user)) return {};
  const scope = await loadAssignmentScope(prisma, user.id);
  return { id: { in: scope.organisationIds } };
}

/** Records outside the user's assignments are reported as not found so their existence is not disclosed. */
export async function assertAssessmentInScope(prisma: ScopeClient, user: AuthUser, assessmentId: string | null | undefined) {
  if (!isAssignmentScoped(user)) return;
  const scope = await loadAssignmentScope(prisma, user.id);
  if (!assessmentId || !scope.assessmentIds.includes(assessmentId)) {
    throw new NotFoundException('Assessment not found.');
  }
}

export async function assertLeadInScope(prisma: ScopeClient, user: AuthUser, leadId: string | null | undefined) {
  if (!isAssignmentScoped(user)) return;
  const scope = await loadAssignmentScope(prisma, user.id);
  if (!leadId || !scope.leadIds.includes(leadId)) {
    throw new NotFoundException('Triage submission not found.');
  }
}

export async function assertSomodInScope(prisma: ScopeClient, user: AuthUser, somodId: string | null | undefined) {
  if (!isAssignmentScoped(user)) return;
  const scope = await loadAssignmentScope(prisma, user.id);
  if (!somodId || !scope.somodAssessmentIds.includes(somodId)) {
    throw new NotFoundException('SOMOD assessment not found.');
  }
}

export async function assertOrganisationInScope(prisma: ScopeClient, user: AuthUser, organisationId: string | null | undefined) {
  if (!isAssignmentScoped(user)) return;
  const scope = await loadAssignmentScope(prisma, user.id);
  if (!organisationId || !scope.organisationIds.includes(organisationId)) {
    throw new NotFoundException('Organisation not found.');
  }
}
