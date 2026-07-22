import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

export const ANONYMOUS_COOKIE = 'moss.public-assessment';

export type AnonymousAssessmentSession = {
  sid: string;
  source: 'wordpress';
  leadId?: string;
  iat?: number;
};

@Injectable()
export class AnonymousSessionService {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  create(source: string): string {
    return this.sign({ sid: randomUUID(), source: this.canonicalSource(source) });
  }

  attach(session: AnonymousAssessmentSession, leadId: string): string {
    return this.sign({ sid: session.sid, source: session.source, leadId });
  }

  verify(cookieHeader?: string): AnonymousAssessmentSession {
    const token = this.readCookie(cookieHeader);
    if (!token) throw new UnauthorizedException('Anonymous assessment session required.');
    try {
      const session = this.jwt.verify<AnonymousAssessmentSession>(token, {
        secret: this.secret(),
      });
      if (!session.sid || session.source !== 'wordpress') throw new Error('Invalid session');
      return session;
    } catch {
      throw new UnauthorizedException('Anonymous assessment session expired. Please start again.');
    }
  }

  tryVerify(cookieHeader?: string): AnonymousAssessmentSession | null {
    try {
      return this.verify(cookieHeader);
    } catch {
      return null;
    }
  }

  cookie(token: string): string {
    return `${ANONYMOUS_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Lax`;
  }

  private sign(payload: AnonymousAssessmentSession): string {
    return this.jwt.sign(payload, { secret: this.secret(), expiresIn: '8h' });
  }

  private secret(): string {
    return this.config.get<string>('JWT_SECRET') || 'development-only-secret-change-me';
  }

  private canonicalSource(_source: string): 'wordpress' {
    // This public entry point is intentionally dedicated to the WordPress CTA.
    // Never persist arbitrary attribution supplied by the browser.
    return 'wordpress';
  }

  private readCookie(header?: string): string | null {
    for (const part of (header || '').split(';')) {
      const [name, ...value] = part.trim().split('=');
      if (name === ANONYMOUS_COOKIE) return decodeURIComponent(value.join('='));
    }
    return null;
  }
}
