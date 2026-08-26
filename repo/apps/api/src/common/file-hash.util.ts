import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

/** Stream SHA-256 of a file without loading it entirely into memory. */
export async function sha256AndSize(filePath: string): Promise<{ sha256: string; size: number }> {
  const info = await stat(filePath);
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return { sha256: hash.digest('hex'), size: info.size };
}
