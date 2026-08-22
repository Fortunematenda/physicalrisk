import { createHash } from 'node:crypto';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertZipBufferIntegrity,
  findZipEndOfCentralDirectory,
  sha256Buffer,
  sha256File,
  verifyStoredBinaryIntegrity,
} from './binary-integrity.util';
import { buildZipArchive } from './zip-archive.util';

describe('binary integrity + zip archive', () => {
  it('detects missing ZIP end of central directory', () => {
    const truncated = Buffer.from('PK\x03\x04not-a-complete-zip');
    expect(() => findZipEndOfCentralDirectory(truncated)).toThrow(/end of central directory/i);
  });

  it('builds a ZIP with archiver, waits for finalize, and validates EOCD', async () => {
    const built = await buildZipArchive([
      { name: 'readme.txt', data: Buffer.from('hello repository', 'utf8') },
      { name: 'data/bin.dat', data: Buffer.from([0x00, 0x01, 0xff, 0x50, 0x4b]) },
    ]);
    expect(built.archiveCompleted).toBe(true);
    expect(built.entryCount).toBe(2);
    expect(built.size).toBe(built.buffer.length);
    expect(built.sha256).toBe(sha256Buffer(built.buffer));
    expect(() => assertZipBufferIntegrity(built.buffer)).not.toThrow();
    expect(built.buffer.subarray(0, 2).toString('binary')).toBe('PK');
  });

  it('never treats UTF-8 string reconstruction as binary identity', async () => {
    const original = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    const corrupted = Buffer.from(original.toString('utf8'), 'utf8');
    expect(sha256Buffer(original)).not.toBe(sha256Buffer(corrupted));
  });

  it('verifies on-disk SHA-256 against the stored checksum', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-bin-'));
    const path = join(dir, 'bundle.zip');
    try {
      const built = await buildZipArchive([{ name: 'a.txt', data: Buffer.from('ok') }]);
      await writeFile(path, built.buffer);
      const report = await verifyStoredBinaryIntegrity({
        absolutePath: path,
        expectedSha256: built.sha256,
        fileName: 'bundle.zip',
        mimeType: 'application/zip',
      });
      expect(report.checksumMatch).toBe(true);
      expect(report.zipValid).toBe(true);
      expect(report.zipEntryCount).toBe(1);
      expect(await sha256File(path)).toBe(built.sha256);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('blocks download when stored checksum does not match bytes on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'repo-bin-'));
    const path = join(dir, 'broken.bin');
    try {
      await writeFile(path, Buffer.from('not-matching'));
      await expect(
        verifyStoredBinaryIntegrity({
          absolutePath: path,
          expectedSha256: createHash('sha256').update('other').digest('hex'),
          fileName: 'broken.bin',
          mimeType: 'application/octet-stream',
        }),
      ).rejects.toMatchObject({ response: { code: 'FILE_INTEGRITY_MISMATCH' } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
