import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // PK\x05\x06

export type ZipEocdInfo = {
  eocdOffset: number;
  totalEntries: number;
  size: number;
};

export type FileIntegrityReport = {
  absolutePath: string;
  size: number;
  sha256: string;
  expectedSha256?: string | null;
  checksumMatch: boolean | null;
  zipValid?: boolean;
  zipEntryCount?: number;
};

/** SHA-256 of an in-memory buffer (never stringify first). */
export function sha256Buffer(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** SHA-256 of a file on disk via binary stream (no text decode). */
export async function sha256File(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(absolutePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Locate the ZIP End of Central Directory record.
 * A valid archive must contain this signature; truncated downloads fail here.
 */
export function findZipEndOfCentralDirectory(buffer: Buffer): ZipEocdInfo {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw new BadRequestException('Corrupted zip: can\'t find end of central directory');
  }
  const scanFrom = Math.max(0, buffer.length - 65_536);
  for (let i = buffer.length - 22; i >= scanFrom; i -= 1) {
    if (
      buffer[i] === EOCD_SIG[0]
      && buffer[i + 1] === EOCD_SIG[1]
      && buffer[i + 2] === EOCD_SIG[2]
      && buffer[i + 3] === EOCD_SIG[3]
    ) {
      const totalEntries = buffer.readUInt16LE(i + 10);
      return { eocdOffset: i, totalEntries, size: buffer.length };
    }
  }
  throw new BadRequestException('Corrupted zip: can\'t find end of central directory');
}

export function assertZipBufferIntegrity(buffer: Buffer): ZipEocdInfo {
  const info = findZipEndOfCentralDirectory(buffer);
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestException('Corrupted zip: missing local file header signature');
  }
  return info;
}

/** Validate ZIP EOCD on disk without loading the entire file when possible. */
export async function assertZipFileIntegrity(absolutePath: string): Promise<ZipEocdInfo> {
  const fileStat = await stat(absolutePath);
  if (fileStat.size < 22) {
    throw new BadRequestException('Corrupted zip: can\'t find end of central directory');
  }
  const readSize = Math.min(fileStat.size, 65_536);
  const fd = await open(absolutePath, 'r');
  try {
    const buf = Buffer.alloc(readSize);
    await fd.read(buf, 0, readSize, fileStat.size - readSize);
    const info = findZipEndOfCentralDirectory(buf);
    // Adjust offset relative to full file when we only read a tail window.
    const eocdOffset = fileStat.size - readSize + info.eocdOffset;
    return { eocdOffset, totalEntries: info.totalEntries, size: fileStat.size };
  } finally {
    await fd.close();
  }
}

export function isZipLike(fileName?: string | null, mimeType?: string | null): boolean {
  const name = String(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  return name.endsWith('.zip') || mime.includes('zip');
}

/**
 * Verify on-disk bytes against the stored repository checksum.
 * APPROVED/IMPORTED alone does not prove binary completeness.
 */
export async function verifyStoredBinaryIntegrity(input: {
  absolutePath: string;
  expectedSha256?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<FileIntegrityReport> {
  const fileStat = await stat(input.absolutePath);
  const sha256 = await sha256File(input.absolutePath);
  const expected = input.expectedSha256?.trim().toLowerCase() || null;
  const usableExpected = expected && expected !== 'draft' && /^[a-f0-9]{64}$/.test(expected) ? expected : null;
  const checksumMatch = usableExpected ? usableExpected === sha256 : null;

  if (usableExpected && !checksumMatch) {
    throw new UnprocessableEntityException({
      code: 'FILE_INTEGRITY_MISMATCH',
      message:
        'Stored binary does not match the recorded SHA-256 checksum. '
        + 'Download blocked — APPROVED/IMPORTED status does not prove binary integrity.',
      expectedSha256: usableExpected,
      storedSha256: sha256,
      size: fileStat.size,
    });
  }

  const report: FileIntegrityReport = {
    absolutePath: input.absolutePath,
    size: fileStat.size,
    sha256,
    expectedSha256: usableExpected,
    checksumMatch,
  };

  if (isZipLike(input.fileName, input.mimeType)) {
    const zip = await assertZipFileIntegrity(input.absolutePath);
    report.zipValid = true;
    report.zipEntryCount = zip.totalEntries;
  }

  return report;
}
