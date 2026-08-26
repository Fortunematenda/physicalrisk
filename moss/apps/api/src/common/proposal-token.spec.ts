import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProposalTokenService } from './proposal-token.service';

describe('ProposalTokenService', () => {
  function service(secret = 'unit-test-proposal-secret') {
    const jwt = {
      sign: vi.fn((_payload: unknown, opts: { secret: string; expiresIn: string }) => {
        expect(opts.secret).toBe(secret);
        expect(opts.expiresIn).toBe('30d');
        return 'signed.jwt.token';
      }),
      verify: vi.fn((token: string) => {
        if (token !== 'signed.jwt.token') throw new Error('bad');
        return { purpose: 'triage_proposal', leadId: 'lead_123' };
      }),
    };
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'PROPOSAL_TOKEN_SECRET') return secret;
        if (key === 'PUBLIC_URL') return 'https://moss.example';
        return undefined;
      }),
    };
    return new ProposalTokenService(jwt as any, config as any);
  }

  it('signs and builds a public URL without exposing the lead id in the path', () => {
    const svc = service();
    const url = svc.buildPublicUrl('lead_123');
    expect(url).toBe('https://moss.example/request-proposal?token=signed.jwt.token');
    expect(url).not.toContain('lead_123');
  });

  it('verifies a valid token', () => {
    const svc = service();
    expect(svc.verify('signed.jwt.token')).toEqual({ purpose: 'triage_proposal', leadId: 'lead_123' });
  });

  it('rejects invalid tokens with a safe message', () => {
    const svc = service();
    expect(() => svc.verify('tampered')).toThrow(BadRequestException);
  });

  it('rejects empty tokens', () => {
    const svc = service();
    expect(() => svc.verify('')).toThrow(BadRequestException);
  });
});
