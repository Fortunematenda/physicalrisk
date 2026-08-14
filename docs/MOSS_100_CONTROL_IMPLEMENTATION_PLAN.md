# MOSS 100-Control Implementation Plan

**Status:** Architecture / planning only — **DO NOT IMPLEMENT** until this revised plan is approved.  
**Baseline:** `docs/PHYSICAL_RISK_CURRENT_STATE_AUDIT.md` (approved).  
**Date:** 2026-08-09 (revised same day — architecture corrections)

---

## 1. Executive summary

This plan adds **true MOSS** (14 domains / 100 controls / maturity scores **0–4**) as a **separate product/methodology** inside the existing Physical Risk application framework (`moss/` host), without breaking:

- **Repository** (locked — untouched)
- **Cost Leakage / SCLI v1.1** (live — preserved)
- Future **SOMOD** (not built now — integration identifiers only; **not** forced onto `AssessmentSession`)

### Approach in one paragraph

Keep the current Next.js + Nest + Prisma app as a **multi-product diagnostic host**. Introduce an explicit **`productCode`** on `AssessmentSession` for **`SCLI_COST_LEAKAGE`** and **`MOSS` only** (a general enum may reserve `SOMOD` without committing SOMOD to that aggregate). Add MOSS catalogue tables with full financial **metadata** preserved (calculations disabled until confirmed), a shared **Site** model in the diagnostic DB, `MossControlAssessment` designed for assessor / suggested / final scores, and a **new** `@moss/shared` module `moss-scoring.ts`. Mount MOSS under `/moss/*` while leaving `/start`, `/assessments`, `/dashboard` as Cost Leakage production URLs.

### Scope discipline

Missing Master Catalogue capabilities are **MOSS product work**, not an automatic declaration that contractual Phase 3 is unpaid/unfinished. See **§1A Contract Scope vs Product Capability**.

### Non-goals (this plan’s approval cycle)

- No schema migrations yet  
- No seeding of 100 controls yet  
- No SCLI formula changes  
- No SOMOD engines or SOMOD aggregate  
- No Repository changes  
- No PDF redesign  
- No MOSS financial **calculation** engines  

---

## 1A. Contract Scope vs Product Capability

**Purpose:** Prevent development from silently expanding agreed commercial scope. This section does **not** make a commercial conclusion; it separates tracking dimensions.

### A. Contractual Phase 3 delivery status

Phase 3 (Executive Diagnostic Engine) was agreed around questionnaires, sessions, response capture, scoring, governance-oriented outputs, leakage, opportunity, and recommendations.

| Contract-oriented capability | How it relates to live SCLI / Cost Leakage | Tracking note |
|------------------------------|--------------------------------------------|---------------|
| Diagnostic questionnaires | **Substantially implemented** via SCLI v1.1 (20 questions, versioned catalogue) | Substantially implemented through the existing SCLI / Cost Leakage diagnostic. Final contractual acceptance or classification remains subject to agreed scope and client sign-off. |
| Diagnostic sessions | **Substantially implemented** (`AssessmentSession`, draft/resume/submit) | Substantially implemented through the existing SCLI / Cost Leakage diagnostic. Final contractual acceptance or classification remains subject to agreed scope and client sign-off. |
| Organisation / response capture | **Largely implemented** (org + inputs + responses + evidence) | Site not in SCLI; separate from MOSS Site work. Final contractual acceptance remains subject to agreed scope and client sign-off. |
| Scoring engine | **Implemented for SCLI** (0–100 weighted risk + bands) | Not Master Catalogue 0–4; different product semantics. Final contractual acceptance remains subject to agreed scope and client sign-off. |
| Governance-oriented scoring | **Partially present** via SCLI “Executive Assurance” category | Not GOV-* Master Catalogue governance. Final contractual acceptance remains subject to agreed scope and client sign-off. |
| Leakage calculations | **Implemented for SCLI** (`leakage.ts` + assumptions) | Cost Leakage product — not MOSS engine. Final contractual acceptance remains subject to agreed scope and client sign-off. |
| Opportunity scoring | **Implemented for SCLI** (`opportunity.ts`) | Cost Leakage product. Final contractual acceptance remains subject to agreed scope and client sign-off. |
| Recommendation logic | **Implemented for SCLI** (9 rules + review edit) | Cost Leakage product. Final contractual acceptance remains subject to agreed scope and client sign-off. |

**Interpretation for planning:** In technical terms, SCLI/Cost Leakage already implements a large share of Phase 3 *diagnostic-engine* substance. That is **not** a commercial acceptance certificate. Final contractual acceptance or classification remains subject to agreed scope and client sign-off. Building true MOSS 100-control remains a **separate product capability track**. Do **not** automatically classify every missing MOSS Master Catalogue feature as an unpaid/unfinished Phase 3 defect.

