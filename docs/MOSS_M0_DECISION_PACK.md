# MOSS M0 Decision Pack

**Status:** Decision / confirmation pack only — **no implementation**.  
**Architecture baseline:** `docs/MOSS_100_CONTROL_IMPLEMENTATION_PLAN.md` (approved, with contract-wording correction).  
**Platform baseline:** `docs/PHYSICAL_RISK_CURRENT_STATE_AUDIT.md`.  
**Date:** 2026-08-09

---

## 1. Executive summary

M0 prepares decisions before **M1 Data Foundation**.

| Track | Status |
|-------|--------|
| Repository | LOCKED — no work |
| Cost Leakage / SCLI v1.1 | LIVE — preserve; immutable published methodology |
| MOSS 100-control | Next product track — architecture approved |
| SOMOD | Future — not in M0/M1 |

### Source of truth

> **MOSS Master Catalogue v3.0 source of truth:**  
> `moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json`

**Previous finding corrected:** The earlier finding that *no MOSS Master Catalogue file is in the repo* is superseded. The authoritative catalogue has been located and moved to the path above (JSON contents unchanged).

| Record | Value |
|--------|--------|
| Catalogue version | **3.0** |
| Domains | **14** |
| Controls | **100** |
| Unique IDs | **100/100** |
| Orphans | **0** |
| Title | Physical Risk MOSS 100-Control Master Catalogue |

Also present for Cost Leakage (unchanged):

- `moss/docs/source/20260626 Executive_Security_Cost_Leakage_Assessment_SCLI_v1_1.xlsx`

### M0 gate status

| Gate | Status |
|------|--------|
| **M1 Data Foundation** | **GO** |
| **M2 Catalogue Import** | **GO / READY FOR IMPLEMENTATION** (authoritative catalogue available and validated) |
| **M4 Aggregation Scoring** | **BLOCKED PENDING CLIENT AGGREGATION FORMULAS** |

Companion client letter: `docs/MOSS_CLIENT_CONFIRMATIONS.md` (aggregation / Site / automation questions remain; catalogue file question removed as resolved).

---

## 2. Decisions already confirmed by source material

These are established by the approved architecture plan, product-separation audit, and methodology statements already given in project briefs (not invented here).

| # | Decision | Source |
|---|----------|--------|
| C1 | Repository is complete and locked | Approved audits / plan |
| C2 | Cost Leakage / SCLI is the live diagnostic; preserve; do not mutate published SCLI 1.1 | Approved plan |
| C3 | MOSS is a separate 14-domain / 100-control product | Approved plan + briefs |
| C4 | SOMOD is separate and not implemented now; not forced onto `AssessmentSession` | Approved plan |
| C5 | Maturity score semantics: **0 Non-existent, 1 Ad hoc, 2 Basic, 3 Effective, 4 Optimised** | Project MOSS methodology statements |
| C6 | SCLI `scoring.ts` / `leakage.ts` / `opportunity.ts` must not be used as MOSS engines | Approved plan |
| C7 | `AssessmentSession.productCode` actively used for **`SCLI_COST_LEAKAGE`** and **`MOSS`** | Approved plan |
| C8 | Site lives in diagnostic platform DB, not Repository | Approved plan |
| C9 | MOSS financial **calculations** disabled until formulas confirmed; metadata to be preserved | Approved plan |
| C10 | Contract vs product tracking: technical “substantially implemented via SCLI” ≠ commercial acceptance | Wording correction / plan §1A |
| C11 | Legacy URLs `/start`, `/assessments`, `/dashboard` remain Cost Leakage | Approved plan |
| C12 | New MOSS routes under `/moss/*` | Approved plan |
| C13 | Master Catalogue file path + version **3.0**, 14×100 validated | `moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json` |

**Still client-owned:** domain/overall aggregation, Site mandatory enforcement, auto findings/recs, financial engine enablement (see §3).

---

## 3. Decisions requiring client confirmation

See also short letter `docs/MOSS_CLIENT_CONFIRMATIONS.md`.

