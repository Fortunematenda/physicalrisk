export interface ExternalFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  revisionId: string;
  modifiedAt?: Date;
  folderId?: string;
  folderPath?: string;
  exportMimeType?: string;
}
