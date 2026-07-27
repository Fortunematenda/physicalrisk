# External Document Connectors

Provider-neutral intake for Google Drive, ChatGPT (MCP), and manual upload into the existing **Import Queue**. The Repo Gateway remains the source of truth for validation, approval, routing, checksums, duplicates, versioning, storage, Master Document Index, Version Register, relationships, and audit.

## Architecture

```text
External Provider
→ Connector Layer
→ Temporary Staging Storage (`storage/staging/external-imports/`)
→ Existing Import Queue (`ImportJob`)
→ Metadata / duplicate / version validation
→ User review and approval
→ Existing final repository import
→ Master Document Index / Version Register / Audit Trail
```

All providers share `ExternalImportOrchestratorService`. Connectors never write directly into final repository folders.

## Terminology

| Term | Meaning |
|------|---------|
| Source Connection | Authenticated link to an external provider |
| External Folder | Provider folder identified by stable ID |
| Repository Project | Project from the Project Registry |
| Repository Module | Project section / directory module |
| Folder Mapping | External folder → project + module |
| Import Queue | Existing `ImportJob` review/process queue |
| Sync History | `ConnectorSyncRun` records |
| Approved Document | Document with approval status `APPROVED` |

## Environment variables

```env
CONNECTOR_ENCRYPTION_KEY=   # 32 bytes as 64-char hex (preferred), base64, or utf8
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8080/api/connectors/google-drive/callback
MCP_ENABLED=true
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Production redirect URI example:

```text
https://repo.physicalrisk.com/api/connectors/google-drive/callback
```

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable the **Google Drive API**.
3. Configure OAuth consent screen (Internal or External as required).
4. Create OAuth 2.0 **Web application** credentials.
5. Add authorized redirect URIs for local and production (see `GOOGLE_REDIRECT_URI`).
6. Copy Client ID and Client Secret into `.env`.
7. Scope used: `https://www.googleapis.com/auth/drive.readonly` (read-only).

### Google Drive workflow

1. Settings → Source Connections → Connect Google Drive.
2. Complete OAuth; tokens are encrypted with AES-256-GCM.
3. Select a root folder (folder IDs, not names).
4. Create Folder Mappings to Repository Projects and Repository Modules.
5. Sync Now (or configure schedule: every 15 minutes / hourly / daily; default Manual).
6. Review staged items in Import Queue → External Imports.
7. Continue Import through the existing Import Document form.

Google Workspace exports:

| Google type | Export |
|-------------|--------|
| Docs | DOCX |
| Sheets | XLSX |
| Slides | PPTX |
| Drawings | PDF |

Provider identity uses **file ID + revision/version**, not only the export checksum.

## MCP (ChatGPT) setup

MCP is hosted inside the NestJS API (not a separate service):

| Route | Purpose |
|-------|---------|
| `POST /api/mcp` | JSON-RPC transport |
| `GET /api/mcp` | Capability discovery |
| `POST /api/mcp/tools/:toolName` | Direct tool call |
| `/mcp` via Nginx | Alias to `/api/mcp` |

### Tools

- `list_repository_projects`
- `list_repository_modules`
- `list_document_types`
- `check_document_exists`
- `submit_approved_document` (APPROVED only)
- `get_import_status`

### Authentication

1. Settings → MCP Integrations → create an integration.
2. Copy the API key **once** (shown only at create/rotate).
3. Scope allowed projects and tools.
4. Call MCP with `Authorization: Bearer <api_key>` (or `X-MCP-API-Key`).

`submit_approved_document` rejects `DRAFT`, `PENDING`, `IN_REVIEW`, `REJECTED`, and missing approval status. Files are staged and queued for human review — never written straight to final storage.

### ChatGPT Custom GPT (Actions)

1. Repo → **Settings → MCP Integrations** → create an integration with all tools + allowed projects.
2. Copy the `mcp_…` API key (shown once).
3. In ChatGPT GPT builder → **Actions**:
   - Import from URL: `https://repo.physicalrisk.com/api/mcp/openai/openapi.json`
   - Or paste the JSON from that URL / from the MCP Integrations page.
4. Authentication: **API Key** → **Bearer** → paste the full `mcp_…` key  
   (alternative header: `X-MCP-API-Key`).
5. Privacy policy URL: `https://repo.physicalrisk.com/privacy`
6. Paste the GPT Instructions from the MCP Integrations page.
7. Update the GPT, start a **new** chat, and Allow actions when prompted.

Verify with:

```bash
curl -s -X POST "https://repo.physicalrisk.com/api/mcp/tools/list_repository_projects" \
  -H "Authorization: Bearer mcp_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d "{}"
```

### ChatGPT / MCP connection (JSON-RPC)

Point advanced MCP clients at `https://repo.physicalrisk.com/mcp` with the integration API key. Custom GPT Actions should use the OpenAPI schema above, not JSON-RPC alone. Use `submit_approved_document` only for approved deliverables.

## Manual upload

Manual upload on Import Document continues to work and sets provider `MANUAL_UPLOAD`. External Drive/MCP jobs share the same Import Queue and final import pipeline.

## Security

- OAuth refresh tokens encrypted at rest (AES-256-GCM).
- Credentials never returned in API responses or logs.
- Disconnect clears stored credentials.
- Staging paths are sanitized; provider paths are never trusted.
- MCP write tools enforce Repo project permissions independently of ChatGPT.

## Local development

```bash
cd repo
cp .env.example .env
# set CONNECTOR_ENCRYPTION_KEY, Google OAuth vars
npm install
docker compose up --build -d
```

Open Source Connections at `/settings/source-connections`.

## Production deployment

```bash
cd repo
docker compose up --build -d
```

Ensure Nginx includes `/mcp` → API (see `deploy/nginx.conf`), and that production `GOOGLE_REDIRECT_URI` matches Google Cloud console.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API fails to start | `CONNECTOR_ENCRYPTION_KEY` must be exactly 32 bytes |
| OAuth callback error | Redirect URI mismatch / missing `code`/`state` |
| Sync finds nothing | Root folder + Folder Mappings configured and enabled |
| File type rejected | Extension enabled under Configuration → File Types |
| MCP 401 | Integration disabled, expired, or wrong API key |
| Duplicate review | Same checksum or provider revision already imported |

## Token rotation / disconnect

- MCP: Rotate credentials on the MCP Integrations page (previous key invalidated).
- Google Drive: Disconnect removes encrypted tokens; reconnect to authorize again.

## Adding a future connector

1. Implement `RepositoryConnector` (and optional OAuth / folder browsing interfaces).
2. Register in `ConnectorRegistryService` (future providers stay disabled until implemented).
3. Reuse `ExternalImportOrchestratorService.queueExternalImport` only.
4. Add UI card when the connector is ready — Never invent fake “Coming Soon” actions.
