import type { ReactNode } from 'react';
import {
  File, FileJson, FileSpreadsheet, FileText, FileType2, Folder, FolderArchive, Image, TableProperties,
} from 'lucide-react';
import type { DocumentItem, TreeEntry, VersionItem } from './types';

export function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function isZipArchive(version?: { mimeType?: string | null; originalFileName?: string | null } | null) {
  if (!version) return false;
  const mime = String(version.mimeType ?? '').toLowerCase();
  if (mime.includes('zip')) return true;
  const name = String(version.originalFileName ?? '');
  return extensionOf(name) === 'zip';
}

export function fileTypeLabel(mimeType?: string, fileName?: string) {
  const ext = fileName ? extensionOf(fileName) : '';
  // Prefer real extension — ChatGPT/MCP sometimes stores wrong MIME (e.g. application/pdf on .xlsx).
  if (ext === 'pdf') return 'PDF';
  if (ext === 'docx' || ext === 'doc') return ext.toUpperCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return ext.toUpperCase();
  if (ext === 'pptx' || ext === 'ppt') return ext.toUpperCase();
  if (ext === 'txt' || ext === 'md') return ext.toUpperCase();
  if (ext === 'zip') return 'ZIP';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return ext.toUpperCase();

  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'DOCX';
  if (mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'XLSX';
  if (mime.includes('presentationml') || mime.includes('ms-powerpoint')) return 'PPTX';
  if (mime === 'text/plain') return 'TXT';
  if (mime?.startsWith('image/')) return mime.replace('image/', '').toUpperCase();
  return ext ? ext.toUpperCase() : (mimeType || 'File');
}

export function iconFor(entry: TreeEntry, size = 16): ReactNode {
  if (entry.nodeType === 'register') return <TableProperties size={size} />;
  if (entry.type === 'directory') {
    if (entry.nodeType === 'document') return <FolderArchive size={size} />;
    return <Folder size={size} />;
  }
  const extension = extensionOf(entry.name);
  if (extension === 'pdf') return <FileText size={size} />;
  if (['doc', 'docx'].includes(extension)) return <FileType2 size={size} />;
  if (['xls', 'xlsx', 'csv'].includes(extension)) return <FileSpreadsheet size={size} />;
  if (extension === 'json') return <FileJson size={size} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return <Image size={size} />;
  return <File size={size} />;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'log', 'yaml', 'yml', 'ini', 'cfg', 'conf', 'rtf',
]);
const SPREADSHEET_EXTS = new Set(['xlsx', 'xls', 'csv', 'tsv']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function versionExt(version?: VersionItem | null) {
  return version?.originalFileName ? extensionOf(version.originalFileName) : '';
}

export function isPdf(version?: VersionItem | null) {
  if (!version) return false;
  const ext = versionExt(version);
  // Extension wins — never treat .xlsx/.docx as PDF just because MIME is wrong.
  if (ext && ext !== 'pdf') return false;
  if (ext === 'pdf') return true;
  return version.mimeType === 'application/pdf';
}

export function isDocx(version?: VersionItem | null) {
  if (!version) return false;
  const ext = versionExt(version);
  if (ext === 'docx' || ext === 'doc') return true;
  if (ext && ext !== 'docx' && ext !== 'doc') return false;
  return version.mimeType === DOCX_MIME;
}

export function isPptx(version?: VersionItem | null) {
  if (!version) return false;
  const ext = versionExt(version);
  if (ext === 'pptx' || ext === 'ppt') return true;
  if (ext && ext !== 'pptx' && ext !== 'ppt') return false;
  const mime = String(version.mimeType ?? '').toLowerCase();
  return mime.includes('presentationml') || mime.includes('ms-powerpoint');
}

export function isImage(version?: VersionItem | null) {
  if (!version) return false;
  const ext = versionExt(version);
  if (IMAGE_EXTS.has(ext)) return true;
  if (ext) return false;
  return /^image\//.test(version.mimeType ?? '');
}

export function isSpreadsheet(version?: VersionItem | null) {
  if (!version) return false;
  const ext = versionExt(version);
  if (SPREADSHEET_EXTS.has(ext)) return true;
  if (ext) return false;
  const mime = version.mimeType ?? '';
  return mime === XLSX_MIME || mime === XLS_MIME || mime === 'text/csv' || mime === 'text/tab-separated-values';
}

export function isTextPreview(version?: VersionItem | null) {
  if (!version) return false;
  const ext = versionExt(version);
  // Prefer spreadsheet table viewer for CSV/TSV/Excel.
  if (isSpreadsheet(version) && SPREADSHEET_EXTS.has(ext)) return false;
  const mime = version.mimeType ?? '';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return true;
  return TEXT_EXTS.has(ext);
}

/** Types we can render inline (PDF is always included). */
export function isInlineType(mimeType?: string, fileName?: string) {
  const version = { mimeType: mimeType ?? '', originalFileName: fileName ?? '' } as VersionItem;
  return isPdf(version) || isDocx(version) || isImage(version) || isSpreadsheet(version) || isTextPreview(version);
}

export function officeAppLabel(version?: VersionItem | null): string | null {
  if (!version) return null;
  if (isSpreadsheet(version)) return 'Excel';
  if (isDocx(version)) return 'Word';
  if (isPptx(version)) return 'PowerPoint';
  return null;
}

export function canUseViewerControls(version?: VersionItem | null) {
  return isPdf(version) || isDocx(version) || isImage(version) || isSpreadsheet(version) || isTextPreview(version);
}

export function flatten(entries: TreeEntry[]): TreeEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.children ? flatten(entry.children) : [])]);
}

