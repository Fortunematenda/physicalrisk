import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { requireRole, ADMIN_ROLES, hasRole } from '../common/roles';
import { resolveIdentityAdminUrl } from './identity-admin-url';
import {
  KeycloakAdminClient,
  KeycloakAdminError,
  MANAGED_REALM_ROLES,
  PROTECTED_REALM_ROLES,
  PROVISIONABLE_ROLES,
  resolveKeycloakAdminConfig,
} from './keycloak-admin';

/** local: MOSS password accounts. keycloak: MOSS writes to Keycloak. console: link out only. */
type UserAdminMode = 'local' | 'keycloak' | 'console';

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  systemRole: true,
  isActive: true,
} as const;

@Injectable()
export class UsersService {
  private keycloak: KeycloakAdminClient | null | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private mode(): UserAdminMode {
    const keycloakOn = this.config.get<string>('KEYCLOAK_ENABLED') === 'true';
    const legacyOn = this.config.get<string>('ENABLE_LEGACY_LOGIN') === 'true';
    // Local admin create/edit remains available whenever legacy login is enabled.
    if (!keycloakOn || legacyOn) return 'local';
    return this.keycloakClient() ? 'keycloak' : 'console';
  }

  private keycloakClient(): KeycloakAdminClient | null {
    if (this.keycloak === undefined) {
      const cfg = resolveKeycloakAdminConfig((key) => this.config.get<string>(key));
      this.keycloak = cfg ? new KeycloakAdminClient(cfg) : null;
    }
    return this.keycloak;
  }

  private assertLocalUserAdminAllowed() {
    if (this.mode() !== 'local') {
      throw new ForbiddenException(
        'Users are managed in Keycloak SSO. Create or update accounts in the identity provider, not here.',
      );
    }
  }

  capabilities(actor?: AuthUser) {
    const keycloakOn = this.config.get<string>('KEYCLOAK_ENABLED') === 'true';
    const legacyOn = this.config.get<string>('ENABLE_LEGACY_LOGIN') === 'true';
    const mode = this.mode();
    return {
      keycloakEnabled: keycloakOn,
      legacyLoginEnabled: legacyOn,
      localUserAdmin: mode === 'local',
      keycloakProvisioning: mode === 'keycloak',
      assignableRoles: mode === 'keycloak' ? Object.keys(PROVISIONABLE_ROLES) : null,
      identityAdminUrl: keycloakOn && actor && hasRole(actor, ADMIN_ROLES)
        ? resolveIdentityAdminUrl({
            explicit: this.config.get<string>('KEYCLOAK_ADMIN_CONSOLE_URL'),
            issuer: this.config.get<string>('KEYCLOAK_ISSUER'),
          })
        : null,
    };
  }

