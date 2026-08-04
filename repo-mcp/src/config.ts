export const config = {
  port: Number(process.env.PORT || 3100),
  repoApiUrl: (process.env.REPO_API_URL || 'http://repo-api:4000/api').replace(/\/$/, ''),
  /**
   * Public MCP base (no trailing slash). Prefer path on repo host so DNS/TLS already work:
   *   https://repo.physicalrisk.com/connector  → resource …/connector/mcp
   * Dedicated subdomain (needs DNS A/CNAME): https://repo-mcp.physicalrisk.com
   */
  publicMcpUrl: (process.env.PUBLIC_MCP_URL || process.env.REPO_MCP_PUBLIC_URL || 'https://repo.physicalrisk.com/connector')
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
  /** Outbound timeout to repo-api (ms). Imports are async so this can stay moderate. */
  requestTimeoutMs: Number(process.env.REPO_MCP_REQUEST_TIMEOUT_MS || 120_000),
};
