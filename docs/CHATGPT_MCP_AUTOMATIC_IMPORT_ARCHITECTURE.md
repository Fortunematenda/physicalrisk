# ChatGPT MCP automatic binary import — architecture

## Goal

Byte-for-byte FILE_PRESERVE of original DOCX/XLSX/PPTX/PDF from ChatGPT into Physical Risk Repository, with **no** Markdown reconstruction and **no** browser upload as the primary “Import” UX.

## Transport selection

| Priority | Mode | When | Tool |
|----------|------|------|------|
| 1 | HOST_REFERENCE | Public HTTPS `fileUrl` / `attachmentReference` | `import_original_file` |
| 2 | CHUNKED_BINARY | Host can send exact raw bytes in chunks | `prepare_automatic_file_import` → chunks → `complete_automatic_file_import` |
| — | UNSUPPORTED | Neither available | `AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST` — no convert, no fake file |

ChatGPT currently does **not** expose OpenAI `file_id` attachment retrieval to this MCP. Mode A works when a public HTTPS URL is supplied. Mode C works only if the host can actually stream exact attachment bytes through tool calls.

## Components

- `McpBinaryImportService` — inspect / import / prepare / chunk / progress / resume / complete / abort
- `mcp_binary_import_sessions` — durable session + token hash
- Temp dir `MCP_UPLOAD_TEMP_STORAGE_PATH` — decoded chunk files (never store Base64 in DB)
- Assembly streams chunks to `assembled.bin` and SHA-256s while writing
- Staging copies the assembled file into incoming storage (`filePath`) — no whole-file Base64 round-trip
- `mcp-ooxml-validate.util.ts` — ZIP/OOXML/PDF signature checks; reject Markdown disguised as Office
- Queue via existing `ExternalImportOrchestratorService` with `importMode=FILE_PRESERVE`
- `McpBinaryImportScheduler` expires abandoned sessions every 10 minutes

## Sequence (Mode C)

1. User: “Import”
2. GPT: `inspect_attachment_capability` (`canProvideExactBytes=true` if host can)
3. `prepare_automatic_file_import` → `uploadId`, `uploadToken`, `acceptedChunkSize`
4. Loop `upload_original_file_chunk` (no user messages between chunks)
5. On interrupt: `resume_automatic_file_import`
6. `complete_automatic_file_import` → assemble → SHA-256 → OOXML validate → queue
7. `get_import_status`

## Non-goals

- Browser `uploadUrl` as primary success path
- Markdown → DOCX/XLSX rebuild for originals
- Marking AVAILABLE before validation
