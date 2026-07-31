# Repo GPT Actions — Workspaces

Existing OpenAPI: `GET /api/mcp/openai/openapi.json`

## New / extended tools (same Nest handlers as REST)

| Tool | Purpose |
|------|---------|
| `create_workspace` | Create WS-YYYY-##### |
| `get_workspace` | Load by code |
| `find_workspaces` | Search current user’s workspaces |
| `get_latest_pending_workspace` | Resume without chat history |
| `resume_workspace` | Unpause / continue |
| `list_workspace_documents` | Files in workspace |
| `get_workspace_summary` | Progress + documents |
| `validate_workspace` | Pre-submit validation |
| `submit_workspace` | Mark import submit |
| `search_documents` | Index search |
| `get_document` | Document by id |

## Example phrases

- Resume workspace WS-2026-00045
- Continue my latest pending import
- Find my Marketing Campaign workspace
- Open document MOSS-PA-002

## Response pattern after create

```
Workspace created successfully
Workspace ID: WS-2026-00045
Project: MARKETING
Status: DRAFT
Documents: 0

Use this Workspace ID to continue from another Repo GPT conversation.
```
