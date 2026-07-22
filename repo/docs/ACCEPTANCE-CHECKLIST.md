# RFP-001 v1.1 MVP Acceptance Checklist

| Requirement | MVP implementation |
|---|---|
| Lightweight import gateway | Import, validation, routing, versioning, indexing, relationships and auditing only |
| Approved documents only | API rejects any status other than `APPROVED` |
| Multiple projects | Project Registry with an independent relative VPS root for each project |
| Standard default directory | Seeded 19-section RFP-001 template |
| Configurable per-project directory | Add, rename, reorder, deactivate and set a relative folder without code changes |
| No hard-coded project logic | Routing reads Project Registry, project sections and routing rules |
| Source support | ChatGPT, Claude, Gemini, Word, local folder, website workflow and future source records |
| Mandatory metadata | Configurable metadata fields plus core required fields |
| Configurable file types | Extension, MIME type, size and extraction settings |
| Automatic routing | Priority-based global or project-specific rules |
| Version history | Immutable `document_versions`, current-version control and superseded history |
| Master Document Index | Database register plus automatic CSV and JSON export on the VPS |
| Version Register | Database register plus automatic CSV and JSON export on the VPS |
| Document relationships | Typed relationship register and management page |
| Complete audit log | Imports, failures, configuration changes and relationships recorded |
| VPS repository destination | Persistent host bind mount with safe relative paths |
| Repository visibility | Read-only VPS Repository Explorer and authenticated downloads |
| Storage health | Writable-volume and capacity checks in System Settings |
| Deployment | PostgreSQL, API, frontend and Nginx Docker Compose stack |
