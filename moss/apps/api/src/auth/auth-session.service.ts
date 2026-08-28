import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export type SessionEventType = 'SIGN_IN' | 'SIGN_OUT' | 'APP_LOGOUT';

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private onlineWindowMs(): number {
    const minutes = Number(this.config.get('ONLINE_USER_WINDOW_MINUTES') ?? 30);
    return Math.max(5, minutes) * 60_000;
  }

  validateEventSecret(secret?: string | null): boolean {
    const expected =
      this.config.get<string>('AUTH_EVENT_SECRET')
      || this.config.get<string>('NEXTAUTH_SECRET')
      || this.config.get<string>('JWT_SECRET')
      || '';
    return Boolean(expected && secret && secret === expected);
  }

  async recordSignIn(input: {
    userId: string;
    email: string;
    app?: string;
    ipAddress?: string;
    userAgent?: string;
    source?: string;
  }) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { lastLoginAt: now, lastSeenAt: now },
    });
    await this.audit.record({
      userId: input.userId,
      action: 'SSO_LOGIN',
      entityType: 'User',
      entityId: input.userId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        email: input.email,
        app: input.app || 'moss',
        source: input.source || 'keycloak',
        message: `Signed in to ${input.app || 'MOSS'}`,
      },
    }).catch(() => undefined);

    this.logger.log(
      `[AUTH] SIGN_IN email=${input.email} userId=${input.userId} app=${input.app || 'moss'}`,
    );
  }

  async touchLastSeen(userId: string) {
    const cutoff = new Date(Date.now() - 300_000);
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      },
      data: { lastSeenAt: new Date() },
    });
  }

  async recordSignOut(input: {
    email?: string;
    userId?: string;
    app?: string;
    ipAddress?: string;
    userAgent?: string;
    action?: 'SSO_LOGOUT' | 'APP_LOGOUT';
  }) {
    const user = input.userId
      ? await this.prisma.user.findUnique({ where: { id: input.userId } })
      : input.email
        ? await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } })
        : null;

    const action = input.action || 'SSO_LOGOUT';
    const email = user?.email || input.email || 'unknown';

    if (user) {
      await this.audit.record({
        userId: user.id,
        action,
        entityType: 'User',
        entityId: user.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          email,
          app: input.app || 'moss',
          message: action === 'APP_LOGOUT' ? `Left ${input.app || 'MOSS'} (SSO still active)` : 'Signed out of SSO',
        },
      }).catch(() => undefined);
    }

    this.logger.log(
      `[AUTH] SIGN_OUT email=${email} userId=${user?.id || 'n/a'} app=${input.app || 'moss'} action=${action}`,
    );

    return { recorded: Boolean(user), email, userId: user?.id ?? null };
  }

  async handleSessionEvent(
    body: { event: SessionEventType; email?: string; app?: string; name?: string },
    opts?: { ipAddress?: string; userAgent?: string },
  ) {
    if (body.event === 'SIGN_IN' && body.email) {
      const user = await this.prisma.user.findUnique({
        where: { email: body.email.trim().toLowerCase() },
      });
      if (user) {
        await this.recordSignIn({
          userId: user.id,
          email: user.email,
          app: body.app,
          ipAddress: opts?.ipAddress,
          userAgent: opts?.userAgent,
          source: 'session-event',
        });
      } else {
        this.logger.log(`[AUTH] SIGN_IN email=${body.email} app=${body.app || 'moss'} (user not provisioned yet)`);
      }
      return { ok: true };
    }

    if (body.event === 'SIGN_OUT' || body.event === 'APP_LOGOUT') {
      return this.recordSignOut({
        email: body.email,
        app: body.app,
        ipAddress: opts?.ipAddress,
        userAgent: opts?.userAgent,
        action: body.event === 'APP_LOGOUT' ? 'APP_LOGOUT' : 'SSO_LOGOUT',
      });
    }

    return { ok: false, message: 'Unsupported session event' };
  }

  async listOnlineUsers() {
    const since = new Date(Date.now() - this.onlineWindowMs());
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        lastSeenAt: { gte: since },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        systemRole: true,
        lastLoginAt: true,
        lastSeenAt: true,
      },
      take: 200,
    });

    return {
      windowMinutes: Math.round(this.onlineWindowMs() / 60_000),
      count: users.length,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
        role: user.systemRole,
        lastLoginAt: user.lastLoginAt,
        lastSeenAt: user.lastSeenAt,
        online: true,
      })),
    };
  }

  assertEventSecret(secret?: string | null) {
    if (!this.validateEventSecret(secret)) {
      throw new ForbiddenException('Invalid auth event secret');
    }
  }
}
