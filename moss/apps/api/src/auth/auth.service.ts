import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private assertRateLimit(email: string) {
    const key = email.toLowerCase();
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (entry && entry.resetAt > now && entry.count >= 5) {
      throw new HttpException('Too many login attempts. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!entry || entry.resetAt <= now) {
      loginAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    } else {
      entry.count += 1;
    }
  }

  async login(email: string, password: string) {
    if (
      this.config.get<string>('KEYCLOAK_ENABLED') === 'true' &&
      this.config.get<string>('ENABLE_LEGACY_LOGIN') !== 'true'
    ) {
      throw new ForbiddenException('Password login is disabled. Sign in with SSO via the portal.');
    }
    this.assertRateLimit(email);
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    loginAttempts.delete(email.toLowerCase());
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      metadata: {},
    }).catch(() => undefined);
    const payload = { sub: user.id, email: user.email, role: user.systemRole };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.systemRole },
    };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, systemRole: true, memberships: { include: { organisation: true } } },
    });
  }
}
