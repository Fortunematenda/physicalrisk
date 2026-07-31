import { config } from './config.js';

/** Canonical MCP resource URL ChatGPT uses as OAuth `resource` parameter. */
export function mcpResourceUrl(): string {
  const base = (config.publicMcpUrl || 'https://repo-mcp.physicalrisk.com').replace(/\/+$/, '');
  return `${base}/mcp`;
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
  const base = (config.publicMcpUrl || 'https://repo-mcp.physicalrisk.com').replace(/\/+$/, '');
  const metadataUrl = `${base}/.well-known/oauth-protected-resource`;
  return `Bearer realm="physicalrisk-repo-mcp", resource_metadata="${metadataUrl}", scope="openid profile email offline_access"`;
}

/** JSON-RPC methods ChatGPT may call before the user completes OAuth (mixed auth). */
export function isUnauthenticatedMcpMethod(method: unknown): boolean {
  if (typeof method !== 'string') return false;
  return (
    method === 'initialize'
    || method === 'notifications/initialized'
    || method === 'ping'
    || method === 'tools/list'
    || method === 'resources/list'
    || method === 'prompts/list'
  );
}
