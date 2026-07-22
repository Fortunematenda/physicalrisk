# Document Versioning Implementation - Deliverables

## Objective
Implemented a complete document versioning workflow that separates the logical document identity from individual document versions. The system now:

- Enforces unique `(document_id, version_no)` and `(document_id, checksum)` constraints.
- Rejects duplicate content even when the version number changes.
- Rejects older versions when a newer current version already exists.
- Preserves previous versions, superseding only the `isCurrent` flag.
- Updates the Master Document Index and Version Register on every import.
- Returns structured API error responses for duplicate content, duplicate version, older version, and validation failures.
- Provides a redesigned frontend import modal with import type selection, existing document search, version suggestions, and duplicate handling.

---

## Modified files

### Backend
- `apps/api/src/database/entities.ts`
  - Added `Document.currentVersion`/`currentVersionId` relation and `current_version_no` support.
  - Added `@Unique(['document', 'versionNo'])` and `@Unique(['document', 'checksum'])` on `DocumentVersion`.
- `apps/api/src/database/database.module.ts`
  - Switched from `synchronize: true` to `synchronize: false` with `migrationsRun: true`.
  - Registered the new migration class.
- `apps/api/src/database/migrations/1721337600000-AddDocumentVersioningConstraints.ts`
  - Idempotent migration adding `current_version_id` and per-document uniqueness constraints.
- `apps/api/src/imports/imports.service.ts`
  - Implemented `resolveLogicalDocument`, `process` workflow, transaction-safe saves, and structured error details.
- `apps/api/src/imports/imports.controller.ts`
  - Wired `UploadImportDto`, exception filters, and file upload.
- `apps/api/src/imports/upload-import.dto.ts`
  - DTO for multipart upload metadata.
- `apps/api/src/imports/import.exception.ts`
  - `ImportBusinessException` and `StructuredErrorResponse` types.
- `apps/api/src/imports/import-exception.filter.ts`
  - Exception filters for `ImportBusinessException`, `BadRequestException`, and `NotFoundException`.
- `apps/api/src/imports/version.util.ts`
  - Robust semantic-like version comparison, parsing, and next-version suggestion.

### Frontend
- `apps/web/app/imports/new/page.tsx`
  - New import page with `NEW` / `NEW_VERSION` modes, existing document picker, duplicate modal, version suggestion.
- `apps/web/app/globals.css`
  - Added `.readonly-box`, `.modal-backdrop`, `.modal`, `.modal-header`, `.modal-body`, `.modal-footer`, `.info-panel` styles.
- `apps/web/lib/version.ts` (new)
  - Shared `suggestNextVersion`, `compareVersions`, and `formatBytes` helpers.

### Tests
- `apps/api/src/imports/version.util.test.ts`
  - Unit tests for parse, compare, and suggestion logic.
- `apps/web/lib/version.test.ts`
  - Frontend unit tests for the shared version helpers.
- `scripts/test-import-workflow.ps1`
  - End-to-end integration test exercising duplicate content, duplicate version, newer version, older version, and version history.

---

## Database migration

The TypeORM migration is applied automatically when the API container starts (`migrationsRun: true`).

To run it manually (from the repo root):

```powershell
cd apps/api
npx typeorm migration:run -d src/database/data-source.ts
```

If a data-source file is not yet configured, use the existing container path:

```powershell
docker compose exec api npx typeorm migration:run -d dist/database/data-source.js
```

---

## API response examples

### 1. Duplicate content with changed version number
**HTTP 400**
```json
{
  "code": "DUPLICATE_DOCUMENT_CONTENT",
  "message": "This file is identical to version 1.0 already stored for this document. Changing the version number does not create a new document version.",
  "details": {
    "documentId": "...",
    "documentTitle": "Release Alpha",
    "documentCode": "MOSS-RN-001",
    "existingVersionId": "...",
    "existingVersion": "1.0",
    "submittedVersion": "1.2",
    "existingFileName": "test-import-a.txt",
    "existingImportDate": "2026-07-18T...",
    "repositoryPath": "repository/MOSS/Release Notes/MOSS-RN-001/v1.0/test-import-a.txt",
    "repositorySection": "Release Notes",
    "checksum": "..."
  }
}
```

### 2. Duplicate version number with different content
**HTTP 400**
```json
{
  "code": "DUPLICATE_VERSION_NUMBER",
  "message": "A version 1.0 already exists for this document. Enter the correct approved version number or select the existing version.",
  "details": { "..." }
}
```

### 3. Older version submission
**HTTP 400**
```json
{
  "code": "VERSION_NOT_NEWER",
  "message": "The submitted version 0.9 is older than the current version 1.1. Historical versions cannot be imported through the standard import workflow.",
  "details": { "..." }
}
```

### 4. Successful new version
**HTTP 200**
```json
{
  "status": "IMPORTED",
  "document": {
    "id": "...",
    "code": "MOSS-RN-001",
    "title": "Release Alpha",
    "currentVersionNo": "1.1"
  },
  "version": {
    "id": "...",
    "versionNo": "1.1",
    "isCurrent": true,
    "storagePath": "repository/MOSS/Release Notes/MOSS-RN-001/v1.1/test-import-b.txt"
  },
  "storageResult": {
    "mode": "VPS_LOCAL_FILESYSTEM",
    "registers": { "versions": 2, "documents": 1 }
  }
}
```

---

## Build commands

```powershell
# API build
npm run build -w @gateway/api

# Web build
npm run build -w @gateway/web

# Docker Compose build and start
docker compose build
docker compose up -d
```

---

## Restart commands

```powershell
# Full restart
docker compose down
docker compose up -d --build

# Restart only the API after code changes
docker compose build api
docker compose up -d api

# View logs
docker compose logs api --tail 50 -f
```

---

## Test commands

```powershell
# Backend version util tests
npx tsx --test apps/api/src/imports/version.util.test.ts

# Frontend version helper tests
cd apps/web
npx tsx --test lib/version.test.ts

# End-to-end import workflow tests (API must be running on localhost:4000)
powershell -File scripts/test-import-workflow.ps1
```

---

## Verification checklist

- [x] `npm run build -w @gateway/api` completes.
- [x] `npm run build -w @gateway/web` completes.
- [x] `docker compose build` completes.
- [x] `docker compose up -d` starts all services.
- [x] TypeORM migration `AddDocumentVersioningConstraints1721337600000` runs.
- [x] `scripts/test-import-workflow.ps1` passes all six scenarios.
- [x] UI at `http://localhost:8080/imports/new` renders the import type selector and duplicate modal.
- [x] API returns structured errors for all versioning violations.

---

## Notes

- Existing documents, versions, audit logs, and indexes are preserved. No data is deleted.
- `DB_SYNCHRONIZE` is no longer used; the migration path controls schema changes.
- The `document_versions` uniqueness rules are enforced by PostgreSQL constraints added by the migration.
