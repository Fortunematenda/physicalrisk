# Repository Workspaces

Persistent, resumable units of import/review work. **Repository is the source of truth** — ChatGPT conversation history is never relied on alone.

## Codes

- Format: `WS-YYYY-#####` (example `WS-2026-00045`)
- Allocated atomically via `sequence_counters` (`SELECT … FOR UPDATE`)
- Future: `JOB-YYYY-#####`, `PACK-YYYY-#####` via same service

## Status / steps

See enums `WorkspaceStatus` and `WorkspaceStep` in `repo/apps/api/src/database/entities.ts`.

## API (Nest, prefix `/api`)

| Method | Path |
|--------|------|
| POST | `/workspaces` |
| GET | `/workspaces` |
| GET | `/workspaces/search?q=` |
| GET | `/workspaces/latest` |
| GET | `/workspaces/my/latest-pending` |
| GET/PATCH | `/workspaces/:workspaceCode` |
| POST | `/workspaces/:workspaceCode/pause\|resume\|validate\|submit\|cancel\|archive` |
| GET/POST | `/workspaces/:workspaceCode/documents` |
| PATCH/DELETE | `/workspaces/:workspaceCode/documents/:id` |
| GET | `/workspaces/:workspaceCode/activity` |
| GET | `/workspaces/:workspaceCode/summary` |

## ZIP linkage

ZIP pack import (`ImportsService.processZipPack`) creates/attaches a workspace and one `WorkspaceDocument` per extracted member (relative paths preserved, sanitized).

## UI

- `/workspaces` — list + create
- `/workspaces/[workspaceCode]` — overview, documents, activity, actions

## Migration

TypeORM migration: `AddRepositoryWorkspaces1721700000000`  
With `DB_SYNCHRONIZE=true` (compose default for repo-api), schema syncs from entities. Production with synchronize off: migrations run on API start.
