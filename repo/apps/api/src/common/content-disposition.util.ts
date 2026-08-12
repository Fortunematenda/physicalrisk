/**
 * Build a Node-safe Content-Disposition header.
 * Quoted filename= must be ASCII (ByteString); use filename*=UTF-8'' for the real name.
 * Fixes downloads failing on en-dash / accented titles (e.g. "Plan – Zimbabwe.pdf").
 */
export function buildContentDisposition(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const raw = String(fileName || 'download').replace(/[\r\n"]/g, '_').trim() || 'download';
  const ascii = raw
    .normalize('NFKD')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'download';
  const encoded = encodeURIComponent(raw)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
