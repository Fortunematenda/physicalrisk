# ChatGPT MCP binary import — root cause

**Status:** Audit complete (read-only + code inspection).  
**Scope:** Physical Risk Repository + `repo-mcp` ChatGPT connector / Custom GPT Actions.  
**Date:** 2026-08-24

## 1. Current architecture

```
ChatGPT (Actions OpenAPI or MCP Connector)
        │
        ├─ Mode A Actions ──► Nest /api/mcp/tools/*
        └─ Mode B Connector ► repo-mcp /mcp ──► Nest /api/mcp/tools/*
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
            FILE_PRESERVE     CONTENT_CREATE    Browser upload
            fileUrl /         documentContent   /api/mcp/upload/:token
            fileContentBase64 → Markdown→OOXML  (multer → FILE_PRESERVE)
            uploadId (chunks)   / PDF rebuild
                    │               │                │
                    └───────────────┴────────────────┘
                                    ▼
              ExternalImportOrchestrator.queueMcpApprovedDocument
                                    ▼
              stageIncoming → SHA-256 verify → ImportJob → async worker
```

Key components:

| Layer | Path |
|-------|------|
| MCP proxy | `repo-mcp/src/server.ts` |
| Tool dispatch | `repo/apps/api/src/mcp/mcp-tools.service.ts` |
| OpenAPI / GPT instructions | `repo/apps/api/src/mcp/mcp-openai.openapi.ts` |
| Chunk session (in-memory) | `repo/apps/api/src/mcp/mcp-upload-session.service.ts` |
| Browser upload (in-memory) | `repo/apps/api/src/mcp/mcp-browser-upload.service.ts` |
| Remote HTTPS fetch | `repo/apps/api/src/mcp/mcp-remote-file.service.ts` |
| Markdown→Office rebuild | `repo/apps/api/src/mcp/mcp-markdown-office.service.ts` |
| Queue / integrity | `repo/apps/api/src/imports/external-import-orchestrator.service.ts` |

## 2. Current import sequences

### 2.1 Intended FILE_PRESERVE

1. `submit_approved_file` with `fileUrl` **or** `fileContentBase64` **or** `uploadId`.
2. Server stores exact bytes; `importMode=FILE_PRESERVE`, `conversionPerformed=false`.
3. Job queued; checksum verified on stage.

### 2.2 prepare / upload_original_docx (browser)

1. Metadata-only prepare → `uploadUrl`.
2. User opens browser, uploads file.
3. `completeBrowserUpload` → FILE_PRESERVE.

**Product requirement update:** browser upload is **not** an acceptable UX for “say Import”. It remains a technical fallback only, not the primary ChatGPT path.

### 2.3 CONTENT_CREATE (lossy)

1. `submit_approved_content` or legacy `submit_approved_document` with `documentContent` (Markdown).
2. `McpMarkdownOfficeService` / PDF renderer **rebuilds** a new Office/PDF package.
3. Stored file is the rebuild — **not** the ChatGPT attachment.

## 3. What ChatGPT actually sends

Observed / code-supported inputs:

| Field | Meaning | Original bytes? |
|-------|---------|-----------------|
| `documentContent` | Markdown / extracted text | **No** |
| `fileName` + Markdown | GPT claims “DOCX import” | **No** |
| `fileContentBase64` | Exact bytes (rare; size-limited) | Yes if complete |
| `fileUrl` | Public HTTPS URL | Yes if fetchable |
| `uploadId` | Chunked base64 assembly | Yes if all chunks exact |
| OpenAI `file_id` / attachment resource | — | **Not implemented; host does not expose to this MCP** |
| MCP binary content blocks / blobs | — | **Not received by this server** |

**Conclusion:** The connected ChatGPT MCP/Actions host does **not** currently supply authorized attachment references or native binary content blocks to this repository MCP. The model frequently substitutes extracted Markdown.

## 4. Root cause

### Primary

**ChatGPT never transmits the original OOXML/PDF bytes.** It extracts or regenerates text (Markdown), then a repository tool on the CONTENT_CREATE path builds a **minimal substitute** DOCX/XLSX/PDF.

### Why ~87 KB → ~1.7 KB