| # | Topic | Why client |
|---|-------|------------|
| Q1 | Domain aggregation formula | Blocks M4 overall/domain compute |
| Q2 | Overall MOSS aggregation formula / weights | Blocks M4 |
| Q3 | Critical-control overrides (if any) | Blocks M4/results semantics |
| Q4 | Score → finding severity mapping (if automated) | Blocks auto-findings |
| Q5 | Whether Site is **mandatory** on every MOSS assessment | Product rule |
| Q6 | Auto recommendation rules vs assessor-curated templates | Blocks M6 automation |
| Q7 | Suggested-score rules (threshold/evidence/inspection) if any for v1 | Affects M3+ UX |
| Q8 | Confirm financial engines remain off for MOSS v1 | Scope control |

*(Catalogue file delivery / identification is resolved — see §1 source of truth.)*

---

## 4. Internal technical decisions

Bretune can decide without client (within approved architecture):

| # | Decision | Recommendation |
|---|----------|----------------|
| T1 | Discriminator column | `AssessmentSession.productCode` enum values **`SCLI_COST_LEAKAGE`**, **`MOSS`** |
| T2 | SOMOD in enum | Optional unused label only; **no** AssessmentSession behaviour |
| T3 | Catalogue storage | Dedicated `MossCatalogueVersion` / `MossDomain` / `MossControl` (hybrid B) |
| T4 | Control responses | `MossControlAssessment` (not overload SCLI `AssessmentResponse`) |
| T5 | Score snapshots | Separate `MossScoreSnapshot` |
| T6 | M1 score fields | `score`, `assessorScore`, `scoreRationale`, `comment`, `status` — defer `suggestedScore`, `finalScore`, `scoreTrace` JSON to later migration |
| T7 | Reference format | `MOSS-YYYY-#####` via sequence counter (separate from SCLI refs) |
| T8 | API prefix | `/api/moss/...` |
| T9 | FE routes | `/moss/...`; keep SCLI legacy paths |
| T10 | Ticket labelling | `MOSS-PRODUCT` (not silent “Phase 3 defect”) |
| T11 | Migrations | Prisma migrations for diagnostic DB only |
| T12 | Effective score in M1 | `score` mirrors assessor entry; document future effectiveScorePolicy |

---

## 5. Authoritative 14 domains

From `moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json`:

| # | domain_id | domain_name | Controls |
|---|-----------|-------------|----------:|
| 1 | D01 | Governance, Mandate & Accountability | 7 |
| 2 | D02 | Risk, Threat & Intelligence Management | 7 |
| 3 | D03 | Security Policy, Standards & SOP Control | 7 |
| 4 | D04 | Deployment & Guarding Operations | 10 |
| 5 | D05 | Access Control & Identity Management | 8 |
| 6 | D06 | Perimeter & Physical Protection | 6 |
| 7 | D07 | Surveillance, Detection & Monitoring Systems | 7 |
| 8 | D08 | Control Room & Alarm Management | 6 |
| 9 | D09 | Incident Management & Investigations | 8 |
| 10 | D10 | Asset Protection & Loss Control | 6 |
| 11 | D11 | Contractor & Vendor Management | 7 |
| 12 | D12 | Competence, Training & Personnel Integrity | 6 |
| 13 | D13 | Emergency Preparedness & Business Continuity | 5 |
| 14 | D14 | Assurance, Audit & Continuous Improvement | 10 |
| | | **Total** | **100** |

---

## 6. 100-control validation summary

| Check | Result |
|-------|--------|
| Exactly 100 controls | **PASS** |
| Unique control IDs | **PASS** (100 / 100) |
| Every control belongs to exactly one domain | **PASS** |
| No duplicate IDs | **PASS** |
| No orphan controls | **PASS** |
| Example IDs | `GOV-01` and peers present |
| Empty control_id | **0** |

---

## 7. Scoring rules — confirmed vs unconfirmed

### Confirmed

| Item | Value |
|------|-------|
| Scale | 0–4 |
| 0 | Non-existent |
| 1 | Ad hoc |
| 2 | Basic |
| 3 | Effective |
| 4 | Optimised |
| Engine location | New `moss-scoring.ts` (not SCLI `scoring.ts`) |

### Unconfirmed (client)

