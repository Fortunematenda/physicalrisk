import { Injectable, Logger } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type SsoSyncInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
};

/**
 * Keeps the local Prisma users table aligned with Keycloak SSO identities.
 */
@Injectable()
export class SsoUserSyncService {
  private readonly logger = new Logger(SsoUserSyncService.name);
  private readonly cache = new Map<string, { id: string; sig: string; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async sync(input: SsoSyncInput): Promise<{ id: string; email: string } | null> {
    const email = input.email?.trim().toLowerCase();
    if (!email) return null;

    const systemRole = this.toSystemRole(input.role);
    const firstName = input.firstName?.trim() || email.split('@')[0] || 'SSO';
    const lastName = input.lastName?.trim() || 'User';
    const sig = `${firstName}|${lastName}|${systemRole}`;
    const cached = this.cache.get(email);
    if (cached && cached.sig === sig && Date.now() - cached.at < 300_000) {
      return { id: cached.id, email };
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const created = await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          systemRole,
          isActive: true,
          lastLoginAt: new Date(),
          // Unusable password — SSO-only accounts.
          passwordHash: await argon2.hash(randomBytes(32).toString('hex')),
        },
        select: { id: true, email: true },
      });
      this.logger.log(`Provisioned SSO user ${email} as ${systemRole}`);
      this.cache.set(email, { id: created.id, sig, at: Date.now() });
      return created;
    }

    const shouldTouchLogin =
      !existing.lastLoginAt || Date.now() - existing.lastLoginAt.getTime() > 300_000;
    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        systemRole,
        isActive: true,
        ...(shouldTouchLogin ? { lastLoginAt: new Date() } : {}),
      },
      select: { id: true, email: true },
    });
    this.cache.set(email, { id: updated.id, sig, at: Date.now() });
    return updated;
  }

  private toSystemRole(role: string): SystemRole {
    if (role === 'SUPER_ADMIN') return SystemRole.SUPER_ADMIN;
    if (role === 'REVIEWER') return SystemRole.REVIEWER;
    if (role === 'ANALYST') return SystemRole.ANALYST;
    if (role === 'CLIENT_EXECUTIVE') return SystemRole.CLIENT_EXECUTIVE;
    if (role === 'METHODOLOGY_ADMIN') return SystemRole.METHODOLOGY_ADMIN;
    if (role === 'SALES') return SystemRole.SALES;
    if (role === 'AUDITOR') return SystemRole.AUDITOR;
    return SystemRole.CLIENT_CONTRIBUTOR;
  }
}