### B. True MOSS 100-Control product implementation status

| MOSS product capability | Status for this plan |
|-------------------------|----------------------|
| 14 domains / 100 controls / IDs (GOV-01, …) | Required for MOSS product |
| Maturity scores 0–4 | Required for MOSS product |
| Domain / overall MOSS aggregation | Required; rules **CLIENT CONFIRMATION** |
| MOSS workspace UX (domains → controls) | Required for MOSS product |
| Site on MOSS assessments | Recommended; mandatory enforcement **CLIENT CONFIRMATION** |
| MOSS findings / recommendations engines | Required for MOSS product (separate from SCLI rules) |
| Catalogue financial metadata | Schema-ready now; calculations later |
| MOSS financial calculation engines | Out of immediate build until formulas confirmed |

**Work tickets for M1+ should be labelled** `MOSS-PRODUCT` (or similar), not silently as “Phase 3 defect fix,” unless the commercial owners explicitly reclassify them.

---

## 2. Current reusable framework

Reusable without copying SCLI methodology:

| Capability | Location | Reuse for MOSS? |
|------------|----------|-----------------|
| Auth / Keycloak / roles | moss auth + SSO | Yes |
| Organisations / memberships | Prisma `Organisation`, `Membership` | Yes |
| Evidence storage + status | `EvidenceDocument`, storage service | Yes (link to control assessments) |
| Audit logging | `AuditEvent` | Yes |
| Assignment / review / approve patterns | workflow module | Yes (product-scoped) |
| Findings / recommendations **tables** | `Finding`, `Recommendation` | Yes as **shared structures**; **new rules/engines** for MOSS |
| Reports / EmailJob / CRM plumbing | existing modules | Later; Phase 4 MOSS reports — not now |
| UI shell, tables, badges, AuthGate | moss-web components | Yes |
| Versioned questionnaire pattern | `Questionnaire` / `QuestionnaireVersion` | Partially — see §6 |

**Do not reuse as MOSS methodology:**

| SCLI asset | Why not |
|------------|---------|
| `Q1`–`Q20` / SCLI categories | Different product |
| `scoring.ts` (0–100 weighted risk) | Different scale & meaning |
| `leakage.ts` / `opportunity.ts` | Cost Leakage engines |
| SCLI `RecommendationRule` seed | SCLI-specific triggers |
| Published SCLI 1.1 version rows | Immutable |

---

## 3. Product boundary

```text
PHYSICAL RISK PLATFORM
├── Repository          LOCKED
├── Cost Leakage (SCLI) LIVE — preserve
├── MOSS                NEW — this plan
└── SOMOD               LATER — hooks only
```

| Concern | Cost Leakage | MOSS |
|---------|--------------|------|
| Catalogue | SCLI v1.1 | Master Catalogue 14×100 |
| Score | 0–100 risk | 0–4 maturity |
| Primary nav (proposed) | `/cost-leakage` or legacy `/assessments` | `/moss` |
| Financial engine | `leakage.ts` | Catalogue financial **metadata fully stored**; **calculations disabled** until confirmed — never call SCLI leakage |
| Host folder | `moss/` (historical name) | Same host, different product routes |

---

## 4. Proposed routing

### Recommended structure (Next.js app under `moss/apps/web`)

| Product | Canonical routes | Notes |
|---------|------------------|-------|
| Cost Leakage | `/cost-leakage`, `/cost-leakage/assessments`, … | New clear branding |
| MOSS | `/moss`, `/moss/assessments`, … | New product |
| SOMOD (future) | `/somod`… | Placeholder only — do not build |

### Backwards compatibility (mandatory)

| Existing production URL | Treatment |
|-------------------------|-----------|
| `/start` | **Keep** as Cost Leakage public questionnaire (unchanged behaviour) |
| `/assessments`, `/assessments/*` | **Keep** as Cost Leakage authenticated assessments (default filter `productCode = SCLI_COST_LEAKAGE`) |
| `/dashboard` | **Keep** as Cost Leakage / portfolio leakage dashboard (or rename label only; URL stays) |
| `/reports`, `/organisations`, `/admin/*` | Keep; scope lists by product where relevant |

**Redirect strategy (later implementation):**

- Add `/cost-leakage/*` as **aliases** that render the same SCLI pages (or soft-redirect `/cost-leakage` → `/dashboard` / assessments).
- Do **not** break bookmarks to `/start` or `/assessments/[id]`.
- Optionally show a product switcher in the shell: Cost Leakage | MOSS | (SOMOD disabled).