| Item | Status |
|------|--------|
| Domain aggregation | UNCONFIRMED |
| Overall aggregation | UNCONFIRMED |
| Domain/control weights | UNCONFIRMED |
| Critical-control overrides | UNCONFIRMED |
| Severity mapping from score | UNCONFIRMED |
| Auto suggested-score rules | UNCONFIRMED |

**M1 impact:** None — store per-control scores only.  
**M4 impact:** Blocked until aggregation confirmed (or overall left null with config pending).

---

## 8. Findings rules — confirmed vs unconfirmed

### Expected from catalogue (when file arrives) — to be validated as PRESENT/PARTIAL/ABSENT

| Catalogue concept | Role for findings |
|-------------------|-------------------|
| failure_conditions | Draft finding templates / triggers |
| evidence_standards | Evidence gap detection |
| thresholds / quantitative threshold | Pass/fail or guidance |
| fraud_indicators | Assessor attention flags |

### Confirmed now

- Findings should be structured and product-scoped (MOSS ≠ SCLI).  
- Do not invent auto-conclusions without rules.

### Unconfirmed

| Item | Status |
|------|--------|
| Whether findings auto-create on score ≤ N | CLIENT CONFIRMATION |
| Severity matrix | CLIENT CONFIRMATION |
| Which failure_conditions auto-fire vs display-only | CLIENT CONFIRMATION (after catalogue review) |

---

## 9. Recommendation rules — confirmed vs unconfirmed

### AVAILABLE FROM CATALOGUE (expected fields — validate on file receipt)

| Field | Use |
|-------|-----|
| technology_substitution_logic | Template / guidance text |
| manpower_optimisation_logic | Template / guidance text |
| failure_conditions | Possible trigger source |

### AUTOMATIC RECOMMENDATION RULE REQUIRES CONFIRMATION

| Item | Status |
|------|--------|
| Auto-generate recommendation when score ≤ N | UNCONFIRMED |
| Map catalogue logic blocks → recommendation records automatically | UNCONFIRMED |
| Priority / owner / due defaults | UNCONFIRMED |

**M1:** No recommendation engine required.  
**M6:** Needs confirmation + catalogue content.

---

## 10. Financial metadata validation

Validated against all **100** controls in the Master Catalogue v3.0 JSON:

| Field | Classification | Notes |
|-------|----------------|-------|
| financial_relevance | **ABSENT** | No top-level key; infer from `cost_category` / leakage block if needed later |
| event_unit | **PRESENT** | 100/100 |
| cost_category | **PRESENT** | 100/100 |
| leakage_quantification | **PRESENT** | Object with `formula`, `minimum_data_required`, `notes` |
| formula_reference | **ABSENT** as top-level | Formula lives under `leakage_quantification.formula` |
| sla_penalty_logic | **PRESENT** | 100/100 |
| incident_to_cost_conversion | **PRESENT** | 100/100 |
| technology_substitution_logic | **PRESENT** | 100/100 |
| manpower_optimisation_logic | **PRESENT** | 100/100 |
| threshold (quantitative text) | **PRESENT** | Key is `threshold` (not `quantitative_threshold`) |
| failure_conditions / evidence_standards / fraud_indicators | **PRESENT** | Arrays |
| moss_scoring_rules | **PRESENT** | Per-score 0–4 guidance objects |

**Schema (M1):** Map JSON keys as-is; store `leakage_quantification.formula` (no separate `formula_reference` required unless we add a derived column). **No executable MOSS financial engine in M1–M3.**

---

## 11. Site decision

| Question | Finding |
|----------|---------|
| Is Site explicitly mandatory in repo source docs for MOSS? | **No** explicit mandatory rule found in repository documentation |
| Architecture recommendation | Site model in diagnostic DB; recommended on MOSS assessments |
| Enforcement | **PRODUCT DECISION REQUIRED** (client) — do not assume mandatory in M1 |

**M1:** Create `Site` table; `AssessmentSession.siteId` **nullable**.  
**Later:** Enforce NOT NULL for MOSS creates only if client confirms.

---

## 12. M1 minimum data model recommendation

Avoid overbuilding while remaining forward-compatible.

### Include in M1

