/**
 * Plain-language descriptions of MOSS platform roles and engagement responsibilities.
 *
 * Platform roles come from Keycloak realm roles at sign-in (see mapRealmRolesToMossRole)
 * and apply everywhere in MOSS. Engagement responsibilities are named per engagement
 * and never grant extra permissions on their own.
 */
export type PlatformRoleInfo = {
  label: string;
  keycloakRole: string | null;
  description: string;
};

export const PLATFORM_ROLE_INFO: Record<string, PlatformRoleInfo> = {
  SUPER_ADMIN: {
    label: 'Administrator',
    keycloakRole: 'moss_admin',
    description:
      'Full administration: users, integrations, methodology and engagement responsibilities. Can review and approve.',
  },
  REVIEWER: {
    label: 'Senior Reviewer',
    keycloakRole: 'moss_reviewer',
    description: 'Reviews and approves assessments, including SOMOD. Can be named Reviewer or Approver on an engagement.',
  },
  ANALYST: {
    label: 'Analyst',
    keycloakRole: 'moss_analyst',
    description:
      'Works triage, diagnostics and assessments. Can be named Engagement lead or Consultant; cannot approve SOMOD.',
  },
  CLIENT_EXECUTIVE: {
    label: 'Client Executive',
    keycloakRole: 'moss_client',
    description: "Sees and contributes to their own organisation's assessments and released reports.",
  },
  CLIENT_CONTRIBUTOR: {
    label: 'Client Contributor',
    keycloakRole: null,
    description: 'Default for signed-in users without a MOSS role. Limited to their own organisation.',
  },
  METHODOLOGY_ADMIN: {
    label: 'Methodology Administrator',
    keycloakRole: null,
    description: 'Maintains questionnaires and scoring. No Keycloak role maps to this yet.',
  },
  SALES: {
    label: 'Sales User',
    keycloakRole: null,
    description: 'Commercial follow-up and CRM sync. No Keycloak role maps to this yet.',
  },
  AUDITOR: {
    label: 'Auditor',
    keycloakRole: null,
    description: 'Read-only oversight. No Keycloak role maps to this yet.',
  },
};

export function platformRoleInfo(systemRole: string): PlatformRoleInfo {
  return (
    PLATFORM_ROLE_INFO[systemRole] || {
      label: systemRole.replaceAll('_', ' '),
      keycloakRole: null,
      description: 'Unrecognised role — no additional access.',
    }
  );
}

export const ENGAGEMENT_RESPONSIBILITY_LABELS: Record<string, string> = {
  PRIMARY_ANALYST: 'Engagement lead',
  CONTRIBUTOR: 'Consultant',
  SENIOR_REVIEWER: 'Reviewer',
  APPROVER: 'Approver',
};

/** "Engagement lead ×2 · Reviewer ×1" style summary of active assignments. */
export function summariseResponsibilities(assignments: Array<{ role: string }> | undefined | null): string {
  if (!assignments?.length) return '';
  const counts = new Map<string, number>();
  for (const a of assignments) {
    const label = ENGAGEMENT_RESPONSIBILITY_LABELS[a.role] || a.role.replaceAll('_', ' ');
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, n]) => `${label} ×${n}`).join(' · ');
}
