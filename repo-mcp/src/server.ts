/**
 * Physical Risk Repository MCP service.
 * Proxies all tools to repo-api — no direct PostgreSQL or storage access.
 *
 * Transport: Streamable HTTP at /mcp (official MCP SDK).
 * Auth: forward Authorization Bearer (user OIDC or mcp_ API key) to repo-api.
 */
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { config } from './config.js';
import { RepositoryApiClient } from './clients/repository-api.client.js';

function toolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function createMcpServer(authHeader?: string) {
  const api = new RepositoryApiClient(authHeader);
  const server = new McpServer({
    name: 'physicalrisk-repo-mcp',
    version: '1.0.0',
  });

  server.tool('list_repository_workspaces', 'List Repository Workspaces for the current user', {
    projectCode: z.string().optional(),
    status: z.string().optional(),
    name: z.string().optional(),
  }, async (args) => {
    const qs = new URLSearchParams({ mine: 'true' });
    if (args.projectCode) qs.set('projectCode', args.projectCode);
    if (args.status) qs.set('status', args.status);
    if (args.name) qs.set('name', args.name);
    return toolResult(await api.request('GET', `/workspaces?${qs}`));
  });

  server.tool('get_repository_workspace', 'Get workspace by code', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('GET', `/workspaces/${encodeURIComponent(workspaceCode)}`)));

  server.tool('get_latest_repository_workspace', 'Latest pending workspace for current user', {}, async () =>
    toolResult(await api.request('GET', '/workspaces/my/latest-pending')));

  server.tool('get_workspace_summary', 'Workspace summary with documents', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('GET', `/workspaces/${encodeURIComponent(workspaceCode)}/summary`)));

  server.tool('list_workspace_documents', 'List workspace documents', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('GET', `/workspaces/${encodeURIComponent(workspaceCode)}/documents`)));

  server.tool('get_workspace_activity', 'Workspace activity trail', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('GET', `/workspaces/${encodeURIComponent(workspaceCode)}/activity`)));

  server.tool('create_repository_workspace', 'Create a workspace', {
    name: z.string(),
    projectId: z.string().uuid(),
  }, async (args) =>
    toolResult(await api.request('POST', '/workspaces', args)));

  server.tool('resume_repository_workspace', 'Resume a workspace', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('POST', `/workspaces/${encodeURIComponent(workspaceCode)}/resume`)));

  server.tool('validate_repository_workspace', 'Validate workspace', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('POST', `/workspaces/${encodeURIComponent(workspaceCode)}/validate`)));

  server.tool('submit_repository_workspace', 'Submit workspace import', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('POST', `/workspaces/${encodeURIComponent(workspaceCode)}/submit`)));

  server.tool('archive_repository_workspace', 'Archive workspace (soft close)', {
    workspaceCode: z.string(),
  }, async ({ workspaceCode }) =>
    toolResult(await api.request('POST', `/workspaces/${encodeURIComponent(workspaceCode)}/archive`)));

  server.tool('list_repository_projects', 'List projects via repo-api MCP tool', {}, async () =>
    toolResult(await api.request('POST', '/mcp/tools/list_repository_projects', {})));

  server.tool('find_repository_documents', 'Search documents', {
    search: z.string().optional(),
    projectId: z.string().uuid().optional(),
  }, async (args) => {
    const qs = new URLSearchParams();
    if (args.search) qs.set('search', args.search);
    if (args.projectId) qs.set('projectId', args.projectId);
    return toolResult(await api.request('GET', `/documents?${qs}`));
  });

  server.tool('get_repository_document', 'Get document by id', {
    documentId: z.string().uuid(),
  }, async ({ documentId }) =>
    toolResult(await api.request('GET', `/documents/${encodeURIComponent(documentId)}`)));

  server.tool('get_import_job', 'Get import job status', {
    importJobId: z.string().uuid(),
  }, async ({ importJobId }) =>
    toolResult(await api.request('GET', `/imports/${encodeURIComponent(importJobId)}`)));

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'repo-mcp' }));
    return;
  }

  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  const server = createMcpServer(authHeader);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`repo-mcp listening on :${config.port} → ${config.repoApiUrl}`);
});
