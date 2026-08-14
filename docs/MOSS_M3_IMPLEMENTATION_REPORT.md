# MOSS M3 Implementation Report — Assessment Session + Control Response APIs

**Status:** **M3 COMPLETE**  
**M4 aggregation scoring:** **BLOCKED / PENDING CLIENT METHODOLOGY**  
**M5 UI:** **READY** (backend APIs sufficient for workspace UI; M5 not implemented in this increment)  
**Date:** 2026-08-09  
**Scope:** Local development only — no production deploy

---

## 1. Executive Summary

M3 delivers a dedicated NestJS MOSS module for catalogue reads, assessment session lifecycle, lazy control response persistence, completion progress, and site APIs — fully isolated from Cost Leakage (SCLI).

| Gate | Result |
|------|--------|
| Catalogue API | Published **3.0** — **14** domains / **100** controls |
| Create MOSS assessment | `productCode = MOSS`, bound to catalogue 3.0 |
| Lazy control assessments | Rows created only on PATCH/save — never on GET |
| Progress | Completion only (e.g. 1/100 → **1%**) — **not** maturity |
| SCLI isolation | Legacy `/api/assessments*` filters `productCode = SCLI_COST_LEAKAGE` |
| SCLI methodology engines | **Unchanged** |
| Repository | **0 files changed** |
| Domain / overall MOSS score | **Not invented** (`PENDING CONFIGURATION`) |

---

## 2. M3 Status

**M3 COMPLETE**

Stop conditions met: no M5 frontend work in this increment, no M4 aggregation, no financial engines, no SOMOD, no production deploy.

---

## 3. Files Changed (M3-relevant)

### New
- `moss/apps/api/src/moss/moss.module.ts`
- `moss/apps/api/src/moss/catalogue/*`
- `moss/apps/api/src/moss/assessments/*` (+ DTOs)
- `moss/apps/api/src/moss/sites/*` (+ DTOs)
- `moss/apps/api/src/moss/progress/moss-progress.service.ts`
- `moss/apps/api/prisma/m3-smoke.js`
- `moss/apps/api/src/moss/moss-api.spec.ts` (expanded)
- `docs/MOSS_M3_IMPLEMENTATION_REPORT.md`

### Updated
- `moss/apps/api/src/app.module.ts` — registers `MossModule`
- `moss/apps/api/src/assessments/assessments.service.ts` — SCLI product guard on list + `checkAccess`; explicit `productCode` on SCLI create
- `moss/apps/api/src/organisations/*` — sites list/create delegate to `MossSitesService` with org access + audit
- `moss/apps/api/package.json` — `prisma:m3-smoke`
- `moss/apps/api/Dockerfile` — copy `tsconfig.base.json` into runner (vitest)
- `moss/apps/api/src/moss/moss-m1-foundation.spec.ts` — removed obsolete “zero MOSS sessions globally” assertion

### Removed (flat duplicates)
- `moss/apps/api/src/moss/moss-catalogue.*.ts`
- `moss/apps/api/src/moss/moss-assessments.*.ts`

---

## 4. API Module Structure

```
moss/apps/api/src/moss/
  moss.module.ts
  catalogue/
    moss-catalogue.controller.ts
    moss-catalogue.service.ts
  assessments/
    moss-assessments.controller.ts
    moss-assessments.service.ts
    dto/
  sites/
    moss-sites.controller.ts
    moss-sites.service.ts
    dto/
  progress/
    moss-progress.service.ts
```

MOSS logic is **not** inside `AssessmentsService.evaluate()`.

---

