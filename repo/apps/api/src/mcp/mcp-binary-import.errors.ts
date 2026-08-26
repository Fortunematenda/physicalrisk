import { BadRequestException } from '@nestjs/common';

/** Structured error codes for ChatGPT MCP automatic binary FILE_PRESERVE import. */
export const BinaryImportErrorCode = {
  ATTACHMENT_REFERENCE_UNAVAILABLE: 'ATTACHMENT_REFERENCE_UNAVAILABLE',
  AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST: 'AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST',
  ATTACHMENT_REFERENCE_EXPIRED: 'ATTACHMENT_REFERENCE_EXPIRED',
  ATTACHMENT_REFERENCE_NOT_AUTHORIZED: 'ATTACHMENT_REFERENCE_NOT_AUTHORIZED',
  ATTACHMENT_BYTES_UNAVAILABLE: 'ATTACHMENT_BYTES_UNAVAILABLE',
  INVALID_UPLOAD_SESSION: 'INVALID_UPLOAD_SESSION',
  UPLOAD_SESSION_EXPIRED: 'UPLOAD_SESSION_EXPIRED',
  UPLOAD_SESSION_ABORTED: 'UPLOAD_SESSION_ABORTED',
  UPLOAD_ALREADY_COMPLETED: 'UPLOAD_ALREADY_COMPLETED',
  INVALID_UPLOAD_TOKEN: 'INVALID_UPLOAD_TOKEN',
  INVALID_CHUNK: 'INVALID_CHUNK',
  INVALID_CHUNK_ENCODING: 'INVALID_CHUNK_ENCODING',
  CHUNK_CHECKSUM_MISMATCH: 'CHUNK_CHECKSUM_MISMATCH',
  CHUNK_SIZE_MISMATCH: 'CHUNK_SIZE_MISMATCH',
  CHUNK_OFFSET_MISMATCH: 'CHUNK_OFFSET_MISMATCH',
  CHUNK_INDEX_OUT_OF_RANGE: 'CHUNK_INDEX_OUT_OF_RANGE',
  CONFLICTING_DUPLICATE_CHUNK: 'CONFLICTING_DUPLICATE_CHUNK',
  MISSING_CHUNKS: 'MISSING_CHUNKS',
  INCOMPLETE_UPLOAD: 'INCOMPLETE_UPLOAD',
  FILE_SIZE_MISMATCH: 'FILE_SIZE_MISMATCH',
  FILE_CHECKSUM_MISMATCH: 'FILE_CHECKSUM_MISMATCH',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  TOO_MANY_CHUNKS: 'TOO_MANY_CHUNKS',
  INVALID_OOXML_PACKAGE: 'INVALID_OOXML_PACKAGE',
  CORRUPTED_ZIP: 'CORRUPTED_ZIP',
  MARKDOWN_DISGUISED_AS_OFFICE: 'MARKDOWN_DISGUISED_AS_OFFICE',
  BINARY_IMPORT_DISABLED: 'BINARY_IMPORT_DISABLED',
  INVALID_BASE64: 'INVALID_BASE64',
  HOST_REFERENCE_FETCH_FAILED: 'HOST_REFERENCE_FETCH_FAILED',
  HOST_REFERENCE_HOST_NOT_ALLOWED: 'HOST_REFERENCE_HOST_NOT_ALLOWED',
  ASSEMBLY_FAILED: 'ASSEMBLY_FAILED',
  SESSION_NOT_RECEIVING: 'SESSION_NOT_RECEIVING',
} as const;

export type BinaryImportErrorCode =
  (typeof BinaryImportErrorCode)[keyof typeof BinaryImportErrorCode];

export type BinaryImportErrorBody = {
  errorCode: BinaryImportErrorCode;
  message: string;
  retryable: boolean;
  uploadId?: string;
  suggestedRecovery?: string;
};

export function binaryImportErrorBody(
  code: BinaryImportErrorCode,
  message: string,
  opts?: { retryable?: boolean; uploadId?: string; recovery?: string },
): BinaryImportErrorBody {
  return {
    errorCode: code,
    message,
    retryable: opts?.retryable ?? false,
    ...(opts?.uploadId ? { uploadId: opts.uploadId } : {}),
    ...(opts?.recovery ? { suggestedRecovery: opts.recovery } : {}),
  };
}

/** Throws BadRequestException with a structured binary-import error body. */
export function binaryImportError(
  code: BinaryImportErrorCode,
  message: string,
  opts?: { retryable?: boolean; uploadId?: string; recovery?: string },
): never {
  throw new BadRequestException(binaryImportErrorBody(code, message, opts));
}
