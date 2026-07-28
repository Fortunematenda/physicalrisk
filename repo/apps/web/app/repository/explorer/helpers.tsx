import type { ReactNode } from 'react';
import {
  File, FileJson, FileSpreadsheet, FileText, FileType2, Folder, FolderArchive, Image, TableProperties,
} from 'lucide-react';
import type { DocumentItem, TreeEntry, VersionItem } from './types';

export function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function fileTypeLabel(mimeType?: string, fileName?: string) {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType?.startsWith('image/')) return mimeType.replace('image/', '').toUpperCase();
  const ext = fileName ? extensionOf(fileName) : '';
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

export function isInlineType(mimeType?: string) {
  return mimeType === 'application/pdf' || /^image\//.test(mimeType ?? '');
}

export function flatten(entries: TreeEntry[]): TreeEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.children ? flatten(entry.children) : [])]);
}

export function subtreeDocuments(entry: TreeEntry, documents: DocumentItem[]) {
  const paths = new Set(flatten([entry]).map((item) => item.path));
  return documents.filter(
    (document) =>
      paths.has(document.section.relativePath)
      || [...paths].some(
        (path) =>
          document.section.relativePath.includes(path.replace(/^.*?\//, ''))
          || path.includes(document.section.relativePath),
      ),
  );
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

export function isPdf(version?: VersionItem | null) {
  return version?.mimeType === 'application/pdf';
}
