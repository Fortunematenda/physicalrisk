# MOSS M1 Implementation Report — Data Foundation

**Status:** **M1 COMPLETE**  
**M2 readiness:** **M2 READY** (authoritative catalogue validated; import/seed not started)  
**Date:** 2026-08-09  
**Scope:** Diagnostic platform DB / Prisma only — schema, additive migration, tests, docs.

---

## 1. Summary

M1 delivered the database foundation for true MOSS 100-control assessments:

- `ProductCode` discriminator on `AssessmentSession` (`SCLI_COST_LEAKAGE` | `MOSS`)
- Shared `Site` model in the **diagnostic** database (not Repository)
- Empty MOSS catalogue structures: `MossCatalogueVersion`, `MossDomain`, `MossControl`
- `MossControlAssessment` + `MossScoreSnapshot` (separate from SCLI `ScoreSnapshot`)
- Additive nullable links from `EvidenceDocument` / `Finding` to MOSS control assessments
- Safe additive SQL migration with productCode backfill default
- Score CHECK constraints (0–4) at Postgres level
- **No catalogue seed** (14 domains / 100 controls remain for **M2**)
- **No MOSS UI / API controllers / aggregation / financial engines / SOMOD**

Local moss DB verification (post-apply):

| Check | Result |
|-------|--------|
| AssessmentSession productCode | **2 / 2 → `SCLI_COST_LEAKAGE`** |
| MossDomain / MossControl counts | **0 / 0** (not seeded) |
| SCLI Question count | **20** unchanged |
| SCLI ScoreSnapshot count | **2** unchanged |
| Score range CHECKs | Present |
| SQL validation suite | **PASS** |

---

## 2. Files changed

| Path | Change |
|------|--------|
| `moss/apps/api/prisma/schema.prisma` | Enums + Site + MOSS models; AssessmentSession / Evidence / Finding / Organisation / User relations |
| `moss/apps/api/prisma/migrations/migration_lock.toml` | Prisma Migrate lock (postgresql) |
| `moss/apps/api/prisma/migrations/20260809180000_moss_m1_data_foundation/migration.sql` | Additive M1 DDL + CHECKs |
| `moss/apps/api/prisma/migrations/README.md` | Migrate adoption notes |
| `moss/apps/api/prisma/m1-preflight.ts` | Pre-migration row-count / safety script |
| `moss/apps/api/prisma/m1-validate.sql` | Post-migration SQL validation suite |
| `moss/apps/api/package.json` | `prisma:migrate` → `migrate deploy` (removed `--accept-data-loss`); added status/dev/db-push/preflight scripts |
| `moss/apps/api/Dockerfile` | Migrate-first startup; non-destructive `db push` bootstrap fallback for empty/legacy DBs |
| `moss/apps/api/src/assessments/assessments.service.ts` | Comment only: document deferred `productCode` filter for SCLI list (M3/M8) |
| `moss/apps/api/src/moss/moss-m1-foundation.spec.ts` | M1 foundation tests (DB suite when `DATABASE_URL` set) |
| `docs/MOSS_M1_IMPLEMENTATION_REPORT.md` | This report |

**Not changed:** Repository / Repository Gateway; SCLI `scoring.ts` / `leakage.ts` / `opportunity.ts`; seed catalogue JSON; MOSS UI/API.

---

## 3. Prisma models added

| Model | Purpose |
|-------|---------|
| `Site` | Org-scoped site master (`organisationId` + `siteCode` unique) |
| `MossCatalogueVersion` | Versioned catalogue shell (`DRAFT` / `PUBLISHED` / `ARCHIVED`) |
| `MossDomain` | Domain rows per catalogue version (`D01`…`D14` later) |
| `MossControl` | Control rows + methodology/financial **metadata** (JSON/text, nullable) |
| `MossControlAssessment` | Per-assessment control scores (0–4), status, rationale |
| `MossScoreSnapshot` | MOSS-only snapshot; **no** leakage/opportunity/riskBand |

**Enums added:** `ProductCode`, `SiteStatus`, `MossCatalogueStatus`, `MossControlAssessmentStatus`.

---

## 4. Existing models modified

| Model | Additive fields / relations |
|-------|-----------------------------|
| `AssessmentSession` | `productCode` (default `SCLI_COST_LEAKAGE`), `siteId?`, `mossCatalogueVersionId?` + indexes |
| `Organisation` | `sites Site[]` |
| `User` | `mossControlAssessments` (assessor relation) |
| `EvidenceDocument` | `mossControlAssessmentId?` |
| `Finding` | `productCode?`, `mossControlAssessmentId?` |

No SCLI columns removed or renamed. `ScoreSnapshot` (SCLI) untouched.

---

## 5. Migration created

`moss/apps/api/prisma/migrations/20260809180000_moss_m1_data_foundation/migration.sql`

Contents (additive only):

