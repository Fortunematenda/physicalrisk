/**
 * Browser download helper for repository binary assets (ZIP/DOCX/XLSX/PDF).
 * Always uses blob(); never treats JSON/HTML error bodies as files.
 */

export type DownloadBinaryOptions = {
  url: string;
  fileName: string;
  token?: string | null;
  expectedSha256?: string | null;
  expectedSize?: number | null;
};

function header(response: Response, name: string): string | null {
  return response.headers.get(name) || response.headers.get(name.toLowerCase());
}

async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function downloadBinaryFile(options: DownloadBinaryOptions): Promise<void> {
  const response = await fetch(options.url, {
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let detail = `Download failed (${response.status})`;
    const contentType = header(response, 'content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await response.json() as { message?: string; code?: string };
        detail = body.message || body.code || detail;
      } catch {
        /* ignore parse errors */
      }
    }
    throw new Error(detail);
  }

  const contentType = header(response, 'content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    throw new Error('Server returned an error page instead of the binary file — download aborted');
  }

  const blob = await response.blob();
  const contentLength = header(response, 'content-length');
  if (contentLength) {
    const expected = Number(contentLength);
    if (Number.isFinite(expected) && expected > 0 && blob.size !== expected) {
      throw new Error(`Download truncated: expected ${expected} bytes, got ${blob.size}`);
    }
  }
  if (options.expectedSize != null && blob.size !== options.expectedSize) {
    throw new Error(`Download size mismatch: expected ${options.expectedSize} bytes, got ${blob.size}`);
  }

  const headerChecksum = (header(response, 'x-checksum-sha256') || '').trim().toLowerCase();
  const expected = (options.expectedSha256 || headerChecksum || '').trim().toLowerCase();
  if (expected && typeof crypto !== 'undefined' && crypto.subtle) {
    const actual = await sha256Hex(blob);
    if (actual !== expected) {
      throw new Error('Downloaded file failed SHA-256 integrity check');
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = options.fileName || 'download';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
