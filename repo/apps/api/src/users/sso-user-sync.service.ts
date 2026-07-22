import { Injectable, Logger } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { User, UserRole } from '../database/entities';

type SsoSyncInput = {
  email: string;
  name?: string;
  role: string;
};

/**
 * Keeps the local users table aligned with Keycloak SSO identities.
 * Local create-user is disabled when KEYCLOAK_ENABLED=true.
 */
@Injectable()
export class SsoUserSyncService {
  private readonly logger = new Logger(SsoUserSyncService.name);
  private readonly cache = new Map<string, { id: string; sig: string; at: number }>();

  constructor(private readonly db: DatabaseService) {}

  async sync(input: SsoSyncInput): Promise<User | null> {
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
      return { id: cached.id, email, name, role, active: true } as User;
    }

    let user = await this.db.users.findOne({ where: { email } });
    if (!user) {
      user = this.db.users.create({
        email,
        name,
        role,
        active: true,
        // Unusable password — SSO-only accounts cannot log in with local credentials.
        passwordHash: await hash(randomBytes(32).toString('hex'), 10),
      });
      user = await this.db.users.save(user);
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
