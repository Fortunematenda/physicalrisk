import { Injectable } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { ConnectorProvider, SourceConnection, SourceConnectionStatus } from '../../database/entities';
import { CredentialEncryptionService } from '../credential-encryption.service';
import { GoogleOAuthSettingsService } from '../google-oauth-settings.service';
import { ConnectorConfigurationError, ConnectorNotConnectedError } from '../connector-errors';
import { ConnectorDownloadResult, ConnectorOAuthStartResult, ConnectorTestResult } from '../interfaces/connector-result.interface';
import { ExternalFile } from '../interfaces/external-file.interface';
import { ExternalFolder } from '../interfaces/external-folder.interface';
import { OAuthConnector } from '../interfaces/repository-connector.interface';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

interface GoogleDriveCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate?: number;
  tokenType?: string;
}

const GOOGLE_EXPORT_MIME: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
  },
  'application/vnd.google-apps.drawing': { mimeType: 'application/pdf', extension: 'pdf' },
};

@Injectable()
export class GoogleDriveConnector implements OAuthConnector {
  readonly provider = ConnectorProvider.GOOGLE_DRIVE;
  readonly supportsFolders = true as const;

  constructor(
    private readonly googleOAuth: GoogleOAuthSettingsService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async buildOAuthStart(connection: SourceConnection, redirectUri: string): Promise<ConnectorOAuthStartResult> {
    const oauth2 = await this.createOAuthClient(redirectUri);
    const state = connection.id;
    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE],
      state,
    });
    return { authUrl, connectionId: connection.id, state };
  }

  async completeOAuth(connection: SourceConnection, code: string, redirectUri: string): Promise<SourceConnection> {
    const oauth2 = await this.createOAuthClient(redirectUri);
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.access_token) throw new ConnectorConfigurationError('Google OAuth did not return an access token');
    const payload: GoogleDriveCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? '',
      expiryDate: tokens.expiry_date ?? undefined,
      tokenType: tokens.token_type ?? 'Bearer',
    };
    await this.encryption.ensureKey();
    connection.credentialsEncrypted = this.encryption.encrypt(JSON.stringify(payload));
    connection.status = SourceConnectionStatus.CONNECTED;
    connection.lastSyncError = null;
    try {
      const drive = await this.getDriveClient(connection, redirectUri);
      const about = await drive.about.get({ fields: 'user(displayName,emailAddress)' });
      connection.externalAccountId = about.data.user?.emailAddress ?? null;
      connection.externalAccountLabel = about.data.user?.displayName ?? about.data.user?.emailAddress ?? 'Google Drive';
    } catch {
      connection.externalAccountLabel = 'Google Drive';
    }
    return connection;
  }

  async testConnection(connection: SourceConnection): Promise<ConnectorTestResult> {
    const redirectUri = await this.getRedirectUri();
    const drive = await this.getDriveClient(connection, redirectUri);
    const about = await drive.about.get({ fields: 'user(displayName,emailAddress)' });
    return {
      ok: true,
      message: 'Google Drive connection is healthy',
      accountLabel: about.data.user?.emailAddress ?? about.data.user?.displayName ?? undefined,
    };
  }

  async listFolders(connection: SourceConnection, parentFolderId?: string): Promise<ExternalFolder[]> {
    const drive = await this.getDriveClient(connection, await this.getRedirectUri());
    const parent = parentFolderId ?? connection.rootExternalFolderId ?? 'root';
    const response = await drive.files.list({
      q: `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id,name,modifiedTime,parents)',
      pageSize: 200,
      orderBy: 'name',
    });
    return (response.data.files ?? []).map((file) => ({
      id: file.id ?? '',
      name: file.name ?? 'Folder',
      parentId: file.parents?.[0],
      modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
    }));
  }

  async listFiles(connection: SourceConnection, folderId: string, pageToken?: string) {
    const drive = await this.getDriveClient(connection, await this.getRedirectUri());
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,version,md5Checksum)',
      pageSize: 100,
      pageToken,
      orderBy: 'modifiedTime desc',
    });
    const files = (response.data.files ?? []).map((file) => this.mapDriveFile(file));
    return { files, nextPageToken: response.data.nextPageToken ?? undefined };
  }

  async downloadFile(connection: SourceConnection, file: ExternalFile): Promise<ConnectorDownloadResult> {
    const drive = await this.getDriveClient(connection, await this.getRedirectUri());
    const meta = await drive.files.get({ fileId: file.id, fields: 'id,name,mimeType,modifiedTime,version,md5Checksum' });
    const mimeType = meta.data.mimeType ?? file.mimeType;
    const exportConfig = GOOGLE_EXPORT_MIME[mimeType];
    if (exportConfig) {
      const response = await drive.files.export({ fileId: file.id, mimeType: exportConfig.mimeType }, { responseType: 'arraybuffer' });
      const baseName = (meta.data.name ?? file.name).replace(/\.[^.]+$/, '');
      return {
        data: Buffer.from(response.data as ArrayBuffer),
        fileName: `${baseName}.${exportConfig.extension}`,
        mimeType: exportConfig.mimeType,
        revisionId: meta.data.version ?? file.revisionId ?? '',
      };
    }
    const response = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
    return {
      data: Buffer.from(response.data as ArrayBuffer),
      fileName: meta.data.name ?? file.name,
      mimeType: mimeType || 'application/octet-stream',
      revisionId: meta.data.version ?? meta.data.md5Checksum ?? file.revisionId ?? '',
    };
  }

  private mapDriveFile(file: drive_v3.Schema$File): ExternalFile {
    const exportConfig = file.mimeType ? GOOGLE_EXPORT_MIME[file.mimeType] : undefined;
    return {
      id: file.id ?? '',
      name: file.name ?? 'file',
      mimeType: exportConfig?.mimeType ?? file.mimeType ?? 'application/octet-stream',
      size: Number(file.size ?? 0),
      revisionId: file.version ?? file.md5Checksum ?? '',
      modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      folderId: file.parents?.[0],
      exportMimeType: exportConfig?.mimeType,
    };
  }

  private async createOAuthClient(redirectUri: string) {
    const credentials = await this.googleOAuth.requireCredentials();
    return new google.auth.OAuth2(credentials.clientId, credentials.clientSecret, redirectUri);
  }

  private async getRedirectUri() {
    const credentials = await this.googleOAuth.requireCredentials();
    return credentials.redirectUri;
  }

  private readCredentials(connection: SourceConnection): GoogleDriveCredentials {
    if (!connection.credentialsEncrypted) throw new ConnectorNotConnectedError('Google Drive credentials are missing');
    return JSON.parse(this.encryption.decrypt(connection.credentialsEncrypted)) as GoogleDriveCredentials;
  }

  private async getDriveClient(connection: SourceConnection, redirectUri: string) {
    const stored = this.readCredentials(connection);
    const oauth2 = await this.createOAuthClient(redirectUri);
    oauth2.setCredentials({
      access_token: stored.accessToken,
      refresh_token: stored.refreshToken || undefined,
      expiry_date: stored.expiryDate,
      token_type: stored.tokenType,
    });
    oauth2.on('tokens', (tokens) => {
      if (!tokens.access_token) return;
      const next: GoogleDriveCredentials = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? stored.refreshToken,
        expiryDate: tokens.expiry_date ?? stored.expiryDate,
        tokenType: tokens.token_type ?? stored.tokenType,
      };
      void this.encryption.ensureKey().then(() => {
        connection.credentialsEncrypted = this.encryption.encrypt(JSON.stringify(next));
      });
    });
    return google.drive({ version: 'v3', auth: oauth2 });
  }
}
