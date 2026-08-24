# ChatGPT MCP automatic binary import — testing

## Unit

```bash
cd repo/apps/api
npx jest --testPathPatterns="mcp-ooxml-validate|mcp-binary-import|mcp-file-preserve|mcp-openai.openapi"
```

Fixtures covered in unit tests:

- Minimal OOXML ZIP signature + required entry names (docx / xlsx / pptx)
- Markdown / HTML / CSV rejected when extension is `.docx` / `.xlsx`
- PDF `%PDF-` signature
- Mode C prepare → chunk → complete happy path (service spec)
- Duplicate valid chunk (idempotent) and conflicting duplicate chunk
- Missing chunks, expired session, abort, out-of-order chunks, replayed complete
- FILE_PRESERVE without conversion when bytes present
- UNSUPPORTED when host supplies neither URL nor bytes

Large 25 MB / 100 MB / 50 MB fixtures are staging-only (not committed).

## Integration (staging)

1. Apply migration `1722000000000-AddMcpBinaryImportSessions`.
2. Set env vars (see deployment doc).
3. Rebuild `repo-api` + `repo-mcp`.
4. Mode A: host a known DOCX on HTTPS → `import_original_file` → compare SHA-256 of download vs source.
5. Mode C: scripted chunk upload of fixture → complete → compare checksums.

## ChatGPT host capability (must be verified live)

Do **not** claim ChatGPT supplies attachment bytes without a live test.

| Scenario | Expected if host has no file_id |
|----------|----------------------------------|
| Say “Import” with no public URL | `AUTOMATIC_TRANSFER_UNSUPPORTED_BY_HOST` |
| Say “Import” + public HTTPS fileUrl | FILE_PRESERVE queue; checksum match |
| Markdown only | Must **not** create tiny fake DOCX |

## Definition of pass

Downloaded repository file SHA-256 === source fixture SHA-256; size match; OOXML validation OK; `conversionPerformed=false`.
