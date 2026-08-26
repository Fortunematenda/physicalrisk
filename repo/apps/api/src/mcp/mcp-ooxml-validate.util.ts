import { extname } from 'node:path';
import { open, readFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

const DEFAULT_MAX_ENTRY_COUNT = 10_000;
const ZIP_LOCAL_SIG = 0x04034b50;
const ZIP_CENTRAL_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;

export type OoxmlKind = 'docx' | 'xlsx' | 'pptx';

export type ZipSignatureResult = { ok: boolean; detail?: string };
export type OoxmlValidateResult = { ok: boolean; details: string[] };
export type PdfSignatureResult = { ok: boolean; detail?: string };
export type StoredBinaryValidateResult = {
  ok: boolean;
  detectedKind: string;
  details: string[];
  mimeType?: string;
};

const REQUIRED_ENTRIES: Record<OoxmlKind, string[]> = {
  docx: ['[Content_Types].xml', 'word/document.xml'],
  xlsx: ['[Content_Types].xml', 'xl/workbook.xml'],
  pptx: ['[Content_Types].xml', 'ppt/presentation.xml'],
};

const MIME_BY_KIND: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
};

export function validateZipSignature(buf: Buffer): ZipSignatureResult {
  if (!buf || buf.length < 4) {
    return { ok: false, detail: 'Buffer too short for ZIP signature' };
  }
  const sig = buf.readUInt32LE(0);
  if (sig !== ZIP_LOCAL_SIG && sig !== ZIP_CENTRAL_SIG) {
    return { ok: false, detail: 'Missing PK ZIP local/central signature' };
  }
  return { ok: true };
}

/**
 * Scan ZIP central-directory entry names without inflating payload
 * (names are stored uncompressed in the CD).
 */
export function listZipCentralDirectoryNames(
  buf: Buffer,
  opts?: { maxEntries?: number },
): { ok: boolean; names: string[]; details: string[] } {
  const details: string[] = [];
  const maxEntries = opts?.maxEntries ?? Number(process.env.MCP_OOXML_MAX_ENTRY_COUNT || DEFAULT_MAX_ENTRY_COUNT);

  const zipSig = validateZipSignature(buf);
  if (!zipSig.ok) {
    return { ok: false, names: [], details: [zipSig.detail || 'Invalid ZIP'] };
  }

  const eocdOffset = findEndOfCentralDirectory(buf);
  if (eocdOffset < 0) {
    return { ok: false, names: [], details: ['End of central directory not found'] };
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  if (totalEntries > maxEntries) {
    return {
      ok: false,
      names: [],
      details: [`ZIP entry count ${totalEntries} exceeds max ${maxEntries}`],
    };
  }
  if (cdOffset + cdSize > buf.length) {
    return { ok: false, names: [], details: ['Central directory extends past end of buffer'] };
  }

  const names: string[] = [];
  let offset = cdOffset;
  const end = cdOffset + cdSize;

  while (offset + 46 <= end && names.length < totalEntries) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== ZIP_CENTRAL_SIG) {
      details.push(`Unexpected central directory signature at offset ${offset}`);
      return { ok: false, names, details };
    }
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buf.length) {
      details.push('Central directory file name extends past buffer');
      return { ok: false, names, details };
    }
    names.push(buf.subarray(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLen + commentLen;
  }

  if (names.length !== totalEntries) {
    details.push(`Parsed ${names.length} CD entries, expected ${totalEntries}`);
  }

  return { ok: details.length === 0, names, details };
}

export function validateOoxmlPackage(buf: Buffer, kind: OoxmlKind): OoxmlValidateResult {
  const details: string[] = [];
  const zipSig = validateZipSignature(buf);
  if (!zipSig.ok) {
    return { ok: false, details: [zipSig.detail || 'Invalid ZIP signature'] };
  }

  const listed = listZipCentralDirectoryNames(buf);
  if (!listed.ok && listed.names.length === 0) {
    // Fallback: uncompressed name scan for minimal test ZIPs / truncated CD
    const haystack = buf.toString('binary');
    const required = REQUIRED_ENTRIES[kind];
    const missingFallback = required.filter((entry) => !haystack.includes(entry));
    if (missingFallback.length) {
      return {
        ok: false,
        details: [...listed.details, `Missing required OOXML paths: ${missingFallback.join(', ')}`],
      };
    }
    details.push(...listed.details);
    details.push('Used fallback uncompressed name scan');
    return { ok: true, details };
  }

  details.push(...listed.details);
  const nameSet = new Set(listed.names.map((n) => n.replace(/^\/+/, '')));
  const required = REQUIRED_ENTRIES[kind];
  const missing = required.filter((entry) => !nameSet.has(entry) && !listed.names.some((n) => n.endsWith(entry)));
  if (missing.length) {
    // Last resort: local-header / payload string presence (names also appear in local headers)
    const haystack = buf.toString('binary');
    const stillMissing = missing.filter((entry) => !haystack.includes(entry));
    if (stillMissing.length) {
      return {
        ok: false,
        details: [...details, `Missing required OOXML paths: ${stillMissing.join(', ')}`],
      };
    }
    details.push(`Required paths found via buffer scan: ${missing.join(', ')}`);
  }

  return { ok: true, details };
}

