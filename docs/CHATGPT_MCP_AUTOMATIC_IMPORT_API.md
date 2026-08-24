# ChatGPT MCP automatic binary import — API

## Tools

| Tool | Purpose |
|------|---------|
| `inspect_attachment_capability` | HOST_REFERENCE / CHUNKED_BINARY / UNSUPPORTED |
| `import_original_file` | Mode A: HTTPS fetch → FILE_PRESERVE |
| `prepare_automatic_file_import` | Mode C: create session |
| `upload_original_file_chunk` | Mode C: one base64 chunk |
| `get_automatic_file_import_progress` | Progress |
| `resume_automatic_file_import` | Missing chunks |
| `complete_automatic_file_import` | Assemble + validate + queue |
| `abort_automatic_file_import` | Abort; keep existing versions |

OpenAPI: `GET /api/mcp/openai/openapi.json` (version **1.29.0+**).

## Chunk contract

- Encoding: Base64 of **raw** bytes
- Default raw chunk size: `MCP_BINARY_IMPORT_CHUNK_SIZE` (256 KiB)
- Required: `chunkIndex`, `chunkSha256` (hex of raw bytes), `rawByteLength`
- Idempotent: same chunk index + same hash accepted; conflicting hash rejected

## Errors (structured)

See `BinaryImportErrorCode` in `mcp-binary-import.errors.ts`.

Notable:

- `AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST`
- `MARKDOWN_DISGUISED_AS_OFFICE`
- `INVALID_OOXML_PACKAGE`
- `FILE_CHECKSUM_MISMATCH` / `FILE_SIZE_MISMATCH`
- `MISSING_CHUNKS`

## Auth

Same MCP Bearer (`mcp_…` or Keycloak SSO via repo-mcp). Binary tools are always allowed for older API keys.
