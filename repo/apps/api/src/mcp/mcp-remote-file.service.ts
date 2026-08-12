import { BadRequestException, Injectable } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { alignStoredFileIdentity } from '../common/document-format.util';

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;

export type FetchedRemoteFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sourceUrl: string;
};

/**
 * Fetch a remote Approved Document URL with basic SSRF protections.
 * Supports PDF, Office (docx/xlsx/pptx), and plain text for ChatGPT `fileUrl` submit.
 */
@Injectable()
export class McpRemoteFileService {
  async fetchApprovedDocument(fileUrl: string, preferredFileName?: string): Promise<FetchedRemoteFile> {
    const start = this.parsePublicHttpUrl(fileUrl);
    await this.assertPublicHost(start.hostname);

    let current = start;
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        response = await fetch(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept:
              'application/pdf,'
              + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,'
              + 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,'
              + 'application/vnd.openxmlformats-officedocument.presentationml.presentation,'
              + 'text/plain,text/csv,application/octet-stream,*/*',
            'User-Agent': 'PhysicalRisk-Repo-MCP/1.0',
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'download failed';
        throw new BadRequestException(`Could not download fileUrl: ${message}`);
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new BadRequestException('fileUrl redirect missing Location header');
        }
        const next = this.resolveRedirect(current, location);
        await this.assertPublicHost(next.hostname);
        current = next;
        continue;
      }

      break;
    }

    if (!response) {
      throw new BadRequestException('Could not download fileUrl');
    }
    if (!response.ok) {
      throw new BadRequestException(`fileUrl returned HTTP ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_BYTES) {
      throw new BadRequestException(`fileUrl content exceeds ${MAX_BYTES} bytes`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      throw new BadRequestException('fileUrl returned an empty file');
    }
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException(`fileUrl content exceeds ${MAX_BYTES} bytes`);
    }

    const headerType = (response.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase() || '';
    const urlName = this.fileNameFromUrl(current);
    const aligned = alignStoredFileIdentity({
      buffer,
      fileName: preferredFileName?.trim() || urlName || 'document',
      mimeType: headerType || undefined,
    });

    if (aligned.format === 'other') {
      throw new BadRequestException(
        'fileUrl must point to a supported document (PDF, Word, Excel, PowerPoint, or text)',
      );
    }

    return {
      buffer,
      fileName: aligned.fileName,
      mimeType: aligned.mimeType,
      sourceUrl: current.toString(),
    };
  }

  parsePublicHttpUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(String(raw || '').trim());
    } catch {
      throw new BadRequestException('fileUrl must be a valid URL');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new BadRequestException('fileUrl must use http or https');
    }
    if (url.username || url.password) {
      throw new BadRequestException('fileUrl must not include credentials');
    }
    return url;
  }

  async assertPublicHost(hostname: string): Promise<void> {
    const host = hostname.trim().toLowerCase();
    if (!host) {
      throw new BadRequestException('fileUrl host is required');
    }
    if (
      host === 'localhost'
      || host === 'localhost.'
      || host.endsWith('.localhost')
      || host.endsWith('.local')
      || host === 'metadata.google.internal'
    ) {
      throw new BadRequestException('fileUrl host is not allowed');
    }

    if (net.isIP(host)) {
      if (this.isPrivateOrLocalIp(host)) {
        throw new BadRequestException('fileUrl must not target a private IP');
      }
      return;
    }

    let addresses: string[];
    try {
      const results = await dns.lookup(host, { all: true, verbatim: true });
      addresses = results.map((item) => item.address);
    } catch {
      const [v4, v6] = await Promise.all([
        dns.resolve4(host).catch(() => [] as string[]),
        dns.resolve6(host).catch(() => [] as string[]),
      ]);
      addresses = [...v4, ...v6];
    }

    if (!addresses.length) {
      throw new BadRequestException('fileUrl host could not be resolved');
    }
    for (const address of addresses) {
      if (this.isPrivateOrLocalIp(address)) {
        throw new BadRequestException('fileUrl must not resolve to a private IP');
      }
    }
  }

  isPrivateOrLocalIp(ip: string): boolean {
    const normalized = ip.trim().toLowerCase();
    if (normalized === '::1' || normalized === '0.0.0.0') return true;

    if (net.isIPv4(normalized)) {
      const parts = normalized.split('.').map(Number);
      const [a, b] = parts;
      if (a === 10 || a === 127 || a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      return false;
    }

    if (net.isIPv6(normalized)) {
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
      if (normalized.startsWith('fe80')) return true;
      if (normalized === '::' || normalized.startsWith('::ffff:127.')) return true;
      const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
      if (mapped?.[1]) return this.isPrivateOrLocalIp(mapped[1]);
      return false;
    }

    return true;
  }

  private resolveRedirect(current: URL, location: string): URL {
    try {
      return new URL(location, current);
    } catch {
      throw new BadRequestException('fileUrl redirect Location is invalid');
    }
  }

  private fileNameFromUrl(url: URL): string | undefined {
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (!last) return undefined;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }
}