Portal (`apps.physicalrisk.com`) later: separate tiles for Cost Leakage vs MOSS — **out of this coding phase** unless requested; plan only.

---

## 5. Product / assessment discriminator

### Recommendation: `productCode` on `AssessmentSession` for SCLI and MOSS only

```text
enum ProductCode {
  SCLI_COST_LEAKAGE
  MOSS
  SOMOD          // OPTIONAL reservation in a shared platform enum only —
                 // NOT a commitment that SOMOD uses AssessmentSession
}
```

**Also keep** `questionnaireVersionId` / `mossCatalogueVersionId` for methodology versioning within a product.

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `questionnaireCode` only (`SCLI` vs `MOSS`) | Already exists via version relation | Easy to forget in queries | Insufficient alone |
| `assessmentType` string | Flexible | Uncontrolled values | Weak |
| **`productCode` on AssessmentSession** (`SCLI_COST_LEAKAGE` \| `MOSS`) | Explicit, indexable | Small migration | **Preferred for SCLI + MOSS** |
| Separate `MossAssessment` table | Hard isolation | Duplicates workflow | Optional later if coupling bites |

**Safest near-term:**

- `AssessmentSession.productCode` **required**, default **`SCLI_COST_LEAKAGE`** for all existing rows (backfill, no behaviour change).
- MOSS sessions created with `productCode = MOSS`.
- APIs must filter by `productCode` so SCLI list endpoints never return MOSS sessions (and vice versa).

**SOMOD:** If a platform-wide `ProductCode` enum includes `SOMOD` for portal/navigation convenience, that does **not** imply SOMOD assessments are `AssessmentSession` rows. SOMOD’s root aggregate will be decided later (see §19).

---

## 6. Catalogue data model

### Two approaches evaluated

#### A — Extend versioned Questionnaire / Question (reuse)

- New `Questionnaire` code `MOSS`, version `3.0`
- Domains as `Question.category` or a new `Domain` table linked to version
- Extra catalogue fields in JSON on Question

**Pros:** Reuses admin methodology screens, seeding pattern, version immutability.  
**Cons:** Question model is tuned to SCLI option risk scores; 0–4 maturity is a different response shape; rich Master Catalogue fields crowd `Question`.

#### B — Dedicated `MossDomain` / `MossControl` (+ `MossCatalogueVersion`)

**Pros:** Clear product boundary; columns match Master Catalogue; no risk of SCLI admin editing MOSS by mistake.  
**Cons:** Parallel admin UI; more tables.

### Recommendation: **Hybrid B + version gate**

| Entity | Purpose |
|--------|---------|
| `MossCatalogueVersion` | e.g. `3.0`, status DRAFT/PUBLISHED, publishedAt, notes |
| `MossDomain` | domain_id, name, sortOrder, versionId |
| `MossControl` | control_id, domainId, name, + catalogue fields (below) |
| Optional `MossScoreBand` / config | Labels for 0–4 (Non-existent … Optimised) |

Link assessment to `mossCatalogueVersionId` (and `productCode = MOSS`).

Do **not** put Master Catalogue rows into the published SCLI 1.1 questionnaire version.

### Field storage guidance

| Catalogue field | Storage |
|-----------------|---------|
| domain_id, domain_name | Relational (`MossDomain`) |
| control_id, control_name, control_function, owner, frequency, metric | Relational columns |
| quantitative threshold (simple) | Column (`thresholdText` / `thresholdJson`) |
| evidence_standards | Text or structured JSON array |
| inspection_methodology | Text |
| failure_conditions | JSON array of structured conditions |
| fraud_indicators | JSON array |
| technology_substitution_logic | **JSON/text — fully preserved** (no engine in v1) |
| manpower_optimisation_logic | **JSON/text — fully preserved** (no engine in v1) |
| moss_scoring_rules | JSON (per-control guidance); aggregation in config — see §11 |
| financial_relevance | **Boolean (or enum) column — preserved** |
| event_unit | **Column or JSON — preserved** |
| cost_category | **Column or JSON — preserved** |
| leakage_quantification | **JSON — fully preserved** (structure ready for later engines) |
| formula_reference | **String column — preserved** |
| sla_penalty_logic | **JSON — fully preserved** |
| incident_to_cost_conversion | **JSON — fully preserved** |

**Derived:** domain/overall scores from control responses (not stored as catalogue).

