import { Injectable, Logger } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { User, UserRole } from '../database/entities';
import { AuthSessionService } from '../auth/auth-session.service';

type SsoSyncInput = {
  email: string;
  name?: string;
  role: string;
};

type SsoSyncContext = {
  ipAddress?: string;
  app?: string;
};

/**
 * Keeps the local users table aligned with Keycloak SSO identities.
 */
@Injectable()
export class SsoUserSyncService {
  private readonly logger = new Logger(SsoUserSyncService.name);
  private readonly cache = new Map<string, { id: string; sig: string; at: number }>();

  constructor(
    private readonly db: DatabaseService,
    private readonly authSessions: AuthSessionService,
  ) {}

  async sync(input: SsoSyncInput, context?: SsoSyncContext): Promise<User | null> {
    const email = input.email?.trim().toLowerCase();
    if (!email) return null;

    const role = this.toUserRole(input.role);
    const name =
      input.name?.trim() ||
      email.split('@')[0] ||
      'SSO User';
    const sig = `${name}|${role}`;
    const cached = this.cache.get(email);
    if (cached && cached.sig === sig && Date.now() - cached.at < 300_000) {
      await this.authSessions.touchLastSeen(cached.id);
      return { id: cached.id, email, name, role, active: true } as User;
    }

    let user = await this.db.users.findOne({ where: { email } });
    let isNew = false;
    if (!user) {
      user = this.db.users.create({
        email,
        name,
        role,
        active: true,
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
        passwordHash: await hash(randomBytes(32).toString('hex'), 10),
      });
      user = await this.db.users.save(user);
      isNew = true;
      this.logger.log(`Provisioned SSO user ${email} as ${role}`);
    } else {
      let dirty = false;
      if (user.name !== name) {
        user.name = name;
        dirty = true;
      }
      if (user.role !== role) {
        user.role = role;
        dirty = true;
      }
      if (!user.active) {
        user.active = true;
        dirty = true;
      }
      if (dirty) {
        user = await this.db.users.save(user);
      }
    }

    const shouldTouchLogin =
      isNew
      || !user.lastLoginAt
      || Date.now() - user.lastLoginAt.getTime() > 300_000;

    if (shouldTouchLogin) {
      user.lastLoginAt = new Date();
      user.lastSeenAt = new Date();
      user = await this.db.users.save(user);
      await this.authSessions.recordSignIn({
        userId: user.id,
        email: user.email,
        app: context?.app || 'repo',
        ipAddress: context?.ipAddress,
        source: 'sso-sync',
      });
    } else {
      await this.authSessions.touchLastSeen(user.id);
    }

    this.cache.set(email, { id: user.id, sig, at: Date.now() });
    return user;
  }

  private toUserRole(role: string): UserRole {
    if (role === UserRole.ADMIN) return UserRole.ADMIN;
    if (role === UserRole.IMPORTER) return UserRole.IMPORTER;
    if (role === UserRole.REVIEWER) return UserRole.REVIEWER;
    return UserRole.VIEWER;
  }
}
