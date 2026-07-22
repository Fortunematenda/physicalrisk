import { BadRequestException } from '@nestjs/common';

export interface StructuredErrorDetails {
  documentId?: string;
  documentTitle?: string;
  existingVersionId?: string;
  existingVersion?: string;
  submittedVersion?: string;
  existingFileName?: string;
  existingImportDate?: string;
  repositoryPath?: string;
  currentVersion?: string;
  [key: string]: unknown | undefined;
}

export interface StructuredErrorResponse {
  code: string;
  message: string;
  details: StructuredErrorDetails;
}

export class ImportBusinessException extends BadRequestException {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly details: StructuredErrorDetails = {},
  ) {
    super({ code: errorCode, message, details } as StructuredErrorResponse);
  }

  getResponse(): StructuredErrorResponse {
    return { code: this.errorCode, message: this.message, details: this.details };
  }
}