**Design rule:** Preserve catalogue financial and optimisation metadata in non-destructive JSON/columns from first catalogue load so later engines do not require schema redesign. **Do not execute** those formulas in MOSS v1. **Do not** call SCLI `leakage.ts`.

Avoid over-normalising every bullet of methodology into separate tables on day one beyond the fields above.

---

## 7. Versioning strategy

| Rule | Detail |
|------|--------|
| Immutable publish | Once `MossCatalogueVersion.status = PUBLISHED`, no in-place edits to domains/controls |
| New version | Clone → edit → publish as `3.1`, `3.2`, … |
| Assessment binding | `AssessmentSession.mossCatalogueVersionId` (or questionnaireVersionId if hybrid A) set at create time — **never** silently rebind |
| Historical reproducibility | Control text, thresholds, and score semantics for that version remain readable forever |
| SCLI | Unchanged: SCLI `1.1` stays published and immutable |

---

## 8. Site model

Shared first-class **Site** in the **shared diagnostic platform database** (moss Postgres — **not** Repository):

```text
Organisation
  └── Site[]
        └── AssessmentSession[]   // SCLI optional; MOSS recommended
        └── (future SomodAssessment may also FK siteId)
```

| Field | Type | Notes |
|-------|------|-------|
| id | cuid | |
| organisationId | FK | |
| name | string | |
| siteCode | string | unique per org |
| address / region | optional text | |
| description | optional | |
| status | ACTIVE / INACTIVE | |
| createdAt / updatedAt | timestamps | |

**MOSS:** Site is **recommended** on new MOSS assessments. **Mandatory enforcement** is **CLIENT METHODOLOGY / PRODUCT CONFIRMATION REQUIRED** unless already explicitly documented by the client — do not hard-require in M1 without that confirmation.  
**SCLI:** Site **optional** (no forced migration of historical SCLI rows).  
**SOMOD (future):** May reference the same `siteId` (and later `engagementId`) without using `AssessmentSession`.

---

## 9. MOSS assessment data model

### Recommendation: Reuse `AssessmentSession` with product scoping **for SCLI and MOSS only**

| Approach | Trade-off | Verdict |
|----------|-----------|---------|
| **Reuse AssessmentSession + productCode (SCLI \| MOSS)** | Faster; shared workflow/evidence/assignments; must discipline all queries by product | **Preferred for MOSS MVP** |
| Dedicated `MossAssessment` | Stronger isolation; duplicates status machine | Use if product governance demands hard split |

### MOSS-specific fields on session (additive)

- `productCode = MOSS`
- `siteId` (nullable until client confirms mandatory)
- `mossCatalogueVersionId`
- existing: organisationId, title, reference, status, createdById, parentAssessmentId, …

**Do not** run SCLI `evaluate()` on MOSS sessions.

**SOMOD:** Do **not** assume SOMOD will use `AssessmentSession`. See §19.

---

## 10. Control response model

### Recommendation: New `MossControlAssessment` (cleaner than overloading `AssessmentResponse`)

SCLI `AssessmentResponse` is bound to `Question` + `ResponseOption` + numeric **riskScore**. MOSS needs discrete **maturity 0–4**, findings text, control catalogue FKs, and **score traceability** that does not assume scores are always manual.

### Core fields (M1 minimum)

| Field | Notes |
|-------|-------|
| id | |
| assessmentId | FK AssessmentSession (MOSS only) |
| mossControlId | FK MossControl |
| controlCode | denormalised GOV-01 (stable for exports) |
| score | Int 0–4 nullable — **effective/display score** used until finalisation rules apply |
| comment | assessor notes |
| findingText | optional structured finding narrative |
| status | NOT_STARTED / IN_PROGRESS / SCORED / NEEDS_EVIDENCE / COMPLETE |
| assessedById / assessedAt | |
| updatedAt | |

### Score traceability (design now; columns may land after M1)

The model and scoring service **must not** assume MOSS scores are always manually selected. Future controls may derive **guidance** from quantitative threshold, evidence status, measured result, or inspection result. Final methodology remains configurable / client-controlled.

| Concept | Planned field (additive) | M1 required? |
|---------|--------------------------|--------------|
| Assessor-entered score | `assessorScore` (0–4, nullable) | Optional in M1 — may start with single `score` as assessor entry |
| System-suggested score | `suggestedScore` (0–4, nullable) | No — reserve in design / nullable column when ready |
| Reviewer / final score | `finalScore` (0–4, nullable) | No — for review workflow |
| Effective score | `score` or derived: final ?? assessor ?? suggested | Yes (single effective value for UI progress) |
| Score rationale | `scoreRationale` (text) | Recommended early |
| Calculation / evidence trace | `scoreTrace` (JSON) | No in M1 — shape reserved |

