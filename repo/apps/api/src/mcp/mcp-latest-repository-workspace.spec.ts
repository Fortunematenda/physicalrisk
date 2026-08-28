import { BadRequestException } from '@nestjs/common';
import { McpIntegration, McpIntegrationStatus } from '../database/entities';
import { MCP_TOOL_NAMES } from './mcp.dto';
import { McpAuthService } from './mcp-auth.service';
import { McpToolsService } from './mcp-tools.service';

const integration = (userId: string): McpIntegration => ({
  id: 'integration-1',
  name: 'ChatGPT',
  status: McpIntegrationStatus.ACTIVE,
  apiKeyHash: 'hash',
  apiKeyPrefix: 'mcp_abc',
  allowedProjectIds: ['*'],
  allowedTools: [],
  expiresAt: null,
  lastUsedAt: null,
  createdBy: { id: userId } as any,
  rotatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

function buildService(workspaces: {
  latestPending: jest.Mock;
}) {
  const auth = {
    assertToolAllowed: jest.fn(),
    assertProjectAllowed: jest.fn(),
  };
  return {
    service: new McpToolsService(
      { importJobs: { findOne: jest.fn() } } as any,
      auth as unknown as McpAuthService,
      { queueMcpApprovedDocument: jest.fn() } as any,
      { record: jest.fn() } as any,
      { begin: jest.fn(), addChunk: jest.fn(), takeBase64: jest.fn() } as any,
      { create: jest.fn(), get: jest.fn(), consume: jest.fn(), assertNotExpired: jest.fn() } as any,
      { fetchApprovedDocument: jest.fn() } as any,
      { render: jest.fn() } as any,
      { renderDocx: jest.fn(), renderXlsx: jest.fn(), renderPptx: jest.fn(), renderTxt: jest.fn() } as any,
      { get: jest.fn().mockReturnValue('https://repo.physicalrisk.com') } as any,
      workspaces as any,
      { search: jest.fn() } as any,
      { beginOrReplay: jest.fn(async ({ execute }) => ({ result: await execute(), replayed: false })) } as any,
      { enqueueSingleImport: jest.fn(), createJob: jest.fn(), getByCodeOrId: jest.fn(), retry: jest.fn(), toView: jest.fn() } as any,
      { inspectAttachmentCapability: jest.fn() } as any,
    ),
    auth,
  };
}

describe('get_latest_repository_workspace', () => {
  it('is listed exactly once in MCP tool definitions', () => {
    const matches = MCP_TOOL_NAMES.filter((name) => name === 'get_latest_repository_workspace');
    expect(matches).toHaveLength(1);
    const tools = buildService({ latestPending: jest.fn() }).service.listToolDefinitions();
    const listed = tools.filter((tool) => tool.name === 'get_latest_repository_workspace');
    expect(listed).toHaveLength(1);
  });

  it('returns the authenticated user latest pending workspace', async () => {
    const latestPending = jest.fn().mockResolvedValue({
      match: { workspaceCode: 'WS-2026-00012', status: 'DRAFT' },
      choices: [],
    });
    const { service } = buildService({ latestPending });
    const result = await service.dispatchTool(
      integration('user-a'),
      'get_latest_repository_workspace',
      { userId: 'user-b' },
    );
    expect(latestPending).toHaveBeenCalledWith({ id: 'user-a' });
    expect(result).toMatchObject({
      found: true,
      match: { workspaceCode: 'WS-2026-00012' },
    });
  });

  it('returns a valid empty response when the user has no workspace', async () => {
    const latestPending = jest.fn().mockResolvedValue({ match: null, choices: [] });
    const { service } = buildService({ latestPending });
    const result = await service.dispatchTool(
      integration('user-a'),
      'get_latest_repository_workspace',
      {},
    );
    expect(result).toMatchObject({
      found: false,
      workspace: null,
      match: null,
      choices: [],
      message: expect.stringContaining('No pending'),
    });
  });

  it('rejects integrations without an owner user', async () => {
    const { service } = buildService({ latestPending: jest.fn() });
    const ownerless = integration('user-a');
    ownerless.createdBy = null;
    await expect(
      service.dispatchTool(ownerless, 'get_latest_repository_workspace', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MCP tool registry parity (repo-mcp advertised names)', () => {
  const REPO_MCP_CONNECTOR_TOOLS = [
    'check_document_exists',
    'upload_original_docx',
    'prepare_automatic_file_import',
    'upload_original_file_chunk',
    'complete_automatic_file_import',
    'finalize_original_file_import',
    'import_original_file',
    'submit_approved_file',
    'list_repository_projects',
    'list_repository_modules',
    'list_document_types',
    'resolve_import_targets',
    'search_documents',
    'get_document',
    'get_import_status',
    'create_repository_workspace',
    'get_repository_workspace',
    'get_latest_repository_workspace',
    'get_workspace_summary',
    'list_workspace_documents',
    'attach_document_to_workspace',
    'submit_repository_workspace',
    'resume_repository_workspace',
  ] as const;

  it('repo-api exposes handlers for every repo-mcp connector tool name', () => {
    const apiNames = new Set<string>(MCP_TOOL_NAMES);
    const aliasMap: Record<string, string> = {
      create_repository_workspace: 'create_workspace',
      get_repository_workspace: 'get_workspace',
      submit_repository_workspace: 'submit_workspace',
      resume_repository_workspace: 'resume_workspace',
    };
    for (const name of REPO_MCP_CONNECTOR_TOOLS) {
      const resolved = aliasMap[name] ?? name;
      expect(apiNames.has(resolved)).toBe(true);
    }
  });
});
