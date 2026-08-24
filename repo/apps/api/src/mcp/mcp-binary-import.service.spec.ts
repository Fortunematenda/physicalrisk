import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpBinaryImportStatus, McpIntegration, McpIntegrationStatus } from '../database/entities';
import { BinaryImportErrorCode } from './mcp-binary-import.errors';
import { McpBinaryImportService } from './mcp-binary-import.service';

/** Minimal store-method ZIP for tests (local + central + EOCD). */
function buildMinimalZip(entries: Array<{ name: string; data: Buffer | string }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const local = Buffer.alloc(30 + nameBuf.length + dataBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    dataBuf.copy(local, 30 + nameBuf.length);
    locals.push(local);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('McpBinaryImportService', () => {
  const integration: McpIntegration = {
    id: 'integration-1',
    name: 'ChatGPT',
    status: McpIntegrationStatus.ACTIVE,
    apiKeyHash: 'hash',
    apiKeyPrefix: 'mcp_abc',
    allowedProjectIds: ['project-1'],
    allowedTools: [],
    expiresAt: null,
    lastUsedAt: null,
    createdBy: { id: 'user-1' } as any,
    rotatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let tempRoot: string;
  let sessions: Map<string, any>;
  let service: McpBinaryImportService;
  let orchestrator: { assertApprovedStatus: jest.Mock; queueMcpApprovedDocument: jest.Mock };

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-bin-test-'));
    sessions = new Map();

    const repo = {
      create: jest.fn((row: any) => ({ ...row })),
      save: jest.fn(async (row: any) => {
        if (!row.id) {
          row.id = `upload-${sessions.size + 1}`;
          row.createdAt = new Date();
          row.updatedAt = new Date();
        }
        sessions.set(row.id, { ...row });
        return sessions.get(row.id);
      }),
      findOne: jest.fn(async ({ where }: any) => {
        const row = sessions.get(where.id);
        return row ? { ...row } : null;
      }),
      find: jest.fn(async () => []),
    };

    orchestrator = {
      assertApprovedStatus: jest.fn(),
      queueMcpApprovedDocument: jest.fn(async (req: any) => {
        const buf = req.filePath
          ? await fs.readFile(req.filePath)
          : Buffer.from(req.fileContentBase64, 'base64');
        const checksum = createHash('sha256').update(buf).digest('hex');
        return {
          importJobId: 'job-1',
          status: 'READY_FOR_REVIEW',
          externalImportStatus: 'READY_FOR_REVIEW',
          checksum,
          fileName: req.fileName,
          imported: false,
          importMode: 'FILE_PRESERVE',
          conversionPerformed: false,
          originalFilename: req.originalFilename,
          sourceSha256: checksum,
          storedSha256: checksum,
          checksumVerified: true,
        };
      }),
    };

    const config = {
      get: jest.fn((key: string, def?: string) => {
        const values: Record<string, string> = {
          MCP_BINARY_IMPORT_ENABLED: 'true',
          MCP_BINARY_IMPORT_MAX_FILE_SIZE: '524288000',
          MCP_BINARY_IMPORT_CHUNK_SIZE: '64',
          MCP_BINARY_IMPORT_SESSION_TTL: '3600',
          MCP_BINARY_IMPORT_MAX_CHUNKS: '4000',
          MCP_UPLOAD_TEMP_STORAGE_PATH: tempRoot,
          MCP_ATTACHMENT_REFERENCE_ALLOWED_HOSTS: '',
          MCP_ATTACHMENT_REFERENCE_TIMEOUT: '30000',
        };
        return values[key] ?? def;
      }),
    };

    service = new McpBinaryImportService(
      { mcpBinaryImportSessions: repo } as any,
      config as any,
      { fetchApprovedDocument: jest.fn(), parsePublicHttpUrl: jest.fn() } as any,
      orchestrator as any,
      { record: jest.fn() } as any,
    );
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  it('inspect returns UNSUPPORTED when neither host reference nor exact bytes', () => {
    const result = service.inspectAttachmentCapability({ fileName: 'a.docx' });
    expect(result.supportedTransport).toBe('UNSUPPORTED');
    expect(result.errorCode).toBe(BinaryImportErrorCode.AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST);
  });

  it('inspect returns HOST_REFERENCE when fileUrl present', () => {
    const result = service.inspectAttachmentCapability({
      fileUrl: 'https://example.com/a.docx',
      fileName: 'a.docx',
    });
    expect(result.supportedTransport).toBe('HOST_REFERENCE');
  });

  it('inspect returns CHUNKED_BINARY when host can provide exact bytes', () => {
    const result = service.inspectAttachmentCapability({
      fileName: 'a.docx',
      canProvideExactBytes: true,
    });
    expect(result.supportedTransport).toBe('CHUNKED_BINARY');
  });

  it('importOriginalFile throws AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST without URL', async () => {
    try {
      await service.importOriginalFile(integration, {
        projectId: 'project-1',
        fileName: 'a.docx',
        documentType: 'Article',
        versionNo: 'Rev 1.0',
        approvalStatus: 'APPROVED',
        approvedBy: 'Tester',
        approvalDate: '2026-08-24',
      });
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as any;
      expect(body.errorCode).toBe(BinaryImportErrorCode.AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST);
    }
  });

  it('prepare → chunk → complete happy path with tiny fake docx', async () => {
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const expectedSha = createHash('sha256').update(docx).digest('hex');

    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: docx.length,
      expectedSha256: expectedSha,
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(prepared.uploadId).toBeTruthy();
    expect(prepared.uploadToken).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.acceptedChunkSize).toBe(64);
    expect(prepared.expectedChunkCount).toBe(Math.ceil(docx.length / 64));

    const chunkSize = prepared.acceptedChunkSize;
    for (let i = 0; i < prepared.expectedChunkCount!; i += 1) {
      const start = i * chunkSize;
      const chunk = docx.subarray(start, Math.min(start + chunkSize, docx.length));
      const chunkSha256 = createHash('sha256').update(chunk).digest('hex');
      const result = await service.uploadOriginalFileChunk({
        uploadId: prepared.uploadId,
        uploadToken: prepared.uploadToken,
        chunkIndex: i,
        chunkBase64: chunk.toString('base64'),
        chunkSha256,
        rawByteLength: chunk.length,
      });
      expect(result.receivedChunkCount).toBe(i + 1);
    }

    const progress = await service.getProgress(prepared.uploadId, prepared.uploadToken);
    expect(progress.receivedChunkCount).toBe(prepared.expectedChunkCount);
    expect(progress.status).toBe(McpBinaryImportStatus.RECEIVING);

    const completed = await service.complete(prepared.uploadId, prepared.uploadToken, integration, {
      projectId: 'project-1',
      documentType: 'Article',
      versionNo: 'Rev 1.0',
      approvalStatus: 'APPROVED',
      approvedBy: 'Tester',
      approvalDate: '2026-08-24',
      fileName: 'memo.docx',
    });

    expect(completed.importMode).toBe('FILE_PRESERVE');
    expect(completed.conversionPerformed).toBe(false);
    expect(completed.actualSha256).toBe(expectedSha);
    expect(completed.importJobId).toBe('job-1');
    expect(orchestrator.queueMcpApprovedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        importMode: 'FILE_PRESERVE',
        conversionPerformed: false,
        fileName: 'memo.docx',
        sourceSha256: expectedSha,
        filePath: expect.any(String),
      }),
    );
  });

  it('accepts a valid duplicate chunk without rewriting', async () => {
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: 10,
    });
    const chunk = Buffer.from('helloworld');
    const chunkSha256 = createHash('sha256').update(chunk).digest('hex');
    const first = await service.uploadOriginalFileChunk({
      uploadId: prepared.uploadId,
      uploadToken: prepared.uploadToken,
      chunkIndex: 0,
      chunkBase64: chunk.toString('base64'),
      chunkSha256,
      rawByteLength: chunk.length,
    });
    expect(first.duplicate).toBe(false);
    const second = await service.uploadOriginalFileChunk({
      uploadId: prepared.uploadId,
      uploadToken: prepared.uploadToken,
      chunkIndex: 0,
      chunkBase64: chunk.toString('base64'),
      chunkSha256,
      rawByteLength: chunk.length,
    });
    expect(second.duplicate).toBe(true);
    expect(second.accepted).toBe(true);
    expect(second.receivedChunkCount).toBe(1);
  });

  it('rejects a conflicting duplicate chunk', async () => {
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: 10,
    });
    const first = Buffer.from('helloworld');
    await service.uploadOriginalFileChunk({
      uploadId: prepared.uploadId,
      uploadToken: prepared.uploadToken,
      chunkIndex: 0,
      chunkBase64: first.toString('base64'),
      chunkSha256: createHash('sha256').update(first).digest('hex'),
      rawByteLength: first.length,
    });
    const second = Buffer.from('otherworld');
    try {
      await service.uploadOriginalFileChunk({
        uploadId: prepared.uploadId,
        uploadToken: prepared.uploadToken,
        chunkIndex: 0,
        chunkBase64: second.toString('base64'),
        chunkSha256: createHash('sha256').update(second).digest('hex'),
        rawByteLength: second.length,
      });
      fail('expected throw');
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as any;
      expect(body.errorCode).toBe(BinaryImportErrorCode.CONFLICTING_DUPLICATE_CHUNK);
    }
  });

  it('rejects complete when chunks are missing', async () => {
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: docx.length,
    });
    const chunk = docx.subarray(0, prepared.acceptedChunkSize);
    await service.uploadOriginalFileChunk({
      uploadId: prepared.uploadId,
      uploadToken: prepared.uploadToken,
      chunkIndex: 0,
      chunkBase64: chunk.toString('base64'),
      chunkSha256: createHash('sha256').update(chunk).digest('hex'),
      rawByteLength: chunk.length,
    });
    await expect(
      service.complete(prepared.uploadId, prepared.uploadToken, integration, {
        projectId: 'project-1',
        documentType: 'Article',
        versionNo: 'Rev 1.0',
        approvalStatus: 'APPROVED',
        approvedBy: 'Tester',
        approvalDate: '2026-08-24',
        fileName: 'memo.docx',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects markdown disguised as docx on complete', async () => {
    const md = Buffer.from('# Title\n\nNot an Office file\n');
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: md.length,
    });
    const chunkSha256 = createHash('sha256').update(md).digest('hex');
    await service.uploadOriginalFileChunk({
      uploadId: prepared.uploadId,
      uploadToken: prepared.uploadToken,
      chunkIndex: 0,
      chunkBase64: md.toString('base64'),
      chunkSha256,
      rawByteLength: md.length,
    });
    try {
      await service.complete(prepared.uploadId, prepared.uploadToken, integration, {
        projectId: 'project-1',
        documentType: 'Article',
        versionNo: 'Rev 1.0',
        approvalStatus: 'APPROVED',
        approvedBy: 'Tester',
        approvalDate: '2026-08-24',
        fileName: 'memo.docx',
      });
      fail('expected throw');
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as any;
      expect(body.errorCode).toBe(BinaryImportErrorCode.MARKDOWN_DISGUISED_AS_OFFICE);
    }
    expect(orchestrator.queueMcpApprovedDocument).not.toHaveBeenCalled();
  });

  it('replays complete without creating a second job', async () => {
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: docx.length,
      expectedSha256: createHash('sha256').update(docx).digest('hex'),
    });
    const chunkSize = prepared.acceptedChunkSize;
    for (let i = 0; i < prepared.expectedChunkCount!; i += 1) {
      const chunk = docx.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, docx.length));
      await service.uploadOriginalFileChunk({
        uploadId: prepared.uploadId,
        uploadToken: prepared.uploadToken,
        chunkIndex: i,
        chunkBase64: chunk.toString('base64'),
        chunkSha256: createHash('sha256').update(chunk).digest('hex'),
        rawByteLength: chunk.length,
      });
    }
    const first = await service.complete(prepared.uploadId, prepared.uploadToken, integration, {
      projectId: 'project-1',
      documentType: 'Article',
      versionNo: 'Rev 1.0',
      approvalStatus: 'APPROVED',
      approvedBy: 'Tester',
      approvalDate: '2026-08-24',
      fileName: 'memo.docx',
    });
    const second = await service.complete(prepared.uploadId, prepared.uploadToken, integration, {
      projectId: 'project-1',
      documentType: 'Article',
      versionNo: 'Rev 1.0',
      approvalStatus: 'APPROVED',
      approvedBy: 'Tester',
      approvalDate: '2026-08-24',
      fileName: 'memo.docx',
    });
    expect(second.replayed).toBe(true);
    expect(second.importJobId).toBe(first.importJobId);
    expect(orchestrator.queueMcpApprovedDocument).toHaveBeenCalledTimes(1);
  });

  it('abort removes temp data and does not queue an import', async () => {
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: 10,
    });
    const aborted = await service.abort(prepared.uploadId, prepared.uploadToken, 'user cancelled');
    expect(aborted.status).toBe(McpBinaryImportStatus.ABORTED);
    expect(orchestrator.queueMcpApprovedDocument).not.toHaveBeenCalled();
  });

  it('rejects expired sessions', async () => {
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: 10,
    });
    const row = sessions.get(prepared.uploadId);
    row.expiresAt = new Date(Date.now() - 1000);
    sessions.set(prepared.uploadId, row);
    try {
      await service.getProgress(prepared.uploadId, prepared.uploadToken);
      fail('expected throw');
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as any;
      expect(body.errorCode).toBe(BinaryImportErrorCode.UPLOAD_SESSION_EXPIRED);
    }
  });

  it('uploads out-of-order chunks then completes', async () => {
    const docx = buildMinimalZip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      { name: 'word/document.xml', data: '<w:document/>' },
    ]);
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: docx.length,
      expectedSha256: createHash('sha256').update(docx).digest('hex'),
    });
    const chunkSize = prepared.acceptedChunkSize;
    const indexes = Array.from({ length: prepared.expectedChunkCount! }, (_, i) => i).reverse();
    for (const i of indexes) {
      const chunk = docx.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, docx.length));
      await service.uploadOriginalFileChunk({
        uploadId: prepared.uploadId,
        uploadToken: prepared.uploadToken,
        chunkIndex: i,
        chunkBase64: chunk.toString('base64'),
        chunkSha256: createHash('sha256').update(chunk).digest('hex'),
        rawByteLength: chunk.length,
      });
    }
    const completed = await service.complete(prepared.uploadId, prepared.uploadToken, integration, {
      projectId: 'project-1',
      documentType: 'Article',
      versionNo: 'Rev 1.0',
      approvalStatus: 'APPROVED',
      approvedBy: 'Tester',
      approvalDate: '2026-08-24',
      fileName: 'memo.docx',
    });
    expect(completed.actualSha256).toBe(createHash('sha256').update(docx).digest('hex'));
    expect(completed.conversionPerformed).toBe(false);
  });

  it('rejects chunk with bad checksum', async () => {
    const prepared = await service.prepareAutomaticFileImport(integration, {
      projectId: 'project-1',
      fileName: 'memo.docx',
      expectedFileSize: 10,
    });
    const chunk = Buffer.from('helloworld');
    await expect(
      service.uploadOriginalFileChunk({
        uploadId: prepared.uploadId,
        uploadToken: prepared.uploadToken,
        chunkIndex: 0,
        chunkBase64: chunk.toString('base64'),
        chunkSha256: 'deadbeef',
        rawByteLength: chunk.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
