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

/**
 * ChatGPT connectors require structuredContent to be a JSON object (not an array).
 * GET /documents previously returned a bare array → "invalid response-format".
 */
function toolResult(data: unknown) {
  const payload =
    data && typeof data === 'object' && !Array.isArray(data) && 'result' in (data as object)
      ? (data as { result: unknown }).result
      : data;
  const structured =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : { items: payload };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function createMcpServer(authHeader?: string) {
  const api = new RepositoryApiClient(authHeader);
  const server = new McpServer({
    name: 'physicalrisk-repo',
    version: '1.30.2',
    description:
      'Physical Risk Repository MCP (~23 tools). Automatic FILE_PRESERVE import: check_document_exists → '
      + 'prepare_automatic_file_import → upload_original_file_chunk → complete_automatic_file_import → '
      + 'finalize_original_file_import. Also upload_original_docx (staged PUT). Never Markdown-only.',
  });

  const mcpTool = (name: string, args: Record<string, unknown> = {}) =>
    api.requestWithAuthRetry('POST', `/mcp/tools/${name}`, args, {
      idempotencyKey: typeof args.idempotencyKey === 'string' ? args.idempotencyKey : undefined,
    });

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

  // ChatGPT MCP connectors truncate tools/list (~17–23). Register automatic FILE_PRESERVE import FIRST.
  const prepareUploadSchema = {
    projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
    module: z.string().optional().describe('Module/section name e.g. Governance Standards'),
    documentType: z.string().optional().describe('e.g. Master Control Catalogue, Article'),
    title: z.string().optional(),
    documentCode: z.string().optional().describe('Existing code e.g. MOSS-GS-003 for NEW_VERSION'),
    mode: z.enum(['NEW', 'NEW_VERSION']).optional().describe(
      'NEW_VERSION = same document, next Rev. Use with documentCode.',
    ),
    versionNo: z.string().optional(),
    fileName: z.string().optional().describe('Original filename with extension, e.g. Catalogue.docx'),
    mimeType: z.string().optional(),
    workspaceCode: z.string().optional().describe('WS-YYYY-#####'),
    owner: z.string().optional(),
    description: z.string().optional(),
    existingDocumentId: z.string().uuid().optional(),
    payload: z.string().optional().describe(
      'JSON metadata only: projectCode, module, documentType, title, fileName, mode, documentCode. NEVER documentContent.',
    ),
  };

  const submitFileSchema = {
    projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
    module: z.string().optional().describe('Module/section name'),
    documentType: z.string().optional().describe('e.g. Research Note, Article'),
    title: z.string().optional(),
    documentCode: z.string().optional(),
    mode: z.enum(['NEW', 'NEW_VERSION']).optional(),
    versionNo: z.string().optional(),
    fileName: z.string().optional().describe('Original filename with extension (.docx, .xlsx, .pdf, …)'),
    mimeType: z.string().optional(),
    fileContentBase64: z.string().optional().describe('Base64 of the exact original file bytes'),
    fileUrl: z.string().url().optional().describe('HTTPS URL to the original artifact'),
    uploadId: z.string().uuid().optional().describe('From chunked upload session'),
    sourceSha256: z.string().optional().describe('Optional SHA-256 hex of source bytes'),
    workspaceCode: z.string().optional().describe('WS-YYYY-#####'),
    owner: z.string().optional(),
    description: z.string().optional(),
    payload: z.string().optional(),
  };

  const callPrepareUpload = async (args: Record<string, unknown>) => {
    const body = typeof args.payload === 'string'
      ? { payload: args.payload }
      : {
          projectCode: args.projectCode,
          module: args.module,
          documentType: args.documentType,
          title: args.title,
          documentCode: args.documentCode,
          mode: args.mode,
          versionNo: args.versionNo,
          fileName: args.fileName,
          mimeType: args.mimeType,
          workspaceCode: args.workspaceCode,
          owner: args.owner,
          description: args.description,
          existingDocumentId: args.existingDocumentId,
        };
    return toolResult(await mcpTool('prepare_original_file_import', body));
  };

  server.tool(
    'check_document_exists',
    'Before import: check if a document with this title/code already exists. '
      + 'If exists, use NEW_VERSION with that documentCode — do NOT create a duplicate code.',
    {
      projectCode: z.string().optional().describe('e.g. MOSS'),
      projectId: z.string().optional(),
      title: z.string().optional(),
      documentCode: z.string().optional(),
      fileName: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('check_document_exists', args)),
  );

  server.tool(
    'upload_original_docx',
    'PRIMARY binary original-file upload (FILE_PRESERVE) for DOCX/XLSX/PDF/PPTX. '
      + 'Returns uploadId + uploadUrl (PUT exact bytes) then finalize_original_file_import. '
      + 'NEW_VERSION: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003). NOT Markdown→PDF.',
    prepareUploadSchema,
    async (args) => callPrepareUpload(args as Record<string, unknown>),
  );

  server.tool(
    'prepare_automatic_file_import',
    'Start automatic resumable chunked FILE_PRESERVE. Returns uploadId+uploadToken+acceptedChunkSize. '
      + 'Then call upload_original_file_chunk repeatedly without waiting for another user message. Never Markdown.',
    prepareUploadSchema,
    async (args) => toolResult(await mcpTool('prepare_automatic_file_import', args as Record<string, unknown>)),
  );

  server.tool(
    'upload_original_file_chunk',
    'Upload one exact binary chunk (base64). Validates chunkSha256. Continue automatically until complete_automatic_file_import.',
    {
      uploadId: z.string(),
      uploadToken: z.string(),
      chunkIndex: z.number().int().min(0),
      encodedContent: z.string().optional(),
      chunkBase64: z.string().optional(),
      chunkSha256: z.string(),
      rawByteLength: z.number().int().min(1),
    },
    async (args) => toolResult(await mcpTool('upload_original_file_chunk', args)),
  );

  server.tool(
    'complete_automatic_file_import',
    'Assemble/validate OOXML+SHA-256 then queue FILE_PRESERVE. Session create is not success.',
    {
      uploadId: z.string(),
      uploadToken: z.string(),
      expectedSha256: z.string().optional(),
      expectedFileSize: z.number().int().optional(),
      ...prepareUploadSchema,
    },
    async (args) => toolResult(await mcpTool('complete_automatic_file_import', args as Record<string, unknown>)),
  );

  server.tool(
    'finalize_original_file_import',
    'Verify stored original file size and SHA-256 after staged PUT or automatic import. '
      + 'Returns UPLOAD_PENDING, VERIFIED, VERIFICATION_FAILED, or IMPORTED.',
    {
      uploadId: z.string(),
      uploadToken: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('finalize_original_file_import', args)),
  );

  server.tool(
    'import_original_file',
    'Zero-click FILE_PRESERVE when a public HTTPS fileUrl exists. Never convert to Markdown or PDF.',
    {
      ...submitFileSchema,
      attachmentReference: z.string().optional(),
      expectedSha256: z.string().optional(),
    },
    async (args) => {
      const body = args.payload
        ? { payload: args.payload, attachmentReference: args.attachmentReference, expectedSha256: args.expectedSha256 }
        : { ...args };
      return toolResult(await mcpTool('import_original_file', body));
    },
  );

  server.tool(
    'submit_approved_file',
    'FILE_PRESERVE import via fileUrl, fileContentBase64, or uploadId. Prefer automatic chunk path for attachments.',
    submitFileSchema,
    async (args) => {
      const body = args.payload
        ? { payload: args.payload }
        : {
            projectCode: args.projectCode,
            module: args.module,
            documentType: args.documentType,
            title: args.title,
            documentCode: args.documentCode,
            mode: args.mode,
            versionNo: args.versionNo,
            fileName: args.fileName,
            mimeType: args.mimeType,
            fileContentBase64: args.fileContentBase64,
            fileUrl: args.fileUrl,
            uploadId: args.uploadId,
            sourceSha256: args.sourceSha256,
            workspaceCode: args.workspaceCode,
            owner: args.owner,
            description: args.description,
          };
      return toolResult(await mcpTool('submit_approved_file', body));
    },
  );

  server.tool(
    'resolve_import_targets',
    'Map project/module/documentType labels to IDs before import.',
    {
      project: z.string().describe('Project code or name e.g. MOSS'),
      module: z.string().optional(),
      documentType: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('resolve_import_targets', args)),
  );

  const searchDocsSchema = {
    search: z.string().optional().describe('Match title, document code, or type'),
    projectCode: z.string().optional().describe('e.g. MCRD, MOSS, PROR'),
    projectId: z.string().optional(),
    status: z.string().optional().describe('e.g. CURRENT'),
    limit: z.number().int().min(1).max(200).optional().describe('Max rows (default 50)'),
  };

  server.tool(
    'search_documents',
    'List/search Master Document Index. Use for how many / list all / what was imported.',
    searchDocsSchema,
    async (args) => toolResult(await mcpTool('search_documents', args)),
  );

  server.tool(
    'get_document',
    'Get one document by UUID or documentCode (e.g. MOSS-GS-003)',
    {
      documentId: z.string().optional(),
      documentCode: z.string().optional().describe('e.g. MOSS-GS-003'),
    },
    async (args) => toolResult(await mcpTool('get_document', args)),
  );

  server.tool(
    'get_import_status',
    'Get import job status after FILE_PRESERVE queue',
    { importJobId: z.string() },
    async (args) => toolResult(await mcpTool('get_import_status', args)),
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
    'attach_document_to_workspace',
    'Attach an already-imported repository document to a workspace',
    {
      workspaceCode: z.string().describe('e.g. WS-2026-00004'),
      documentCode: z.string().optional().describe('e.g. MOSS-GS-003'),
      documentId: z.string().optional(),
      importJobId: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('attach_document_to_workspace', args)),
  );

  server.tool(
    'submit_repository_workspace',
    'Submit workspace import',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('submit_workspace', { workspaceCode })),
  );

  server.tool(
    'resume_repository_workspace',
    'Resume / continue a paused workspace',
    { workspaceCode: z.string() },
    async ({ workspaceCode }) =>
      toolResult(await mcpTool('resume_workspace', { workspaceCode })),
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
      checks: {
        auth: '/health/auth',
        database: '/health/database',
        storage: '/health/storage',
        importWorker: '/health/import-worker',
      },
    });
    return;
  }

  if (url.pathname === '/health/auth'
    || url.pathname === '/health/database'
    || url.pathname === '/health/storage'
    || url.pathname === '/health/import-worker') {
    try {
      const api = new RepositoryApiClient();
      const data = await api.request('GET', url.pathname);
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 503, {
        status: 'error',
        service: 'repo-mcp',
        path: url.pathname,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (url.pathname === '/connector/session/status' || url.pathname === '/session/status') {
    const authorization = requireAuth(req);
    if (!authorization) {
      sendJson(res, 401, {
        success: false,
        errorCode: 'MCP_AUTH_FAILED',
        message: 'Authorization Bearer required',
        retryable: false,
        requiresLogin: true,
      }, { 'WWW-Authenticate': wwwAuthenticateHeader() });
      return;
    }
    try {
      const api = new RepositoryApiClient(authorization);
      sendJson(res, 200, await api.requestWithAuthRetry('GET', '/connector/session/status'));
    } catch (error) {
      const err = error as { errorCode?: string; message?: string; status?: number; retryable?: boolean; requiresLogin?: boolean; requestId?: string };
      sendJson(res, err.status || 503, {
        success: false,
        errorCode: err.errorCode || 'REPOSITORY_API_UNAVAILABLE',
        message: err.message || 'Session status failed',
        retryable: err.retryable ?? true,
        requiresLogin: err.requiresLogin ?? false,
        requestId: err.requestId,
      });
    }
    return;
  }

  if (
    (url.pathname === '/connector/session/heartbeat' || url.pathname === '/session/heartbeat')
    && req.method === 'POST'
  ) {
    const authorization = requireAuth(req);
    if (!authorization) {
      sendJson(res, 401, {
        success: false,
        errorCode: 'MCP_AUTH_FAILED',
        message: 'Authorization Bearer required',
        retryable: false,
        requiresLogin: true,
      }, { 'WWW-Authenticate': wwwAuthenticateHeader() });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const api = new RepositoryApiClient(authorization);
      sendJson(res, 200, await api.requestWithAuthRetry('POST', '/connector/session/heartbeat', body ?? {}));
    } catch (error) {
      const err = error as { errorCode?: string; message?: string; status?: number; retryable?: boolean; requiresLogin?: boolean; requestId?: string };
      sendJson(res, err.status || 503, {
        success: false,
        errorCode: err.errorCode || 'REPOSITORY_API_UNAVAILABLE',
        message: err.message || 'Heartbeat failed',
        retryable: err.retryable ?? true,
        requiresLogin: err.requiresLogin ?? false,
        requestId: err.requestId,
      });
    }
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
