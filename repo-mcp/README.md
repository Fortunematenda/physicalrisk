# Repository MCP Service (`repo-mcp`)

Standalone MCP proxy for the Physical Risk Repository — **Notion-style ChatGPT connector**.

- Calls **repo-api only** (no PostgreSQL, no direct VPS writes)
- OAuth Protected Resource Metadata at `/.well-known/oauth-protected-resource`
- Forwards Bearer (Keycloak user token or `mcp_…` API key) to repo-api
- Endpoint: `https://repo-mcp.physicalrisk.com/mcp`

## Local

```bash
cd repo-mcp
npm install
REPO_API_URL=http://localhost:4002/api \
PUBLIC_MCP_URL=https://repo-mcp.physicalrisk.com \
KEYCLOAK_ISSUER=https://auth.physicalrisk.com/realms/physicalrisk \
npm run dev
```

## Docker

```bash
DOCKER_BUILDKIT=1 docker compose -f docker-compose.sso.yml --env-file .env.sso build repo-mcp
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d repo-mcp nginx
```

See `docs/chatgpt-repo-connector-notion-style.md`.
