# ChatGPT connector — Notion-style (Mode B)

Use the Repository the same way you use **Notion** in ChatGPT: connect once, then use it from normal chats (Developer mode / Apps).

Mode A (Custom GPT + Actions + `mcp_…` key) remains available as a fallback.

## What Wayne does (Plus)

1. ChatGPT (web) → **Settings → Security and login** (or **Apps → Advanced**) → turn on **Developer mode**.
2. **Settings → Apps / Connectors** → create / add connector:
   - **Name:** Physical Risk Repository  
   - **URL:** `https://repo-mcp.physicalrisk.com/mcp`  
   - **Auth:** OAuth  
3. Sign in with **Physical Risk SSO** (Keycloak) when prompted — same account as Repo web.
4. Start a chat → enable **Developer mode** tools → select **Physical Risk Repository**.
5. Example prompts:
   - List repository projects  
   - Create a workspace named Marketing Campaign for project MCRD  
   - Resume workspace WS-2026-00003  
   - Submit approved document with projectCode MCRD …

Write actions may ask for confirmation (same as other connectors).

## Admin: Keycloak client `repo-chatgpt-app`

Create (or update) a Keycloak client in realm `physicalrisk`:

| Setting | Value |
|--------|--------|
| Client ID | `repo-chatgpt-app` |
| Client authentication | **Off** (public) preferred for PKCE, or On if you paste a secret into ChatGPT |
| Standard flow | ON |
| Direct access grants | OFF |
| Valid redirect URIs | `https://chatgpt.com/connector/oauth/*` and `https://chatgpt.com/connector_platform_oauth_redirect` |
| Web origins | `https://chatgpt.com` |
| PKCE | S256 |
| Scopes | `openid`, `profile`, `email`, `offline_access` |

Map realm roles as usual: `repo_admin`, `repo_importer`, `repo_reviewer`.

ChatGPT will show the exact redirect URI on the app page — add that URI if it differs.

### Resource indicator

ChatGPT sends `resource=https://repo-mcp.physicalrisk.com/mcp`.  
Keycloak 25+ can map audience; Repo API currently accepts realm access tokens for SSO users (same as web).

## Deploy checklist

```bash
cd /opt/physicalrisk && bash scripts/deploy-sso-rsync.sh
DOCKER_BUILDKIT=1 docker compose -f docker-compose.sso.yml --env-file .env.sso build repo-mcp repo-api
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d repo-mcp repo-api nginx
```

Verify:

```bash
curl -sS https://repo-mcp.physicalrisk.com/.well-known/oauth-protected-resource
curl -sS https://repo-mcp.physicalrisk.com/health
```

Expected PRM JSON includes `authorization_servers` pointing at your Keycloak issuer (e.g. `https://auth.physicalrisk.com/realms/physicalrisk`).

## Env

| Variable | Purpose |
|----------|---------|
| `PUBLIC_MCP_URL` | `https://repo-mcp.physicalrisk.com` |
| `KEYCLOAK_ISSUER` | Realm issuer URL |
| `MCP_OAUTH_REQUIRED` | `true` — tool calls need Bearer; `initialize` / `tools/list` stay open for discovery |
| `REPO_MCP_API_KEY` | Optional fallback `mcp_…` for non-OAuth clients |

## Difference vs Notion directory app

Notion ships as a polished OpenAI directory connector. Ours is a **custom** connector to your MCP URL + your SSO — same *user* experience (connect → chat), not the same OpenAI listing. Plus users who can add Notion via Developer mode / connectors can try this the same way.
