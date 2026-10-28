export const USER_ROLES = [
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
  'CLIENT_EXECUTIVE',
  'CLIENT_CONTRIBUTOR',
  'AUDITOR',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type CreatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  systemRole: string;
  isActive: boolean;
  /** Present when the account was created or linked in Keycloak. */
  keycloak?: {
    linkedExisting: boolean;
    inviteSent: boolean;
    inviteError: string | null;
  };
};

/** Where new accounts are created: MOSS passwords (legacy) or Keycloak SSO. */
export type UserProvisioning = 'local' | 'keycloak';

export type UserAdminCapabilities = {
  keycloakEnabled?: boolean;
  legacyLoginEnabled?: boolean;
  localUserAdmin?: boolean;
  keycloakProvisioning?: boolean;
  assignableRoles?: string[] | null;
  identityAdminUrl?: string | null;
};

export function userProvisioning(caps?: UserAdminCapabilities | null): UserProvisioning | null {
  if (caps?.keycloakProvisioning) return 'keycloak';
  if (caps?.localUserAdmin) return 'local';
  return null;
}

/** Roles the current mode can grant, narrowed to `wanted` when given. */
export function grantableRoles(caps: UserAdminCapabilities | null | undefined, wanted?: UserRole[]): UserRole[] {
  const base = wanted?.length ? wanted : [...USER_ROLES];
  if (!caps?.keycloakProvisioning) return base;
  const allowed = new Set(caps.assignableRoles || []);
  return base.filter((role) => allowed.has(role));
}

/** Toast copy for a newly added user. */
export function createdUserNotice(user: CreatedUser): { variant: 'success' | 'warning'; title: string; description: string } {
  if (!user.keycloak) return { variant: 'success', title: 'User created', description: user.email };
  if (user.keycloak.linkedExisting) {
    return {
      variant: 'success',
      title: 'Existing account added',
      description: `${user.email} already had a sign-in account; the MOSS role was applied. No email was sent.`,
    };
  }
  if (user.keycloak.inviteSent) {
    return { variant: 'success', title: 'User added', description: `An email to set a password was sent to ${user.email}.` };
  }
  return {
    variant: 'warning',
    title: 'User added, but the email was not sent',
    description: `${user.keycloak.inviteError || 'Keycloak could not send the email.'} Use "Send password email" once email is working.`,
  };
}
