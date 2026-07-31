# Workspace testing checklist

## Automated / API

1. Concurrent `WS` code generation (no duplicate codes)
2. Create workspace → `WS-YYYY-#####`
3. Search by code / project / name
4. `GET /workspaces/my/latest-pending` uses token user only
5. User A cannot read User B workspace (non-admin)
6. ZIP import creates WorkspaceDocument rows + relative paths
7. Path traversal rejected (`../` stripped)
8. Existing checksum / version / approval / routing unchanged
9. Progress → COMPLETED / PARTIALLY_COMPLETED
10. MCP/Actions call same WorkspacesService
11. Audit + workspace activity rows written

## Manual acceptance

**Session A**

1. Create workspace “Marketing Campaign Articles”
2. Note `WS-…` code
3. Import ZIP with multiple articles into that project (optional `workspaceCode` in metadata)
4. Confirm documents + relative paths on `/workspaces/WS-…`

**Session B (new chat / browser)**

1. “Resume workspace WS-…”
2. Confirm project, counts, step — no dependency on Session A chat history
3. “Continue my latest pending Marketing workspace”
4. If multiple matches, choose from list

## ChatGPT MCP (Mode B) — only if account supports it

1. Deploy `repo-mcp` + nginx `repo-mcp.physicalrisk.com`
2. Create MCP API key in Repo Admin
3. Connect ChatGPT custom app/MCP to `https://repo-mcp.physicalrisk.com/mcp` with Bearer key
4. Call `get_latest_repository_workspace`
5. If connection UI missing → use Mode A Actions fallback
