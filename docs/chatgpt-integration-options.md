# ChatGPT integration options

Do **not** assume every ChatGPT Plus account can add a private custom MCP app.

## MODE A — Existing Repo GPT Actions (fallback)

- Dedicated Custom GPT with Actions → `https://repo.physicalrisk.com/api/mcp/...`
- API key (`mcp_…`) per integration
- Workspace tools added alongside import tools
- **Works today** when Actions are configured

## MODE B — Notion-style ChatGPT connector (preferred UX)

- Same pattern as Notion: Settings → Apps / Connectors → OAuth → use in normal chats
- URL: `https://repo-mcp.physicalrisk.com/mcp`
- Auth: Physical Risk SSO (Keycloak) — user identity, not a shared `mcp_…` key
- Setup guide: [chatgpt-repo-connector-notion-style.md](./chatgpt-repo-connector-notion-style.md)
- Plus can work when Developer mode / custom connectors are available on the account (test on Wayne’s login)
- Mode A remains the fallback if OAuth connect fails

## MODE C — Repository Web / future embedded assistant

- Same Workspace REST API + MCP proxy
- Can power an in-repo assistant later without ChatGPT

## Known platform limits

- New ChatGPT conversations do not resume prior chat history
- Resume by **workspace code** (`WS-YYYY-#####`) or “latest pending”
- Repository remains source of truth
