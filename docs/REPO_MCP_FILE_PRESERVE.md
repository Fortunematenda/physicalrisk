# Repository MCP — original file preservation

## Problem

ChatGPT same-chat imports used `submit_approved_document` with `documentContent` (Markdown), then the API regenerated DOCX/XLSX/PDF. That destroyed formatting, sheets, formulas, images, and layout.

## Solution (two modes)

| Tool | Mode | Behaviour |
|------|------|-----------|
| `submit_approved_file` | **FILE_PRESERVE** | Stores exact bytes from `fileContentBase64` / `fileUrl` / `uploadId`. No Markdown conversion. Missing artifact → `ORIGINAL_FILE_UNAVAILABLE` (no silent fallback). |
| `submit_approved_content` | **CONTENT_CREATE** | Intentional Markdown/text → generated document (existing converters). |
| `submit_approved_document` | Legacy | Still works; prefer the two tools above. |

## ChatGPT / MCP limitation

The MCP SDK used here does **not** expose a native file object. Binary transfer is via:

- `fileContentBase64`
- `fileUrl` (server fetch)
- `uploadId` (chunked upload) / browser upload URL from `prepare_approved_document`

## Integrity

On FILE_PRESERVE / any MCP queue:

- SHA-256 of source bytes
- Re-read staged file and compare (`checksumVerified`)
- Mismatch → `FILE_INTEGRITY_MISMATCH` (job not accepted as IMPORTED)

Metadata on `ImportJob.metadata`: `importMode`, `conversionPerformed`, `originalFilename`, sizes, SHA fields.

## Local test

```bash
cd repo/apps/api
npx jest --runInBand --forceExit mcp-file-preserve.spec.ts
```

Connector: rebuild `repo-mcp` + `repo-api`, then in ChatGPT prefer `submit_approved_file` when a real file exists.
