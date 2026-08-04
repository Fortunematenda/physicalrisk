import { ConnectorProvider, ExternalImportStatus, ImportStatus } from '../../database/entities';

/** Connector sync / selective import queue payload (Google Drive, etc.). */
export interface ExternalImportRequest {
  provider: ConnectorProvider;
  sourceConnectionId?: string;
  externalFileId: string;
  externalRevisionId?: string;
  externalFileName: string;
  mimeType: string;
  fileSize: number;
  externalModifiedAt?: Date;
  folderId?: string;
  folderMappingId?: string;
  projectId?: string;
  sectionId?: string;
  sourceSystemId?: string;
  initiatedByUserId?: string;
  data: Buffer;
}

/** ChatGPT MCP approved-document submission payload. */
export interface McpApprovedDocumentRequest {
  provider: ConnectorProvider;
  projectId: string;
  sourceSystemId?: string;
  title: string;
  documentCode?: string;
  documentType: string;
  description?: string;
  owner?: string;
  versionNo: string;
  approvalStatus: string;
  approvedBy: string;
  approvalDate: string;
  sectionKey?: string;
  metadataJson?: string;
  relationshipsJson?: string;
  mode?: 'NEW' | 'NEW_VERSION';
  existingDocumentId?: string;
  fileName: string;
  fileContentBase64: string;
  mimeType?: string;
  mcpIntegrationId?: string;
  /**
   * When true (default for ChatGPT MCP), stage the import and return immediately.
   * Repository placement runs in a background worker so nginx/ChatGPT timeouts cannot kill the job.
   */
  processAsync?: boolean;
}

export interface McpExternalImportResult {
  importJobId: string;
  status: ImportStatus;
  externalImportStatus: ExternalImportStatus;
  checksum: string;
  fileName: string;
  /** True when process() completed into the repository + Master Document Index. */
  imported?: boolean;
  documentCode?: string;
  sectionName?: string;
  message?: string;
  needsReview?: boolean;
}
