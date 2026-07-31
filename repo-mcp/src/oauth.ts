import { config } from './config.js';

/**
 * Canonical MCP resource URL ChatGPT uses as OAuth `resource` parameter.
 * Prefer path on existing host (no extra DNS): https://repo.physicalrisk.com/connector/mcp
 * Or dedicated host: https://repo-mcp.physicalrisk.com/mcp
 */
export function mcpResourceUrl(): string {
  const configured = (config.publicMcpUrl || 'https://repo.physicalrisk.com/connector').replace(/\/+$/, '');
  if (configured.endsWith('/mcp')) return configured;
  return `${configured}/mcp`;
}

export function protectedResourceMetadata() {
  const resource = mcpResourceUrl();
  const issuer = (config.keycloakIssuer || '').replace(/\/+$/, '');
  return {
    resource,
    authorization_servers: issuer ? [issuer] : [],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    resource_documentation: 'https://repo.physicalrisk.com',
  };
}

export function wwwAuthenticateHeader(): string {
  const resource = mcpResourceUrl();
  // Origin of the public URL (strip path) for well-known discovery.
  let origin = 'https://repo.physicalrisk.com';
  try {
    origin = new URL(resource).origin;
  } catch {
    /* keep default */
  }
  const metadataUrl = `${origin}/.well-known/oauth-protected-resource`;
  return `Bearer realm="physicalrisk-repo-mcp", resource_metadata="${metadataUrl}", scope="openid profile email offline_access"`;
}

/** JSON-RPC methods ChatGPT may call before the user completes OAuth (mixed auth). */
export function isUnauthenticatedMcpMethod(method: unknown): boolean {
  if (typeof method !== 'string') return false;
  return (
    method === 'initialize'
    || method === 'notifications/initialized'
    || method === 'notifications/cancelled'
    || method === 'ping'
    || method === 'tools/list'
    || method === 'resources/list'
    || method === 'resources/templates/list'
    || method === 'prompts/list'
  );
}

/**
 * Mixed auth (Notion-style): discover + list tools without a token;
 * only tool execution requires SSO Bearer.
 */
export function mcpRequestRequiresAuth(httpMethod: string, rpcMethod: unknown): boolean {
  const verb = httpMethod.toUpperCase();
  // Streamable HTTP / SSE session opens often use GET with no JSON-RPC method.
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return false;
  if (isUnauthenticatedMcpMethod(rpcMethod)) return false;
  // tools/call (and unknown mutating RPC) need a user token.
  if (rpcMethod === 'tools/call') return true;
  // Empty / non-JSON probes should not force OAuth.
  if (rpcMethod == null || rpcMethod === '') return false;
  return true;
}
