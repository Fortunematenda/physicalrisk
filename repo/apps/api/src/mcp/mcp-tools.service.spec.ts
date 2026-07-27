import { McpIntegration, McpIntegrationStatus } from '../database/entities';
import { McpAuthService } from './mcp-auth.service';
import { McpToolsService } from './mcp-tools.service';
import { McpForbiddenException } from './mcp.exceptions';

describe('McpToolsService project permissions', () => {
  const integration: McpIntegration = {
    id: 'integration-1',
    name: 'ChatGPT',
    status: McpIntegrationStatus.ACTIVE,
    apiKeyHash: 'hash',
    apiKeyPrefix: 'mcp_abc',
    allowedProjectIds: ['project-allowed'],
    allowedTools: ['list_repository_projects'],
    expiresAt: null,
    lastUsedAt: null,
    createdBy: null,
    rotatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const auth = {
    assertProjectAllowed: jest.fn((item: McpIntegration, projectId: string) => {
      if (!item.allowedProjectIds.includes(projectId)) {
        throw new Error(`project ${projectId} not allowed`);
      }
    }),
    assertToolAllowed: jest.fn(),
  };

  const service = new McpToolsService(
    {} as any,
    auth as unknown as McpAuthService,
    {} as any,
    {} as any,
    { begin: jest.fn(), addChunk: jest.fn(), takeBase64: jest.fn() } as any,
    { create: jest.fn(), get: jest.fn(), consume: jest.fn(), assertNotExpired: jest.fn() } as any,
    { get: jest.fn().mockReturnValue('https://repo.physicalrisk.com') } as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows access to configured projects', () => {
    expect(() => service.assertProjectAccess(integration, 'project-allowed')).not.toThrow();
    expect(auth.assertProjectAllowed).toHaveBeenCalledWith(integration, 'project-allowed');
  });

  it('rejects projects outside the integration scope', () => {
    expect(() => service.assertProjectAccess(integration, 'project-denied')).toThrow(McpForbiddenException);
    try {
      service.assertProjectAccess(integration, 'project-denied');
    } catch (error) {
      expect((error as McpForbiddenException).message).toContain('project-denied');
    }
  });
});

describe('McpAuthService project permissions', () => {
  const db = {
    mcpIntegrations: {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    },
    users: { findOne: jest.fn() },
  };
  const audit = { record: jest.fn() };
  const service = new McpAuthService(db as any, audit as any);

  const integration: McpIntegration = {
    id: 'integration-1',
    name: 'ChatGPT',
    status: McpIntegrationStatus.ACTIVE,
    apiKeyHash: 'hash',
    apiKeyPrefix: 'mcp_abc',
    allowedProjectIds: ['project-allowed'],
    allowedTools: [],
    expiresAt: null,
    lastUsedAt: null,
    createdBy: null,
    rotatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('permits allowed project ids', () => {
    expect(() => service.assertProjectAllowed(integration, 'project-allowed')).not.toThrow();
  });

  it('blocks disallowed project ids', () => {
    expect(() => service.assertProjectAllowed(integration, 'project-denied')).toThrow('project project-denied not allowed');
  });
});