- Create enums
- Create `Site`, MOSS catalogue/control/assessment/snapshot tables
- `ALTER AssessmentSession` add `productCode` / `siteId` / `mossCatalogueVersionId`
- `ALTER EvidenceDocument` / `Finding` add nullable MOSS FKs
- Indexes + FKs
- CHECK: `score` / `assessorScore` null or 0–4

**Forbidden tooling not used:** `prisma db push --accept-data-loss`.

Package script now: `prisma migrate deploy`.

---

## 6. Migration safety checks

Pre-apply local moss DB:

| Metric | Count |
|--------|------:|
| Organisations | 2 |
| AssessmentSession | 2 |
| ScoreSnapshot (SCLI) | 2 |
| Question | 20 |
| `productCode` column | absent |
| Moss* / Site tables | absent |
| `_prisma_migrations` | absent |

Apply method: pipe additive `migration.sql` into `moss-db` with `ON_ERROR_STOP=1` (no drops).

Post-apply: recorded in `_prisma_migrations` as `20260809180000_moss_m1_data_foundation`.

---

## 7. ProductCode backfill result

| Item | Result |
|------|--------|
| Column default | `SCLI_COST_LEAKAGE` |
| Existing rows after migrate | **2 / 2 = `SCLI_COST_LEAKAGE`** |
| MOSS sessions created | **0** |

New SCLI creates inherit the Prisma/DB default without requiring create-path changes.

---

## 8. SCLI regression results

| Suite | Result |
|-------|--------|
| Existing Vitest (`roles`, `workflow`, `espocrm`, `mvp-contracts`) | **PASS** (29 passed) |
| M1 contract tests without DB | **PASS** |
| M1 DB-backed Vitest | Skipped when host `DATABASE_URL` unset (Docker hostname `moss-db` not reachable from host) |
| `m1-validate.sql` against live moss-db | **PASS** (backfill, no seed, uniqueness, score CHECK, null overallScore, SCLI Q20 intact) |

SCLI engines (`scoring` / `leakage` / `opportunity`) were **not modified**.

---

## 9. Tests added

- `moss/apps/api/src/moss/moss-m1-foundation.spec.ts` — foundation behaviour when `DATABASE_URL` is set
- `moss/apps/api/prisma/m1-validate.sql` — executable SQL validation (used successfully on local moss-db)
- `moss/apps/api/prisma/m1-preflight.ts` — pre-migrate inspection helper

---

## 10. Deferred M1 fields / behaviours

| Item | Status |
|------|--------|
| `suggestedScore` / `finalScore` / `scoreTrace` | **Deferred** (M0 T6) — additive later |
| Catalogue import of v3.0 (14×100) | **M2** |
| Domain/overall aggregation formulas | **M4** (client formulas) |
| Site mandatory on MOSS assessments | **Product decision** — DB remains nullable |
| SCLI list/get `productCode = SCLI_COST_LEAKAGE` filter | **Documented**; implement in **M3/M8** before MOSS sessions exist in production traffic |
| Invented `formulaReference` values | **Not done** — column nullable; M2 maps `leakage_quantification.formula` |
| SOMOD | **Not implemented** (not on ProductCode enum) |

---

## 11. Risks discovered

1. **Legacy migrate tooling:** Project previously used `prisma db push --accept-data-loss`. M1 switches to Migrate; greenfield/empty DBs may need the Dockerfile bootstrap path (`db push` **without** accept-data-loss + `migrate resolve`) once.
2. **SCLI list filter not yet applied:** Until M3/M8, if MOSS sessions are created early they could appear on legacy `/assessments` lists. Safe today because no MOSS create API exists yet.
3. **Container rebuild required:** Running `moss-api` image still has the pre-M1 Prisma client until rebuild/redeploy; DB schema is already updated locally.
4. **Host Vitest + Docker DB:** `DATABASE_URL` inside compose uses hostname `moss-db` (not published to host). Prefer `m1-validate.sql` via `docker exec` or run tests on the Docker network.

---

## 12. M2 readiness status

**M2 READY**

Prerequisites met:

- Authoritative file: `moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json`
- Validated: version **3.0**, **14** domains, **100** controls, **100/100** unique IDs, **0** orphans
- Empty schema ready for non-destructive import into a **DRAFT** `MossCatalogueVersion` (`3.0`)
- Financial metadata columns/JSON present; no calculation engine

**Do not start M2 until explicitly approved.**

---

## 13. Repository lock confirmation

| Area | Touched? |
|------|----------|
| Repository application code | **No** |
| Repository APIs / schema / migrations | **No** |
| Repository Gateway / SOP / routing / document workflow | **No** |
| Repository configuration | **No** |

Site + MOSS catalogue live only in the **diagnostic (moss) Postgres**.

---

## Gate statements

```text
M1 COMPLETE
M2 READY
```

**STOP — waiting for approval before M2 catalogue import/seed.**