export function validatePdfSignature(buf: Buffer): PdfSignatureResult {
  if (!buf || buf.length < 5) {
    return { ok: false, detail: 'Buffer too short for PDF signature' };
  }
  const head = buf.subarray(0, 5).toString('utf8');
  if (head !== '%PDF-') {
    return { ok: false, detail: 'Missing %PDF- signature' };
  }
  return { ok: true };
}

/**
 * Validate stored binary for FILE_PRESERVE. Rejects Markdown/HTML disguised as Office.
 */
export function validateStoredBinary(
  buf: Buffer,
  fileName: string,
): StoredBinaryValidateResult {
  const details: string[] = [];
  const ext = extname(String(fileName || '').trim()).replace('.', '').toLowerCase();
  const officeExt = ext === 'docx' || ext === 'xlsx' || ext === 'pptx';

  if (officeExt && looksLikeMarkdownOrHtml(buf)) {
    return {
      ok: false,
      detectedKind: 'markdown_or_html',
      details: [
        `Content looks like Markdown/HTML/plain text but extension is .${ext}`,
        'Never convert Markdown to Office for FILE_PRESERVE binary import',
      ],
    };
  }

  if (ext === 'pdf') {
    const pdf = validatePdfSignature(buf);
    if (!pdf.ok) {
      return { ok: false, detectedKind: 'unknown', details: [pdf.detail || 'Invalid PDF'], mimeType: undefined };
    }
    return { ok: true, detectedKind: 'pdf', details, mimeType: MIME_BY_KIND.pdf };
  }

  if (officeExt) {
    const zip = validateZipSignature(buf);
    if (!zip.ok) {
      return {
        ok: false,
        detectedKind: looksLikeMarkdownOrHtml(buf) ? 'markdown_or_html' : 'unknown',
        details: [zip.detail || 'Not a ZIP/OOXML package', `Expected PK signature for .${ext}`],
      };
    }
    const ooxml = validateOoxmlPackage(buf, ext as OoxmlKind);
    if (!ooxml.ok) {
      return {
        ok: false,
        detectedKind: 'corrupted_ooxml',
        details: ooxml.details,
      };
    }
    return {
      ok: true,
      detectedKind: ext,
      details: [...details, ...ooxml.details],
      mimeType: MIME_BY_KIND[ext],
    };
  }

  // Generic binary: accept with sniffed kind when possible
  if (validatePdfSignature(buf).ok) {
    return { ok: true, detectedKind: 'pdf', details, mimeType: MIME_BY_KIND.pdf };
  }
  if (validateZipSignature(buf).ok) {
    for (const kind of ['docx', 'xlsx', 'pptx'] as OoxmlKind[]) {
      const ooxml = validateOoxmlPackage(buf, kind);
      if (ooxml.ok) {
        return {
          ok: true,
          detectedKind: kind,
          details: ooxml.details,
          mimeType: MIME_BY_KIND[kind],
        };
      }
    }
    return { ok: true, detectedKind: 'zip', details, mimeType: 'application/zip' };
  }

  details.push(`Unrecognized binary for fileName=${fileName || '(none)'}`);
  return { ok: false, detectedKind: 'other', details };
}

