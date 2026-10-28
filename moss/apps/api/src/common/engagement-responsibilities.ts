import type { AssignmentRole } from '@prisma/client';
import { normalizeRole } from './roles';

/**
 * Engagement-scoped responsibilities (one assessment / engagement at a time).
 *
 * These are distinct from platform roles (Keycloak realm role → User.systemRole),
 * which decide what a person may do anywhere in MOSS. Holding a responsibility
 * never grants extra permissions: approve/review actions are still gated by the
 * platform role checks in roles.ts. Eligibility below only limits who may be
 * named for a responsibility.
 */
export type EngagementResponsibilityKey = 'ENGAGEMENT_LEAD' | 'CONSULTANT' | 'REVIEWER' | 'APPROVER';

export type EngagementResponsibility = {
  key: EngagementResponsibilityKey;
  assignmentRole: AssignmentRole;
  label: string;
  description: string;
  /** Platform roles (SystemRole) that may hold this responsibility. */
  eligibleSystemRoles: readonly string[];
  /** Only one active holder per engagement. */
  singleHolder: boolean;
};

export const ENGAGEMENT_RESPONSIBILITIES: readonly EngagementResponsibility[] = [
  {
    key: 'ENGAGEMENT_LEAD',
    assignmentRole: 'PRIMARY_ANALYST',
    label: 'Engagement lead',
    description:
      'Accountable consultant for this engagement (shown as the primary consultant). One per engagement; carried forward from Level 1 triage.',
    eligibleSystemRoles: ['ANALYST', 'REVIEWER', 'SUPER_ADMIN'],
    singleHolder: true,
  },
  {
    key: 'CONSULTANT',
    assignmentRole: 'CONTRIBUTOR',
    label: 'Consultant',
    description: 'Supports fieldwork, evidence and drafting on this engagement.',
    eligibleSystemRoles: ['ANALYST', 'REVIEWER', 'SUPER_ADMIN'],
    singleHolder: false,
  },
  {
    key: 'REVIEWER',
    assignmentRole: 'SENIOR_REVIEWER',
    label: 'Reviewer',
    description: 'Named quality reviewer for this engagement. Requires the Senior Reviewer platform role.',
    eligibleSystemRoles: ['REVIEWER', 'SUPER_ADMIN'],
    singleHolder: false,
  },
  {
    key: 'APPROVER',
    assignmentRole: 'APPROVER',
    label: 'Approver',
    description:
      'Named sign-off owner for this engagement. Requires the Senior Reviewer platform role. Naming an approver does not change who the platform allows to approve.',
    eligibleSystemRoles: ['REVIEWER', 'SUPER_ADMIN'],
    singleHolder: false,
  },
];

const BY_KEY = new Map(ENGAGEMENT_RESPONSIBILITIES.map((r) => [r.key, r]));
const BY_ASSIGNMENT_ROLE = new Map(ENGAGEMENT_RESPONSIBILITIES.map((r) => [r.assignmentRole as string, r]));

export function responsibilityByKey(key: string): EngagementResponsibility | undefined {
  return BY_KEY.get(key as EngagementResponsibilityKey);
}

export function responsibilityForAssignmentRole(role: string): EngagementResponsibility | undefined {
  return BY_ASSIGNMENT_ROLE.get(role);
}

export function isEligibleForResponsibility(systemRole: string, responsibility: EngagementResponsibility): boolean {
  return responsibility.eligibleSystemRoles.includes(normalizeRole(systemRole));
}

export function eligibleResponsibilityKeys(systemRole: string): EngagementResponsibilityKey[] {
  return ENGAGEMENT_RESPONSIBILITIES.filter((r) => isEligibleForResponsibility(systemRole, r)).map((r) => r.key);
}

/**
 * Validate a requested responsibility set for one person on one engagement.
 * Returns normalised keys, or throws a descriptive Error for unknown/ineligible entries.
 */
export function validateResponsibilitySet(systemRole: string, requested: readonly string[]): EngagementResponsibilityKey[] {
  const keys = [...new Set(requested.map((k) => String(k).trim().toUpperCase()).filter(Boolean))];
  const unknown = keys.filter((k) => !responsibilityByKey(k));
  if (unknown.length) throw new Error(`Unknown responsibility: ${unknown.join(', ')}.`);
  const ineligible = keys
    .map((k) => responsibilityByKey(k)!)
    .filter((r) => !isEligibleForResponsibility(systemRole, r));
  if (ineligible.length) {
    throw new Error(
      `${ineligible.map((r) => r.label).join(', ')} cannot be assigned to a user whose platform role is ${normalizeRole(systemRole)}.`,
    );
  }
  return keys as EngagementResponsibilityKey[];
}

/** Public catalogue for the UI (no internal fields). */
export function responsibilityCatalogue() {
  return ENGAGEMENT_RESPONSIBILITIES.map(({ key, label, description, eligibleSystemRoles, singleHolder }) => ({
    key,
    label,
    description,
    eligibleSystemRoles: [...eligibleSystemRoles],
    singleHolder,
  }));
}