  list(user: AuthUser) {
    requireRole(user, ADMIN_ROLES);
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        systemRole: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        memberships: {
          include: { organisation: { select: { id: true, name: true } } },
        },
        assignmentsHeld: {
          where: { status: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
          select: { role: true, assessmentId: true },
        },
      },
    });
  }

  async create(
    input: {
      email: string;
      password?: string;
      firstName: string;
      lastName: string;
      systemRole: SystemRole;
      organisationIds?: string[];
    },
    actor: AuthUser,
  ) {
    requireRole(actor, ADMIN_ROLES);
    if (this.mode() === 'keycloak') return this.createInKeycloak(input, actor);
    this.assertLocalUserAdminAllowed();
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    const exists = await this.prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (exists) throw new BadRequestException('Email already registered.');
    const passwordHash = await argon2.hash(input.password);
    const created = await this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        systemRole: input.systemRole,
        memberships: input.organisationIds?.length
          ? {
              create: input.organisationIds.map((organisationId) => ({
                organisationId,
                role: input.systemRole,
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        systemRole: true,
        isActive: true,
      },
    });
    await this.audit.record({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: created.id,
      metadata: { email: created.email, role: created.systemRole },
    });
    return created;
  }

  async update(
    id: string,
    input: {
      firstName?: string;
      lastName?: string;
      systemRole?: SystemRole;
      isActive?: boolean;
      organisationIds?: string[];
    },
    actor: AuthUser,
  ) {
    requireRole(actor, ADMIN_ROLES);
    if (this.mode() === 'keycloak') return this.updateInKeycloak(id, input, actor);
    this.assertLocalUserAdminAllowed();
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: input.firstName?.trim(),
        lastName: input.lastName?.trim(),
        systemRole: input.systemRole,
        isActive: input.isActive,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        systemRole: true,
        isActive: true,
      },
    });
    if (input.organisationIds) {
      await this.prisma.membership.deleteMany({ where: { userId: id } });
      if (input.organisationIds.length) {
        await this.prisma.membership.createMany({
          data: input.organisationIds.map((organisationId) => ({
            userId: id,
            organisationId,
            role: updated.systemRole,
          })),
        });
      }
    }
    await this.audit.record({
      userId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      metadata: { changes: input },
    });
    return updated;
  }

  async resetPassword(id: string, password: string, actor: AuthUser) {
    requireRole(actor, ADMIN_ROLES);
    this.assertLocalUserAdminAllowed();
    const passwordHash = await argon2.hash(password);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.audit.record({
      userId: actor.id,
      action: 'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      metadata: {},
    });
    return { ok: true };
  }

  /** Keycloak mode: Keycloak emails the user a link to choose a new password. */
  async sendPasswordEmail(id: string, actor: AuthUser) {
    requireRole(actor, ADMIN_ROLES);
    if (this.mode() !== 'keycloak') {
      throw new BadRequestException('Password emails are only available when MOSS manages Keycloak users.');
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    await this.withKeycloak(async (kc) => {
      const kcUser = await this.requireManageableKeycloakUser(kc, existing.email);
      await kc.sendActionsEmail(kcUser.id, ['UPDATE_PASSWORD']);
    });
    await this.audit.record({
      userId: actor.id,
      action: 'USER_PASSWORD_EMAIL_SENT',
      entityType: 'User',
      entityId: id,
      metadata: { via: 'keycloak' },
    });
    return { ok: true };
  }

  private async createInKeycloak(
    input: { email: string; firstName: string; lastName: string; systemRole: SystemRole; organisationIds?: string[] },
    actor: AuthUser,
  ) {
    const email = (input.email || '').trim().toLowerCase();
    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
    if (!firstName || !lastName) throw new BadRequestException('First and last name are required.');
    this.assertProvisionableRole(input.systemRole);
    const realmRole = PROVISIONABLE_ROLES[input.systemRole];

    const outcome = await this.withKeycloak(async (kc) => {
      const found = await kc.findUserByEmail(email);
      if (found) {
        await this.assertNotProtected(kc, found.id);
        await kc.setManagedRealmRole(found.id, realmRole, MANAGED_REALM_ROLES);
        return { linkedExisting: true, enabled: found.enabled !== false, inviteSent: false, inviteError: null };
      }
      const kcId = await kc.createUser({ email, firstName, lastName });
      try {
        await kc.setManagedRealmRole(kcId, realmRole, MANAGED_REALM_ROLES);
      } catch (error) {
        await kc.deleteUser(kcId).catch(() => undefined);
        throw error;
      }
      let inviteError: string | null = null;
      try {
        await kc.sendActionsEmail(kcId, ['UPDATE_PASSWORD', 'VERIFY_EMAIL']);
      } catch (error) {
        inviteError = error instanceof Error ? error.message : 'The invitation email could not be sent.';
      }
      return { linkedExisting: false, enabled: true, inviteSent: !inviteError, inviteError };
    });

    const local = await this.prisma.user.findUnique({ where: { email } });
    const user = local
      ? await this.prisma.user.update({
          where: { id: local.id },
          data: { systemRole: input.systemRole, isActive: outcome.enabled },
          select: USER_SELECT,
        })
      : await this.prisma.user.create({
          data: {
            email,
            firstName,
            lastName,
            systemRole: input.systemRole,
            isActive: outcome.enabled,
            // Sign-in is through Keycloak; this hash is never usable.
            passwordHash: await argon2.hash(randomBytes(32).toString('hex')),
          },
          select: USER_SELECT,
        });
    if (input.organisationIds) await this.replaceMemberships(user.id, input.organisationIds, user.systemRole);

    await this.audit.record({
      userId: actor.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        email: user.email,
        role: user.systemRole,
        via: 'keycloak',
        linkedExisting: outcome.linkedExisting,
        inviteSent: outcome.inviteSent,
      },
    });
    return { ...user, keycloak: outcome };
  }

  private async updateInKeycloak(
    id: string,
    input: { firstName?: string; lastName?: string; systemRole?: SystemRole; isActive?: boolean; organisationIds?: string[] },
    actor: AuthUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    if (existing.systemRole === SystemRole.SUPER_ADMIN) {
      throw new ForbiddenException('Administrator accounts are managed in the Keycloak admin console.');
    }
    const isSelf = existing.id === actor.id || existing.email === (actor.email || '').toLowerCase();
    const roleChanges = input.systemRole !== undefined && input.systemRole !== existing.systemRole;
    if (isSelf && (roleChanges || input.isActive === false)) {
      throw new BadRequestException('You cannot change your own role or deactivate your own account.');
    }
    if (roleChanges) this.assertProvisionableRole(input.systemRole!);

    const firstName = input.firstName?.trim() || undefined;
    const lastName = input.lastName?.trim() || undefined;
    await this.withKeycloak(async (kc) => {
      const kcUser = await this.requireManageableKeycloakUser(kc, existing.email);
      if (firstName !== undefined || lastName !== undefined || input.isActive !== undefined) {
        await kc.updateUser(kcUser.id, { firstName, lastName, enabled: input.isActive });
      }
      if (roleChanges) {
        await kc.setManagedRealmRole(kcUser.id, PROVISIONABLE_ROLES[input.systemRole!], MANAGED_REALM_ROLES);
      }
      if (input.isActive === false) await kc.logoutUser(kcUser.id);
    });

    const updated = await this.prisma.user.update({
      where: { id },
      data: { firstName, lastName, systemRole: roleChanges ? input.systemRole : undefined, isActive: input.isActive },
      select: USER_SELECT,
    });
    if (input.organisationIds) await this.replaceMemberships(id, input.organisationIds, updated.systemRole);
    await this.audit.record({
      userId: actor.id,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      metadata: { changes: input, via: 'keycloak' },
    });
    return updated;
  }

  private assertProvisionableRole(role: string) {
    if (!(role in PROVISIONABLE_ROLES)) {
      throw new BadRequestException(
        'MOSS can only grant the Analyst, Senior Reviewer, Client Executive or Client Contributor roles. Administrators are added in Keycloak.',
      );
    }
  }

  private async assertNotProtected(kc: KeycloakAdminClient, kcId: string) {
    const roles = await kc.realmRoleNames(kcId);
    if (roles.some((r) => PROTECTED_REALM_ROLES.includes(r))) {
      throw new ForbiddenException('Administrator accounts are managed in the Keycloak admin console.');
    }
  }

  private async requireManageableKeycloakUser(kc: KeycloakAdminClient, email: string) {
    const kcUser = await kc.findUserByEmail(email);
    if (!kcUser) {
      throw new BadRequestException(`No Keycloak account exists for ${email}. Use Add user to create one.`);
    }
    await this.assertNotProtected(kc, kcUser.id);
    return kcUser;
  }

  private async withKeycloak<T>(work: (kc: KeycloakAdminClient) => Promise<T>): Promise<T> {
    const kc = this.keycloakClient();
    if (!kc) throw new BadRequestException('Keycloak user administration is not configured.');
    try {
      return await work(kc);
    } catch (error) {
      if (!(error instanceof KeycloakAdminError)) throw error;
      if (error.status === 400 || error.status === 409) throw new BadRequestException(error.message);
      if (error.status === 404) throw new NotFoundException(error.message);
      throw new BadGatewayException(error.message);
    }
  }

  private async replaceMemberships(userId: string, organisationIds: string[], role: SystemRole) {
    await this.prisma.membership.deleteMany({ where: { userId } });
    if (organisationIds.length) {
      await this.prisma.membership.createMany({
        data: organisationIds.map((organisationId) => ({ userId, organisationId, role })),
      });
    }
  }

  async auditForUser(id: string, actor: AuthUser) {
    requireRole(actor, ADMIN_ROLES);
    return this.prisma.auditEvent.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  analysts(actor: AuthUser) {
    if (!hasRole(actor, [...ADMIN_ROLES, 'REVIEWER', 'ANALYST'])) {
      requireRole(actor, ADMIN_ROLES);
    }
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        systemRole: { in: [SystemRole.ANALYST, SystemRole.REVIEWER, SystemRole.SUPER_ADMIN] },
      },
      select: { id: true, email: true, firstName: true, lastName: true, systemRole: true },
      orderBy: { lastName: 'asc' },
    });
  }
}
