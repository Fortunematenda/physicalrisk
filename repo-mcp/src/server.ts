/**
 * Physical Risk Repository MCP — Notion-style ChatGPT connector.
 *
 * - Streamable HTTP at /mcp
 * - OAuth 2.1 Protected Resource Metadata (RFC 9728) for ChatGPT Connectors
 * - Forwards Authorization Bearer (Keycloak user token or mcp_ API key) to repo-api
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { RepositoryApiClient } from './clients/repository-api.client.js';
import { createMcpServer } from './create-mcp-server.js';
import {
  mcpRequestRequiresAuth,
  mcpResourceUrl,
  protectedResourceMetadata,
  wwwAuthenticateHeader,
} from './oauth.js';
import { REPO_MCP_TOOL_NAMES } from './tool-registry.js';

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
      tools: REPO_MCP_TOOL_NAMES.length,
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
