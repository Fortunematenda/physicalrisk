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

  const browserUploads = {
    create: jest.fn((input: any) => ({
      token: 'upload-token-1',
      expiresAt: Date.now() + 60_000,
      ...input,
    })),
    get: jest.fn(),
    consume: jest.fn(),
    assertNotExpired: jest.fn(),
  };

  const service = new McpToolsService(
    {
      projects: { find: jest.fn().mockResolvedValue([{ id: 'project-allowed', code: 'MOSS', name: 'MOSS', status: 'ACTIVE' }]) },
      documents: { findOne: jest.fn().mockResolvedValue(null), createQueryBuilder: jest.fn() },
      projectSections: { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) },
      documentTypes: { find: jest.fn().mockResolvedValue([{ name: 'Article', active: true }]) },
    } as any,
    auth as unknown as McpAuthService,
    orchestrator as any,
    { record: jest.fn() } as any,
    { begin: jest.fn(), addChunk: jest.fn(), takeBase64: jest.fn() } as any,
    browserUploads as any,
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

  it('TEST E — submit_approved_file without artifact returns uploadUrl for browser FILE_PRESERVE', async () => {
    const result = await service.submitApprovedFile(integration, {
      title: 'Test',
      documentType: 'Article',
      projectCode: 'MOSS',
      fileName: 'test.docx',
    } as any);

    expect(result).toMatchObject({
      status: 'ORIGINAL_FILE_UNAVAILABLE',
      conversionPerformed: false,
      importMode: 'FILE_PRESERVE',
      preserveOriginal: true,
      uploadUrl: expect.stringContaining('/api/mcp/upload/'),
    });
    expect(orchestrator.queueMcpApprovedDocument).not.toHaveBeenCalled();
    expect(markdownOffice.renderDocx).not.toHaveBeenCalled();
    expect(browserUploads.create).toHaveBeenCalled();
  });

  it('TEST E2 — DOCX fileName + Markdown without CONTENT_CREATE offers uploadUrl (no PDF)', async () => {
    const result = await service.submitApprovedDocument(
      integration,
      {
        title: 'Repo Import Test',
        documentType: 'Article',
        projectCode: 'MOSS',
        fileName: 'Repo_Import_Test_Small.docx',
        documentContent: '# Fake body that must not become a PDF',
        versionNo: '1.0',
        approvalStatus: 'APPROVED',
        approvalDate: '2026-08-23',
      } as any,
    );

    expect(result).toMatchObject({
      status: 'ORIGINAL_FILE_UNAVAILABLE',
      uploadUrl: expect.stringContaining('/api/mcp/upload/'),
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

  it('TEST A2 — submit_approved_file preserves XLSX bytes from Actions payload string', async () => {
    const bytes = Buffer.from('PK\x03\x04xl/workbook.xml-fake-xlsx');
    const result = await service.dispatchTool(
      integration,
      'submit_approved_file',
      {
        payload: JSON.stringify({
          projectCode: 'MOSS',
          documentType: 'Article',
          title: 'Budget Workbook',
          fileName: 'Budget.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileContentBase64: bytes.toString('base64'),
        }),
        fileName: 'Budget.xlsx',
      },
    );

    expect(result).toMatchObject({
      status: 'QUEUED',
      importMode: 'FILE_PRESERVE',
      conversionPerformed: false,
    });
    expect(orchestrator.queueMcpApprovedDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        importMode: 'FILE_PRESERVE',
        conversionPerformed: false,
        fileName: expect.stringMatching(/\.xlsx$/i),
        fileContentBase64: bytes.toString('base64'),
      }),
    );
    expect(markdownOffice.renderXlsx).not.toHaveBeenCalled();
  });

  it('TEST G — prepare_approved_document NEW_VERSION stores revision fields on browser upload token', async () => {
    (service as any).resolveNewVersionSubmit = jest.fn().mockResolvedValue({
      title: 'Governance Standard',
      documentType: 'Article',
      versionNo: 'Rev 1.1',
      mode: 'NEW_VERSION',
      documentCode: 'MOSS-GS-003',
      existingDocumentId: 'doc-existing-1',
    });

    const result = await service.prepareApprovedDocument(integration, {
      projectCode: 'MOSS',
      documentType: 'Article',
      title: 'Governance Standard',
      versionNo: 'Rev 1.0',
      approvalStatus: 'APPROVED',
      approvalDate: '2026-08-23',
      fileName: 'MOSS-GS-003.docx',
      mode: 'NEW_VERSION',
      documentCode: 'MOSS-GS-003',
    } as any);

    expect(result).toMatchObject({
      uploadUrl: expect.stringContaining('/api/mcp/upload/'),
      importMode: 'FILE_PRESERVE',
      preserveOriginal: true,
      mode: 'NEW_VERSION',
      documentCode: 'MOSS-GS-003',
      existingDocumentId: 'doc-existing-1',
      versionNo: 'Rev 1.1',
    });
    expect(browserUploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'NEW_VERSION',
        documentCode: 'MOSS-GS-003',
        existingDocumentId: 'doc-existing-1',
        versionNo: 'Rev 1.1',
        fileName: 'MOSS-GS-003.docx',
      }),
    );
  });

  it('TEST G2 — submit_approved_file without bytes passes NEW_VERSION to browser upload', async () => {
    (service as any).resolveNewVersionSubmit = jest.fn().mockResolvedValue({
      title: 'Governance Standard',
      documentType: 'Article',
      versionNo: 'Rev 1.1',
      mode: 'NEW_VERSION',
      documentCode: 'MOSS-GS-003',
      existingDocumentId: 'doc-existing-1',
    });

    await service.submitApprovedFile(integration, {
      projectCode: 'MOSS',
      documentType: 'Article',
      title: 'Governance Standard',
      fileName: 'MOSS-GS-003.docx',
      mode: 'NEW_VERSION',
      documentCode: 'MOSS-GS-003',
    } as any);

    expect(browserUploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'NEW_VERSION',
        documentCode: 'MOSS-GS-003',
        existingDocumentId: 'doc-existing-1',
      }),
    );
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
