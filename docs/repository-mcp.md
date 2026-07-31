# Repository MCP Service

Standalone service: `repo-mcp/`

## Rules

- Calls **repo-api only**
- No PostgreSQL, no VPS filesystem, no document-code generation
- Forwards `Authorization` (OIDC Bearer or `mcp_…` API key)

## Endpoint

- Local: `http://localhost:3100/mcp`
- Production: `https://repo-mcp.physicalrisk.com/mcp`
- Health: `/health`
- OAuth PRM: `/.well-known/oauth-protected-resource`

Notion-style connect guide: [chatgpt-repo-connector-notion-style.md](./chatgpt-repo-connector-notion-style.md)

## Env

| Variable | Purpose |
|----------|---------|
| `PORT` | Default 3100 |
| `REPO_API_URL` | e.g. `http://repo-api:4000/api` |
| `PUBLIC_MCP_URL` | `https://repo-mcp.physicalrisk.com` |
| `REPO_MCP_API_KEY` | Optional fallback `mcp_…` key |
| `KEYCLOAK_ISSUER` | Authorization server for PRM / OAuth |
| `MCP_OAUTH_REQUIRED` | `true` → 401 + WWW-Authenticate on tool calls without Bearer |

## Docker

```bash
DOCKER_BUILDKIT=1 docker compose -f docker-compose.sso.yml --env-file .env.sso build repo-mcp
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d repo-mcp
```

## Tools (proxy)

`list_repository_workspaces`, `get_repository_workspace`, `get_latest_repository_workspace`, `get_workspace_summary`, `list_workspace_documents`, `get_workspace_activity`, `create_repository_workspace`, `resume_repository_workspace`, `validate_repository_workspace`, `submit_repository_workspace`, `archive_repository_workspace`, `list_repository_projects`, `find_repository_documents`, `get_repository_document`, `get_import_job`