export function looksLikeMarkdownOrHtml(buf: Buffer): boolean {
  if (!buf?.length) return false;
  // OOXML / ZIP never looks like this at the start
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return false;
  if (buf.length >= 5 && buf.subarray(0, 5).toString('utf8') === '%PDF-') return false;

  const sampleLen = Math.min(buf.length, 512);
  const sample = buf.subarray(0, sampleLen).toString('utf8');
  const trimmed = sample.replace(/^\uFEFF/, '').trimStart();
  if (!trimmed) return false;

  if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed.startsWith('### ')) return true;
  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return true;
  if (/^```/.test(trimmed)) return true;
  // High ratio of printable ASCII / newlines without null bytes → likely text
  let printable = 0;
  let nulls = 0;
  for (let i = 0; i < sampleLen; i += 1) {
    const c = buf[i];
    if (c === 0) nulls += 1;
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable += 1;
  }
  if (nulls > 0) return false;
  if (printable / sampleLen > 0.95 && /[\n\r]/.test(sample) && /[a-zA-Z]{3,}/.test(sample)) {
    return true;
  }
  return false;
}

const FULL_VALIDATE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Validate a FILE_PRESERVE candidate on disk. Small files are read whole;
 * larger files only load the ZIP head + central directory (no inflate).
 */
export async function validateStoredBinaryFromFile(
  filePath: string,
  fileName: string,
): Promise<StoredBinaryValidateResult> {
  const fh = await open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    if (size <= 0) {
      return { ok: false, detectedKind: 'other', details: ['Empty file'] };
    }
    if (size <= FULL_VALIDATE_MAX_BYTES) {
      const buf = await readFile(filePath);
      return validateStoredBinary(buf, fileName);
    }

    const headLen = Math.min(size, 512);
    const head = Buffer.alloc(headLen);
    await fh.read(head, 0, headLen, 0);

    const ext = extname(String(fileName || '').trim()).replace('.', '').toLowerCase();
    const officeExt = ext === 'docx' || ext === 'xlsx' || ext === 'pptx';

    if (officeExt && looksLikeMarkdownOrHtml(head)) {
      return {
        ok: false,
        detectedKind: 'markdown_or_html',
        details: [
          `Content looks like Markdown/HTML/plain text but extension is .${ext}`,
          'Never convert Markdown to Office for FILE_PRESERVE binary import',
        ],
      };
    }

    if (ext === 'pdf') {
      const pdf = validatePdfSignature(head);
      if (!pdf.ok) {
        return { ok: false, detectedKind: 'unknown', details: [pdf.detail || 'Invalid PDF'] };
      }
      return { ok: true, detectedKind: 'pdf', details: [], mimeType: MIME_BY_KIND.pdf };
    }

    if (officeExt) {
      const zip = validateZipSignature(head);
      if (!zip.ok) {
        return {
          ok: false,
          detectedKind: looksLikeMarkdownOrHtml(head) ? 'markdown_or_html' : 'unknown',
          details: [zip.detail || 'Not a ZIP/OOXML package', `Expected PK signature for .${ext}`],
        };
      }
      const listed = await listZipCentralDirectoryNamesFromFile(fh, size);
      if (!listed.ok && listed.names.length === 0) {
        return {
          ok: false,
          detectedKind: 'corrupted_ooxml',
          details: listed.details.length ? listed.details : ['Could not read ZIP central directory'],
        };
      }
      const nameSet = new Set(listed.names.map((n) => n.replace(/^\/+/, '')));
      const required = REQUIRED_ENTRIES[ext as OoxmlKind];
      const missing = required.filter(
        (entry) => !nameSet.has(entry) && !listed.names.some((n) => n.endsWith(entry)),
      );
      if (missing.length) {
        return {
          ok: false,
          detectedKind: 'corrupted_ooxml',
          details: [...listed.details, `Missing required OOXML paths: ${missing.join(', ')}`],
        };
      }
      return {
        ok: true,
        detectedKind: ext,
        details: listed.details,
        mimeType: MIME_BY_KIND[ext],
      };
    }

    return { ok: false, detectedKind: 'other', details: [`Unrecognized binary for fileName=${fileName}`] };
  } finally {
    await fh.close();
  }
}

async function listZipCentralDirectoryNamesFromFile(
  fh: FileHandle,
  size: number,
  opts?: { maxEntries?: number },
): Promise<{ ok: boolean; names: string[]; details: string[] }> {
  const details: string[] = [];
  const maxEntries = opts?.maxEntries ?? Number(process.env.MCP_OOXML_MAX_ENTRY_COUNT || DEFAULT_MAX_ENTRY_COUNT);
  const tailLen = Math.min(size, 22 + 65_535);
  const tail = Buffer.alloc(tailLen);
  await fh.read(tail, 0, tailLen, size - tailLen);
  const eocdRel = findEndOfCentralDirectory(tail);
  if (eocdRel < 0) {
    return { ok: false, names: [], details: ['End of central directory not found'] };
  }
  const totalEntries = tail.readUInt16LE(eocdRel + 10);
  const cdSize = tail.readUInt32LE(eocdRel + 12);
  const cdOffset = tail.readUInt32LE(eocdRel + 16);
  if (totalEntries > maxEntries) {
    return { ok: false, names: [], details: [`ZIP entry count ${totalEntries} exceeds max ${maxEntries}`] };
  }
  if (cdOffset + cdSize > size) {
    return { ok: false, names: [], details: ['Central directory extends past end of file'] };
  }
  const cd = Buffer.alloc(cdSize);
  await fh.read(cd, 0, cdSize, cdOffset);

  const names: string[] = [];
  let offset = 0;
  while (offset + 46 <= cd.length && names.length < totalEntries) {
    const sig = cd.readUInt32LE(offset);
    if (sig !== ZIP_CENTRAL_SIG) {
      details.push(`Unexpected central directory signature at offset ${offset}`);
      return { ok: false, names, details };
    }
    const nameLen = cd.readUInt16LE(offset + 28);
    const extraLen = cd.readUInt16LE(offset + 30);
    const commentLen = cd.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > cd.length) {
      details.push('Central directory file name extends past buffer');
      return { ok: false, names, details };
    }
    names.push(cd.subarray(nameStart, nameEnd).toString('utf8'));
    offset = nameEnd + extraLen + commentLen;
  }
  if (names.length !== totalEntries) {
    details.push(`Parsed ${names.length} CD entries, expected ${totalEntries}`);
  }
  return { ok: details.length === 0, names, details };
}

function findEndOfCentralDirectory(buf: Buffer): number {
  // EOCD is at least 22 bytes; comment can be up to 65535
  const min = Math.max(0, buf.length - (22 + 65535));
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === ZIP_EOCD_SIG) return i;
  }
  return -1;
}
