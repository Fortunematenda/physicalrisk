export const config = {
  port: Number(process.env.PORT || 3100),
  repoApiUrl: (process.env.REPO_API_URL || 'http://repo-api:4000/api').replace(/\/$/, ''),
  /** Public HTTPS origin for this MCP service (no trailing slash), e.g. https://repo-mcp.physicalrisk.com */
  publicMcpUrl: (process.env.PUBLIC_MCP_URL || process.env.REPO_MCP_PUBLIC_URL || 'https://repo-mcp.physicalrisk.com')
    .replace(/\/+$/, ''),
  keycloakIssuer: process.env.KEYCLOAK_ISSUER || '',
  keycloakAudience: process.env.KEYCLOAK_AUDIENCE || process.env.REPO_MCP_AUDIENCE || '',
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || process.env.REPO_MCP_CLIENT_ID || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  /**
   * When true (default if KEYCLOAK_ISSUER set): unauthenticated tool calls get 401 + OAuth challenge.
   * Initialize / tools/list stay open so ChatGPT can discover tools like Notion.
   */
  oauthRequired: (process.env.MCP_OAUTH_REQUIRED
    ?? (process.env.KEYCLOAK_ISSUER ? 'true' : 'false')) === 'true',
  /** Optional service API key for MCP → repo-api (mcp_…) when no user Bearer is forwarded. */
  repoMcpApiKey: process.env.REPO_MCP_API_KEY || '',
};
