import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { AuditService } from '../common/audit.service';
import { DatabaseService } from '../database/database.service';
import { UserRole } from '../database/entities';

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
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

  async list() {
    const users = await this.db.users.find({ order: { name: 'ASC' } });
    return users.map(({ passwordHash: _passwordHash, ...user }) => user);
  }

  async create(
    input: { name: string; email: string; password: string; role?: UserRole },
    actorId?: string,
  ) {
    this.assertLocalUserAdminAllowed();
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const user = this.db.users.create({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await hash(input.password, 12),
      role: input.role ?? UserRole.VIEWER,
      active: true,
    });
    await this.db.users.save(user);
    await this.audit.record({
      userId: actorId,
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      message: `Created user ${user.email}`,
    });
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async update(
    id: string,
    input: { name?: string; email?: string; password?: string; role?: UserRole; active?: boolean },
    actorId?: string,
  ) {
    this.assertLocalUserAdminAllowed();
    const user = await this.db.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (input.name !== undefined) user.name = input.name;
    if (input.email !== undefined) user.email = input.email.toLowerCase();
    if (input.password) user.passwordHash = await hash(input.password, 12);
    if (input.role !== undefined) user.role = input.role;
    if (input.active !== undefined) user.active = input.active;
    await this.db.users.save(user);
    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      message: `Updated user ${user.email}`,
    });
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
