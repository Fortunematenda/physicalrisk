# MCP original-file import contract fix

ChatGPT was refusing MOSS-GS-003 DOCX import with:

> The repository currently exposes only a Markdown-to-PDF import action, not binary DOCX upload.

That is an **MCP tool-discovery / description** failure, not a storage UI failure.

## OLD MCP CONTRACT

ChatGPT Connector URL: `https://repo.physicalrisk.com/connector/mcp` (`repo-mcp`).

What ChatGPT treated as “the” import tool:

- `submit_approved_document`
- Input included `documentContent` (Markdown) and `outputFormat` (default PDF)
- Descriptions still allowed the model to believe Repo is Markdown→PDF only
- `import_original_file` existed in later local code but was:
  - not on production until deploy
  - weakly advertised vs `submit_approved_document`
  - buried among workspace tools in `tools/list`

`prepare_approved_document` had also been changed to return `AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST` when ChatGPT cannot send `fileUrl`, which left **no executable FILE_PRESERVE action**. The model then fell back to the only remaining “import” tool: Markdown→PDF.

Direct MCP file blocks (`file: binary`) are **not** supplied by ChatGPT to this connector. No `file_id` retrieval.

## NEW MCP CONTRACT

Two capabilities:

| Capability | Tools | Source |
|------------|-------|--------|
| **A. GENERATED CONTENT** | `submit_approved_content`, `submit_approved_document` | Markdown/text you wrote |
| **B. ORIGINAL FILE** | `import_original_file`, `prepare_original_file_import`, `finalize_original_file_import` | Exact DOCX/XLSX/PDF/PPTX bytes |

`submit_approved_document` description now states it is **GENERATED TEXT ONLY** and **not a binary DOCX upload action**.

OpenAPI version: **1.30.1**. `repo-mcp` version: **1.30.1**.

Binary upload tools are registered **first** in `tools/list` so ChatGPT does not truncate them away:
`upload_original_docx`, `upload_original_xlsx`, `upload_original_pdf`, `upload_original_pptx`, `prepare_original_file_import`.

### `import_original_file`

Description (ChatGPT-facing):

> Import an existing source file into the Physical Risk Repository while preserving the original file format and binary contents. Use this tool for DOCX, XLSX, PDF and other uploaded/generated files when the user requests the original file to be imported. Do not convert the file to Markdown or PDF.

Inputs: `projectCode`, `workspaceCode`, `module`, `documentType`, `title`, `description`, `mode`, `documentCode`, `versionNo`, `fileName`, `mimeType`, `fileUrl` / `attachmentReference`.

### Staged transfer (`prepare_original_file_import`)

When ChatGPT cannot send original bytes in the tool call:

```json
{
  "status": "UPLOAD_PENDING",
  "uploadId": "...",
  "uploadUrl": "https://…/api/mcp/upload/{uploadId}",
  "method": "PUT",
  "expiresAt": "...",
  "maxFileSize": 524288000,
  "acceptedMimeTypes": ["…wordprocessingml.document", "…spreadsheetml.sheet", "…presentationml.presentation", "application/pdf"],
  "mode": "FILE_PRESERVE",
  "preservationMode": "ORIGINAL_BINARY",
  "source": "CHATGPT_MCP",
  "conversionPerformed": false
}
```

PUT (or POST multipart `file`) the **exact original bytes** to `uploadUrl`. Then:

`finalize_original_file_import({ uploadId })`

Statuses: `UPLOAD_PENDING` → `UPLOADED`/`VERIFIED` → `IMPORTED` or `VERIFICATION_FAILED`.  
`IMPORTED` is never returned for metadata-only session create.

## FILE TRANSFER METHOD

1. **HOST_REFERENCE** — HTTPS `fileUrl` → `import_original_file` (server fetch).
2. **CHUNKED_BINARY** — `prepare_automatic_file_import` + `upload_original_file_chunk` + `complete_automatic_file_import`.
3. **STAGED PUT** — `prepare_original_file_import` → PUT `/api/mcp/upload/:token` → `finalize_original_file_import`.

## DIRECT FILE SUPPORT

**No.** ChatGPT MCP does not give this connector native attachment bytes / OpenAI `file_id`.

## STAGED UPLOAD SUPPORT

**Yes.** PUT/POST to `uploadUrl` stores original bytes with `forceFilePreserve: true`. No Markdown rebuild.

## DOCX / XLSX / PDF PRESERVATION

FILE_PRESERVE. No DOCX→Markdown→PDF. Markdown disguised as `.docx` is rejected.

## NEW VERSION SUPPORT

`mode=NEW_VERSION` + `documentCode=MOSS-GS-003` on original-file tools. Existing version is not overwritten on failed transfer.

## BYTE-SIZE / SHA256 VERIFICATION

Orchestrator compares source vs stored size and SHA-256 before queue success. Finalize reads those fields. Mismatch → `VERIFICATION_FAILED`, not `IMPORTED`.

## 125059-BYTE DOCX TEST

Not run against live ChatGPT in this change. After **staging** deploy (not production until e2e):

1. Record source filename, size `125059`, SHA-256.
2. New ChatGPT chat; reconnect connector.
3. “Import this file as a new version of MOSS-GS-003 and preserve the original DOCX exactly.”
4. Confirm tools/list includes `import_original_file` and `prepare_original_file_import`.
5. Download repository artifact; compare size + SHA-256.

## END-TO-END MCP TEST

**Not passed on production.** Do not deploy to production until the ChatGPT connector test above passes.

Local unit: OpenAPI 1.30.0 + tool descriptions + FILE_PRESERVE prepare path.

## Exact tools ChatGPT should see after deploy

From `GET /connector/mcp` `tools/list` (repo-mcp 1.30.0), original-file tools include:

- `import_original_file`
- `prepare_original_file_import` → `uploadUrl` + `method: PUT`
- `finalize_original_file_import`
- `inspect_attachment_capability`
- chunk tools
- `submit_approved_document` labeled **GENERATED TEXT ONLY**