| Entity / field | Notes |
|----------------|-------|
| `ProductCode` | `SCLI_COST_LEAKAGE`, `MOSS` (+ optional unused `SOMOD` label) |
| `AssessmentSession.productCode` | Backfill existing → SCLI |
| `Site` | Shared diagnostic |
| `AssessmentSession.siteId` | Nullable |
| `MossCatalogueVersion` | Empty or draft shell |
| `MossDomain` | Columns ready; rows at M2 |
| `MossControl` | Including financial metadata JSON/columns (empty until M2) |
| `MossControlAssessment` | See score fields below |
| Sequence for `MOSS-YYYY-#####` | Separate from SCLI refs |

### `MossControlAssessment` — M1 fields

| Field | M1 |
|-------|-----|
| `score` (effective 0–4, nullable) | **Yes** |
| `assessorScore` (0–4, nullable) | **Yes** — write same value as `score` in M1 UI |
| `scoreRationale` | **Yes** (optional text) |
| `comment` | **Yes** |
| `status` | **Yes** |
| `suggestedScore` | **Defer** |
| `finalScore` | **Defer** |
| `scoreTrace` JSON | **Defer** (document reserved shape in plan; add column when suggestion engine exists) |

**Rationale:** M1 needs durable assessor entry + rationale without shipping unused suggestion/review columns. Deferred fields remain in the approved design so M3/M4/M6 can add them non-destructively.

### Explicitly not in M1

- Catalogue seed of 100 controls  
- `moss-scoring` aggregation execution  
- MOSS UI routes (can start in M5; optional stub later)  
- SOMOD tables  
- Repository changes  

---

## 13. Reference numbering recommendation

| Product | Format | Notes |
|---------|--------|-------|
| Cost Leakage / SCLI | Keep existing assessment `reference` scheme unchanged | Do not alter historical refs |
| MOSS | **`MOSS-YYYY-#####`** e.g. `MOSS-2026-000001` | Own `sequence_counters` name e.g. `moss_assessment` |

Collision avoidance: distinct prefix `MOSS-` vs whatever SCLI uses today (typically non-`MOSS-` references). Implement only in M3 create API — listed here as decision only.

---

## 14. Catalogue version decision

| Item | Decision |
|------|----------|
| Invent version? | **No** |
| Version from source metadata | **`3.0`** |
| Title | Physical Risk MOSS 100-Control Master Catalogue |
| Source path | `moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json` |

---

## 15. M1 GO / NO-GO checklist

### M1 Data Foundation — **GO**

May proceed **after M0 pack approval** for:

- [x] Architecture boundaries locked (Repo / SCLI / MOSS / SOMOD)  
- [x] `productCode` values for AssessmentSession (`SCLI_COST_LEAKAGE`, `MOSS`) decided  
- [x] Site in diagnostic DB decided (nullable FK)  
- [x] Moss catalogue + control assessment **empty structures** decided  
- [x] Financial metadata **columns reserved** without calculation  
- [x] M1 score field minimum decided  
- [x] Reference prefix decided (`MOSS-YYYY-#####`)  
- [x] Authoritative Master Catalogue located & validated (v3.0, 14×100) — not required for empty M1 schema; required for M2  

### Still NO-GO (do not treat as M1 blockers)

| Item | Blocks |
|------|--------|
| Domain aggregation formula | **M4** scoring compute |
| Overall aggregation / weights | **M4** |
| Site mandatory | Product rule only; schema stays nullable |
| Auto findings / recs | **M6** |
| Financial engines | Post-M7 / separate approval |

### Summary

```text
M1 DATA FOUNDATION:     GO
M2 CATALOGUE IMPORT:    GO / READY FOR IMPLEMENTATION
M4 SCORING AGGREGATION: BLOCKED PENDING CLIENT AGGREGATION FORMULAS
M5+ UI / engines:       After M2+ as sequenced in implementation plan
```

**STOP:** M0 docs and catalogue placement only. Do **not** begin M1 or M2 coding until explicitly approved.

---

## Appendix — Safety reminder

This pack does not authorise: Repository changes, SCLI changes, migrations, Prisma edits, seeding, routes, APIs, scoring implementation, or SOMOD.

---

*End of M0 Decision Pack.*
