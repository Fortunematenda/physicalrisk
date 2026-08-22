import archiver = require('archiver');
import { PassThrough } from 'node:stream';
import { assertZipBufferIntegrity, sha256Buffer } from './binary-integrity.util';

export type ZipArchiveEntry = {
  name: string;
  data: Buffer;
};

export type BuiltZipArchive = {
  buffer: Buffer;
  size: number;
  sha256: string;
  entryCount: number;
  archiveCompleted: true;
};

/**
 * Build a ZIP in memory with archiver.
 * Waits for finalize + output finish; validates EOCD before returning.
 * Never treats a truncated stream as success.
 */
export async function buildZipArchive(entries: ZipArchiveEntry[]): Promise<BuiltZipArchive> {
  if (!entries.length) {
    throw new Error('ZIP archive requires at least one entry');
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];

  const completed = new Promise<Buffer>((resolve, reject) => {
    pass.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    pass.on('error', reject);
    pass.on('finish', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.on('warning', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') return;
      reject(err);
    });
  });

  archive.pipe(pass);

  for (const entry of entries) {
    if (!Buffer.isBuffer(entry.data)) {
      throw new Error(`ZIP entry "${entry.name}" must be a Buffer — never UTF-8/JSON text`);
    }
    archive.append(entry.data, { name: entry.name.replace(/\\/g, '/') });
  }

  await archive.finalize();
  const buffer = await completed;
  const zipInfo = assertZipBufferIntegrity(buffer);

  return {
    buffer,
    size: buffer.length,
    sha256: sha256Buffer(buffer),
    entryCount: zipInfo.totalEntries,
    archiveCompleted: true,
  };
}
