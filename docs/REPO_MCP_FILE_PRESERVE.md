# Repository MCP — original file preservation

## Problem

ChatGPT same-chat imports used `submit_approved_document` with `documentContent` (Markdown), then the API regenerated DOCX/XLSX/PDF. That destroyed formatting, sheets, formulas, images, and layout.

## Solution (two modes)

| Tool | Mode | Behaviour |
|------|------|-----------|
| `submit_approved_file` | **FILE_PRESERVE** | Stores exact bytes from `fileContentBase64` / `fileUrl` / `uploadId`. No Markdown conversion. Missing artifact → `ORIGINAL_FILE_UNAVAILABLE` (no silent fallback). |
| `submit_approved_content` | **CONTENT_CREATE** | Intentional Markdown/text → generated document (existing converters). |
| `submit_approved_document` | Legacy | Still works; prefer the two tools above. |

## Excel / `.xlsx` (exact workbook)

Original spreadsheets **must** use FILE_PRESERVE:

1. `submit_approved_file` with `fileUrl` (preferred), `fileContentBase64`, or `uploadId`
2. Or `prepare_approved_document` → open `uploadUrl` in a browser and upload the `.xlsx`

Do **not** use `documentContent` + `outputFormat=xlsx` for an existing workbook — that rebuilds a new single-sheet file and drops formulas, multiple sheets, charts, and formatting.

ChatGPT Custom GPT Actions accept `fileUrl` / `uploadId` / `fileContentBase64` as **top-level** fields on `submit_approved_file` (in addition to the JSON `payload` string).

## ChatGPT / MCP limitation

The MCP SDK used here does **not** expose a native file object. Binary transfer is via:

- `fileContentBase64`
- `fileUrl` (server fetch)
- `uploadId` (chunked upload) / browser upload URL from `prepare_approved_document`

Large workbooks: prefer `fileUrl` or browser upload — do not rely on stuffing megabytes of base64 into the Action `payload` string.

## Integrity

On FILE_PRESERVE / any MCP queue:

- SHA-256 of source bytes
- Re-read staged file and compare (`checksumVerified`)
- Optional client `sourceSha256` must match or the job fails
- Mismatch → `FILE_INTEGRITY_MISMATCH` (job not accepted as IMPORTED)

Metadata on `ImportJob.metadata`: `importMode`, `conversionPerformed`, `originalFilename`, sizes, SHA fields.

## Local test

```bash
cd repo/apps/api
npx jest --runInBand --forceExit mcp-file-preserve.spec.ts
```

Connector: rebuild `repo-api` (+ `repo-mcp` for Mode B). Then refresh ChatGPT:

**Mode A (Custom GPT Actions):** GPT builder → Actions → re-import  
`https://repo.physicalrisk.com/api/mcp/openai/openapi.json`  
and paste updated GPT Instructions from Repo → Settings → MCP Integrations (or `/api/mcp/openai/gpt-instructions`).

**Mode B (MCP connector):** reconnect / start a new chat so tool list refreshes (`submit_approved_file`, `submit_approved_content`).

Prefer `submit_approved_file` when a real file exists — especially for `.xlsx`.
