# SCL / MOSS Navigation Separation Report

**Date:** 2026-08-09  
**Scope:** Local development / local staging only (`http://moss-staging.localhost`)  
**Production:** NOT DEPLOYED (`https://moss.physicalrisk.com` untouched)

---

## Summary

SCL (Cost Leakage) and MOSS are separated in the sidebar and use product-specific assessment reference prefixes.

| Product | DB `productCode` | User-facing name | Reference prefix |
|---------|------------------|------------------|------------------|
| Cost Leakage | `SCLI_COST_LEAKAGE` (unchanged) | SCL | `SCL-YYYY-######` |
| MOSS | `MOSS` | MOSS | `MOSS-YYYY-######` |

---

## Sidebar change

Under **DIAGNOSTICS**:

- **SCL** — Dashboard (`/dashboard`), New Assessment (`/start`), Assessments (`/assessments`), plus Organisations / Review Queue / Reports
- **MOSS** — Dashboard (`/moss`), New Assessment (`/moss/assessments/new`), Assessments (`/moss/assessments`), Catalogue (admin)

No mixed “Assessments” menu. Routes unchanged.

Brand subtitle uses **SCL** or **MOSS** from pathname via `activeDiagnosticProduct()`.

---

## SCL routes (unchanged URLs)

| Action | Route | Label |
|--------|-------|-------|
| Dashboard | `/dashboard` | SCL Dashboard |
| New | `/start` | New Assessment |
| List | `/assessments` | SCL Assessments |
| Create form | `/assessments/new` | New SCL Assessment |

## MOSS routes (unchanged URLs)

| Action | Route | Label |
|--------|-------|-------|
| Dashboard | `/moss` | MOSS Dashboard |
| New | `/moss/assessments/new` | New MOSS Assessment |
| List | `/moss/assessments` | MOSS Assessments |

---

## Reference generation

Shared helper: `moss/apps/api/src/common/assessment-reference.ts`

- `assessmentReferencePrefix(productCode)` → `SCL` | `MOSS`
- `generateAssessmentReference(tx, productCode)` → race-safe sequential `{PREFIX}-{YEAR}-{000001}`
- Separate sequences per `productCode`
- Unique `reference` constraint preserved; clash retries + timestamp fallback

Wired into:

- SCL create: `assessments.service.ts` (`productCode = SCLI_COST_LEAKAGE`)
- MOSS create: `moss-assessments.service.ts` (`productCode = MOSS`)

---

## Historical-reference audit

### Staging (`moss_staging`) — before repair

| productCode | prefix | count |
|-------------|--------|------:|
| SCLI_COST_LEAKAGE | SCLI- | 3 |
| MOSS | MOSS- | 5 |

Incorrect SCL prefixes were from recent local/staging generators (`MOSS-` then `SCLI-`).

### After local/staging repair only

| productCode | prefix | count | examples |
|-------------|--------|------:|----------|
| SCLI_COST_LEAKAGE | SCL- | 3 | SCL-2026-SPMV0K, SCL-2026-DKMLEQ, SCL-2026-6UAG42 |
| MOSS | MOSS- | 5 | MOSS-2026-000001 … 000005 |

### Local moss DB

| productCode | prefix | count |
|-------------|--------|------:|
| SCLI_COST_LEAKAGE | SCL- | 2 |
| MOSS | MOSS- | 2 |

**Production:** not touched. Repair scripts for later approval:

- `moss/apps/api/prisma/repair_scl_assessment_references.sql`
- `moss/apps/api/prisma/repair-scl-references.js`

---

## Labels

- `/assessments` → **SCL Assessments**
- `/moss/assessments` → **MOSS Assessments**
- SCL detail eyebrow → **SCL Assessment · {reference}**
- Create SCL → **New SCL Assessment**
- Create MOSS → **New MOSS Assessment**

---

## Isolation

- `GET` SCL list filters `productCode = SCLI_COST_LEAKAGE`
- `GET` MOSS list filters `productCode = MOSS`
- Dashboards use each product’s list endpoint
- CRM/report guards unchanged (SCL-only for SCLI reports)

---

## Tests

| Test | Result |
|------|--------|
| Nav: separate SCL / MOSS under DIAGNOSTICS | PASS |
| Prefix map: SCLI_COST_LEAKAGE → SCL, MOSS → MOSS | PASS |
| Create SCL → `SCL-YYYY-######` | PASS (staging API) |
| Create MOSS → `MOSS-YYYY-######` | PASS (staging API) |
| No prefix collision across products | PASS |
| List isolation by productCode | PASS (after productCode on MOSS list DTO) |

Files:

- `moss/apps/web/lib/navigation.test.ts`
- `moss/apps/api/src/common/assessment-reference.spec.ts`
- `moss/apps/api/src/assessments/scl-moss-isolation.spec.ts`

---

## Local staging verification

- Staging API + web rebuilt and restarted
- Existing incorrect SCL refs repaired to `SCL-`
- New creates use `SCL-` / `MOSS-` sequences

---

## Live-site safety

| Check | Value |
|-------|------:|
| SSH commands | 0 |
| VPS changes | 0 |
| Live DB changes | 0 |
| Production migrations | 0 |
| Production Keycloak changes | 0 |
| Production nginx changes | 0 |
| moss.physicalrisk.com changes | 0 |
| Repository (`repo/`) changes | 0 |

---

## Final result

```
SIDEBAR SCL/MOSS SEPARATION: PASS
NEW SCL REFERENCE: SCL-YYYY-XXXXXX
NEW MOSS REFERENCE: MOSS-YYYY-XXXXXX
SCL/MOSS PRODUCT ISOLATION: PASS
LOCAL STAGING: PASS
LIVE SITE CHANGES: 0
REPOSITORY CHANGES: 0
```

**STOP. DO NOT DEPLOY PRODUCTION.**
