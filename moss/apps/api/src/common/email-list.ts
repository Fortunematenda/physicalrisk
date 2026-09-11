import { BadRequestException } from '@nestjs/common';

/** Split / validate comma- or semicolon-separated email lists (proposal + org contacts). */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function extractEmailAddress(value: string) {
  const trimmed = String(value || '').trim();
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled ? angled[1] : trimmed).trim();
}

export function isValidEmailAddress(value: string) {
  return EMAIL_RE.test(extractEmailAddress(value));
}

export function parseEmailList(raw: string | null | undefined): string[] {
  return String(raw || '')
    .split(/[,;]+/)
    .map((part) => extractEmailAddress(part))
    .filter(Boolean);
}

export function normalizeEmailList(raw: string | null | undefined): string | null {
  const emails = parseEmailList(raw);
  if (!emails.length) return null;
  return emails.join('; ');
}

export function assertEmailList(
  raw: string | null | undefined,
  opts?: { required?: boolean; fieldLabel?: string },
): string[] {
  const label = opts?.fieldLabel || 'Email';
  const emails = parseEmailList(raw);
  if (!emails.length) {
    if (opts?.required) {
      throw new BadRequestException(`${label} is required.`);
    }
    return [];
  }
  const invalid = emails.find((email) => !isValidEmailAddress(email));
  if (invalid) {
    throw new BadRequestException(`Invalid email address: ${invalid}`);
  }
  return emails;
}

export function emailListIncludes(haystack: string | null | undefined, needle: string) {
  const target = extractEmailAddress(needle).toLowerCase();
  if (!target) return false;
  return parseEmailList(haystack).some((email) => email.toLowerCase() === target);
}
