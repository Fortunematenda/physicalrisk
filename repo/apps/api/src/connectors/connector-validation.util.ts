import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import { FileType } from '../database/entities';

export function sanitizeConnectorFileName(fileName: string): string {
  const cleaned = String(fileName ?? '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-').replace(/[. ]+$/g, '').replace(/^-+|-+$/g, '');
  return cleaned || 'document';
}

export function assertMimeTypeAllowed(mimeType: string, fileType: FileType, fileName: string) {
  const extension = extname(fileName).replace('.', '').toLowerCase();
  const declaredMime = String(mimeType || '').trim().toLowerCase().split(';')[0].trim();
  const allowedMimes = (fileType.mimeTypes ?? [])
    .map((item) => String(item).trim().toLowerCase().split(';')[0].trim())
    .filter(Boolean);
  if (!allowedMimes.length || !declaredMime || declaredMime === 'application/octet-stream') return;
  const mimeAllowed = allowedMimes.some((allowed) => {
    if (allowed.endsWith('/*')) return declaredMime.startsWith(allowed.slice(0, -1));
    return allowed === declaredMime;
  });
  if (!mimeAllowed) {
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
