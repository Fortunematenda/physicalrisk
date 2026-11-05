export type MossEvidenceItem = {
  id: string;
  title?: string | null;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status?: string | null;
  uploadedAt?: string | null;
  uploadedByName?: string | null;
  canRemove?: boolean;
};

/** Same limit and types as MossEvidenceService.upload in the API. */
export const MOSS_EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;

const TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG image',
  'image/jpeg': 'JPEG image',
  'image/jpg': 'JPEG image',
  'image/webp': 'WebP image',
  'image/gif': 'GIF image',
  'application/msword': 'Word document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word document',
  'application/vnd.ms-excel': 'Excel workbook',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel workbook',
  'text/plain': 'Text file',
};

export const MOSS_EVIDENCE_ACCEPT = Object.keys(TYPE_LABELS).join(',');

export function evidenceFileTypeLabel(mimeType?: string | null, fileName?: string | null): string {
  const label = mimeType ? TYPE_LABELS[mimeType.toLowerCase()] : undefined;
  if (label) return label;
  const ext = fileName?.includes('.') ? fileName.split('.').pop()?.toUpperCase() : '';
  return ext ? `${ext} file` : 'File';
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Checks a chosen file before upload so obvious rejections are reported without a round trip. */
export function evidenceFileProblem(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MOSS_EVIDENCE_MAX_BYTES) return `${file.name} is larger than the 25 MB limit.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.type && !TYPE_LABELS[file.type.toLowerCase()] && file.type !== 'application/octet-stream') {
    return `${file.name} is not a supported file type. Upload a PDF, image, Word, Excel or text file.`;
  }
  return null;
}

export function formatEvidenceDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  });
}
