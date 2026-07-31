# Keycloak client: `repo-chatgpt-app`

Suggested client for Mode B (user OIDC → MCP → repo-api).

## Client settings

- Client ID: `repo-chatgpt-app`
- Access type: confidential (or public + PKCE if required by ChatGPT)
- Standard flow: ON
- Direct access grants: OFF
- Valid redirect URIs: as provided by ChatGPT app connector
- Web origins: ChatGPT origins

## Scopes (document / map as needed)

`openid`, `profile`, `email`, `offline_access`

Repository roles remain realm roles:

- `repo_admin` → ADMIN
- `repo_importer` → IMPORTER
- `repo_reviewer` → REVIEWER
- else VIEWER

## Prototype auth path

Until ChatGPT OIDC is fully wired:

1. Create MCP integration in Repo Admin → MCP
2. Use `mcp_…` key as Bearer to `repo-mcp` and `/api/mcp`

Never log access tokens, refresh tokens, or client secrets.