**Reserved `scoreTrace` JSON shape (illustrative, not implemented):**

```json
{
  "inputs": {
    "threshold": "...",
    "evidenceStatus": "...",
    "measuredResult": null,
    "inspectionResult": null
  },
  "suggestionRuleId": null,
  "suggestedAt": null,
  "assessorOverride": true,
  "reviewerId": null
}
```

**Evidence:** continue using `EvidenceDocument` with optional `mossControlAssessmentId` — do not fork storage.

**Service design:** `moss-scoring` / assessment services accept optional suggestion plugins later; M1 UI can still be manual 0–4 selection writing `assessorScore`/`score`.

---

## 11. MOSS scoring architecture

### New module (do not touch SCLI)

`moss/packages/shared/src/moss-scoring.ts`  
(+ `moss-scoring.test.ts`)

Exported separately from `scoring.ts` / `leakage.ts` / `opportunity.ts`.

### Outputs

| Output | Description |
|--------|-------------|
| Control score | 0–4 as recorded (or null) |
| Domain score | Aggregation of control scores in domain |
| Overall MOSS score | Aggregation across domains |
| Optional completeness | % controls scored |

### Aggregation — **CLIENT METHODOLOGY CONFIRMATION REQUIRED**

Do **not** invent weights. Implement a **configurable** aggregator, e.g.:

```text
MossScoringConfig {
  domainAggregation: 'MEAN' | 'WEIGHTED_MEAN' | 'MIN' | ...
  overallAggregation: 'MEAN' | 'WEIGHTED_MEAN' | ...
  domainWeights?: Record<domainId, number>
  criticalControlPolicy?: ...
  effectiveScorePolicy: 'FINAL_ELSE_ASSESSOR_ELSE_SUGGESTED' | ...
}
```

Default in code can be simple MEAN **only after client confirms**, or refuse to compute overall until config is published with the catalogue version.

Control-level inputs to aggregation should use the **effective** score policy (final / assessor / suggested — §10), not assume manual-only entry forever.

### Persistence

New `MossScoreSnapshot` to avoid polluting SCLI snapshot shape (`leakageResult`, `opportunityScore`, etc.).

---

## 12. Findings architecture

### Sources

1. Assessor-entered finding text on control  
2. Optional auto-draft when `score <= threshold` using catalogue `failure_conditions` templates  

### Structured finding payload

| Field | Source |
|-------|--------|
| controlId / controlCode | MossControl |
| domainId | MossDomain |
| score | MossControlAssessment |
| thresholdStatus | compare to catalogue threshold **if rule defined** |
| finding | text |
| severity | mapped via configurable score→severity (**CLIENT CONFIRMATION**) |
| evidenceStatus | derived from linked evidence |
| assessorComment | comment |

Reuse `Finding` model with `productCode` / `mossControlAssessmentId`, or keep MOSS findings in JSON until review — prefer **relational Finding** for Phase 4 reports.

**Do not** auto-generate unsupported legal/audit conclusions.

---

## 13. Recommendation architecture

### Separate from SCLI `RecommendationRule`

| Entity | Purpose |
|--------|---------|
| `MossRecommendationRule` | Version-scoped; trigger on score range, failure_condition code, evidence gap, etc. |
| `MossRecommendation` or reuse `Recommendation` + productCode | Instance on assessment |

### Possible trigger sources (configurable)

- Control score ≤ N  
- failure_conditions match  
- evidence missing  
- technology_substitution_logic / manpower_optimisation_logic as **template text**, not auto-optimisation  

Analyst may edit wording (same pattern as SCLI review) without sharing SCLI rule seed data.

---

## 14. Financial mapping readiness

Catalogue financial and related methodology fields must be **fully preserved in schema** from first import. **MOSS financial calculations remain disabled** until methodology/formulas are confirmed.

### Preserve in `MossControl` (or versioned JSON document per control)

| Field | Persist now | Calculate in MOSS v1? |
|-------|-------------|------------------------|
| financial_relevance | Yes | No |
| event_unit | Yes | No |
| cost_category | Yes | No |
| leakage_quantification | Yes (JSON) | No |
| formula_reference | Yes | No |
| sla_penalty_logic | Yes (JSON) | No |
| incident_to_cost_conversion | Yes (JSON) | No |
| technology_substitution_logic | Yes | No (display / future rec templates) |
| manpower_optimisation_logic | Yes | No (display / future rec templates) |

### Explicit prohibitions

