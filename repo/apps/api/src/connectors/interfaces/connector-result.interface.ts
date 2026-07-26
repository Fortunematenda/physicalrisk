export interface ConnectorTestResult {
  ok: boolean;
  message: string;
  accountLabel?: string;
}

export interface ConnectorDownloadResult {
  data: Buffer;
  fileName: string;
  mimeType: string;
  revisionId: string;
}

export interface ConnectorOAuthStartResult {
  authUrl: string;
  connectionId: string;
  state: string;
}
