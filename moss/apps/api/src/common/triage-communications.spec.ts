import { describe, expect, it } from 'vitest';
import {
  CommunicationCallOutcome,
  CommunicationDirection,
  CommunicationMessageStatus,
  CommunicationMessageType,
} from '@prisma/client';
import {
  buildReferences,
  callOutcomeLabel,
  COMMUNICATION_ADMIN_ROLES,
  COMMUNICATION_READ_ROLES,
  COMMUNICATION_WRITE_ROLES,
  communicationStatusLabel,
  communicationTypeLabel,
  extractCorrelationToken,
  isValidEmail,
  messagePreview,
  parseMessageIdHeader,
  replySubject,
  sanitizeEmailHtml,
  splitQuotedReply,
} from './triage-communications';

describe('triage communications helpers', () => {
  it('validates email addresses', () => {
    expect(isValidEmail('client@company.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('builds message previews', () => {
    expect(messagePreview('  Hello   world  ')).toBe('Hello world');
    expect(messagePreview('x'.repeat(200), 160).endsWith('…')).toBe(true);
  });

  it('splits Gmail-style quoted replies', () => {
    const body = [
      'will come tomorrow',
      '',
      'On Wed, Sep 2, 2026 at 10:17 PM Physical Risk <sales@physicalrisk.com> wrote:',
      '',
      '> ok',
      '>',
    ].join('\n');
    const split = splitQuotedReply(body);
    expect(split.main).toBe('will come tomorrow');
    expect(split.quoted).toContain('On Wed, Sep 2, 2026');
    expect(messagePreview(body)).toBe('will come tomorrow');
  });

  it('labels communication status and types', () => {
    expect(communicationStatusLabel(CommunicationMessageStatus.FAILED)).toBe('Failed to send');
    expect(
      communicationTypeLabel(
        CommunicationMessageType.INBOUND_EMAIL,
        CommunicationDirection.INBOUND,
      ),
    ).toBe('Client replied');
    expect(callOutcomeLabel(CommunicationCallOutcome.NO_ANSWER)).toBe('No answer');
  });

  it('extracts correlation token from reply-to addresses', () => {
    expect(
      extractCorrelationToken(['reply+TRIAGE-abc123-x92k@physicalrisk.com', 'advisory@physicalrisk.com']),
    ).toBe('abc123-x92k');
    expect(extractCorrelationToken(['client@company.com'])).toBeNull();
  });

  it('parses RFC message-id headers', () => {
    expect(parseMessageIdHeader('<msg-1@domain.com> <msg-2@domain.com>')).toEqual([
      '<msg-1@domain.com>',
      '<msg-2@domain.com>',
    ]);
    expect(parseMessageIdHeader('msg-3@domain.com')).toEqual(['msg-3@domain.com']);
  });

  it('builds References chain for replies', () => {
    expect(buildReferences('<first@domain.com>', '<second@domain.com>')).toBe(
      '<first@domain.com> <second@domain.com>',
    );
    expect(buildReferences(undefined, 'third@domain.com')).toBe('<third@domain.com>');
  });

  it('prefixes reply subjects once', () => {
    expect(replySubject('Executive Governance Diagnostic')).toBe(
      'Re: Executive Governance Diagnostic',
    );
    expect(replySubject('Re: Executive Governance Diagnostic')).toBe(
      'Re: Executive Governance Diagnostic',
    );
  });

  it('sanitises dangerous HTML', () => {
    const html = '<p>Hi</p><script>alert(1)</script><a onclick="evil()">link</a>';
    const safe = sanitizeEmailHtml(html);
    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('onclick');
  });
});

describe('triage communications RBAC sets', () => {
  it('allows admins and analysts to read', () => {
    expect(COMMUNICATION_READ_ROLES.has('SUPER_ADMIN')).toBe(true);
    expect(COMMUNICATION_READ_ROLES.has('ANALYST')).toBe(true);
    expect(COMMUNICATION_READ_ROLES.has('AUDITOR')).toBe(true);
    expect(COMMUNICATION_READ_ROLES.has('CLIENT_EXECUTIVE')).toBe(false);
  });

  it('allows write for operational roles but not auditor', () => {
    expect(COMMUNICATION_WRITE_ROLES.has('ANALYST')).toBe(true);
    expect(COMMUNICATION_WRITE_ROLES.has('AUDITOR')).toBe(false);
    expect(COMMUNICATION_WRITE_ROLES.has('SALES')).toBe(true);
  });

  it('treats methodology admin as communication admin', () => {
    expect(COMMUNICATION_ADMIN_ROLES.has('METHODOLOGY_ADMIN')).toBe(true);
    expect(COMMUNICATION_ADMIN_ROLES.has('ANALYST')).toBe(false);
  });
});

describe('inbound thread matching order', () => {
  type Thread = { id: string; correlationToken: string };
  type Message = { internetMessageId: string | null; thread: Thread | null };

  function resolveThread(
    lookup: {
      byToken: (token: string) => Thread | null;
      byInternetMessageId: (id: string) => Message | null;
      byProviderMessageId: (id: string) => Message | null;
    },
    recipients: string[],
    inReplyTo?: string,
    references?: string,
    providerMessageId?: string,
  ) {
    const token = extractCorrelationToken(recipients);
    if (token) {
      const byToken = lookup.byToken(token);
      if (byToken) return { thread: byToken, via: 'token' as const };
    }

    const candidateIds = [
      ...parseMessageIdHeader(inReplyTo),
      ...parseMessageIdHeader(references),
    ];
    for (const messageId of candidateIds) {
      const prior = lookup.byInternetMessageId(messageId);
      if (prior?.thread) return { thread: prior.thread, via: 'headers' as const };
    }

    if (providerMessageId) {
      const prior = lookup.byProviderMessageId(providerMessageId);
      if (prior?.thread) return { thread: prior.thread, via: 'provider' as const };
    }

    return null;
  }

  const thread: Thread = { id: 'thread-1', correlationToken: 'lead1-abc' };

  it('matches through In-Reply-To header', () => {
    const result = resolveThread(
      {
        byToken: () => null,
        byInternetMessageId: (id) =>
          id === '<outbound@physicalrisk.com>' ? { internetMessageId: id, thread } : null,
        byProviderMessageId: () => null,
      },
      ['advisory@physicalrisk.com'],
      '<outbound@physicalrisk.com>',
    );
    expect(result?.via).toBe('headers');
    expect(result?.thread.id).toBe('thread-1');
  });

  it('matches through References header', () => {
    const result = resolveThread(
      {
        byToken: () => null,
        byInternetMessageId: (id) =>
          id === '<second@domain.com>' ? { internetMessageId: id, thread } : null,
        byProviderMessageId: () => null,
      },
      ['advisory@physicalrisk.com'],
      undefined,
      '<first@domain.com> <second@domain.com>',
    );
    expect(result?.via).toBe('headers');
  });

  it('matches through correlation token fallback', () => {
    const result = resolveThread(
      {
        byToken: (token) => (token === 'lead1-abc' ? thread : null),
        byInternetMessageId: () => null,
        byProviderMessageId: () => null,
      },
      ['reply+TRIAGE-lead1-abc@physicalrisk.com'],
    );
    expect(result?.via).toBe('token');
  });

  it('does not match unknown inbound email', () => {
    const result = resolveThread(
      {
        byToken: () => null,
        byInternetMessageId: () => null,
        byProviderMessageId: () => null,
      },
      ['random@company.com'],
    );
    expect(result).toBeNull();
  });
});
