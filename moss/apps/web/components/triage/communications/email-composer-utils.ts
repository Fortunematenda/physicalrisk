export type EmailDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  message: string;
};

export type ComposeMode = 'new' | 'reply' | 'reply-all' | 'forward';

export const FROM_NAME = 'Physical Risk';
export const FROM_EMAIL = 'sales@physicalrisk.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export function parseRecipientList(raw: string) {
  return raw
    .split(/[,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function validateRecipients(raw: string, required = false) {
  const items = parseRecipientList(raw);
  if (required && items.length === 0) return 'At least one recipient is required.';
  const invalid = items.find((item) => {
    const match = item.match(/<([^>]+)>/);
    const email = (match ? match[1] : item).trim();
    return !isValidEmail(email);
  });
  if (invalid) return `Invalid email address: ${invalid}`;
  return null;
}

export function formatRecipientChip(name: string, email: string) {
  if (!email) return name;
  if (!name || name === email) return email;
  return `${name} <${email}>`;
}

export function extractEmailFromChip(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

export function buildDefaultSubject(triageReference?: string) {
  if (triageReference) {
    return `Physical Risk Executive Governance Triage | ${triageReference}`;
  }
  return 'Executive Governance Triage – Follow-up';
}

export function replySubject(subject: string) {
  const trimmed = subject.trim();
  if (!trimmed) return 'Re:';
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

export function forwardSubject(subject: string) {
  const trimmed = subject.trim();
  if (!trimmed) return 'Fwd:';
  if (/^fwd:/i.test(trimmed)) return trimmed;
  return `Fwd: ${trimmed}`;
}

export function draftStorageKey(submissionId: string) {
  return `moss-triage-email-draft-${submissionId}`;
}

export function loadLocalDraft(submissionId: string): EmailDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftStorageKey(submissionId));
    if (!raw) return null;
    return JSON.parse(raw) as EmailDraft;
  } catch {
    return null;
  }
}

export function saveLocalDraft(submissionId: string, draft: EmailDraft) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(draftStorageKey(submissionId), JSON.stringify(draft));
}

export function clearLocalDraft(submissionId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(draftStorageKey(submissionId));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SAFE_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function isSafeAttachment(file: File) {
  if (file.size > 25 * 1024 * 1024) return false;
  if (!file.type) return true;
  return SAFE_ATTACHMENT_TYPES.has(file.type);
}

export function insertAtCursor(textarea: HTMLTextAreaElement | null, current: string, insert: string) {
  if (!textarea) return `${current}${insert}`;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
  const cursor = start + insert.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
  return next;
}

export function wrapSelection(
  textarea: HTMLTextAreaElement | null,
  current: string,
  before: string,
  after: string,
) {
  if (!textarea) return `${current}${before}text${after}`;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = current.slice(start, end) || 'text';
  const next = `${current.slice(0, start)}${before}${selected}${after}${current.slice(end)}`;
  const cursor = start + before.length + selected.length + after.length;
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
  return next;
}

export function prefixLines(text: string, prefix: string) {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function buildUserSignature(firstName?: string, lastName?: string) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const lines = ['Kind regards,', ''];
  if (name) lines.push(name);
  lines.push('Physical Risk', 'Executive Risk Advisory');
  return lines.join('\n');
}
