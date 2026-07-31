# ChatGPT connector — Notion-style (Mode B)

Use the Repository the same way you use **Notion** in ChatGPT: connect once, then use it from normal chats (Developer mode / Apps).

Mode A (Custom GPT + Actions + `mcp_…` key) remains available as a fallback.

## What Wayne does (Plus)

1. ChatGPT (web) → **Settings → Security and login** (or **Apps → Advanced**) → turn on **Developer mode**.
2. **Admin first:** create Keycloak client `repo-chatgpt-app` (section below).  
   ChatGPT tries **dynamic client registration (DCR)** by default; Keycloak’s **Trusted Hosts** policy rejects that (`403 insufficient_scope`). Use a **static Client ID** instead of DCR.
3. **Settings → Apps / Connectors** → create / add connector:
   - **Name:** Physical Risk Repository  
   - **URL:** `https://repo.physicalrisk.com/connector/mcp`  
   - **Auth:** OAuth  
   - **Client ID:** `repo-chatgpt-app` (predefined / static)  
   - Client secret: only if the Keycloak client has authentication **On**

   (Optional later: `https://repo-mcp.physicalrisk.com/mcp` if you add DNS + a dedicated cert.)
4. Sign in with **Physical Risk SSO** (Keycloak) when prompted — same account as Repo web.
5. Start a chat → enable **Developer mode** tools → select **Physical Risk Repository**.
6. Example prompts:
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
| Client authentication | **Off** (public + PKCE) |
| Standard flow | ON |
| Direct access grants | OFF |
| Valid redirect URIs | `https://chatgpt.com/connector/oauth/*` and `https://chatgpt.com/connector_platform_oauth_redirect` |
| Web origins | `https://chatgpt.com` |
| PKCE | S256 |
| Scopes | `openid`, `profile`, `email`, `offline_access` |

Map realm roles as usual: `repo_admin`, `repo_importer`, `repo_reviewer`.

ChatGPT will show the exact redirect URI on the app page — add that URI if it differs.

### Fix Connect error: `Offline tokens not allowed`

ChatGPT always requests `scope=offline_access`. Keycloak logs show:

`CODE_TO_TOKEN_ERROR … Offline tokens not allowed for the user or client`

**Automated (VPS):**

```bash
cd /opt/physicalrisk && bash scripts/deploy-sso-rsync.sh
bash scripts/keycloak-fix-repo-chatgpt-app.sh
```

**Manual (Keycloak Admin):**

1. Clients → `repo-chatgpt-app` → **Client scopes**  
   - Assign **`offline_access`** under **Optional** (Assigned)
2. Realm roles → ensure users have **`offline_access`**  
   - Easiest: Realm settings → **User registration** / **Default roles** → add `offline_access`  
   - Or each user → Role mapping → assign `offline_access`
3. Login settings redirect URIs include `https://chatgpt.com/connector/oauth/*`
4. ChatGPT → Disconnect → Connect again → SSO login

### Fixing `Trusted Hosts` / DCR 403 (optional)

Prefer static Client ID (above). Only if you want DCR to work:

1. Keycloak Admin → realm **physicalrisk** → **Client registration** policies  
2. Open **Trusted Hosts** and adjust (less secure if opened widely)

Do **not** expand shared TLS certs for this — OAuth client setup is Keycloak-only.

### Resource indicator

ChatGPT sends `resource=https://repo.physicalrisk.com/connector/mcp`.  
Keycloak 25+ can map audience; Repo API currently accepts realm access tokens for SSO users (same as web).

## Deploy checklist

```bash
cd /opt/physicalrisk && bash scripts/deploy-sso-rsync.sh
DOCKER_BUILDKIT=1 docker compose -f docker-compose.sso.yml --env-file .env.sso build repo-mcp
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d repo-mcp nginx
```

Verify (uses existing `repo.physicalrisk.com` DNS/TLS — no `repo-mcp` subdomain required):

```bash
# Must show resource https://repo.physicalrisk.com/connector/mcp (not repo-mcp.*)
curl -sS https://repo.physicalrisk.com/.well-known/oauth-protected-resource
curl -sS https://repo.physicalrisk.com/connector/health
```

If `resource` still says `repo-mcp.physicalrisk.com`, fix `.env.sso`:

```bash
PUBLIC_MCP_URL=https://repo.physicalrisk.com/connector
```

then `docker compose … up -d repo-mcp nginx`.

Expected PRM JSON includes `authorization_servers` pointing at your Keycloak issuer (e.g. `https://auth.physicalrisk.com/realms/physicalrisk`).

## Env

| Variable | Purpose |
|----------|---------|
| `PUBLIC_MCP_URL` | Default `https://repo.physicalrisk.com/connector` |
| `KEYCLOAK_ISSUER` | Realm issuer URL |
| `MCP_OAUTH_REQUIRED` | `true` — tool calls need Bearer; `initialize` / `tools/list` stay open for discovery |
| `REPO_MCP_API_KEY` | Optional fallback `mcp_…` for non-OAuth clients |

## Optional: dedicated DNS `repo-mcp.physicalrisk.com`

Only needed if you want a short hostname. Create an **A** (or CNAME) record → same IP as `repo.physicalrisk.com`, issue/include TLS, set `PUBLIC_MCP_URL=https://repo-mcp.physicalrisk.com`, then use `https://repo-mcp.physicalrisk.com/mcp`. Until then use `/connector/mcp` on `repo`.

## Difference vs Notion directory app

Notion ships as a polished OpenAI directory connector. Ours is a **custom** connector to your MCP URL + your SSO — same *user* experience (connect → chat), not the same OpenAI listing. Plus users who can add Notion via Developer mode / connectors can try this the same way.
