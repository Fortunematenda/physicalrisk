import { ConnectorProvider, SourceConnection } from '../../database/entities';
import { ConnectorDownloadResult, ConnectorOAuthStartResult, ConnectorTestResult } from './connector-result.interface';
import { ExternalFile } from './external-file.interface';
import { ExternalFolder } from './external-folder.interface';

export interface RepositoryConnector {
  readonly provider: ConnectorProvider;
  readonly supportsFolders: boolean;
  testConnection(connection: SourceConnection): Promise<ConnectorTestResult>;
  downloadFile(connection: SourceConnection, file: ExternalFile): Promise<ConnectorDownloadResult>;
}

export interface FolderBrowsingConnector extends RepositoryConnector {
  readonly supportsFolders: true;
  listFolders(connection: SourceConnection, parentFolderId?: string): Promise<ExternalFolder[]>;
  listFiles(connection: SourceConnection, folderId: string, pageToken?: string): Promise<{ files: ExternalFile[]; nextPageToken?: string }>;
}

export interface OAuthConnector extends FolderBrowsingConnector {
  buildOAuthStart(connection: SourceConnection, redirectUri: string): Promise<ConnectorOAuthStartResult>;
  completeOAuth(connection: SourceConnection, code: string, redirectUri: string): Promise<SourceConnection>;
}

export function isFolderBrowsingConnector(connector: RepositoryConnector): connector is FolderBrowsingConnector {
  return connector.supportsFolders;
}

export function isOAuthConnector(connector: RepositoryConnector): connector is OAuthConnector {
  return connector.supportsFolders && typeof (connector as OAuthConnector).buildOAuthStart === 'function';
}
