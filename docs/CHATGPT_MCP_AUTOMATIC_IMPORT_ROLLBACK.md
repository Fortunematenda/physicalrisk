# ChatGPT MCP automatic binary import — rollback

1. **Feature flag:** `MCP_BINARY_IMPORT_ENABLED=false` → restart `repo-api`.
2. **Images:** redeploy previous `repo-api` / `repo-mcp` image digests.
3. **OpenAPI / GPT:** re-import previous Actions schema if needed; start new chat.
4. **DB:** optional `down` on `AddMcpBinaryImportSessions1722000000000` (drops sessions table only).
5. **Temp files:** clear `MCP_UPLOAD_TEMP_STORAGE_PATH` if disk pressure.

Existing document versions and Import Jobs are not deleted by abort/disable.
