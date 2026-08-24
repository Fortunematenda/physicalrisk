import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { In, LessThan } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { ConnectorProvider, McpBinaryImportSession, McpBinaryImportStatus, McpIntegration } from '../database/entities';
import { DatabaseService } from '../database/database.service';
import { ExternalImportOrchestratorService } from '../imports/external-import-orchestrator.service';
import { BinaryImportErrorCode, binaryImportError } from './mcp-binary-import.errors';
import { ConnectorImportJobService } from './connector-import-job.service';
import { validateStoredBinary, validateStoredBinaryFromFile } from './mcp-ooxml-validate.util';
import { McpRemoteFileService } from './mcp-remote-file.service';

export type BinaryTransportMode = 'HOST_REFERENCE' | 'CHUNKED_BINARY' | 'UNSUPPORTED';

export type InspectAttachmentCapabilityInput = {
  fileName?: string;
  attachmentReference?: string;
  fileUrl?: string;
  /** Host asserts it can supply exact original bytes via chunked tools. */
  canProvideExactBytes?: boolean;
  declaredMimeType?: string;
  expectedFileSize?: number;
};

export type ImportOriginalFileInput = {
  projectId: string;
  fileName: string;
  title?: string;
  documentType: string;
  description?: string;
  owner?: string;
  versionNo: string;
  approvalStatus: string;
  approvedBy: string;
  approvalDate: string;
  sectionKey?: string;
  metadataJson?: string;
  relationshipsJson?: string;
  mode?: 'NEW' | 'NEW_VERSION';
  existingDocumentId?: string;
  documentCode?: string;
  attachmentReference?: string;
  fileUrl?: string;
  mimeType?: string;
  sourceSha256?: string;
  processAsync?: boolean;
};

export type PrepareAutomaticFileImportInput = {
  projectId: string;
  projectCode?: string;
  userId?: string | null;
  fileName: string;
  expectedFileSize?: number;
  expectedSha256?: string;
  declaredMimeType?: string;
  expectedChunkCount?: number;
  documentType?: string;
  documentId?: string;
  documentCode?: string;
  sectionKey?: string;
  module?: string;
  mode?: string;
  title?: string;
  versionNo?: string;
  approvalStatus?: string;
  approvedBy?: string;
  approvalDate?: string;
  metadataJson?: string;
  relationshipsJson?: string;
  description?: string;
  owner?: string;
};

export type UploadOriginalFileChunkInput = {
  uploadId: string;
  uploadToken: string;
  chunkIndex: number;
  chunkBase64: string;
  chunkSha256: string;
  rawByteLength: number;
};

