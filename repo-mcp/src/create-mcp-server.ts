import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RepositoryApiClient } from './clients/repository-api.client.js';
import { registerRepoMcpTools, REPO_MCP_TOOL_NAMES } from './tool-registry.js';

export function createMcpServer(authHeader?: string) {
  const api = new RepositoryApiClient(authHeader);
  const server = new McpServer({
    name: 'physicalrisk-repo-file-preserve',
    version: '1.32.0',
    description:
      `Physical Risk Repository MCP v1.32 (${REPO_MCP_TOOL_NAMES.length} tools). FILE_PRESERVE first, `
      + 'then workspace tools including get_latest_repository_workspace. Never Markdown→PDF.',
  });

  const mcpTool = (name: string, args: Record<string, unknown> = {}) =>
    api.requestWithAuthRetry('POST', `/mcp/tools/${name}`, args, {
      idempotencyKey: typeof args.idempotencyKey === 'string' ? args.idempotencyKey : undefined,
    });

  registerRepoMcpTools(server, mcpTool);

  return server;
}
