import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ProposalTokenPayload = {
  purpose: 'triage_proposal';
  leadId: string;
  iat?: number;
  exp?: number;
};

/** Client-facing respond link for a specific sent proposal version. */
export type ProposalRespondTokenPayload = {
  purpose: 'proposal_respond';
  proposalId: string;
  publicLeadId: string;
  version: number;
  versionRevision: number;
  iat?: number;
  exp?: number;
};

const DEFAULT_TTL = '30d';
const RESPOND_TTL = '45d';

@Injectable()
export class ProposalTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  sign(leadId: string): string {
    return this.jwt.sign(
      { purpose: 'triage_proposal', leadId } satisfies ProposalTokenPayload,
      { secret: this.secret(), expiresIn: this.ttl() },
    );
  }

  /** Absolute public URL safe to embed in PDFs. */
  buildPublicUrl(leadId: string): string {
    const token = this.sign(leadId);
    return `${this.webBase()}/request-proposal?token=${encodeURIComponent(token)}`;
  }

  /** Opaque-ish JWT for client proposal response (accept / changes / decline). */
  signRespond(input: {
    proposalId: string;
    publicLeadId: string;
    version: number;
    versionRevision: number;
  }): string {
    return this.jwt.sign(
      {
        purpose: 'proposal_respond',
        proposalId: input.proposalId,
        publicLeadId: input.publicLeadId,
        version: input.version,
        versionRevision: input.versionRevision,
      } satisfies ProposalRespondTokenPayload,
      { secret: this.secret(), expiresIn: this.respondTtl() },
    );
  }

  buildRespondUrl(input: {
    proposalId: string;
    publicLeadId: string;
    version: number;
    versionRevision: number;
  }): string {
    const token = this.signRespond(input);
    return `${this.webBase()}/proposal/respond?token=${encodeURIComponent(token)}`;
  }

  /** Random opaque token stored on the proposal row (secondary lookup / revoke). */
  mintOpaqueResponseToken(): string {
    return randomBytes(32).toString('base64url');
  }

  verify(token: string): ProposalTokenPayload {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('This proposal link is invalid or has expired.');
    try {
      const payload = this.jwt.verify<ProposalTokenPayload>(raw, { secret: this.secret() });
      if (payload?.purpose !== 'triage_proposal' || !payload.leadId) {
        throw new Error('invalid purpose');
      }
      return payload;
    } catch {
      throw new BadRequestException('This proposal link is invalid or has expired.');
    }
  }

  verifyRespond(token: string): ProposalRespondTokenPayload {
    const raw = String(token || '').trim();
    if (!raw) throw new BadRequestException('This proposal link is invalid or has expired.');
    try {
      const payload = this.jwt.verify<ProposalRespondTokenPayload>(raw, { secret: this.secret() });
      if (
        payload?.purpose !== 'proposal_respond'
        || !payload.proposalId
        || !payload.publicLeadId
      ) {
        throw new Error('invalid purpose');
      }
      return payload;
    } catch {
      throw new BadRequestException('This proposal link is invalid or has expired.');
    }
  }

  /** Constant-time compare helper for tests / future opaque tokens. */
  safeEqual(a: string, b: string): boolean {
    const left = createHmac('sha256', this.secret()).update(a).digest();
    const right = createHmac('sha256', this.secret()).update(b).digest();
    return timingSafeEqual(left, right);
  }

  webBase(): string {
    return (
      this.config.get<string>('PUBLIC_URL') ||
      this.config.get<string>('WEB_URL') ||
      this.config.get<string>('MOSS_WEB_URL') ||
      'http://localhost:3001'
    ).replace(/\/$/, '');
  }

  private secret(): string {
    return (
      this.config.get<string>('PROPOSAL_TOKEN_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      'development-only-secret-change-me'
    );
  }

  private ttl(): string {
    return this.config.get<string>('PROPOSAL_TOKEN_TTL') || DEFAULT_TTL;
  }

  private respondTtl(): string {
    return this.config.get<string>('PROPOSAL_RESPOND_TOKEN_TTL') || RESPOND_TTL;
  }
}
