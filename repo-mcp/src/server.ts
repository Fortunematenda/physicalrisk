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
    version: '1.28.0',
    description:
      'Physical Risk Repository. Prefer projectCode from list_repository_projects (e.g. MCRD, MOSS, PROR). '
      + 'Use find_repository_documents / search_documents to list Master Document Index. '
      + 'Workspaces use codes WS-YYYY-##### — resume by workspace code, not chat history. '
      + 'ZERO-CLICK DOCX IMPORT (preferred after user says approved/import): call submit_approved_file with '
      + 'fileUrl=https://… pointing at the exact .docx (FILE_PRESERVE). No browser link, no Markdown. '
      + 'NEW_VERSION: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003). '
      + 'Only if no HTTPS fileUrl and no fileContentBase64: prepare_approved_document → uploadUrl (user must upload once). '
      + 'NEVER say Markdown-only. NEVER convert DOCX to Markdown/PDF. '
      + 'Imports return QUEUED — poll get_import_status.',
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
      return toolResult(await api.requestWithAuthRetry('GET', `/workspaces?${qs}`));
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

  server.tool(
    'attach_document_to_workspace',
    'Attach an already-imported repository document to a workspace '
      + '(e.g. link PROR-PA-002 into WS-2026-00004). Use when import created a doc but workspace still has 0 attachments.',
    {
      workspaceCode: z.string().describe('e.g. WS-2026-00004'),
      documentCode: z.string().optional().describe('e.g. PROR-PA-002'),
      documentId: z.string().optional(),
      importJobId: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('attach_document_to_workspace', args)),
  );

  server.tool(
    'check_document_exists',
    'Before import: check if a document with this title/code already exists. '
      + 'If it exists, submit as NEW_VERSION with that documentCode (Rev 1.1+) — do NOT create another PA-00x.',
    {
      projectCode: z.string().optional().describe('e.g. PROR'),
      projectId: z.string().optional(),
      title: z.string().optional(),
      documentCode: z.string().optional(),
      fileName: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('check_document_exists', args)),
  );

  // Flat fields preferred for ChatGPT connectors; payload kept for Custom GPT Actions.
  const submitDocSchema = {
    projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
    module: z.string().optional().describe('Module/section name e.g. Research Library'),
    documentType: z.string().optional().describe('e.g. Research Note, Article'),
    title: z.string().optional(),
    documentContent: z.string().optional().describe(
      'Markdown/text only — use submit_approved_content for intentional text imports. '
        + 'Do NOT put DOCX/XLSX/PDF content here when an original file exists.',
    ),
    documentCode: z.string().optional().describe('Existing code e.g. PROR-PA-003 for NEW_VERSION'),
    mode: z.enum(['NEW', 'NEW_VERSION']).optional().describe(
      'NEW_VERSION = same document, next Rev (1.1). NEW = brand-new document code. Omit to auto NEW_VERSION on same title.',
    ),
    versionNo: z.string().optional().describe('Optional; server suggests next Rev if omitted'),
    fileName: z.string().optional().describe(
      'Original or output file name including extension (.docx, .xlsx, .pdf, …).',
    ),
    mimeType: z.string().optional(),
    outputFormat: z.enum(['pdf', 'docx', 'xlsx', 'pptx', 'txt']).optional().describe(
      'CONTENT_CREATE only. Default pdf. Never use this to "convert" an original binary file.',
    ),
    fileContentBase64: z.string().optional().describe(
      'Base64 of the ORIGINAL file bytes (FILE_PRESERVE). Prefer submit_approved_file when available.',
    ),
    fileUrl: z.string().url().optional().describe(
      'HTTPS URL the repository can fetch for the ORIGINAL artifact (FILE_PRESERVE).',
    ),
    uploadId: z.string().uuid().optional().describe(
      'Chunked upload session id from begin_document_upload (FILE_PRESERVE).',
    ),
    workspaceCode: z.string().optional().describe(
      'WS-YYYY-##### — REQUIRED when adding a document into a workspace so it attaches (not only Master Index)',
    ),
    owner: z.string().optional(),
    description: z.string().optional(),
    payload: z.string().optional().describe(
      'JSON string alternative: projectCode, module, documentType, title, documentContent / file fields, workspaceCode',
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
    uploadId: z.string().uuid().optional().describe('From begin_document_upload + chunks'),
    sourceSha256: z.string().optional().describe('Optional SHA-256 hex of source bytes'),
    workspaceCode: z.string().optional().describe('WS-YYYY-#####'),
    owner: z.string().optional(),
    description: z.string().optional(),
    payload: z.string().optional(),
  };

  const submitContentSchema = {
    projectCode: z.string().optional(),
    module: z.string().optional(),
    documentType: z.string().optional(),
    title: z.string().optional(),
    documentContent: z.string().optional().describe('Full Markdown/text body to generate a Repository document from'),
    documentCode: z.string().optional(),
    mode: z.enum(['NEW', 'NEW_VERSION']).optional(),
    versionNo: z.string().optional(),
    fileName: z.string().optional(),
    mimeType: z.string().optional(),
    outputFormat: z.enum(['pdf', 'docx', 'xlsx', 'pptx', 'txt']).optional(),
    workspaceCode: z.string().optional(),
    owner: z.string().optional(),
    description: z.string().optional(),
    payload: z.string().optional(),
  };

  const prepareUploadSchema = {
    projectCode: z.string().optional().describe('e.g. MOSS, MCRD, PROR'),
    module: z.string().optional().describe('Module/section name e.g. Governance Standards'),
    documentType: z.string().optional().describe('e.g. Article'),
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

  server.tool(
    'submit_approved_file',
    'ZERO-CLICK FILE_PRESERVE import of exact DOCX/XLSX/PDF/PPTX. '
      + 'PREFERRED after user says approved/import: pass fileUrl (public HTTPS to the exact .docx) OR fileContentBase64 OR uploadId. '
      + 'For revisions: mode=NEW_VERSION + documentCode (e.g. MOSS-GS-003). '
      + 'Do NOT convert to Markdown. Do NOT ask the user to open uploadUrl when fileUrl/base64 is available. '
      + 'Only if neither fileUrl nor bytes exist, response includes uploadUrl as last resort.',
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
    'submit_approved_content',
    'Create a Repository document from supplied text/Markdown. '
      + 'Not appropriate when preserving an existing binary DOCX/XLSX/PDF is required — use upload_original_docx or submit_approved_file instead. '
      + 'Converts Markdown to PDF/DOCX/XLSX/PPTX/TXT from fileName/outputFormat.',
    submitContentSchema,
    async (args) => {
      const body = args.payload
        ? { payload: args.payload }
        : {
            projectCode: args.projectCode,
            module: args.module,
            documentType: args.documentType,
            title: args.title,
            documentContent: args.documentContent,
            documentCode: args.documentCode,
            mode: args.mode,
            versionNo: args.versionNo,
            fileName: args.fileName,
            mimeType: args.mimeType,
            outputFormat: args.outputFormat,
            workspaceCode: args.workspaceCode,
            owner: args.owner,
            description: args.description,
          };
      return toolResult(await mcpTool('submit_approved_content', body));
    },
  );

  server.tool(
    'submit_approved_document',
    'Legacy combined submit. Prefer upload_original_docx / prepare_approved_document for original DOCX, '
      + 'or submit_approved_content for Markdown you wrote. '
      + 'ALWAYS call check_document_exists first. If it exists: mode=NEW_VERSION + documentCode. '
      + 'When working in a workspace, ALWAYS pass workspaceCode.',
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
            documentCode: args.documentCode,
            mode: args.mode,
            versionNo: args.versionNo,
            fileName: args.fileName,
            mimeType: args.mimeType,
            outputFormat: args.outputFormat,
            fileContentBase64: args.fileContentBase64,
            fileUrl: args.fileUrl,
            uploadId: args.uploadId,
            workspaceCode: args.workspaceCode,
            owner: args.owner,
            description: args.description,
          };
      return toolResult(await mcpTool('submit_approved_document', body));
    },
  );

  const callPrepareUpload = async (args: Record<string, unknown>) => {
    // Never forward documentContent — ChatGPT stuffing Markdown causes 413 / wrong "Markdown only" claims.
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
    return toolResult(await mcpTool('prepare_approved_document', body));
  };

  server.tool(
    'upload_original_docx',
    'PRIMARY for original DOCX/XLSX/PDF. Returns uploadUrl — user uploads exact binary in browser (FILE_PRESERVE). '
      + 'Metadata only (projectCode, module, documentType, title, fileName, mode, documentCode). '
      + 'NEVER send documentContent or Markdown. NEW_VERSION: mode=NEW_VERSION + documentCode=MOSS-GS-003.',
    prepareUploadSchema,
    async (args) => callPrepareUpload(args as Record<string, unknown>),
  );

  server.tool(
    'prepare_approved_document',
    'PRIMARY for original DOCX/XLSX/PDF/PPTX. Returns uploadUrl for exact browser upload (FILE_PRESERVE). '
      + 'Metadata only — never documentContent/Markdown (that causes request entity too large). '
      + 'NEW_VERSION: mode=NEW_VERSION + documentCode. Same as upload_original_docx.',
    prepareUploadSchema,
    async (args) => callPrepareUpload(args as Record<string, unknown>),
  );

  server.tool(
    'begin_document_upload',
    'Start chunked FILE_PRESERVE upload when you can send DOCX bytes as base64 parts (no browser click). '
      + 'Then call upload_document_chunk for each part, then submit_approved_file with uploadId.',
    {
      fileName: z.string().describe('e.g. MOSS-GS-003.docx'),
      totalChunks: z.number().int().min(1).max(500),
      mimeType: z.string().optional(),
    },
    async (args) => toolResult(await mcpTool('begin_document_upload', args)),
  );

  server.tool(
    'upload_document_chunk',
    'Upload one base64 chunk after begin_document_upload (zero-click FILE_PRESERVE path).',
    {
      uploadId: z.string(),
      index: z.number().int().min(0),
      total: z.number().int().min(1),
      data: z.string().describe('Base64 chunk of the exact DOCX/XLSX bytes'),
    },
    async (args) => toolResult(await mcpTool('upload_document_chunk', args)),
  );

  server.tool(
    'get_import_status',
    'Get import job status',
    { importJobId: z.string() },
    async (args) => toolResult(await mcpTool('get_import_status', args)),
  );

  const searchDocsSchema = {
    search: z.string().optional().describe('Match title, document code, or type'),
    projectCode: z.string().optional().describe('e.g. MCRD, MOSS, PROR'),
    projectId: z.string().optional(),
    status: z.string().optional().describe('e.g. CURRENT'),
    limit: z.number().int().min(1).max(200).optional().describe('Max rows (default 50)'),
  };

  server.tool(
    'find_repository_documents',
    'List/search Master Document Index (compact). Use for how many / list all / what was imported.',
    searchDocsSchema,
    async (args) => toolResult(await mcpTool('search_documents', args)),
  );

  server.tool(
    'search_documents',
    'Alias of find_repository_documents — list/search Master Document Index.',
    searchDocsSchema,
    async (args) => toolResult(await mcpTool('search_documents', args)),
  );

  server.tool(
    'get_repository_document',
    'Get one document by UUID or documentCode (e.g. MCRD-AS1-012)',
    {
      documentId: z.string().optional(),
      documentCode: z.string().optional().describe('e.g. MCRD-AS1-012'),
    },
    async (args) => toolResult(await mcpTool('get_document', args)),
  );

  server.tool(
    'get_document',
    'Alias of get_repository_document — get one document by id or code.',
    {
      documentId: z.string().optional(),
      documentCode: z.string().optional().describe('e.g. MCRD-AS1-012'),
    },
    async (args) => toolResult(await mcpTool('get_document', args)),
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
