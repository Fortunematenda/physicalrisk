import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Logger } from '@nestjs/common';
import { buildContentDisposition } from './content-disposition.util';
import type { FileIntegrityReport } from './binary-integrity.util';

const logger = new Logger('BinaryDownload');

export type StreamBinaryFileInput = {
  response: Response;
  absolutePath: string;
  fileName: string;
  mimeType: string;
  integrity: FileIntegrityReport;
  disposition?: 'inline' | 'attachment';
};

/**
 * Stream exact on-disk bytes to the client.
 * Never JSON-serializes binary; never uses text conversion.
 */
export async function streamBinaryFile(input: StreamBinaryFileInput): Promise<void> {
  const {
    response,
    absolutePath,
    fileName,
    mimeType,
    integrity,
    disposition = 'attachment',
  } = input;

  const contentType = mimeType || 'application/octet-stream';
  response.status(200);
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', String(integrity.size));
  response.setHeader('Content-Disposition', buildContentDisposition(disposition, fileName));
  response.setHeader('X-Checksum-Sha256', integrity.sha256);
  response.setHeader('Digest', `sha-256=${Buffer.from(integrity.sha256, 'hex').toString('base64')}`);
  response.setHeader('Cache-Control', 'no-store');
  if (integrity.zipEntryCount != null) {
    response.setHeader('X-Zip-Entry-Count', String(integrity.zipEntryCount));
  }

  logger.log({
    event: 'binary_download_start',
    fileName,
    mimeType: contentType,
    originalSize: integrity.size,
    outputSize: integrity.size,
    sourceChecksum: integrity.expectedSha256 || null,
    storedChecksum: integrity.sha256,
    downloadedExportChecksum: integrity.sha256,
    checksumMatch: integrity.checksumMatch,
    zipValid: integrity.zipValid ?? null,
    zipEntryCount: integrity.zipEntryCount ?? null,
    archiveCompletionStatus: integrity.zipValid === true ? 'valid_eocd' : 'n/a',
  });

  const stream = createReadStream(absolutePath);
  try {
    await pipeline(stream, response);
    logger.log({
      event: 'binary_download_complete',
      fileName,
      outputSize: integrity.size,
      storedChecksum: integrity.sha256,
      archiveCompletionStatus: integrity.zipValid === true ? 'valid_eocd' : 'streamed',
    });
  } catch (error) {
    logger.error({
      event: 'binary_download_failed',
      fileName,
      storedChecksum: integrity.sha256,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!response.headersSent) {
      throw error;
    }
    response.destroy(error instanceof Error ? error : undefined);
  }
}
