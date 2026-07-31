export const config = {
  port: Number(process.env.PORT || 3100),
  repoApiUrl: (process.env.REPO_API_URL || 'http://repo-api:4000/api').replace(/\/$/, ''),
  keycloakIssuer: process.env.KEYCLOAK_ISSUER || '',
  keycloakAudience: process.env.KEYCLOAK_AUDIENCE || process.env.REPO_MCP_AUDIENCE || '',
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || process.env.REPO_MCP_CLIENT_ID || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  /** Optional service API key for MCP → repo-api (mcp_…) when no user Bearer is forwarded. */
  repoMcpApiKey: process.env.REPO_MCP_API_KEY || '',
};
