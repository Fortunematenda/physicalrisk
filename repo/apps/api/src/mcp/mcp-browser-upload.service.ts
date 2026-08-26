import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type PendingApprovedUpload = {
  token: string;
  projectCode?: string;
  projectId?: string;
  module?: string;
  sectionKey?: string;
  documentType: string;
  title: string;
  versionNo: string;
  approvalStatus: string;
  approvedBy: string;
  approvalDate: string;
  fileName?: string;
  mimeType?: string;
  /** NEW_VERSION when uploading a revision to an existing document. */
  mode?: 'NEW' | 'NEW_VERSION';
  documentCode?: string;
  existingDocumentId?: string;
  integrationId: string;
  createdAt: number;
  expiresAt: number;
};

export type CompletedOriginalUpload = {
  uploadId: string;
  importJobId?: string;
  status: string;
  fileName?: string;
  fileSize?: number;
  sha256?: string;
  checksumVerified?: boolean;
  completedAt: number;
};

@Injectable()
export class McpBrowserUploadService {
  private readonly pending = new Map<string, PendingApprovedUpload>();
  private readonly completed = new Map<string, CompletedOriginalUpload>();
  private readonly ttlMs = 60 * 60 * 1000;

  create(input: Omit<PendingApprovedUpload, 'token' | 'createdAt' | 'expiresAt'>) {
    this.purge();
    const token = randomUUID().replace(/-/g, '');
    const now = Date.now();
    const row: PendingApprovedUpload = {
      ...input,
      token,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.pending.set(token, row);
    return row;
  }

  get(token: string): PendingApprovedUpload {
    this.purge();
    const row = this.pending.get(token);
    if (!row) throw new NotFoundException('Upload link not found or expired');
    return row;
  }

  consume(token: string): PendingApprovedUpload {
    const row = this.get(token);
    this.pending.delete(token);
    return row;
  }

  rememberCompleted(row: CompletedOriginalUpload) {
    this.completed.set(row.uploadId, row);
  }

  getCompleted(uploadId: string): CompletedOriginalUpload | null {
    this.purge();
    return this.completed.get(uploadId) ?? null;
  }

  private purge() {
    const now = Date.now();
    for (const [token, row] of this.pending) {
      if (row.expiresAt <= now) this.pending.delete(token);
    }
    for (const [token, row] of this.completed) {
      if (now - row.completedAt > this.ttlMs) this.completed.delete(token);
    }
  }

  assertNotExpired(row: PendingApprovedUpload) {
    if (row.expiresAt <= Date.now()) {
      this.pending.delete(row.token);
      throw new BadRequestException('Upload link expired — ask the assistant to create a new one');
    }
  }
}
