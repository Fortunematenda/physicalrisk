# Keycloak client: `repo-chatgpt-app`

Used for **Mode B** — Notion-style ChatGPT connector → `repo-mcp` → repo-api.

Full Wayne steps: [chatgpt-repo-connector-notion-style.md](./chatgpt-repo-connector-notion-style.md)

## Client settings

- Client ID: `repo-chatgpt-app`
- Client authentication: **Off** (public + PKCE) recommended  
  Or **On** if ChatGPT is configured with a static client secret
- Standard flow: ON
- Direct access grants: OFF
- Valid redirect URIs:
  - `https://chatgpt.com/connector/oauth/*`
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - Plus any exact URI shown on the ChatGPT app page
- Web origins: `https://chatgpt.com`
- PKCE: S256 (`code_challenge_methods_supported` must include S256 on the realm)

## Scopes

`openid`, `profile`, `email`, `offline_access`

## Roles

Realm roles (unchanged):

- `repo_admin` → ADMIN
- `repo_importer` → IMPORTER
- `repo_reviewer` → REVIEWER
- else VIEWER

## Auth paths

1. **OAuth (Mode B):** ChatGPT → Keycloak → Bearer access token → `repo-mcp` → `repo-api` `/api/mcp/...` (JWT accepted)
2. **API key (Mode A):** Custom GPT Actions → `mcp_…` Bearer → same MCP tools

Never log access tokens, refresh tokens, or client secrets.
