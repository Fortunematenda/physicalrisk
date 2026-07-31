# Repository MCP Service (`repo-mcp`)

Standalone MCP-compatible proxy for the Physical Risk Repository.

- Calls **repo-api only** (no PostgreSQL, no direct VPS writes)
- Enforces Repository auth via forwarded Bearer token or `REPO_MCP_API_KEY` (`mcp_…`)
- Endpoint: `POST/GET https://repo-mcp.physicalrisk.com/mcp`

## Local

```bash
cd repo-mcp
npm install
REPO_API_URL=http://localhost:4002/api REPO_MCP_API_KEY=mcp_xxx npm run dev
```

## Docker

Built via `docker-compose.sso.yml` service `repo-mcp`.

See `docs/repository-mcp.md` and `docs/chatgpt-integration-options.md`.
