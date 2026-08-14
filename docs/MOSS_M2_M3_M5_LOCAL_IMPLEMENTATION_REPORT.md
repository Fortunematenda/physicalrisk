# MOSS M2 + M3 + M5 Local Implementation Report

**Status:** COMPLETE (local only)  
**Date:** 2026-08-09  
**Production deploy:** NOT performed  

---

## 1. Executive Summary

Local MVP increment delivered:

- **M2** Master Catalogue import (v3.0 published, 14×100)
- **M3** MOSS catalogue + assessment APIs (product-scoped)
- **M5** Basic MOSS UI under `/moss`

SCLI Cost Leakage routes and engines were preserved. Repository untouched. Domain/overall maturity aggregation **not** implemented.

---

## 2. Catalogue Import Result

| Metric | Result |
|--------|--------|
| Version | **3.0** |
| Status | **PUBLISHED** |
| Domains | **14** |
| Controls | **100** |
| Unique IDs | **100/100** |
| Orphans | **0** |

Importer: `moss/apps/api/prisma/import-moss-catalogue.ts`  
Packaged data: `moss/apps/api/prisma/data/moss-master-catalogue-v3.json`  
Source of truth: `moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json`

Idempotent: re-run returns `skipped_already_published`.

---

## 3. Files Changed (high level)

### API
- `src/moss/*` — module, catalogue + assessments services/controllers, tests
- `src/app.module.ts` — register `MossModule`
- `src/assessments/assessments.service.ts` — SCLI list filters `productCode = SCLI_COST_LEAKAGE`
- `src/organisations/*` — site list/create endpoints
- `prisma/import-moss-catalogue.ts`, `prisma/data/moss-master-catalogue-v3.json`, seed hook

### Web
- `app/moss/**` — dashboard, assessments list/new/workspace
- `lib/navigation.ts` — Products switcher (Cost Leakage / MOSS)

### Docs
- `docs/MOSS_M2_M3_M5_LOCAL_IMPLEMENTATION_REPORT.md` (this file)

**Repository changed files:** 0  

---

## 4. Database Changes

No new migration in this increment (M1 foundation already present).

Runtime data:
- Published `MossCatalogueVersion` 3.0 + 14 domains + 100 controls
- Optional MOSS shell `Questionnaire` code `MOSS` / version `3.0` created on first MOSS assessment (FK only; no Q1–Q20 content)

---

## 5. Catalogue Importer

- Validates version, 14 domains, 100 controls, unique IDs, no orphans, no duplicate domain IDs
- Imports as DRAFT then publishes after success
- Preserves methodology JSON; `formulaReference` only from `leakage_quantification.formula`
- Does not call SCLI leakage/scoring

---

## 6. MOSS API Endpoints Added

| Method | Path |
|--------|------|
| GET | `/api/moss/catalogue` |
| GET | `/api/moss/catalogue/domains` |
| GET | `/api/moss/catalogue/domains/:domainCode` |
| GET | `/api/moss/catalogue/controls/:controlCode` |
| GET | `/api/moss/dashboard` |
| GET | `/api/moss/assessments` |
| POST | `/api/moss/assessments` |
| GET | `/api/moss/assessments/:id` |
| GET | `/api/moss/assessments/:id/controls/:controlCode` |
| PATCH | `/api/moss/assessments/:id/controls/:controlCode` |
| GET | `/api/organisations/:id/sites` |
| POST | `/api/organisations/:id/sites` |

**Control assessment strategy:** **LAZY** — `MossControlAssessment` created on first open/save.

---

## 7. Frontend Routes Added

| Route | Purpose |
|-------|---------|
| `/moss` | Dashboard |
| `/moss/assessments` | List |
| `/moss/assessments/new` | Create |
| `/moss/assessments/[id]` | Workspace |

Unchanged SCLI: `/start`, `/dashboard`, `/assessments`.

---

## 8. MOSS Workspace Behaviour

- 14-domain left nav with completion counts
- Control list + full methodology detail
- Financial Mapping collapsed as **Methodology Metadata** (no calculation)
- Progress = scored controls / 100 (completion only)
- Save on score change; debounced text autosave

---

## 9. Scoring Behaviour

| Capability | Status |
|------------|--------|
| Control 0–4 capture | **Implemented** |
| Labels 0–4 Non-existent…Optimised | **Implemented** |
| Domain aggregation | **NOT implemented** (`PENDING CONFIGURATION`) |
| Overall aggregation | **NOT implemented** (`PENDING CONFIGURATION`) |
| SCLI leakage/opportunity | **NOT used** |

---

## 10. SCLI Regression Results

Host Vitest: **30 passed** (SCLI unit/contracts + MOSS contract tests; DB cases skipped without host DB URL).

Legacy `/api/assessments` now filters `productCode = SCLI_COST_LEAKAGE`.

---

## 11. Local Test Results

| Check | Result |
|-------|--------|
| `GET /api/health` | OK |
| Catalogue DB 14×100 | OK |
| Nest maps MOSS routes | OK |
| `http://moss.localhost/moss` | HTTP 200 |
| moss-api / moss-web rebuilt & restarted | OK |

---

## 12. Local URLs

- MOSS Dashboard: http://moss.localhost/moss  
- MOSS Assessments: http://moss.localhost/moss/assessments  
- New MOSS Assessment: http://moss.localhost/moss/assessments/new  
- Cost Leakage: http://moss.localhost/dashboard  
- API health: http://localhost:4001/api/health  

---

## 13. Known Issues

- Contact-submission scheduler error may still appear in logs (pre-existing; unrelated to MOSS).
- Host Vitest cannot reach Docker hostname `moss-db` without network bridge; use container smoke / SQL validation for DB cases.
- First MOSS assessment creates empty MOSS questionnaire shell for FK compatibility.

---

## 14. Deferred Items

- M4 domain/overall aggregation formulas
- M6 findings/recommendations automation
- MOSS financial calculation engines
- MOSS PDF
- SOMOD
- Production deployment

---

## 15. M4 Readiness

**M4 READY TO START after client aggregation formulas are confirmed.**  
Score capture and completion progress are in place; do not invent averages.

---

## 16. Repository Lock Confirmation

Repository / Repository Gateway: **unchanged**.

---

## Gate

```text
M2 COMPLETE
M3 COMPLETE
M5 BASIC UI COMPLETE (local)
STOP — awaiting approval before M4 / production
```
