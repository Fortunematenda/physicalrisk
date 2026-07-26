import { Injectable } from '@nestjs/common';
import { ConnectorProvider, SourceConnection } from '../../database/entities';
import { ConnectorNotImplementedError } from '../connector-errors';
import { ConnectorDownloadResult, ConnectorTestResult } from '../interfaces/connector-result.interface';
import { ExternalFile } from '../interfaces/external-file.interface';
import { RepositoryConnector } from '../interfaces/repository-connector.interface';

@Injectable()
export class ManualUploadConnector implements RepositoryConnector {
  readonly provider = ConnectorProvider.MANUAL_UPLOAD;
  readonly supportsFolders = false;

  async testConnection(_connection: SourceConnection): Promise<ConnectorTestResult> {
    return { ok: true, message: 'Manual upload does not require an external connection' };
  }

  async downloadFile(_connection: SourceConnection, _file: ExternalFile): Promise<ConnectorDownloadResult> {
    throw new ConnectorNotImplementedError(this.provider);
  }
}
