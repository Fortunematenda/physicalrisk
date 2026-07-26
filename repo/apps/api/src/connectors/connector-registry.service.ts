import { Injectable } from '@nestjs/common';
import { ConnectorProvider } from '../database/entities';
import { GoogleDriveConnector } from './google-drive/google-drive.connector';
import { ManualUploadConnector } from './manual/manual-upload.connector';
import { ConnectorNotImplementedError } from './connector-errors';
import { RepositoryConnector } from './interfaces/repository-connector.interface';

@Injectable()
export class ConnectorRegistryService {
  private readonly connectors: Map<ConnectorProvider, RepositoryConnector>;

  constructor(
    manualUpload: ManualUploadConnector,
    googleDrive: GoogleDriveConnector,
  ) {
    this.connectors = new Map<ConnectorProvider, RepositoryConnector>([
      [ConnectorProvider.MANUAL_UPLOAD, manualUpload],
      [ConnectorProvider.GOOGLE_DRIVE, googleDrive],
    ]);
  }

  get(provider: ConnectorProvider): RepositoryConnector {
    const connector = this.connectors.get(provider);
    if (!connector) throw new ConnectorNotImplementedError(provider);
    return connector;
  }

  listProviders() {
    const implemented = new Set(this.connectors.keys());
    return Object.values(ConnectorProvider).map((provider) => ({
      provider,
      implemented: implemented.has(provider),
      supportsFolders: this.connectors.get(provider)?.supportsFolders ?? false,
    }));
  }
}
