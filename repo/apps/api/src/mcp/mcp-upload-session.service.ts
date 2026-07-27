import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type UploadSession = {
  id: string;
  fileName: string;
  mimeType?: string;
  totalChunks: number;
  chunks: Map<number, string>;
  createdAt: number;
  expiresAt: number;
};

@Injectable()
export class McpUploadSessionService {
  private readonly sessions = new Map<string, UploadSession>();
  private readonly ttlMs = 30 * 60 * 1000;

  begin(fileName: string, totalChunks: number, mimeType?: string) {
    this.purgeExpired();
    const total = Number(totalChunks);
    if (!fileName?.trim()) throw new BadRequestException('fileName is required');
    if (!Number.isFinite(total) || total < 1 || total > 500) {
      throw new BadRequestException('totalChunks must be between 1 and 500');
    }
    const id = randomUUID();
    const now = Date.now();
    this.sessions.set(id, {
      id,
      fileName: fileName.trim(),
      mimeType: mimeType?.trim() || undefined,
      totalChunks: total,
      chunks: new Map(),
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });
    return {
      uploadId: id,
      fileName: fileName.trim(),
      totalChunks: total,
      expiresAt: new Date(now + this.ttlMs).toISOString(),
      hint: 'Send each base64 chunk with upload_document_chunk, then call submit_approved_document with uploadId.',
    };
  }

  addChunk(uploadId: string, index: number, total: number, data: string) {
    const session = this.requireSession(uploadId);
    if (total !== session.totalChunks) {
      throw new BadRequestException(`totalChunks mismatch (expected ${session.totalChunks}, got ${total})`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      throw new BadRequestException(`chunk index out of range (0..${session.totalChunks - 1})`);
    }
    const chunk = String(data ?? '').replace(/\s+/g, '');
    if (!chunk) throw new BadRequestException('chunk data is empty');
    if (!/^[A-Za-z0-9+/=]+$/.test(chunk)) {
      throw new BadRequestException('chunk data must be base64');
    }
    session.chunks.set(index, chunk);
    return {
      uploadId,
      received: session.chunks.size,
      totalChunks: session.totalChunks,
      complete: session.chunks.size === session.totalChunks,
    };
  }

  /** Assemble and consume the session (one-shot). */
  takeBase64(uploadId: string): { fileName: string; mimeType?: string; fileContentBase64: string } {
    const session = this.requireSession(uploadId);
    if (session.chunks.size !== session.totalChunks) {
      const missing = [];
      for (let i = 0; i < session.totalChunks; i += 1) {
        if (!session.chunks.has(i)) missing.push(i);
      }
      throw new BadRequestException(
        `Upload incomplete (${session.chunks.size}/${session.totalChunks}). Missing chunk indexes: ${missing.slice(0, 20).join(', ')}`,
      );
    }
    const parts: string[] = [];
    for (let i = 0; i < session.totalChunks; i += 1) {
      parts.push(session.chunks.get(i)!);
    }
    this.sessions.delete(uploadId);
    return {
      fileName: session.fileName,
      mimeType: session.mimeType,
      fileContentBase64: parts.join(''),
    };
  }

  private requireSession(uploadId: string): UploadSession {
    this.purgeExpired();
    const session = this.sessions.get(uploadId);
    if (!session) throw new NotFoundException(`Upload session '${uploadId}' not found or expired`);
    return session;
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }
}