- **Do not** call SCLI `calculateLeakage()` / `leakage.ts` from MOSS.
- **Do not** call SCLI `opportunity.ts` for MOSS overall results.
- **Do not** drop or flatten away catalogue financial metadata to “simplify” v1.

### Later classification

| Item | Label |
|------|-------|
| Metadata present on control | **AVAILABLE FROM CATALOGUE** |
| Executable financial engine | **CLIENT FORMULA CONFIRMATION REQUIRED** |

Schema should use nullable JSON/text columns so adding engines later is additive, not destructive.

---

## 15. UI screens

Reuse existing component library (`AppShell`, tables, badges, cards).

| Screen | Route (proposed) |
|--------|------------------|
| MOSS Dashboard | `/moss` or `/moss/dashboard` |
| MOSS Assessments list | `/moss/assessments` |
| New MOSS Assessment | `/moss/assessments/new` |
| Assessment Workspace | `/moss/assessments/[id]` |
| Domain view (optional deep link) | `/moss/assessments/[id]/domains/[domainId]` |
| Control Assessment (main pane) | within workspace |
| Evidence drawer/panel | within workspace |
| Findings | `/moss/assessments/[id]/findings` or tab |
| Recommendations | tab / `/moss/assessments/[id]/recommendations` |
| Results | `/moss/assessments/[id]/results` |
| Methodology Admin | `/moss/admin/catalogue` (or `/admin/moss-methodology`) |

Cost Leakage screens remain on current routes (§4).

---

## 16. Assessment user flow

```text
Login (SSO)
  → MOSS Dashboard
  → New MOSS Assessment
  → Select Organisation (+ Site when confirmed / provided)
  → Bind published MossCatalogueVersion (default latest published)
  → Workspace:
        Left: 14 domains with progress
        Main: control detail + score 0–4 (assessor entry; room for suggested/final later) + comment + evidence + finding
        Actions: Previous / Save / Next
  → Complete / Submit (required-control policy TBD)
  → Compute MossScoreSnapshot (no SCLI leakage/opportunity)
  → Generate draft findings / recommendations (MOSS rules only)
  → Optional analyst review (reuse workflow patterns, product-scoped)
  → Results view
```

**Progress:** `% = scoredControls / totalControls` for version.

---

## 17. Result model

Structured output for Phase 4 (no PDF work now):

```json
{
  "productCode": "MOSS",
  "assessmentId": "...",
  "reference": "MOSS-...",
  "organisationId": "...",
  "siteId": "...",
  "catalogueVersion": "3.0",
  "overallScore": null,
  "domainScores": [{ "domainId": "GOV", "score": null, "controlsScored": 0, "controlsTotal": 0 }],
  "controlScores": [{ "controlId": "GOV-01", "score": 2, "status": "SCORED" }],
  "criticalControls": [],
  "findings": [],
  "evidenceGaps": [],
  "recommendations": [],
  "completenessPercent": 0,
  "calculatedAt": "..."
}
```

`overallScore` / domain aggregates remain null until client confirms aggregation rules.

---

## 18. SCLI backwards compatibility

| Asset | How preserved |
|-------|----------------|
| SCLI questionnaire 1.1 | Untouched published version |
| `/start` public flow | Unchanged; still loads `SCLI` |
| Existing assessments | `productCode` defaulted to `SCLI_COST_LEAKAGE`; same IDs |
| ScoreSnapshots | Unchanged shape; MOSS uses `MossScoreSnapshot` |
| `scoring.ts` / `leakage.ts` / `opportunity.ts` | No edits for MOSS feature work |
| SCLI recommendation rules | Untouched |
| SCLI PDFs / CRM sync | Continue to read SCLI snapshots only; guard with `productCode` |
| `/assessments` APIs | Default filter SCLI; MOSS under `/api/moss/...` or query `?productCode=` |

**Regression tests (when implementing):** existing SCLI evaluate fixtures + leakage tests must still pass unchanged.

---

## 19. Future SOMOD integration points

SOMOD (Security Operating Model Optimisation Diagnostic) is a **separate product** with a substantially different aggregate/root model and **five internal engines**. It must **not** be forced into the questionnaire / `AssessmentSession` model.

### What SCLI and MOSS may share

- `AssessmentSession` with `productCode` ∈ { `SCLI_COST_LEAKAGE`, `MOSS` }

### What SOMOD will decide later

- Prefer evaluation of a dedicated **`SomodAssessment`** (or equivalent) aggregate for engines: Risk/Requirement, Deployment/Capability, Technology, Cost/Efficiency, Optimisation/Trade-off.
- Optional presence of `SOMOD` in a platform `ProductCode` enum is for **labelling only**, not schema commitment to `AssessmentSession`.