1. Original attachment ≈ 87 KB (valid OOXML ZIP with media/styles).
2. Model content in the tool call is short Markdown (summary or extracted text), not base64 of the ZIP.
3. `buildDocx` / similar emits a minimal `[Content_Types].xml` + `word/document.xml` package — typically **1–3 KB**.
4. Orchestrator correctly stores those already-tiny bytes (`conversionPerformed=true` when that path ran).
5. Download matches the substitute — checksum of the **wrong** file, not truncation of the original.

This is **not** primarily nginx clipping (110m) or multer (100 MB). Staging re-reads and verifies SHA-256 of whatever buffer was submitted.

### Secondary failure modes

| Mode | Effect |
|------|--------|
| Nest default JSON body ~100 KB | Large single-shot `fileContentBase64` / Markdown → 413 “request entity too large” |
| `documentContent` max 500 KiB chars | GPT hits limit on huge Markdown dumps |
| In-memory chunk sessions | Lost on API restart; no durable resume |
| SSO `sso:userId` browser upload | Previously crashed UUID lookup (fixed via `resolveIntegrationForBrowserUpload`) |
| GPT instructions / stale Actions schema | Model insists “Markdown only” and skips FILE_PRESERVE tools |

## 5. Truncation / conversion points (code)

| Location | Behaviour |
|----------|-----------|
| `mcp-tools.service.ts` `submitApprovedDocument` + Markdown | CONTENT_CREATE conversion |
| `mcp-markdown-office.service.ts` | Rebuilds OOXML from text |
| `mcp-markdown-pdf.service.ts` | Rebuilds PDF from text |
| `prepare_approved_document` | Now strips `documentContent` (good) |
| `queueMcpApprovedDocument` | No content conversion; integrity only |

## 6. Limits discovered

| Limit | Value |
|-------|-------|
| nginx `client_max_body_size` (repo) | 110m |
| multer upload | 100 MB |
| remote `fileUrl` | 100 MB, 30s |
| `documentContent` | 500 KiB characters |
| Legacy chunk session | ≤500 chunks, 30 min TTL, in-memory |
| Nest JSON parser | default ~100kb (needs raise for chunk metadata only, not whole-file base64) |
| Seeded Office types | 50 MB (configurable via file_types) |

## 7. Security findings

- `fileUrl` fetch has SSRF guards (private IP / localhost blocked).
- Browser upload tokens are bearerless secrets (TTL).
- Logs must never include base64, signed URL query strings, or OAuth tokens.
- Synthetic SSO integration ids must not be queried as DB UUIDs (fixed for upload path).

## 8. Recommended automatic transport mode

| Priority | Mode | Host support today | Action |
|----------|------|--------------------|--------|
| 1 | **A — HOST_REFERENCE** | **Not available** from ChatGPT MCP to this server | Implement plumbing; return clear error until host supplies reference |
| 2 | **B — NATIVE_BINARY** | **Not available** | Same |
| 3 | **C — CHUNKED_BINARY** | Only if host can read **exact** attachment bytes and auto-loop tools | Implement durable resumable chunks; GPT must drive without user messages |
| — | Browser `uploadUrl` | Works but **forbidden by product UX** | Must not be the success path for “Import” |
| — | Markdown CONTENT_CREATE | Available | **Forbidden** for original Office/PDF imports |

**Selected implementation strategy:**

1. Implement Mode A + Mode C production architecture (inspect → import / prepare → chunk → complete).
2. On missing bytes/reference: return `AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST` — **do not** convert, **do not** create AVAILABLE version, **do not** send user to a browser upload page as the “import succeeded” path.
3. Keep FILE_PRESERVE `fileUrl` for clients that can supply a public HTTPS URL (operational zero-click when URL exists).
4. Hard-reject Markdown saved as `.docx`/`.xlsx`/`.pptx`.

## 9. Capability gap (honest)

True “attach in ChatGPT → say Import → byte-identical store” **requires** the ChatGPT host to expose original attachment bytes or an authorized retrievable reference to the MCP server. That capability is **not** present in the current connector payload surface inspected in this codebase.

Repository-only changes cannot access a private ChatGPT attachment that was never supplied to the MCP tool call.

## 10. Next steps (implementation)

See companion docs:

- `CHATGPT_MCP_AUTOMATIC_IMPORT_ARCHITECTURE.md`
- `CHATGPT_MCP_AUTOMATIC_IMPORT_API.md`
- Implementation of tools: `inspect_attachment_capability`, `import_original_file`, `prepare_automatic_file_import`, chunk/progress/resume/complete/abort.