## 5. Endpoints Implemented

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/moss/catalogue` | Published summary (`domainCount` / `controlCount`) |
| GET | `/api/moss/catalogue/domains` | Ordered domains |
| GET | `/api/moss/catalogue/domains/:domainCode` | Domain + ordered controls |
| GET | `/api/moss/catalogue/controls/:controlCode` | Full methodology metadata only |
| GET | `/api/moss/dashboard` | Convenience summary |
| GET | `/api/moss/assessments` | MOSS-only list + completion progress |
| POST | `/api/moss/assessments` | Create DRAFT session |
| GET | `/api/moss/assessments/:id` | Workspace (assessment + domain progress) |
| PATCH | `/api/moss/assessments/:id` | Safe metadata only (`title`, `siteId`) |
| GET | `/api/moss/assessments/:id/domains/:domainCode` | Domain workspace |
| GET | `/api/moss/assessments/:id/controls/:controlCode` | Methodology + assessment (lazy read) |
| PATCH | `/api/moss/assessments/:id/controls/:controlCode` | Upsert score/text/status |
| GET/POST | `/api/organisations/:id/sites` | Site list/create |
| GET/PATCH | `/api/sites/:id` | Site get/update |

Auth: JWT + `RolesGuard` on all MOSS routes (same policy as other authenticated app APIs).

---

## 6. MOSS Assessment Creation Behaviour

- Requires existing organisation + caller access.
- Optional `siteId` must belong to organisation.
- Binds to latest **PUBLISHED** catalogue **3.0** via `mossCatalogueVersionId`.
- Sets `productCode = MOSS`, `status = DRAFT`, `createdById` = authenticated user.
- Reference format: **`MOSS-YYYY-000001`** (product-scoped sequence, unique constraint).
- Schema still requires `questionnaireVersionId`: creates/uses empty shell questionnaire `code=MOSS` / version `3.0` for FK only — **not** SCLI content and **not** used for MOSS control methodology.

---

## 7. Product Isolation

| Surface | Guard |
|---------|--------|
| `GET /api/moss/assessments*` | `productCode = MOSS` only; SCLI IDs → 404 |
| `GET /api/assessments*` (legacy) | `productCode = SCLI_COST_LEAKAGE` on list + `checkAccess` |
| Org assessment embeds | Already filtered to SCLI |
| SCLI create | Explicitly sets `productCode = SCLI_COST_LEAKAGE` |

---

## 8. Catalogue Version Binding

Control upsert resolves `MossControl` by `(assessment.mossCatalogueVersionId, controlCode)`.  
A control from another catalogue version cannot be stored against a 3.0-bound assessment.

Catalogue rebinding via PATCH is **not** allowed.

---

## 9. Control Persistence

**Design: LAZY creation**

- GET never inserts `MossControlAssessment`.
- PATCH upserts when score / rationale / comment / finding / status is saved.
- Scores: integers **0–4** only; `score = assessorScore` for M3 (isolated for future suggested/final).
- Status defaults: no data → `NOT_STARTED`; text without score → `IN_PROGRESS`; score → `SCORED`.
- Unique `(assessmentId, mossControlId)`.

---

## 10. Progress Calculation

`MossProgressService.forAssessment()` returns completion only:

```
overall: { assessed, total, percent }
domains: [{ domainCode, assessed, total, percent, ... }]
```

No domain maturity. No overall MOSS score.

---

## 11. Site APIs

Implemented under `/api/organisations/:id/sites` and `/api/sites/:id`.  
Site remains **optional** on MOSS assessments.  
Default status `ACTIVE`; unique `(organisationId, siteCode)`.

---

## 12. Audit Behaviour

Reuses existing `AuditService` / `AuditEvent`:

| Action | When |
|--------|------|
| `MOSS_ASSESSMENT_CREATED` | Assessment create |
| `MOSS_CONTROL_UPDATED` | Control PATCH |
| `MOSS_SITE_CREATED` | Site create |

Repository audit surfaces untouched.

---

## 13. Tests Added

`moss-api.spec.ts` covers:

- Catalogue 14×100, D01/D14/GOV-01, invalid control
- MOSS create + reference + catalogue bind
- MOSS list excludes SCLI; SCLI filter excludes MOSS
- Lazy GET (no row created)
- Scores 0–4; reject -1 / 5 / 1.5
- Rationale / comment / finding
- Progress ≥2 after second control; maturity placeholders
- SCLI id rejected on MOSS get

---

## 14. SCLI Regression Results

| Check | Result |
|-------|--------|
| `pnpm test` in moss-api (45 tests) | **PASS** |
| `scoring.ts` / `leakage.ts` / `opportunity.ts` | **Not modified** |
| Product isolation filters | **Present** |
| Public `/api/public/start` | Available (health stack up) |

Vitest in container previously needed `tsconfig.base.json` in the runner image — Dockerfile updated accordingly.

---

## 15. Local API Smoke Results

| Check | Result |
|-------|--------|
| `GET http://localhost:4001/api/health` | **200** `{"status":"ok"}` |
| Nest route map | All M3 MOSS routes registered |
| `node prisma/m3-smoke.js` | **M3 SMOKE PASS** |
| Catalogue | 14/100 |
| Assessment ref | e.g. `MOSS-2026-000002` |
| Progress after one score | **1/100 (1%)** |
| SCLI/MOSS isolation | **OK** |
| Cleanup | Smoke deletes its own rows |

---

## 16. Known Issues

- Assessment list progress currently computes per-row (acceptable for early volumes; batch later if needed).
- Historical SCLI create still uses a `MOSS-YYYY-…` reference prefix (pre-existing product naming). New MOSS refs use zero-padded numeric sequences scoped by `productCode=MOSS`; DB uniqueness prevents collisions.
- Pre-existing local M5 UI files may exist from an earlier combined increment; **this M3 task did not implement or extend M5**.

---

## 17. Deferred Items

| Item | Status |
|------|--------|
| `POST .../submit` | **DEFERRED** — required-control policy unconfirmed |
| `POST .../evaluate` | **DEFERRED to M4** |
| Domain / overall aggregation | **M4 — blocked** |
| Financial / leakage execution from MOSS | **Deferred** |
| Recommendation automation | **M6** |
| MOSS PDF/reports | **Deferred** |
| SOMOD | **Out of scope** |

---

## 18. M4 Status

**M4 AGGREGATION SCORING: BLOCKED / PENDING CLIENT METHODOLOGY**

Do not invent domain or overall maturity formulas.

---

## 19. M5 Readiness

**M5 UI: READY**

Backend contracts needed for a workspace UI are in place:

- catalogue browse
- assessment create/list/get
- domain workspace
- control get/patch
- completion progress
- optional sites

M5 implementation itself is **out of scope for this stop**.

---

## 20. Repository Lock Confirmation

| Check | Result |
|-------|--------|
| Repository changed files | **0** (no `repository/` tree modified) |
| SCLI methodology changed | **No** |
| `scoring.ts` / `leakage.ts` / `opportunity.ts` | **No** |
| Catalogue v3.0 | **14 / 100** |
| MOSS API `productCode` | **MOSS only** |
| Legacy SCLI APIs expose MOSS | **No** |
| Domain/overall MOSS scoring invented | **No** |

---

## Final verdict

```
M3 COMPLETE
M5 READY
M4 BLOCKED / PENDING CLIENT METHODOLOGY
```
