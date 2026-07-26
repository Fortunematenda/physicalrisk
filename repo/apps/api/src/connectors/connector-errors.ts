import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConnectorProvider } from '../database/entities';

export class ConnectorNotImplementedError extends BadRequestException {
  constructor(provider: ConnectorProvider) {
    super(`Connector provider ${provider} is not implemented yet`);
  }
}

export class ConnectorNotConnectedError extends BadRequestException {
  constructor(message = 'Source connection is not connected') {
    super(message);
  }
}

export class ConnectorConfigurationError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export class ConnectorResourceNotFoundError extends NotFoundException {
  constructor(resource: string) {
    super(resource);
  }
}
