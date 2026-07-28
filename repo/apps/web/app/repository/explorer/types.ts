export type NodeType = 'root' | 'module' | 'folder' | 'document' | 'version' | 'file' | 'register';

export type TreeEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  nodeType?: NodeType;
  childCount?: number;
  documentId?: string;
  versionId?: string;
  documentCode?: string;
  versionNo?: string;
  status?: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  children?: TreeEntry[];
};

export type DocumentItem = {
  id: string;
  code: string;
  title: string;
  documentType: string;
  currentVersionNo: string;
  status: string;
  updatedAt: string;
  project: { id: string; code: string; name: string };
  section: { id: string; name: string; relativePath: string };
  versions: VersionItem[];
  _count: { versions: number };
  importJobs?: Array<{ sourceSystem?: { name?: string } | null }>;
};

export type VersionItem = {
  id: string;
  versionNo: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  approvalStatus: string;
  approvedBy: string;
  approvalDate: string;
  isCurrent: boolean;
  storagePath: string;
  createdAt: string;
  createdBy?: { name?: string } | null;
};

export type RepositoryResponse = {
  project: { id: string; code: string; name: string; repositoryRootPath: string };
  rootPath: string;
  lastSynchronisedAt: string | null;
  entries: TreeEntry[];
};

export type Selection = { entry: TreeEntry; kind: 'folder' | 'document' | 'file' } | null;

export type SelectedDocument = DocumentItem & {
  versions?: VersionItem[];
};
