import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

export interface ConfigurationErrorDetails {
  existingId?: string;
  existingName?: string;
  existingCode?: string;
  [key: string]: unknown | undefined;
}

export interface ConfigurationErrorResponse {
  code: string;
  message: string;
  details?: ConfigurationErrorDetails;
}

export class ConfigurationException extends BadRequestException {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly details: ConfigurationErrorDetails = {},
  ) {
    super({ code: errorCode, message, details } as ConfigurationErrorResponse);
  }

  getResponse(): ConfigurationErrorResponse {
    return { code: this.errorCode, message: this.message, details: this.details };
  }
}

export class ConfigurationConflictException extends ConflictException {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly details: ConfigurationErrorDetails = {},
  ) {
    super({ code: errorCode, message, details } as ConfigurationErrorResponse);
  }

  getResponse(): ConfigurationErrorResponse {
    return { code: this.errorCode, message: this.message, details: this.details };
  }
}

export class ConfigurationPermissionException extends ForbiddenException {
  constructor(message = 'You do not have permission to create configuration records.') {
    super({ code: 'PERMISSION_DENIED', message, details: {} } as ConfigurationErrorResponse);
  }
}
