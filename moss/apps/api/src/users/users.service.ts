import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';
import { requireRole, ADMIN_ROLES, hasRole } from '../common/roles';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private assertLocalUserAdminAllowed() {
    if (this.config.get<string>('KEYCLOAK_ENABLED') === 'true') {
      throw new ForbiddenException(
        'Users are managed in Keycloak SSO. Create or update accounts in auth.localhost, not here.',
      );
    }
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
      },
    });
  }

  async create(
    input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      systemRole: SystemRole;
      organisationIds?: string[];
    },
    actor: AuthUser,
  ) {
    requireRole(actor, ADMIN_ROLES);
    this.assertLocalUserAdminAllowed();
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