export function findTreeEntry(entries: TreeEntry[], path: string): TreeEntry | null {
  const target = path.replace(/\\/g, '/');
  for (const entry of entries) {
    if (entry.path.replace(/\\/g, '/') === target) return entry;
    if (entry.children?.length) {
      const nested = findTreeEntry(entry.children, target);
      if (nested) return nested;
    }
  }
  return null;
}

export function parentTreePath(path?: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return null;
  return normalized.slice(0, index);
}

/** Documents that belong to the clicked folder (and its nested pack paths). */
export function subtreeDocuments(entry: TreeEntry, documents: DocumentItem[]) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const found = new Map<string, DocumentItem>();
  const folderPath = entry.path.replace(/\\/g, '/').replace(/\/+$/, '');
  const folderPrefix = `${folderPath}/`;

  for (const item of flatten([entry])) {
    if (!item.documentId) continue;
    const document = byId.get(item.documentId);
    if (document) found.set(document.id, document);
  }

  for (const document of documents) {
    if (found.has(document.id)) continue;

    const sectionPath = document.section.relativePath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (sectionPath === folderPath || sectionPath.startsWith(folderPrefix)) {
      found.set(document.id, document);
      continue;
    }

    const versionPaths = (document.versions ?? [])
      .map((version) => version.storagePath?.replace(/\\/g, '/'))
      .filter(Boolean) as string[];
    if (versionPaths.some((path) => path === folderPath || path.startsWith(folderPrefix))) {
      found.set(document.id, document);
    }
  }

  return [...found.values()];
}

export function downloadText(fileName: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function pathSegments(rawPath?: string | null): string[] {
  if (!rawPath?.trim()) return [];
  return rawPath
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Prefer hash form browsers understand for embedded PDF viewers. */
export function pdfViewerHash(options: {
  page: number;
  zoom: number | 'page-width' | 'page-fit';
  rotate: number;
}) {
  const parts = [
    'toolbar=0',
    'navpanes=0',
    'scrollbar=1',
    `page=${Math.max(1, options.page)}`,
  ];
  if (options.zoom === 'page-width') parts.push('view=FitH');
  else if (options.zoom === 'page-fit') parts.push('view=Fit');
  else parts.push(`zoom=${options.zoom}`);
  if (options.rotate) parts.push(`rotate=${options.rotate % 360}`);
  return parts.join('&');
}

