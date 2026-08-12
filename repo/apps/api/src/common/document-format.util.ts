import { extname } from 'path';

export type StoredDocumentFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'txt' | 'csv' | 'md' | 'zip' | 'png' | 'jpg' | 'other';

const OOXML_ZIP_MAGIC = Buffer.from('PK');

/** Prefer real file bytes + extension over ChatGPT's habitual application/pdf MIME. */
export function sniffDocumentFormat(input: {
  buffer?: Buffer;
  fileName?: string;
  mimeType?: string;
}): StoredDocumentFormat {
  const name = String(input.fileName || '').trim().toLowerCase();
  const ext = extname(name).replace('.', '');
  const mime = String(input.mimeType || '').trim().toLowerCase().split(';')[0].trim();
  const buffer = input.buffer;

  if (buffer && buffer.length >= 5 && buffer.subarray(0, 5).toString('utf8') === '%PDF-') {
    return 'pdf';
  }
  if (buffer && buffer.length >= 2 && buffer.subarray(0, 2).equals(OOXML_ZIP_MAGIC)) {
    const head = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('binary');
    if (head.includes('word/') || mime.includes('wordprocessingml') || ext === 'docx' || ext === 'doc') {
      return 'docx';
    }
    if (
      head.includes('xl/')
      || head.includes('worksheets')
      || mime.includes('spreadsheetml')
      || ext === 'xlsx'
      || ext === 'xls'
    ) {
      return 'xlsx';
    }
    if (
      head.includes('ppt/')
      || mime.includes('presentationml')
      || ext === 'pptx'
      || ext === 'ppt'
    ) {
      return 'pptx';
    }
    if (ext === 'zip' || mime.includes('zip')) return 'zip';
    // ZIP/OOXML body with a wrong .pdf name from ChatGPT — do not trust PDF.
    if (ext === 'pdf' || mime === 'application/pdf') {
      return 'zip';
    }
  }

  if (['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'md', 'zip', 'png', 'jpg', 'jpeg'].includes(ext)) {
    if (ext === 'jpeg') return 'jpg';
    return ext as StoredDocumentFormat;
  }
  if (ext === 'doc') return 'docx';
  if (ext === 'xls') return 'xlsx';
  if (ext === 'ppt') return 'pptx';

  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
  if (mime.includes('spreadsheetml') || mime.includes('ms-excel') || mime === 'text/csv') {
    return mime === 'text/csv' ? 'csv' : 'xlsx';
  }
  if (mime.includes('presentationml') || mime.includes('ms-powerpoint')) return 'pptx';
  if (mime === 'text/plain') return 'txt';
  if (mime === 'text/markdown') return 'md';
  if (mime.includes('zip')) return 'zip';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';

  return 'other';
}

export function mimeForStoredFormat(format: StoredDocumentFormat): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'md':
      return 'text/markdown';
    case 'zip':
      return 'application/zip';
    case 'png':
      return 'image/png';
    case 'jpg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

export function extensionForStoredFormat(format: StoredDocumentFormat): string {
  if (format === 'other') return 'bin';
  return format;
}

/** Align fileName + mimeType with sniffed/format intent before import queue. */
export function alignStoredFileIdentity(input: {
  buffer?: Buffer;
  fileName?: string;
  mimeType?: string;
  title?: string;
}): { fileName: string; mimeType: string; format: StoredDocumentFormat } {
  const format = sniffDocumentFormat(input);
  const ext = extensionForStoredFormat(format);
  const rawName = String(input.fileName || input.title || 'document').trim() || 'document';
  const withoutExt = rawName.replace(/\.[^.]+$/i, '');
  const safeBase = withoutExt
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim() || 'document';
  const fileName = format === 'other' && /\.[a-z0-9]+$/i.test(rawName)
    ? rawName
    : `${safeBase}.${ext}`;
  return {
    format,
    fileName,
    mimeType: format === 'other'
      ? (input.mimeType?.trim() || 'application/octet-stream')
      : mimeForStoredFormat(format),
  };
}
