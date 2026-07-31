# ChatGPT integration options

Do **not** assume every ChatGPT Plus account can add a private custom MCP app.

## MODE A — Existing Repo GPT Actions (fallback)

- Dedicated Custom GPT with Actions → `https://repo.physicalrisk.com/api/mcp/...`
- API key (`mcp_…`) per integration
- Workspace tools added alongside import tools
- **Works today** when Actions are configured

## MODE B — Custom MCP App

- Connect ChatGPT to `https://repo-mcp.physicalrisk.com/mcp`
- Requires account/workspace that exposes custom app / MCP connectors
- Must be tested on the **actual** user account
- Capability is **not guaranteed** by Plus alone

## MODE C — Repository Web / future embedded assistant

- Same Workspace REST API + MCP proxy
- Can power an in-repo assistant later without ChatGPT

## Known platform limits

- New ChatGPT conversations do not resume prior chat history
- Resume by **workspace code** (`WS-YYYY-#####`) or “latest pending”
- Repository remains source of truth
