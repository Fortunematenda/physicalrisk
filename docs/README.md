# Documentation

Living references for local SSO and production. One-off implementation/fix reports are not kept here.

## Local SSO & identity

| Doc | Purpose |
|-----|---------|
| [LOCAL_SSO_SETUP.md](LOCAL_SSO_SETUP.md) | Bring up `moss.localhost` / full SSO stack |
| [LOCAL_SSO_ARCHITECTURE.md](LOCAL_SSO_ARCHITECTURE.md) | SSO architecture and flows |
| [LOCAL_SSO_TROUBLESHOOTING.md](LOCAL_SSO_TROUBLESHOOTING.md) | Common local SSO issues |
| [KEYCLOAK_LOCAL_SETUP.md](KEYCLOAK_LOCAL_SETUP.md) | Keycloak realm / clients |
| [LOCAL_ROLE_MAPPING.md](LOCAL_ROLE_MAPPING.md) | Keycloak roles → app roles |

## Deploy

| Doc | Purpose |
|-----|---------|
| [SERVER_DEPLOY_PHYSICALRISK.md](SERVER_DEPLOY_PHYSICALRISK.md) | Production / VPS deploy checklist |

## MOSS & SCL

| Doc | Purpose |
|-----|---------|
| [MOSS_100_CONTROL_IMPLEMENTATION_PLAN.md](MOSS_100_CONTROL_IMPLEMENTATION_PLAN.md) | MOSS control architecture plan |
| [MOSS_M0_DECISION_PACK.md](MOSS_M0_DECISION_PACK.md) | Approved product decisions |
| [MOSS_CLIENT_CONFIRMATIONS.md](MOSS_CLIENT_CONFIRMATIONS.md) | Client confirmation tracker |
| [SCL_COMMERCIAL_FUNNEL_ARCHITECTURE.md](SCL_COMMERCIAL_FUNNEL_ARCHITECTURE.md) | Public SCL funnel architecture |
| [SCL_END_TO_END_UAT_CHECKLIST.md](SCL_END_TO_END_UAT_CHECKLIST.md) | SCL end-to-end UAT |
| [SCL_SCORE_DIRECTION_AUDIT.md](SCL_SCORE_DIRECTION_AUDIT.md) | Score direction / band semantics |

App-level MOSS docs: `moss/docs/` (API, EspoCRM, methodology, WordPress entry, deployment).

## SOMOD

| Doc | Purpose |
|-----|---------|
| [SOMOD_MASTER_DEVELOPER_HANDOFF_PACK.md](SOMOD_MASTER_DEVELOPER_HANDOFF_PACK.md) | SOMOD developer handoff |

## Repository / ChatGPT connector

| Doc | Purpose |
|-----|---------|
| [repository-mcp.md](repository-mcp.md) | Repository MCP service |
| [repository-workspaces.md](repository-workspaces.md) | Workspaces model |
| [keycloak-repo-mcp-setup.md](keycloak-repo-mcp-setup.md) | Keycloak client for MCP |
| [connector-session-lifecycle.md](connector-session-lifecycle.md) | Connector session lifecycle |
| [chatgpt-integration-options.md](chatgpt-integration-options.md) | Integration modes |
| [chatgpt-repo-connector-notion-style.md](chatgpt-repo-connector-notion-style.md) | Mode B connector guide |
| [chatgpt-import-versioning.md](chatgpt-import-versioning.md) | Import versioning rules |
| [REPO_MCP_FILE_PRESERVE.md](REPO_MCP_FILE_PRESERVE.md) | Original file import (FILE_PRESERVE vs CONTENT_CREATE) |
| [CHATGPT_MCP_BINARY_IMPORT_ROOT_CAUSE.md](CHATGPT_MCP_BINARY_IMPORT_ROOT_CAUSE.md) | Why ChatGPT DOCX became ~1.7KB |
| [CHATGPT_MCP_AUTOMATIC_IMPORT_ARCHITECTURE.md](CHATGPT_MCP_AUTOMATIC_IMPORT_ARCHITECTURE.md) | Automatic FILE_PRESERVE architecture |
| [CHATGPT_MCP_AUTOMATIC_IMPORT_API.md](CHATGPT_MCP_AUTOMATIC_IMPORT_API.md) | MCP tools for automatic binary import |
| [CHATGPT_MCP_AUTOMATIC_IMPORT_TESTING.md](CHATGPT_MCP_AUTOMATIC_IMPORT_TESTING.md) | Unit/integration/host tests |
| [CHATGPT_MCP_AUTOMATIC_IMPORT_DEPLOYMENT.md](CHATGPT_MCP_AUTOMATIC_IMPORT_DEPLOYMENT.md) | Staging deploy (no auto production) |
| [CHATGPT_MCP_AUTOMATIC_IMPORT_ROLLBACK.md](CHATGPT_MCP_AUTOMATIC_IMPORT_ROLLBACK.md) | Rollback |
| [CHATGPT_MCP_AUTOMATIC_IMPORT_VERIFICATION.md](CHATGPT_MCP_AUTOMATIC_IMPORT_VERIFICATION.md) | Smoke/verify commands |
| [MCP_ORIGINAL_FILE_IMPORT_FIX.md](MCP_ORIGINAL_FILE_IMPORT_FIX.md) | Why ChatGPT saw Markdown-to-PDF only |
| [repo-gpt-actions-workspaces.md](repo-gpt-actions-workspaces.md) | GPT Actions / workspaces |
| [workspace-testing-checklist.md](workspace-testing-checklist.md) | Workspace UAT checklist |
