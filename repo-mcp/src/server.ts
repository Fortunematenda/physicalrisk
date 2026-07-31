/**
 * Physical Risk Repository MCP — Notion-style ChatGPT connector.
 *
 * - Streamable HTTP at /mcp
 * - OAuth 2.1 Protected Resource Metadata (RFC 9728) for ChatGPT Connectors
 * - Forwards Authorization Bearer (Keycloak user token or mcp_ API key) to repo-api
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { config } from './config.js';
import { RepositoryApiClient } from './clients/repository-api.client.js';
import {
  mcpRequestRequiresAuth,
  mcpResourceUrl,
  protectedResourceMetadata,
  wwwAuthenticateHeader,
} from './oauth.js';

function toolResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function createMcpServer(authHeader?: string) {
  const api = new RepositoryApiClient(authHeader);
  const server = new McpServer({
    name: 'physicalrisk-repo',
    version: '1.1.0',
    description:
      'Physical Risk Repository. Prefer projectCode from list_repository_projects (e.g. MCRD, MOSS, PROR). '
      + 'Workspaces use codes WS-YYYY-##### — resume by workspace code, not chat history. '
      + 'For imports: list projects/modules/types, then submit_approved_document with projectCode + full documentContent.',
  });

  const mcpTool = (name: string, args: Record<string, unknown> = {}) =>
    api.request('POST', `/mcp/tools/${name}`, args);

  server.tool(
    'list_repository_projects',
    'List repository projects. Use this when choosing a projectCode (e.g. MCRD).',
    {},
    async () => toolResult(await mcpTool('list_repository_projects')),
  );

  server.tool(
    'list_repository_modules',
    'List modules/sections for a project. Use projectCode from list_repository_projects.',
    {
      projectCode: z.string().optional().describe('Project code e.g. MCRD'),
      projectId: z.string().optional().describe('Project UUID if known'),
    },
    async (args) => toolResult(await mcpTool('list_repository_modules', args)),
  );

  server.tool(
    'list_document_types',
    'List active document types (e.g. Article).',
    {},
    async () => toolResult(await mcpTool('list_document_types')),
  );

  server.tool(
    'create_repository_workspace',
    'Create a Repository Workspace. Returns workspaceCode WS-YYYY-##### to resume later.',
    {
      name: z.string(),
      projectCode: z.string().optional().describe('Prefer this — e.g. MCRD'),
      projectId: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('create_workspace', args)),
  );

  server.tool(
    'list_repository_workspaces',
    'List Repository Workspaces for the signed-in user',
    {
      projectCode: z.string().optional(),
      status: z.string().optional(),
      name: z.string().optional(),
    },
    async (args) => {
      const qs = new URLSearchParams({ mine: 'true' });
      if (args.projectCode) qs.set('projectCode', args.projectCode);
      if (args.status) qs.set('status', args.status);
      if (args.name) qs.set('name', args.name);
      return toolResult(await api.request('GET', `/workspaces?${qs}`));
    },
  );

  server.tool(
    'get_repository_workspace',
    'Get workspace by code (WS-YYYY-#####)',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('get_workspace', { workspaceCode })),
  );

  server.tool(
    'get_latest_repository_workspace',
    'Latest pending workspace for the signed-in user — use when resuming without a code',
    {},
    async () => toolResult(await mcpTool('get_latest_pending_workspace')),
  );

  server.tool(
    'get_workspace_summary',
    'Workspace progress + documents',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('get_workspace_summary', { workspaceCode })),
  );

  server.tool(
    'list_workspace_documents',
    'List documents attached to a workspace',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('list_workspace_documents', { workspaceCode })),
  );

  server.tool(
    'resume_repository_workspace',
    'Resume / continue a paused workspace',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('resume_workspace', { workspaceCode })),
  );

  server.tool(
    'validate_repository_workspace',
    'Validate workspace before submit',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('validate_workspace', { workspaceCode })),
  );

  server.tool(
    'submit_repository_workspace',
    'Submit workspace import',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('submit_workspace', { workspaceCode })),
  );

  // Flat fields preferred for ChatGPT connectors; payload kept for Custom GPT Actions.
  const submitDocSchema = {
    projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
    module: z.string().optional().describe('Module/section name e.g. Research Library'),
    documentType: z.string().optional().describe('e.g. Research Note, Article'),
    title: z.string().optional(),
    documentContent: z.string().optional().describe('Full Markdown body of the document'),
    workspaceCode: z.string().optional().describe('Optional WS-YYYY-#####'),
    owner: z.string().optional(),
    description: z.string().optional(),
    payload: z.string().optional().describe('JSON string alternative: projectCode, module, documentType, title, documentContent'),
  };

  server.tool(
    'submit_approved_document',
    'IMPORT/SUBMIT an approved document into the repository (Markdown → PDF). '
      + 'Call this when the user asks to import or submit a document. '
      + 'Prefer flat fields (projectCode, module, documentType, title, documentContent).',
    submitDocSchema,
    async (args) => {
      const body = args.payload
        ? { payload: args.payload }
        : {
            projectCode: args.projectCode,
            module: args.module,
            documentType: args.documentType,
            title: args.title,
            documentContent: args.documentContent,
            workspaceCode: args.workspaceCode,
            owner: args.owner,
            description: args.description,
          };
      return toolResult(await mcpTool('submit_approved_document', body));
    },
  );

  server.tool(
    'prepare_approved_document',
    'Prepare or submit (alias of submit_approved_document) — same fields as submit.',
    submitDocSchema,
    async (args) => {
      const body = args.payload
        ? { payload: args.payload }
        : {
            projectCode: args.projectCode,
            module: args.module,
            documentType: args.documentType,
            title: args.title,
            documentContent: args.documentContent,
            workspaceCode: args.workspaceCode,
            owner: args.owner,
            description: args.description,
          };
      return toolResult(await mcpTool('prepare_approved_document', body));
    },
  );

  server.tool(
    'get_import_status',
    'Get import job status',
    { importJobId: z.string() },
    async (args) => toolResult(await mcpTool('get_import_status', args)),
  );

  server.tool(
    'find_repository_documents',
    'Search repository documents',
    {
      search: z.string().optional(),
      projectId: z.string().optional(),
    },
    async (args) => {
      const qs = new URLSearchParams();
      if (args.search) qs.set('search', args.search);
      if (args.projectId) qs.set('projectId', args.projectId);
      return toolResult(await api.request('GET', `/documents?${qs}`));
    },
  );

  server.tool(
    'get_repository_document',
    'Get document by UUID',
    { documentId: z.string() },
    async ({ documentId }) =>
      toolResult(await api.request('GET', `/documents/${encodeURIComponent(documentId)}`)),
  );

  return server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function requireAuth(req: IncomingMessage): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.trim()) return authorization.trim();
  return undefined;
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'repo-mcp',
      resource: mcpResourceUrl(),
      oauth: Boolean(config.keycloakIssuer),
    });
    return;
  }

  // RFC 9728 — ChatGPT discovers Keycloak from this document (Notion-style connect).
  if (
    url.pathname === '/.well-known/oauth-protected-resource'
    || url.pathname === '/.well-known/oauth-protected-resource/mcp'
  ) {
    sendJson(res, 200, protectedResourceMetadata());
    return;
  }

  if (!url.pathname.startsWith('/mcp')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Browsers / paste-in-address-bar: MCP Streamable HTTP rejects text/html Accept.
  // This is NOT a outage — ChatGPT uses POST + Accept: application/json, text/event-stream.
  if (isBrowserStyleMcpGet(req)) {
    sendJson(res, 200, {
      status: 'ok',
      service: 'repo-mcp',
      message:
        'This URL is an MCP endpoint for ChatGPT Connectors — it is not meant to be opened in a browser. '
        + 'Paste it into ChatGPT → Settings → Apps/Connectors (OAuth).',
      mcpUrl: mcpResourceUrl(),
      health: '/health',
      oauthMetadata: '/.well-known/oauth-protected-resource',
    });
    return;
  }

  const authHeader = requireAuth(req);
  let parsedBody: unknown | undefined;

  if (req.method === 'POST' || req.method === 'PUT') {
    parsedBody = await readJsonBody(req);
  }

  const rpcMethod =
    parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)
      ? (parsedBody as { method?: unknown }).method
      : undefined;

  if (config.oauthRequired && !authHeader && mcpRequestRequiresAuth(req.method || 'GET', rpcMethod)) {
    sendJson(res, 401, {
      error: 'unauthorized',
      message: 'Sign in with Physical Risk SSO to use Repository tools (same pattern as Notion).',
    }, {
      'WWW-Authenticate': wwwAuthenticateHeader(),
    });
    return;
  }

  // Streamable HTTP requires Accept: application/json, text/event-stream.
  normalizeMcpAcceptHeader(req);

  try {
    const server = createMcpServer(authHeader);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MCP handler failed';
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'mcp_error', message });
    }
  }
});

/** True for browser address-bar / plain curl GET — not ChatGPT MCP clients. */
function isBrowserStyleMcpGet(req: IncomingMessage): boolean {
  if ((req.method || 'GET').toUpperCase() !== 'GET') return false;
  const accept = String(req.headers.accept || '').toLowerCase();
  if (accept.includes('text/html')) return true;
  // MCP clients always advertise event-stream and/or json
  if (accept.includes('text/event-stream') || accept.includes('application/json')) return false;
  return true;
}

/** Ensure MCP Accept header is present for Streamable HTTP / SSE. */
function normalizeMcpAcceptHeader(req: IncomingMessage) {
  const current = String(req.headers.accept || '').toLowerCase();
  const needsJson = !current.includes('application/json');
  const needsSse = !current.includes('text/event-stream');
  if (!needsJson && !needsSse) return;
  const parts = [req.headers.accept, needsJson ? 'application/json' : '', needsSse ? 'text/event-stream' : '']
    .filter((part) => typeof part === 'string' && part.trim())
    .join(', ');
  req.headers.accept = parts || 'application/json, text/event-stream';
}

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(
    `repo-mcp listening on :${config.port} → ${config.repoApiUrl} | resource=${mcpResourceUrl()} | oauth=${config.oauthRequired}`,
  );
});
