import { createHash } from 'node:crypto';
import { McpIntegration, McpIntegrationStatus } from '../database/entities';
import { McpAuthService } from './mcp-auth.service';
import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService FILE_PRESERVE / CONTENT_CREATE', () => {
  const integration: McpIntegration = {
    id: 'integration-1',
    name: 'ChatGPT',
    status: McpIntegrationStatus.ACTIVE,
    apiKeyHash: 'hash',
    apiKeyPrefix: 'mcp_abc',
    allowedProjectIds: ['project-allowed'],
    allowedTools: ['submit_approved_file', 'submit_approved_content', 'submit_approved_document'],
    expiresAt: null,
    lastUsedAt: null,
    createdBy: { id: 'user-1', firstName: 'Test', lastName: 'User', email: 't@example.com' } as any,
    rotatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const auth = {
    assertProjectAllowed: jest.fn(),
    assertToolAllowed: jest.fn(),
  };

  const queuedChecksum = createHash('sha256').update(Buffer.from('PK\x03\x04fake-docx')).digest('hex');
  const orchestrator = {
    assertApprovedStatus: jest.fn(),
    queueMcpApprovedDocument: jest.fn(async (req: any) => ({
      importJobId: 'job-1',
      status: 'READY_FOR_REVIEW',
      externalImportStatus: 'READY_FOR_REVIEW',
      checksum: queuedChecksum,
      fileName: req.fileName,
      imported: false,
      needsReview: false,
      importMode: req.importMode,
      conversionPerformed: req.conversionPerformed === true,
      originalFilename: req.originalFilename || req.fileName,
      mimeType: req.mimeType,
      sourceSizeBytes: Buffer.from(req.fileContentBase64, 'base64').length,
      storedSizeBytes: Buffer.from(req.fileContentBase64, 'base64').length,
      sourceSha256: queuedChecksum,
      storedSha256: queuedChecksum,
      checksumVerified: true,
      message: 'queued',
    })),
  };

  const markdownOffice = {
    renderDocx: jest.fn(async () => Buffer.from('converted-docx')),
    renderXlsx: jest.fn(async () => Buffer.from('converted-xlsx')),
    renderPptx: jest.fn(async () => Buffer.from('converted-pptx')),
    renderTxt: jest.fn(async () => Buffer.from('converted-txt')),
  };

  const service = new McpToolsService(
    {
      projects: { find: jest.fn().mockResolvedValue([{ id: 'project-allowed', code: 'MOSS', name: 'MOSS', status: 'ACTIVE' }]) },
      documents: { findOne: jest.fn().mockResolvedValue(null), createQueryBuilder: jest.fn() },
      projectSections: { findOne: jest.fn() },
      documentTypes: { find: jest.fn().mockResolvedValue([{ name: 'Article', active: true }]) },
    } as any,
    auth as unknown as McpAuthService,
    orchestrator as any,
    { record: jest.fn() } as any,
    { begin: jest.fn(), addChunk: jest.fn(), takeBase64: jest.fn() } as any,
    { create: jest.fn(), get: jest.fn(), consume: jest.fn(), assertNotExpired: jest.fn() } as any,
    { fetchApprovedDocument: jest.fn() } as any,
    { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')) } as any,
    markdownOffice as any,
    { get: jest.fn().mockReturnValue('https://repo.physicalrisk.com') } as any,
    {} as any,
    {} as any,
    { beginOrReplay: jest.fn(async ({ execute }) => ({ result: await execute(), replayed: false })) } as any,
    { enqueueSingleImport: jest.fn(), createJob: jest.fn(), getByCodeOrId: jest.fn(), retry: jest.fn(), toView: jest.fn() } as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (service as any).resolveProjectId = jest.fn().mockResolvedValue('project-allowed');
    (service as any).resolveNewVersionSubmit = jest.fn().mockResolvedValue({
      title: 'Test Doc',
      documentType: 'Article',
      versionNo: '1.0',
      mode: 'NEW',
    });
    (service as any).normaliseSubmitInput = jest.fn(async (input: any) => input);
    (service as any).applySubmitDefaults = jest.fn((input: any) => ({
      ...input,
      title: input.title || 'Test Doc',
      documentType: input.documentType || 'Article',
      versionNo: input.versionNo || '1.0',
      approvalStatus: input.approvalStatus || 'APPROVED',
      approvalDate: input.approvalDate || '2026-08-22',
      fileName: input.fileName || 'test.docx',
    }));
    (service as any).mcpActor = jest.fn(() => ({ id: 'user-1' }));
    (service as any).defaultApproverName = jest.fn(() => 'Test User');
  });

  it('TEST E — submit_approved_file without artifact returns ORIGINAL_FILE_UNAVAILABLE', async () => {
    const result = await service.submitApprovedFile(integration, {
      title: 'Test',
      documentType: 'Article',
      fileName: 'test.docx',
    } as any);

    expect(result).toMatchObject({
      status: 'ORIGINAL_FILE_UNAVAILABLE',
      conversionPerformed: false,
      importMode: 'FILE_PRESERVE',
    });
    expect(orchestrator.queueMcpApprovedDocument).not.toHaveBeenCalled();
    expect(markdownOffice.renderDocx).not.toHaveBeenCalled();
  });

  it('TEST A — submit_approved_file preserves DOCX bytes without conversion', async () => {
    const bytes = Buffer.from('PK\x03\x04fake-docx');
    const result = await service.submitApprovedFile(integration, {
      title: 'Test Doc',
      documentType: 'Article',
      projectCode: 'MOSS',
      fileName: 'test-document.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileContentBase64: bytes.toString('base64'),
    } as any);

    expect(result).toMatchObject({
      status: 'QUEUED',
      importMode: 'FILE_PRESERVE',
      conversionPerformed: false,
      checksumVerified: true,
      originalFilename: 'test-document.docx',
    });
    expect(orchestrator.queueMcpApprovedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        importMode: 'FILE_PRESERVE',
        conversionPerformed: false,
        fileName: expect.stringMatching(/\.docx$/i),
        fileContentBase64: bytes.toString('base64'),
      }),
    );
    expect(markdownOffice.renderDocx).not.toHaveBeenCalled();
  });

  it('TEST F — submit_approved_content marks CONTENT_CREATE and may convert', async () => {
    const result = await service.dispatchTool(
      integration,
      'submit_approved_content',
      {
        title: 'From Markdown',
        documentType: 'Article',
        projectCode: 'MOSS',
        documentContent: '# Hello\n\nThis is a full enough markdown body for import tests to pass validation gates here.',
        fileName: 'from-md.docx',
        outputFormat: 'docx',
      },
    );

    expect(result).toMatchObject({
      importMode: 'CONTENT_CREATE',
      conversionPerformed: true,
    });
    expect(markdownOffice.renderDocx).toHaveBeenCalled();
  });
});
