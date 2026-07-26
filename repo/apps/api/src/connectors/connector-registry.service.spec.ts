import { ConnectorProvider } from '../database/entities';
import { ConnectorRegistryService } from './connector-registry.service';
import { GoogleDriveConnector } from './google-drive/google-drive.connector';
import { ManualUploadConnector } from './manual/manual-upload.connector';

describe('ConnectorRegistryService', () => {
  const googleDrive = {
    provider: ConnectorProvider.GOOGLE_DRIVE,
    supportsFolders: true,
  };
  const registry = new ConnectorRegistryService(
    new ManualUploadConnector(),
    googleDrive as GoogleDriveConnector,
  );

  it('returns implemented manual upload connector', () => {
    const connector = registry.get(ConnectorProvider.MANUAL_UPLOAD);
    expect(connector.provider).toBe(ConnectorProvider.MANUAL_UPLOAD);
    expect(connector.supportsFolders).toBe(false);
  });

  it('lists provider availability', () => {
    const providers = registry.listProviders();
    expect(providers.find((item) => item.provider === ConnectorProvider.GOOGLE_DRIVE)?.implemented).toBe(true);
    expect(providers.find((item) => item.provider === ConnectorProvider.SHAREPOINT)?.implemented).toBe(false);
  });

  it('throws for unimplemented providers', () => {
    expect(() => registry.get(ConnectorProvider.SHAREPOINT)).toThrow('not implemented');
  });
});