@Injectable()
export class McpBinaryImportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly remoteFiles: McpRemoteFileService,
    private readonly orchestrator: ExternalImportOrchestratorService,
    private readonly audit: AuditService,
    private readonly connectorImports: ConnectorImportJobService,
  ) {}

  get enabled(): boolean {
    return this.config.get<string>('MCP_BINARY_IMPORT_ENABLED', 'true') !== 'false';
  }

  get maxFileSize(): number {
    return Number(this.config.get('MCP_BINARY_IMPORT_MAX_FILE_SIZE') ?? 524_288_000);
  }

  get chunkSize(): number {
    return Number(this.config.get('MCP_BINARY_IMPORT_CHUNK_SIZE') ?? 262_144);
  }

  get sessionTtlSec(): number {
    return Number(this.config.get('MCP_BINARY_IMPORT_SESSION_TTL') ?? 3600);
  }

  get maxChunks(): number {
    return Number(this.config.get('MCP_BINARY_IMPORT_MAX_CHUNKS') ?? 4000);
  }

  get tempRoot(): string {
    return (
      this.config.get<string>('MCP_UPLOAD_TEMP_STORAGE_PATH')
      || path.join(os.tmpdir(), 'pr-mcp-binary-import')
    );
  }

  get attachmentTimeoutMs(): number {
    return Number(this.config.get('MCP_ATTACHMENT_REFERENCE_TIMEOUT') ?? 30_000);
  }

  allowedAttachmentHosts(): string[] {
    const raw = this.config.get<string>('MCP_ATTACHMENT_REFERENCE_ALLOWED_HOSTS', '') || '';
    return raw
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }

  inspectAttachmentCapability(input: InspectAttachmentCapabilityInput) {
    if (!this.enabled) {
      return {
        supportedTransport: 'UNSUPPORTED' as BinaryTransportMode,
        errorCode: BinaryImportErrorCode.BINARY_IMPORT_DISABLED,
        message: 'MCP binary FILE_PRESERVE import is disabled',
        serverSupportsHostReference: false,
        serverSupportsChunkedBinary: false,
        neverConvertsMarkdownToOffice: true,
      };
    }

    const hasHostReference = Boolean(
      String(input.attachmentReference || '').trim() || String(input.fileUrl || '').trim(),
    );

    if (hasHostReference) {
      return {
        supportedTransport: 'HOST_REFERENCE' as BinaryTransportMode,
        message: 'HTTPS attachmentReference/fileUrl available — use import_original_file',
        serverSupportsHostReference: true,
        serverSupportsChunkedBinary: true,
        neverConvertsMarkdownToOffice: true,
        fileName: input.fileName ?? null,
        expectedFileSize: input.expectedFileSize ?? null,
      };
    }

    if (input.canProvideExactBytes === true) {
      return {
        supportedTransport: 'CHUNKED_BINARY' as BinaryTransportMode,
        message: 'Use prepare_automatic_file_import → upload_original_file_chunk → complete',
        serverSupportsHostReference: true,
        serverSupportsChunkedBinary: true,
        neverConvertsMarkdownToOffice: true,
        acceptedChunkSize: this.chunkSize,
        maxFileSize: this.maxFileSize,
        maxChunks: this.maxChunks,
        fileName: input.fileName ?? null,
        expectedFileSize: input.expectedFileSize ?? null,
      };
    }

    return {
      supportedTransport: 'UNSUPPORTED' as BinaryTransportMode,
      errorCode: BinaryImportErrorCode.AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST,
      message:
        'Host supplied neither an HTTPS attachment reference/fileUrl nor exact binary chunk capability. '
        + 'ChatGPT does not expose attachment file_ids to this MCP. Do not convert Markdown to Office.',
      suggestedRecovery:
        'Provide a public HTTPS fileUrl, or enable host exact-byte chunking and call prepare_automatic_file_import',
      serverSupportsHostReference: true,
      serverSupportsChunkedBinary: true,
      neverConvertsMarkdownToOffice: true,
      browserUploadForbiddenAsPrimaryUx: true,
    };
  }

  /**
   * Mode A: fetch HTTPS attachmentReference/fileUrl and queue FILE_PRESERVE.
   * Never returns uploadUrl; never converts Markdown to Office.
   */
  async importOriginalFile(integration: McpIntegration, input: ImportOriginalFileInput) {
    this.assertEnabled();
    const fileUrl = String(input.fileUrl || input.attachmentReference || '').trim();
    if (!fileUrl) {
      binaryImportError(
        BinaryImportErrorCode.AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST,
        'No attachmentReference/fileUrl provided. Automatic transfer unsupported by host. '
          + 'Do not fall back to browser upload or Markdown→Office conversion.',
        {
          retryable: false,
          recovery:
            'Supply HTTPS fileUrl/attachmentReference, or use prepare_automatic_file_import if the host can chunk exact bytes',
        },
      );
    }

    await this.assertAttachmentHostAllowed(fileUrl);

    let fetched;
    try {
      fetched = await this.remoteFiles.fetchApprovedDocument(fileUrl, input.fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'download failed';
      binaryImportError(
        BinaryImportErrorCode.HOST_REFERENCE_FETCH_FAILED,
        `Could not fetch host attachment reference: ${message}`,
        { retryable: true, recovery: 'Retry import_original_file with a reachable HTTPS URL' },
      );
    }

    if (fetched.buffer.length > this.maxFileSize) {
      binaryImportError(
        BinaryImportErrorCode.FILE_TOO_LARGE,
        `File exceeds max size ${this.maxFileSize} bytes`,
        { retryable: false },
      );
    }

    const validation = validateStoredBinary(fetched.buffer, fetched.fileName || input.fileName);
    if (!validation.ok) {
      const code = validation.detectedKind === 'markdown_or_html'
        ? BinaryImportErrorCode.MARKDOWN_DISGUISED_AS_OFFICE
        : validation.detectedKind === 'corrupted_ooxml'
          ? BinaryImportErrorCode.INVALID_OOXML_PACKAGE
          : BinaryImportErrorCode.CORRUPTED_ZIP;
      binaryImportError(code, validation.details.join('; ') || 'Binary validation failed', {
        retryable: false,
        recovery: 'Provide the exact original OOXML/PDF bytes — never Markdown saved as .docx',
      });
    }

    if (input.sourceSha256?.trim()) {
      const actual = createHash('sha256').update(fetched.buffer).digest('hex');
      if (actual !== input.sourceSha256.trim().toLowerCase()) {
        binaryImportError(
          BinaryImportErrorCode.FILE_CHECKSUM_MISMATCH,
          'Fetched file SHA-256 does not match sourceSha256',
          { retryable: true },
        );
      }
    }

    this.orchestrator.assertApprovedStatus(input.approvalStatus);

    await fs.mkdir(this.tempRoot, { recursive: true });
    const stagedPath = path.join(
      this.tempRoot,
      `host-${randomBytes(12).toString('hex')}${path.extname(fetched.fileName || input.fileName) || '.bin'}`,
    );
    await fs.writeFile(stagedPath, fetched.buffer);

    try {
      const queued = await this.orchestrator.queueMcpApprovedDocument({
        provider: ConnectorProvider.CHATGPT_MCP,
        projectId: input.projectId,
        title: (input.title || input.fileName).trim(),
        documentCode: input.documentCode,
        documentType: input.documentType,
        description: input.description,
        owner: input.owner,
        versionNo: input.versionNo,
        approvalStatus: input.approvalStatus,
        approvedBy: input.approvedBy,
        approvalDate: input.approvalDate,
        sectionKey: input.sectionKey,
        metadataJson: input.metadataJson,
        relationshipsJson: input.relationshipsJson,
        mode: input.mode,
        existingDocumentId: input.existingDocumentId,
        fileName: fetched.fileName || input.fileName,
        filePath: stagedPath,
        mimeType: validation.mimeType || fetched.mimeType || input.mimeType,
        mcpIntegrationId: integration.id,
        processAsync: input.processAsync !== false,
        importMode: 'FILE_PRESERVE',
        conversionPerformed: false,
        originalFilename: input.fileName,
        sourceSha256: input.sourceSha256?.trim().toLowerCase(),
      });

      await this.audit.record({
        userId: integration.createdBy?.id,
        action: 'MCP_BINARY_IMPORT_HOST_REFERENCE',
        entityType: 'ImportJob',
        entityId: queued.importJobId,
        message: `Mode A FILE_PRESERVE queued for ${fetched.fileName}`,
        after: {
          transport: 'HOST_REFERENCE',
          importJobId: queued.importJobId,
          fileName: fetched.fileName,
          checksum: queued.checksum,
        },
      });

      await this.finishQueuedImport(queued, integration.createdBy?.id);

      return {
        transportMode: 'HOST_REFERENCE' as const,
        importMode: 'FILE_PRESERVE' as const,
        conversionPerformed: false,
        ...queued,
      };
    } finally {
      await fs.rm(stagedPath, { force: true }).catch(() => undefined);
    }
  }

  async prepareAutomaticFileImport(integration: McpIntegration, input: PrepareAutomaticFileImportInput) {
    this.assertEnabled();
    const fileName = String(input.fileName || '').trim();
    if (!fileName) {
      binaryImportError(BinaryImportErrorCode.INVALID_UPLOAD_SESSION, 'fileName is required');
    }

    const expectedSize = input.expectedFileSize != null ? Number(input.expectedFileSize) : null;
    if (expectedSize != null) {
      if (!Number.isFinite(expectedSize) || expectedSize < 1) {
        binaryImportError(BinaryImportErrorCode.FILE_SIZE_MISMATCH, 'expectedFileSize must be a positive number');
      }
      if (expectedSize > this.maxFileSize) {
        binaryImportError(
          BinaryImportErrorCode.FILE_TOO_LARGE,
          `expectedFileSize exceeds max ${this.maxFileSize}`,
          { retryable: false },
        );
      }
    }

    const chunkSize = this.chunkSize;
    let expectedChunkCount = input.expectedChunkCount != null ? Number(input.expectedChunkCount) : null;
    if (expectedChunkCount == null && expectedSize != null) {
      expectedChunkCount = Math.ceil(expectedSize / chunkSize);
    }
    if (expectedChunkCount != null) {
      if (!Number.isInteger(expectedChunkCount) || expectedChunkCount < 1) {
        binaryImportError(BinaryImportErrorCode.TOO_MANY_CHUNKS, 'expectedChunkCount must be a positive integer');
      }
      if (expectedChunkCount > this.maxChunks) {
        binaryImportError(
          BinaryImportErrorCode.TOO_MANY_CHUNKS,
          `expectedChunkCount ${expectedChunkCount} exceeds max ${this.maxChunks}`,
          { retryable: false },
        );
      }
    }

    const uploadToken = randomBytes(32).toString('hex');
    const uploadTokenHash = this.hashToken(uploadToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTtlSec * 1000);

    await fs.mkdir(this.tempRoot, { recursive: true });

    const session = this.db.mcpBinaryImportSessions.create({
      uploadTokenHash,
      integrationKey: integration.id,
      userId: input.userId ?? integration.createdBy?.id ?? null,
      projectId: input.projectId,
      projectCode: input.projectCode ?? null,
      module: input.module ?? null,
      sectionKey: input.sectionKey ?? null,
      documentType: input.documentType ?? null,
      documentId: input.documentId ?? null,
      documentCode: input.documentCode ?? null,
      mode: input.mode || 'NEW_DOCUMENT',
      source: 'CHATGPT',
      transportMode: 'CHUNKED_BINARY',
      originalFileName: fileName,
      expectedFileSize: expectedSize != null ? String(expectedSize) : null,
      expectedSha256: input.expectedSha256?.trim().toLowerCase() || null,
      declaredMimeType: input.declaredMimeType ?? null,
      chunkSize,
      expectedChunkCount,
      receivedChunkCount: 0,
      receivedChunks: [],
      tempDir: path.join(this.tempRoot, 'pending'),
      status: McpBinaryImportStatus.RECEIVING,
      expiresAt,
      lastActivityAt: now,
    });

    const saved = await this.db.mcpBinaryImportSessions.save(session);
    const sessionTemp = path.join(this.tempRoot, saved.id);
    await fs.mkdir(sessionTemp, { recursive: true });
    saved.tempDir = sessionTemp;
    await this.db.mcpBinaryImportSessions.save(saved);

    const meta = {
      uploadId: saved.id,
      originalFileName: fileName,
      chunkSize,
      expectedChunkCount,
      expectedFileSize: expectedSize,
      expectedSha256: saved.expectedSha256,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    await fs.writeFile(path.join(sessionTemp, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    await this.audit.record({
      userId: saved.userId ?? undefined,
      action: 'MCP_BINARY_IMPORT_PREPARE',
      entityType: 'McpBinaryImportSession',
      entityId: saved.id,
      message: `Prepared chunked FILE_PRESERVE session for ${fileName}`,
      after: {
        uploadId: saved.id,
        chunkSize,
        expectedChunkCount,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      uploadId: saved.id,
      uploadToken,
      transportMode: 'CHUNKED_BINARY' as const,
      acceptedChunkSize: chunkSize,
      expectedChunkCount: expectedChunkCount ?? null,
      maxFileSize: this.maxFileSize,
      maxChunks: this.maxChunks,
      expiresAt: expiresAt.toISOString(),
      originalFileName: fileName,
      status: saved.status,
      hint: 'Upload each exact raw chunk as base64 with upload_original_file_chunk, then complete_automatic_file_import',
    };
  }

  async uploadOriginalFileChunk(input: UploadOriginalFileChunkInput) {
    this.assertEnabled();
    const session = await this.requireSession(input.uploadId, input.uploadToken, {
      allowStatuses: [McpBinaryImportStatus.RECEIVING, McpBinaryImportStatus.PAUSED, McpBinaryImportStatus.PREPARING],
    });

    const index = Number(input.chunkIndex);
    if (!Number.isInteger(index) || index < 0) {
      binaryImportError(BinaryImportErrorCode.CHUNK_INDEX_OUT_OF_RANGE, 'chunkIndex must be a non-negative integer', {
        uploadId: session.id,
      });
    }
    if (session.expectedChunkCount != null && index >= session.expectedChunkCount) {
      binaryImportError(
        BinaryImportErrorCode.CHUNK_INDEX_OUT_OF_RANGE,
        `chunkIndex ${index} out of range (0..${session.expectedChunkCount - 1})`,
        { uploadId: session.id },
      );
    }
    if (index >= this.maxChunks) {
      binaryImportError(
        BinaryImportErrorCode.TOO_MANY_CHUNKS,
        `chunkIndex ${index} exceeds maxChunks ${this.maxChunks}`,
        { uploadId: session.id },
      );
    }

    const rawB64 = String(input.chunkBase64 ?? '').replace(/\s+/g, '');
    if (!rawB64 || !/^[A-Za-z0-9+/]+=*$/.test(rawB64)) {
      binaryImportError(BinaryImportErrorCode.INVALID_BASE64, 'chunkBase64 must be valid base64', {
        uploadId: session.id,
        retryable: true,
      });
    }

    let chunk: Buffer;
    try {
      chunk = Buffer.from(rawB64, 'base64');
    } catch {
      binaryImportError(BinaryImportErrorCode.INVALID_BASE64, 'Failed to decode chunkBase64', {
        uploadId: session.id,
        retryable: true,
      });
    }

    const declaredLen = Number(input.rawByteLength);
    if (!Number.isInteger(declaredLen) || declaredLen !== chunk.length) {
      binaryImportError(
        BinaryImportErrorCode.CHUNK_SIZE_MISMATCH,
        `rawByteLength ${declaredLen} does not match decoded length ${chunk.length}`,
        { uploadId: session.id, retryable: true },
      );
    }

    // Last chunk may be shorter; others should match accepted chunk size when expected count known
    if (
      session.expectedChunkCount != null
      && index < session.expectedChunkCount - 1
      && chunk.length !== session.chunkSize
    ) {
      binaryImportError(
        BinaryImportErrorCode.CHUNK_SIZE_MISMATCH,
        `Non-final chunk length ${chunk.length} != acceptedChunkSize ${session.chunkSize}`,
        { uploadId: session.id, retryable: true },
      );
    }
    if (chunk.length > session.chunkSize) {
      binaryImportError(
        BinaryImportErrorCode.CHUNK_SIZE_MISMATCH,
        `Chunk length ${chunk.length} exceeds acceptedChunkSize ${session.chunkSize}`,
        { uploadId: session.id, retryable: true },
      );
    }

    const actualChunkSha = createHash('sha256').update(chunk).digest('hex');
    const expectedChunkSha = String(input.chunkSha256 || '').trim().toLowerCase();
    if (!expectedChunkSha || actualChunkSha !== expectedChunkSha) {
      binaryImportError(
        BinaryImportErrorCode.CHUNK_CHECKSUM_MISMATCH,
        'chunkSha256 does not match decoded chunk bytes',
        { uploadId: session.id, retryable: true },
      );
    }

    await fs.mkdir(session.tempDir, { recursive: true });
    const chunkPath = path.join(session.tempDir, `chunk-${index}.bin`);
    if (existsSync(chunkPath)) {
      const existing = await fs.readFile(chunkPath);
      const existingSha = createHash('sha256').update(existing).digest('hex');
      if (existingSha !== actualChunkSha) {
        binaryImportError(
          BinaryImportErrorCode.CONFLICTING_DUPLICATE_CHUNK,
          `Chunk ${index} already stored with a different SHA-256`,
          { uploadId: session.id, retryable: false },
        );
      }
      const received = new Set(session.receivedChunks || []);
      received.add(index);
      session.receivedChunks = Array.from(received).sort((a, b) => a - b);
      session.receivedChunkCount = session.receivedChunks.length;
      session.status = McpBinaryImportStatus.RECEIVING;
      session.lastActivityAt = new Date();
      await this.db.mcpBinaryImportSessions.save(session);
      return {
        uploadId: session.id,
        chunkIndex: index,
        accepted: true,
        duplicate: true,
        receivedChunkCount: session.receivedChunkCount,
        expectedChunkCount: session.expectedChunkCount,
        receivedChunks: session.receivedChunks,
        complete:
          session.expectedChunkCount != null
          && session.receivedChunkCount >= session.expectedChunkCount,
        status: session.status,
      };
    }

    await fs.writeFile(chunkPath, chunk);

    const received = new Set(session.receivedChunks || []);
    received.add(index);
    const receivedChunks = Array.from(received).sort((a, b) => a - b);
    session.receivedChunks = receivedChunks;
    session.receivedChunkCount = receivedChunks.length;
    session.status = McpBinaryImportStatus.RECEIVING;
    session.lastActivityAt = new Date();
    session.errorCode = null;
    session.errorMessage = null;
    await this.db.mcpBinaryImportSessions.save(session);

    const complete = session.expectedChunkCount != null
      && session.receivedChunkCount >= session.expectedChunkCount;

    return {
      uploadId: session.id,
      chunkIndex: index,
      accepted: true,
      duplicate: false,
      receivedChunkCount: session.receivedChunkCount,
      expectedChunkCount: session.expectedChunkCount,
      receivedChunks,
      complete,
      status: session.status,
    };
  }

  async getProgress(uploadId: string, uploadToken: string) {
    const session = await this.requireSession(uploadId, uploadToken, { allowAnyActive: true });
    return this.progressView(session);
  }

  async resume(uploadId: string, uploadToken: string) {
    const session = await this.requireSession(uploadId, uploadToken, {
      allowStatuses: [
        McpBinaryImportStatus.RECEIVING,
        McpBinaryImportStatus.PAUSED,
        McpBinaryImportStatus.PREPARING,
        McpBinaryImportStatus.FAILED,
      ],
    });

    if (session.status === McpBinaryImportStatus.FAILED || session.status === McpBinaryImportStatus.PAUSED) {
      session.status = McpBinaryImportStatus.RECEIVING;
      session.errorCode = null;
      session.errorMessage = null;
      session.retryable = false;
      session.lastActivityAt = new Date();
      await this.db.mcpBinaryImportSessions.save(session);
    }

    const missingChunks: number[] = [];
    if (session.expectedChunkCount != null) {
      const have = new Set(session.receivedChunks || []);
      for (let i = 0; i < session.expectedChunkCount; i += 1) {
        if (!have.has(i)) missingChunks.push(i);
      }
    }

    return {
      ...this.progressView(session),
      missingChunks: missingChunks.slice(0, 100),
      missingChunkCount: missingChunks.length,
      acceptedChunkSize: session.chunkSize,
      hint: missingChunks.length
        ? 'Re-upload missing chunk indexes then call complete'
        : 'All expected chunks present — call complete_automatic_file_import',
    };
  }

  async complete(
    uploadId: string,
    uploadToken: string,
    integration: McpIntegration,
    queueInput: Omit<ImportOriginalFileInput, 'attachmentReference' | 'fileUrl' | 'fileName'> & {
      fileName?: string;
    },
  ) {
    this.assertEnabled();
    const session = await this.requireSession(uploadId, uploadToken, {
      allowStatuses: [McpBinaryImportStatus.RECEIVING, McpBinaryImportStatus.PAUSED, McpBinaryImportStatus.AVAILABLE],
    });

    if (session.status === McpBinaryImportStatus.AVAILABLE && session.importJobId) {
      // Recover stuck READY_FOR_REVIEW jobs from earlier builds that queued but never processed.
      this.connectorImports.enqueueSingleImport(session.importJobId, {
        userId: session.userId ?? integration.createdBy?.id ?? null,
      });
      return {
        uploadId: session.id,
        transportMode: 'CHUNKED_BINARY' as const,
        importMode: 'FILE_PRESERVE' as const,
        conversionPerformed: false,
        importJobId: session.importJobId,
        status: session.status,
        actualSha256: session.actualSha256,
        actualFileSize: session.actualFileSize ? Number(session.actualFileSize) : null,
        replayed: true,
      };
    }

    const expectedCount = session.expectedChunkCount;
    const received = [...(session.receivedChunks || [])].sort((a, b) => a - b);
    if (expectedCount == null) {
      if (!received.length) {
        binaryImportError(BinaryImportErrorCode.MISSING_CHUNKS, 'No chunks received', {
          uploadId: session.id,
          retryable: true,
        });
      }
      // Infer contiguous 0..max
      const maxIdx = received[received.length - 1];
      const missing: number[] = [];
      for (let i = 0; i <= maxIdx; i += 1) {
        if (!received.includes(i)) missing.push(i);
      }
      if (missing.length) {
        binaryImportError(
          BinaryImportErrorCode.MISSING_CHUNKS,
          `Missing chunk indexes: ${missing.slice(0, 20).join(', ')}`,
          { uploadId: session.id, retryable: true },
        );
      }
      session.expectedChunkCount = maxIdx + 1;
    } else {
      const missing: number[] = [];
      for (let i = 0; i < expectedCount; i += 1) {
        if (!received.includes(i)) missing.push(i);
      }
      if (missing.length) {
        binaryImportError(
          BinaryImportErrorCode.MISSING_CHUNKS,
          `Missing ${missing.length} chunk(s): ${missing.slice(0, 20).join(', ')}`,
          { uploadId: session.id, retryable: true },
        );
      }
    }

    session.status = McpBinaryImportStatus.ASSEMBLING;
    session.lastActivityAt = new Date();
    await this.db.mcpBinaryImportSessions.save(session);

    const assembledPath = path.join(session.tempDir, 'assembled.bin');
    const chunkCount = session.expectedChunkCount!;
    const hash = createHash('sha256');
    let totalBytes = 0;

    try {
      await fs.mkdir(session.tempDir, { recursive: true });
      const out = createWriteStream(assembledPath);
      for (let i = 0; i < chunkCount; i += 1) {
        const chunkPath = path.join(session.tempDir, `chunk-${i}.bin`);
        if (!existsSync(chunkPath)) {
          binaryImportError(
            BinaryImportErrorCode.MISSING_CHUNKS,
            `Chunk file missing on disk: chunk-${i}.bin`,
            { uploadId: session.id, retryable: true },
          );
        }
        const rs = createReadStream(chunkPath);
        for await (const piece of rs) {
          const buf = piece as Buffer;
          hash.update(buf);
          totalBytes += buf.length;
          if (!out.write(buf)) {
            await new Promise<void>((resolve) => out.once('drain', () => resolve()));
          }
        }
      }
      await new Promise<void>((resolve, reject) => {
        out.end(() => resolve());
        out.on('error', reject);
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      session.status = McpBinaryImportStatus.FAILED;
      session.errorCode = BinaryImportErrorCode.ASSEMBLY_FAILED;
      session.errorMessage = error instanceof Error ? error.message : 'assembly failed';
      session.retryable = true;
      await this.db.mcpBinaryImportSessions.save(session);
      binaryImportError(BinaryImportErrorCode.ASSEMBLY_FAILED, session.errorMessage, {
        uploadId: session.id,
        retryable: true,
      });
    }

    const actualSha256 = hash.digest('hex');

    if (session.expectedFileSize != null && Number(session.expectedFileSize) !== totalBytes) {
      await this.failSession(session, BinaryImportErrorCode.FILE_SIZE_MISMATCH,
        `Assembled size ${totalBytes} != expected ${session.expectedFileSize}`);
      binaryImportError(
        BinaryImportErrorCode.FILE_SIZE_MISMATCH,
        `Assembled size ${totalBytes} != expected ${session.expectedFileSize}`,
        { uploadId: session.id, retryable: true },
      );
    }

    if (session.expectedSha256 && session.expectedSha256 !== actualSha256) {
      await this.failSession(session, BinaryImportErrorCode.FILE_CHECKSUM_MISMATCH,
        'Assembled SHA-256 does not match expectedSha256');
      binaryImportError(
        BinaryImportErrorCode.FILE_CHECKSUM_MISMATCH,
        'Assembled SHA-256 does not match expectedSha256',
        { uploadId: session.id, retryable: true },
      );
    }

    if (totalBytes > this.maxFileSize) {
      await this.failSession(session, BinaryImportErrorCode.FILE_TOO_LARGE, 'Assembled file too large');
      binaryImportError(BinaryImportErrorCode.FILE_TOO_LARGE, 'Assembled file too large', {
        uploadId: session.id,
      });
    }

    session.status = McpBinaryImportStatus.VALIDATING;
    await this.db.mcpBinaryImportSessions.save(session);

    const fileName = queueInput.fileName?.trim() || session.originalFileName;
    const validation = await validateStoredBinaryFromFile(assembledPath, fileName);
    session.validationDetails = validation.details;
    session.validationStatus = validation.ok ? 'OK' : 'FAILED';
    session.detectedMimeType = validation.mimeType ?? null;
    session.actualFileSize = String(totalBytes);
    session.actualSha256 = actualSha256;

    if (!validation.ok) {
      const code = validation.detectedKind === 'markdown_or_html'
        ? BinaryImportErrorCode.MARKDOWN_DISGUISED_AS_OFFICE
        : validation.detectedKind === 'corrupted_ooxml'
          ? BinaryImportErrorCode.INVALID_OOXML_PACKAGE
          : BinaryImportErrorCode.CORRUPTED_ZIP;
      await this.failSession(session, code, validation.details.join('; '));
      binaryImportError(code, validation.details.join('; ') || 'Validation failed', {
        uploadId: session.id,
        recovery: 'Re-upload exact original OOXML/PDF bytes — never Markdown as .docx',
      });
    }

    this.orchestrator.assertApprovedStatus(queueInput.approvalStatus);

    const queued = await this.orchestrator.queueMcpApprovedDocument({
      provider: ConnectorProvider.CHATGPT_MCP,
      projectId: queueInput.projectId || session.projectId!,
      title: (queueInput.title || fileName).trim(),
      documentCode: queueInput.documentCode || session.documentCode || undefined,
      documentType: queueInput.documentType || session.documentType || 'Article',
      description: queueInput.description,
      owner: queueInput.owner,
      versionNo: queueInput.versionNo,
      approvalStatus: queueInput.approvalStatus,
      approvedBy: queueInput.approvedBy,
      approvalDate: queueInput.approvalDate,
      sectionKey: queueInput.sectionKey || session.sectionKey || undefined,
      metadataJson: queueInput.metadataJson,
      relationshipsJson: queueInput.relationshipsJson,
      mode: queueInput.mode,
      existingDocumentId: queueInput.existingDocumentId || session.documentId || undefined,
      fileName,
      filePath: assembledPath,
      mimeType: validation.mimeType || session.declaredMimeType || undefined,
      mcpIntegrationId: integration.id,
      processAsync: queueInput.processAsync !== false,
      importMode: 'FILE_PRESERVE',
      conversionPerformed: false,
      originalFilename: session.originalFileName,
      sourceSha256: actualSha256,
    });

    session.status = McpBinaryImportStatus.AVAILABLE;
    session.importJobId = queued.importJobId;
    session.completedAt = new Date();
    session.lastActivityAt = session.completedAt;
    session.errorCode = null;
    session.errorMessage = null;
    await this.db.mcpBinaryImportSessions.save(session);

    await this.audit.record({
      userId: session.userId ?? integration.createdBy?.id,
      action: 'MCP_BINARY_IMPORT_COMPLETE',
      entityType: 'McpBinaryImportSession',
      entityId: session.id,
      message: `Mode C FILE_PRESERVE completed for ${fileName}`,
      after: {
        uploadId: session.id,
        importJobId: queued.importJobId,
        actualSha256,
        actualFileSize: totalBytes,
      },
    });

    await this.finishQueuedImport(queued, session.userId ?? integration.createdBy?.id);

    // Best-effort cleanup of chunk files (keep assembled briefly)
    this.cleanupChunks(session.tempDir, chunkCount).catch(() => undefined);

    return {
      uploadId: session.id,
      transportMode: 'CHUNKED_BINARY' as const,
      importMode: 'FILE_PRESERVE' as const,
      conversionPerformed: false,
      ...queued,
      actualSha256,
      actualFileSize: totalBytes,
      detectedKind: validation.detectedKind,
      validationStatus: session.validationStatus,
    };
  }

  async abort(uploadId: string, uploadToken: string, reason?: string) {
    const session = await this.requireSession(uploadId, uploadToken, { allowAnyActive: true });
    if (
      session.status === McpBinaryImportStatus.AVAILABLE
      || session.status === McpBinaryImportStatus.ABORTED
    ) {
      return { uploadId: session.id, status: session.status };
    }

    session.status = McpBinaryImportStatus.ABORTED;
    session.errorCode = BinaryImportErrorCode.UPLOAD_SESSION_ABORTED;
    session.errorMessage = reason?.trim() || 'Aborted by client';
    session.lastActivityAt = new Date();
    session.completedAt = session.lastActivityAt;
    await this.db.mcpBinaryImportSessions.save(session);

    await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => undefined);

    return {
      uploadId: session.id,
      aborted: true,
      status: session.status,
      temporaryDataRemoved: true,
      existingDocumentPreserved: true,
      message: session.errorMessage,
    };
  }

  /** Mark expired in-flight sessions and delete their temp chunk dirs. */
  async expireStaleSessions(): Promise<{ expired: number }> {
    const now = new Date();
    const stale = await this.db.mcpBinaryImportSessions.find({
      where: {
        expiresAt: LessThan(now),
        status: In([
          McpBinaryImportStatus.PREPARING,
          McpBinaryImportStatus.RECEIVING,
          McpBinaryImportStatus.PAUSED,
          McpBinaryImportStatus.ASSEMBLING,
          McpBinaryImportStatus.VALIDATING,
          McpBinaryImportStatus.FAILED,
        ]),
      },
      take: 200,
    });
    let expired = 0;
    for (const session of stale) {
      session.status = McpBinaryImportStatus.EXPIRED;
      session.errorCode = BinaryImportErrorCode.UPLOAD_SESSION_EXPIRED;
      session.errorMessage = 'Upload session expired';
      session.lastActivityAt = now;
      await this.db.mcpBinaryImportSessions.save(session);
      if (session.tempDir) {
        await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
      expired += 1;
    }
    return { expired };
  }

  private progressView(session: McpBinaryImportSession) {
    return {
      uploadId: session.id,
      status: session.status,
      originalFileName: session.originalFileName,
      receivedChunkCount: session.receivedChunkCount,
      expectedChunkCount: session.expectedChunkCount,
      receivedChunks: session.receivedChunks || [],
      expectedFileSize: session.expectedFileSize != null ? Number(session.expectedFileSize) : null,
      actualFileSize: session.actualFileSize != null ? Number(session.actualFileSize) : null,
      expectedSha256: session.expectedSha256,
      actualSha256: session.actualSha256,
      validationStatus: session.validationStatus,
      errorCode: session.errorCode,
      errorMessage: session.errorMessage,
      retryable: session.retryable,
      importJobId: session.importJobId,
      expiresAt: session.expiresAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
    };
  }

  private assertEnabled() {
    if (!this.enabled) {
      binaryImportError(
        BinaryImportErrorCode.BINARY_IMPORT_DISABLED,
        'MCP binary FILE_PRESERVE import is disabled',
      );
    }
  }

  /** Match submit_approved_document: stage then process when no human review needed. */
  private async finishQueuedImport(
    queued: { importJobId: string; needsReview?: boolean },
    userId?: string | null,
  ) {
    if (queued.needsReview) return;
    try {
      await this.connectorImports.processReadyImport(queued.importJobId, {
        userId: userId ?? null,
      });
    } catch {
      // Binary session is already verified; leave job at READY_FOR_REVIEW for get_import_status retry.
    }
  }

  private async assertAttachmentHostAllowed(fileUrl: string) {
    const allowed = this.allowedAttachmentHosts();
    if (!allowed.length) return; // fall through to McpRemoteFileService SSRF rules on fetch
    let url: URL;
    try {
      url = this.remoteFiles.parsePublicHttpUrl(fileUrl);
    } catch {
      binaryImportError(
        BinaryImportErrorCode.HOST_REFERENCE_HOST_NOT_ALLOWED,
        'attachmentReference/fileUrl is not a valid public HTTP(S) URL',
      );
    }
    const host = url.hostname.toLowerCase();
    if (!allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
      binaryImportError(
        BinaryImportErrorCode.HOST_REFERENCE_HOST_NOT_ALLOWED,
        `Host '${host}' is not in MCP_ATTACHMENT_REFERENCE_ALLOWED_HOSTS`,
        { retryable: false },
      );
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(String(token), 'utf8').digest('hex');
  }

  private async requireSession(
    uploadId: string,
    uploadToken: string,
    opts: {
      allowStatuses?: McpBinaryImportStatus[];
      allowAnyActive?: boolean;
    },
  ): Promise<McpBinaryImportSession> {
    const id = String(uploadId || '').trim();
    if (!id) {
      binaryImportError(BinaryImportErrorCode.INVALID_UPLOAD_SESSION, 'uploadId is required');
    }

    const session = await this.db.mcpBinaryImportSessions.findOne({ where: { id } });
    if (!session) {
      binaryImportError(BinaryImportErrorCode.INVALID_UPLOAD_SESSION, 'Upload session not found', {
        uploadId: id,
      });
    }

    const tokenHash = this.hashToken(uploadToken);
    const a = Buffer.from(tokenHash, 'utf8');
    const b = Buffer.from(session.uploadTokenHash, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      binaryImportError(BinaryImportErrorCode.INVALID_UPLOAD_TOKEN, 'Invalid uploadToken', {
        uploadId: session.id,
      });
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      if (session.status !== McpBinaryImportStatus.EXPIRED) {
        session.status = McpBinaryImportStatus.EXPIRED;
        session.errorCode = BinaryImportErrorCode.UPLOAD_SESSION_EXPIRED;
        session.errorMessage = 'Upload session expired';
        await this.db.mcpBinaryImportSessions.save(session).catch(() => undefined);
      }
      binaryImportError(BinaryImportErrorCode.UPLOAD_SESSION_EXPIRED, 'Upload session expired', {
        uploadId: session.id,
        retryable: false,
        recovery: 'Call prepare_automatic_file_import again',
      });
    }

    if (session.status === McpBinaryImportStatus.ABORTED) {
      binaryImportError(BinaryImportErrorCode.UPLOAD_SESSION_ABORTED, 'Upload session was aborted', {
        uploadId: session.id,
      });
    }

    if (opts.allowAnyActive) {
      return session;
    }

    const allowed = opts.allowStatuses || [];
    if (allowed.length && !allowed.includes(session.status)) {
      binaryImportError(
        BinaryImportErrorCode.SESSION_NOT_RECEIVING,
        `Session status ${session.status} does not allow this operation`,
        { uploadId: session.id, retryable: session.status === McpBinaryImportStatus.FAILED },
      );
    }

    return session;
  }

  private async failSession(
    session: McpBinaryImportSession,
    code: string,
    message: string,
  ) {
    session.status = McpBinaryImportStatus.FAILED;
    session.errorCode = code;
    session.errorMessage = message;
    session.retryable = true;
    session.lastActivityAt = new Date();
    await this.db.mcpBinaryImportSessions.save(session);
  }

  private async cleanupChunks(tempDir: string, chunkCount: number) {
    for (let i = 0; i < chunkCount; i += 1) {
      await fs.rm(path.join(tempDir, `chunk-${i}.bin`), { force: true }).catch(() => undefined);
    }
  }
}