### Safe shared identifiers (no SOMOD logic now)

| Identifier | Purpose |
|------------|---------|
| `organisationId` | Client |
| `siteId` | Site context |
| `engagementId` | Reserved for future engagement entity (not required in M1) |
| User IDs | Assessor / reviewer |
| Optional read-only reference | `mossAssessmentId` / control results as **inputs** to SOMOD later |

SOMOD must not overwrite MOSS or SCLI rows. No scenario calculations in this plan.

---

## 20. Proposed database changes (plan only)

**Additive only; no SCLI destructive changes. No Repository changes.**

1. Enum `ProductCode` with at least `SCLI_COST_LEAKAGE`, `MOSS` (optional unused `SOMOD` label value — **not** wired to AssessmentSession behaviour)  
2. `AssessmentSession.productCode` (default `SCLI_COST_LEAKAGE`) + index — **SCLI and MOSS only**  
3. `Site` table in diagnostic DB + `AssessmentSession.siteId` nullable  
4. `MossCatalogueVersion`, `MossDomain`, `MossControl` (including full financial metadata columns/JSON — §14)  
5. `MossControlAssessment` (effective score + room for assessor/suggested/final/trace — §10)  
6. `MossScoreSnapshot`  
7. Optional: `MossRecommendationRule`; FKs on `Finding` / `EvidenceDocument` / `Recommendation` for MOSS links  
8. Backfill: all existing sessions → `SCLI_COST_LEAKAGE`  
9. **Do not** create `AssessmentSession` rows for SOMOD under this plan  

**Migrations:** use proper Prisma migrations for MOSS rollout (avoid `db push --accept-data-loss`).

---

## 21. Proposed API endpoints (plan only)

Prefix recommendation: `/api/moss/...` (Nest controllers), while SCLI keeps `/api/assessments` behaviour.

### Catalogue / admin
- `GET /moss/catalogue/versions`
- `GET /moss/catalogue/versions/:versionId` (domains + controls)
- `POST /moss/catalogue/versions` (draft)
- `POST /moss/catalogue/versions/:id/publish`

### Sites
- `GET/POST /organisations/:id/sites`
- `PATCH /sites/:id`

### Assessments
- `GET /moss/assessments`
- `POST /moss/assessments` `{ organisationId, siteId, title?, catalogueVersionId? }`
- `GET /moss/assessments/:id`
- `PATCH /moss/assessments/:id/controls/:controlCode` `{ score, comment, findingText, status }`
- `POST /moss/assessments/:id/evaluate` → MossScoreSnapshot + draft recs/findings
- `POST /moss/assessments/:id/submit`

### Evidence / findings / recommendations
- Reuse evidence routes with MOSS assessment auth checks  
- `GET/PATCH` findings & recommendations scoped to MOSS assessment  

All endpoints: JWT + roles; enforce `productCode = MOSS`.

---

## 22. Proposed frontend routes (plan only)

| Route | Purpose |
|-------|---------|
| `/moss` | Dashboard |
| `/moss/assessments` | List |
| `/moss/assessments/new` | Create |
| `/moss/assessments/[id]` | Workspace (domains + control pane) |
| `/moss/assessments/[id]/results` | Results |
| `/moss/admin/catalogue` | Methodology admin |
| `/cost-leakage` | Optional alias home for SCLI |
| Existing `/start`, `/assessments`, `/dashboard` | **Unchanged SCLI** |

---

## 23. Implementation phases

| Phase | Scope | Depends on | Scope label |
|-------|-------|------------|-------------|
| **M0 — Decisions** | Aggregation rules; Site mandatory?; catalogue file; confirm §1A tracking | Client | Governance |
| **M1 — Data foundation** | productCode backfill (SCLI\|MOSS), Site, Moss catalogue tables **with financial metadata**, control assessment core fields | M0 | `MOSS-PRODUCT` |
| **M2 — Catalogue load** | Import Master Catalogue into draft `3.0`; publish; preserve all §14 fields | Client file + M1 | `MOSS-PRODUCT` |
| **M3 — Session + responses API** | Create MOSS assessment, save scores (trace-ready), evidence link | M2 | `MOSS-PRODUCT` |
| **M4 — Scoring service** | `moss-scoring.ts` + MossScoreSnapshot per confirmed config | Client aggregation | `MOSS-PRODUCT` |
| **M5 — Workspace UI** | Dashboard, list, new, domain/control workspace | M3 | `MOSS-PRODUCT` |
| **M6 — Findings & recommendations** | MOSS rules (not SCLI rules) | M4–M5 | `MOSS-PRODUCT` |
| **M7 — Results API shape** | Structured JSON for Phase 4 | M6 | `MOSS-PRODUCT` |
| **M8 — Hardening** | Product filters, SCLI regression, optional `/cost-leakage` aliases | M7 | `MOSS-PRODUCT` |
| **Later** | MOSS financial engines; MOSS PDF; SOMOD dedicated aggregate | Separate approvals | Not silent Phase 3 |

