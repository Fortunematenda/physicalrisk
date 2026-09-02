import {
  CommunicationCallOutcome,
  CommunicationDirection,
  CommunicationMessageStatus,
  CommunicationMessageType,
} from '@prisma/client';

export const COMMUNICATION_READ_ROLES = new Set([
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
  'AUDITOR',
]);

export const COMMUNICATION_WRITE_ROLES = new Set([
  'SUPER_ADMIN',
  'METHODOLOGY_ADMIN',
  'ANALYST',
  'REVIEWER',
  'SALES',
]);

export const COMMUNICATION_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'METHODOLOGY_ADMIN']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export function messagePreview(text?: string | null, max = 160) {
  const { main } = splitQuotedReply(text);
  const normalized = (main || text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

/**
 * Split a reply body into the new content and quoted history.
 * Handles Gmail "On … wrote:", Outlook original-message blocks, and `>` quote lines.
 */
export function splitQuotedReply(text?: string | null): { main: string; quoted: string } {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
  if (!normalized) return { main: '', quoted: '' };

  const onWrote = normalized.match(
    /^([\s\S]*?)\n+(On\s[\s\S]{0,300}?\bwrote:\s*(?:\n|$)[\s\S]*)$/i,
  );
  if (onWrote?.[1]?.trim()) {
    return { main: onWrote[1].trim(), quoted: onWrote[2].trim() };
  }

  const outlook = normalized.match(
    /^([\s\S]*?)\n+(-{2,}\s*Original Message\s*-{2,}[\s\S]*)$/i,
  );
  if (outlook?.[1]?.trim()) {
    return { main: outlook[1].trim(), quoted: outlook[2].trim() };
  }

  const fromBlock = normalized.match(/^([\s\S]*?)\n+(From:\s.+\n[\s\S]*)$/i);
  if (fromBlock?.[1]?.trim() && fromBlock[1].trim().length >= 1) {
    const main = fromBlock[1].trim();
    // Avoid cutting short bodies that legitimately mention "From:"
    if (main.length <= normalized.length * 0.95 && /\nSent:|\nTo:|\nSubject:/i.test(fromBlock[2])) {
      return { main, quoted: fromBlock[2].trim() };
    }
  }

  const lines = normalized.split('\n');
  let cut = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^On\s.+\bwrote:\s*$/i.test(line) || /^>/.test(line)) {
      cut = i;
      while (cut > 0 && !lines[cut - 1].trim()) cut -= 1;
      break;
    }
  }
  if (cut > 0) {
    return {
      main: lines.slice(0, cut).join('\n').trim(),
      quoted: lines.slice(cut).join('\n').trim(),
    };
  }

  return { main: normalized, quoted: '' };
}

export function communicationStatusLabel(status: CommunicationMessageStatus) {
  const map: Record<CommunicationMessageStatus, string> = {
    DRAFT: 'Draft',
    QUEUED: 'Queued',
    SENT: 'Sent',
    DELIVERED: 'Delivered',
    FAILED: 'Failed to send',
    RECEIVED: 'Received',
    BOUNCED: 'Bounced',
  };
  return map[status] || status;
}

export function communicationTypeLabel(type: CommunicationMessageType, direction: CommunicationDirection) {
  if (type === CommunicationMessageType.OUTBOUND_EMAIL) return 'Email sent';
  if (type === CommunicationMessageType.INBOUND_EMAIL) return 'Client replied';
  if (type === CommunicationMessageType.OUTBOUND_CALL) return 'Outbound call';
  if (type === CommunicationMessageType.INBOUND_CALL) return 'Inbound call';
  if (type === CommunicationMessageType.CALL_NOTE) return 'Call note';
  return 'System';
}

export function callOutcomeLabel(outcome?: CommunicationCallOutcome | null) {
  if (!outcome) return '—';
  const map: Record<CommunicationCallOutcome, string> = {
    CLIENT_REACHED: 'Client reached',
    NO_ANSWER: 'No answer',
    VOICEMAIL: 'Voicemail',
    WRONG_NUMBER: 'Wrong number',
    CALLBACK_REQUESTED: 'Call back requested',
    MEETING_ARRANGED: 'Meeting arranged',
    OTHER: 'Other',
  };
  return map[outcome] || outcome;
}

/** Extract TRIAGE correlation token from recipient addresses. */
export function extractCorrelationToken(recipients: string[]): string | null {
  for (const raw of recipients) {
    const value = String(raw || '').trim();
    const plusMatch = value.match(/TRIAGE-([A-Za-z0-9_-]+)/i);
    if (plusMatch?.[1]) return plusMatch[1];
  }
  return null;
}

/** Parse References / In-Reply-To header values into normalized message IDs. */
export function parseMessageIdHeader(value?: string | null): string[] {
  if (!value) return [];
  const matches = value.match(/<[^>]+>/g) || [];
  if (matches.length) return matches.map((m) => m.trim());
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildReferences(existing?: string | null, previousMessageId?: string | null) {
  const parts = parseMessageIdHeader(existing);
  if (previousMessageId) {
    const normalized = previousMessageId.startsWith('<') ? previousMessageId : `<${previousMessageId}>`;
    if (!parts.includes(normalized)) parts.push(normalized);
  }
  return parts.join(' ').trim() || undefined;
}

export function replySubject(subject?: string | null) {
  const base = (subject || '').trim();
  if (!base) return 'Re: Executive Governance Diagnostic';
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

export function sanitizeEmailHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
