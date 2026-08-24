# ChatGPT MCP automatic binary import — deployment

**Do not deploy to production without explicit approval.**

## Env (`.env.sso` / API)

```bash
MCP_BINARY_IMPORT_ENABLED=true
MCP_BINARY_IMPORT_MAX_FILE_SIZE=524288000
MCP_BINARY_IMPORT_CHUNK_SIZE=262144
MCP_BINARY_IMPORT_SESSION_TTL=3600
MCP_BINARY_IMPORT_MAX_CHUNKS=4000
MCP_UPLOAD_TEMP_STORAGE_PATH=/var/lib/physicalrisk/mcp-binary-import
MCP_ATTACHMENT_REFERENCE_ALLOWED_HOSTS=
MCP_ATTACHMENT_REFERENCE_TIMEOUT=30000
MCP_OOXML_MAX_ENTRY_COUNT=10000
MCP_OOXML_MAX_EXPANDED_SIZE=1073741824
```

Office file-type seed limits are **500 MB** (docx/xlsx/pptx/pdf). Nest JSON body limit is **2mb** in `main.ts` (enough for one chunk + metadata; not whole-file base64). Abandoned Mode C sessions are expired every 10 minutes.

## Staging steps

```bash
cd /opt/physicalrisk
bash scripts/deploy-sso-rsync.sh /opt/physicalrisk
# Ensure migration runs with API boot / typeorm migrate
DOCKER_BUILDKIT=1 docker compose -f docker-compose.sso.yml --env-file .env.sso build repo-api repo-mcp
docker compose -f docker-compose.sso.yml --env-file .env.sso up -d repo-api repo-mcp nginx
```

Verify:

```bash
curl -sS https://repo.physicalrisk.com/api/mcp/openai/openapi.json | head -c 400
# expect version 1.29.0+ and import_original_file / prepare_automatic_file_import
```

Re-import Custom GPT Actions schema; reconnect @Repo; **new chat**.

## Rollback

1. Set `MCP_BINARY_IMPORT_ENABLED=false` and restart `repo-api`.
2. Optionally roll back API/MCP images to previous tag.
3. Migration table `mcp_binary_import_sessions` may remain (harmless); down migration available in `1722000000000-AddMcpBinaryImportSessions.ts`.

## Verification checklist

See `CHATGPT_MCP_AUTOMATIC_IMPORT_VERIFICATION.md`.