Each phase must include **SCLI regression** checklist. **No implementation begins until this revised plan is approved.**

---

## 24. Risks

| Risk | Mitigation |
|------|------------|
| Treating MOSS gaps as unpaid Phase 3 defects | Use §1A; label tickets `MOSS-PRODUCT` |
| Product confusion (MOSS vs Cost Leakage) | Explicit routes + productCode + UI labels |
| Accidental SCLI evaluate on MOSS | Hard guard in service layer |
| Invented scoring weights | Configurable; block overall score until confirmed |
| Assuming all scores are manual forever | §10 trace fields / scoreTrace reserved |
| Forcing SOMOD onto AssessmentSession | §19 dedicated aggregate evaluation later |
| Losing catalogue financial metadata | Persist §14 fields on first import |
| Calling SCLI leakage from MOSS | Explicit prohibition + code review checklist |
| Catalogue import quality | Draft version + validation (100 controls, 14 domains, unique IDs) |
| Query leakage across products | Mandatory product filters on list endpoints |
| `db push` data loss | Prisma migrations only for MOSS rollout |

---

## 25. CLIENT METHODOLOGY CONFIRMATIONS REQUIRED

1. Authoritative Master Catalogue file (version label, e.g. MOSS 3.0).  
2. Exact list of **14 domain IDs** and **100 control IDs**.  
3. Domain score aggregation rule (mean, weighted, minimum, …).  
4. Overall MOSS score aggregation rule.  
5. Score → severity mapping for findings (if any).  
6. Which controls are “critical” and how that affects results.  
7. Auto-finding / auto-recommendation rules vs assessor-only.  
8. Whether Site is **mandatory** for MOSS assessments (recommended yes; not assumed mandatory in M1).  
9. Confirm financial catalogue fields are **display/metadata-only** for MOSS v1 (recommended: yes).  
10. Rules for suggested vs assessor vs final score when automated guidance exists.  
11. Naming: keep public host `moss.physicalrisk.com` for both products or split later.  
12. Commercial/owners: which MOSS backlog items (if any) are explicitly reclassified as Phase 3 vs MOSS-product (plan makes no commercial conclusion).

Until (3)–(4) are confirmed: implement score **capture** and per-control persistence; mark domain/overall as **pending configuration**.

---

## 26. Repository lock confirmation

Repository / Repository Gateway remains completed and locked under this plan. No Repository application code, database schema, configuration, SOP, routing, document workflow, or Repository business rule is proposed for change. Site, MOSS catalogue, and assessments live only in the shared **diagnostic platform** database / services — **not** Repository.

**Implementation safety:** No coding, migrations, seeding, or route changes may begin until this **revised** architecture plan has been approved. SCLI v1.1 remains immutable and operational.

---

## Appendix A — Workspace UX sketch (reference)

```text
┌─────────────────────────────────────────────────────────────┐
│ MOSS Assessment  REF-…    Org: …    Site: …    Status: DRAFT │
│ Progress ████░░░░ 28/100   Catalogue v3.0                    │
├──────────────┬──────────────────────────────────────────────┤
│ D01 Governance│ GOV-01  Policy ownership                     │
│ D02 Risk      │ Objective: …                                 │
│ D03 Policy    │ Threshold: …                                 │
│ …             │ Evidence: …                                  │
│ D14 Assurance │                                              │
│               │ Score:  (0) (1) (2) (3) (4)                  │
│               │ Comment: [________________]                  │
│               │ Finding:  [________________]                 │
│               │ Evidence: [Upload / link]                    │
│               │                                              │
│               │ [Previous]  [Save]  [Next]                   │
└──────────────┴──────────────────────────────────────────────┘
```

---

## Appendix B — Explicit non-actions

This revised document does **not** authorise:

- schema/migration execution  
- seeding MOSS controls  
- route changes in code  
- SCLI or Repository modifications  
- SOMOD implementation or forcing SOMOD onto `AssessmentSession`  
- app renames  
- enabling MOSS financial calculation engines  

**Next step after approval of this revision:** Phase M0 client confirmations → Phase M1 ticket breakdown labelled `MOSS-PRODUCT`.

---

*End of MOSS 100-control implementation plan (revised).*
