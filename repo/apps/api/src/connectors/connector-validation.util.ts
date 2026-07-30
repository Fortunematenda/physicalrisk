import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import { FileType } from '../database/entities';

/** Browser/OS aliases that should match the same configured MIME type. */
const MIME_ALIASES: Record<string, string[]> = {
  'application/zip': ['application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip'],
  'application/x-zip-compressed': ['application/zip', 'application/x-zip', 'multipart/x-zip'],
  'image/jpeg': ['image/jpg'],
  'image/jpg': ['image/jpeg'],
  'text/markdown': ['text/x-markdown'],
  'text/x-markdown': ['text/markdown'],
};

export function sanitizeConnectorFileName(fileName: string): string {
  const cleaned = String(fileName ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-').replace(/[. ]+$/g, '').replace(/^-+|-+$/g, '');
  return cleaned || 'document';
}

export function mimeTypeAllowed(declaredMime: string, allowedMimes: string[]): boolean {
  const declared = String(declaredMime || '').trim().toLowerCase().split(';')[0].trim();
  const allowed = allowedMimes
    .map((item) => String(item).trim().toLowerCase().split(';')[0].trim())
    .filter(Boolean);
  if (!allowed.length || !declared || declared === 'application/octet-stream') return true;
  const candidates = new Set([declared, ...(MIME_ALIASES[declared] ?? [])]);
  return allowed.some((entry) => {
    if (entry.endsWith('/*')) {
      const prefix = entry.slice(0, -1);
      return [...candidates].some((candidate) => candidate.startsWith(prefix));
    }
    return candidates.has(entry) || (MIME_ALIASES[entry] ?? []).some((alias) => candidates.has(alias));
  });
}

export function assertMimeTypeAllowed(mimeType: string, fileType: FileType, fileName: string) {
  const extension = extname(fileName).replace('.', '').toLowerCase();
  const declaredMime = String(mimeType || '').trim().toLowerCase().split(';')[0].trim();
  const allowedMimes = (fileType.mimeTypes ?? [])
    .map((item) => String(item).trim().toLowerCase().split(';')[0].trim())
    .filter(Boolean);
  if (!mimeTypeAllowed(declaredMime, allowedMimes)) {
    throw new BadRequestException(
      `MIME type '${declaredMime}' is not allowed for .${extension || 'unknown'} files (allowed: ${allowedMimes.join(', ')})`,
    );
  }
}

export function assertFileSizeAllowed(fileSize: number, fileType: FileType) {
  if (fileSize > fileType.maxSizeMb * 1024 * 1024) {
    throw new BadRequestException(`File exceeds the ${fileType.maxSizeMb} MB limit`);
  }
}
