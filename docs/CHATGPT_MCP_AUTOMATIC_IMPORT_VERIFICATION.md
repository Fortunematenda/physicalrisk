# ChatGPT MCP automatic binary import — verification

## API smoke

```bash
# OpenAPI version
curl -sS "$REPO/api/mcp/openai/openapi.json" | jq -r .info.version

# Inspect (expect UNSUPPORTED without URL)
curl -sS -X POST "$REPO/api/mcp/tools/inspect_attachment_capability" \
  -H "Authorization: Bearer $MCP_KEY" -H "Content-Type: application/json" \
  -d '{"fileName":"x.docx"}' | jq .
```

## Mode A (fileUrl)

1. Place a known DOCX on HTTPS.
2. Call `import_original_file` with `fileUrl`, `mode=NEW_VERSION`, `documentCode=…`.
3. `get_import_status` → download version → `sha256sum` match.

## Mode C (chunks)

1. `prepare_automatic_file_import` with `expectedFileSize`.
2. Split file into `acceptedChunkSize` raw chunks; for each: base64 + sha256 → `upload_original_file_chunk`.
3. `complete_automatic_file_import`.
4. Compare repository download SHA-256 to source.

## Negative

- Markdown body + `.docx` name → must **not** queue CONTENT_CREATE as success for original import tools.
- Missing URL/bytes → `AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST`.
