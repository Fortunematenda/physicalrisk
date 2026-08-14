# MOSS Current State Audit

**Original audit date:** 2026-08-09  
**Update:** 2026-08-14 — see `docs/MOSS_CATALOGUE_PARITY_CHECK_2026-08-14.md`

> **Superseded finding:** The 2026-08-09 claim that the MOSS 100-control catalogue is **missing** is **no longer true**. Local product now has published Master Catalogue **v3.0** (14×100), identical to Wayne’s JSON, with MEAN scoring **v1.0.0**. Keep the narrative below as historical audit only.

---

## 1. Executive summary

### Phase 3 estimated completion: **56%**

This percentage measures progress against the **contractual Phase 3 baseline** stated in the audit brief:

> Executive Diagnostic Engine — questionnaires, sessions, response capture, scoring, governance scoring, leakage, opportunity, recommendations — applying Physical Risk methodology, with the MOSS Master Catalogue (14 domains / 100 controls / scores 0–4) as the source-of-truth model.

| Deliverable | Weight | Credit | Contribution |
|-------------|-------:|-------:|-------------:|
| Diagnostic questionnaires | 12.5% | 50% | 6.3 |
| Diagnostic sessions | 12.5% | 90% | 11.3 |
| Response capture | 12.5% | 85% | 10.6 |
| Scoring engine (0–4 MOSS) | 12.5% | 20% | 2.5 |
| Governance scoring | 12.5% | 30% | 3.8 |
| Leakage calculations | 12.5% | 65% | 8.1 |
| Opportunity scoring | 12.5% | 70% | 8.8 |
| Recommendation logic | 12.5% | 55% | 6.9 |
| **Total** | **100%** | | **~56%** |

### Critical finding (do not overlook)

The live product is **not** the MOSS 100-control Master Catalogue.

What exists today is the **SCLI v1.1 Lean Revenue MVP**:

- **5** question categories (not 14 domains)
- **20** executive questions `Q1`–`Q20` (not 100 controls `GOV-01`, `RISK-01`, `DEP-02`, …)
- Score scale **0–100 weighted risk** (not MOSS maturity **0–4**)
- Leakage/opportunity engines tied to **SCLI calibration inputs C1–C23**, not per-control financial event maps

Against **its own documented Lean Revenue MVP scope** (`moss/docs/PROJECT_SCOPE.md`, `moss/README.md`), the build is substantially further along — roughly **~85% of SCLI Lean MVP**.

Against the **agreed Phase 3 / MOSS Master Catalogue model**, the platform has a **working diagnostic session + engine shell**, but the **catalogue, score scale, and control-level financial mapping are a different product model**.

### Headline verdict

| Question | Answer |
|----------|--------|
| Is there a real MOSS app (web + API + DB)? | **Yes** — monorepo under `moss/` |
| Does end-to-end SCLI assess → score → leakage → recs → PDF work? | **Largely yes** (backed by shared engines + Prisma persistence) |
| Is the MOSS 100-control / 14-domain catalogue present? | **No** — `GOV-01` / `RISK-01` / `DEP-02` not found anywhere in MOSS |
| Are dashboard KPIs mock? | **No for core KPIs** — derived from live `/assessments` score snapshots |
| Can the architecture support 100 controls later? | **Yes, with catalogue + scoring model changes** — Question/Response/Version tables are configuration-driven |
| Repository dependency? | **None found in MOSS code** — SSO/Keycloak/portal/nginx are shared infra only |

---

## 2. Current architecture

Actual structure (not invented):

```text
WordPress / public /start (optional lead)
        ↓
MOSS Web  (Next.js @moss/web)  — moss.physicalrisk.com
        ↓  BFF /api/gw/*
MOSS API  (NestJS @moss/api)
        ↓
AssessmentsService.evaluate()
        ↓
@moss/shared  — scoring.ts | leakage.ts | opportunity.ts | confidence.ts
        ↓
PostgreSQL (Prisma)  — Questionnaire*, AssessmentSession, ScoreSnapshot,
                       Recommendation, Evidence, Report, …
        ↓ (pilot extras)
PDF Reports → EmailJob → EspoCRM sync
```

| Layer | Location |
|-------|----------|
| Frontend | `moss/apps/web` |
| API | `moss/apps/api` |
| Shared engines | `moss/packages/shared` |
| Catalogue seed | `moss/apps/api/prisma/scli-v1.1.json` + `seed.ts` |
| Schema | `moss/apps/api/prisma/schema.prisma` (**28 models**, **0 migration files** — uses `db push`) |
| Docs | `moss/docs/*`, `moss/README.md` |
| Compose | `moss/docker-compose.yml`; also `moss-*` services in root `docker-compose.sso.yml` |

**Repository / Repository Gateway is not part of this runtime path.** No MOSS calls into Repository APIs, import, indexing, or SOP modules were found.

---

## 3. Feature status matrix

| Feature | Status | Frontend | Backend | Database | Real/Mock | Notes |
|---------|--------|----------|---------|----------|-----------|-------|
| Login / SSO | COMPLETE | Yes | JWT + Keycloak strategies | User | Real | Shared Keycloak client `physicalrisk-moss` |
| Organisations | COMPLETE | Yes | CRUD | Organisation, Membership | Real | No Site entity |
| Create assessment | COMPLETE | `/assessments/new` | `POST /assessments` | AssessmentSession | Real | Org + optional title + SCLI version |
| Assessment reference ID | COMPLETE | Yes | Yes | `reference` unique | Real | |
| Assessor / creator | COMPLETE | Shown | `createdById` | Yes | Real | Assignments also exist |
| Assessment date | PARTIAL | Updated/created shown | timestamps | Yes | Real | No dedicated “assessment date” field |
| Site selection | MISSING | No | No | No Site model | — | Premises count is input `C3`, not a Site record |
| Draft / resume / save | COMPLETE | Assessment + `/start` | Patch inputs/responses; public resume | Yes | Real | |
| Complete / evaluate | COMPLETE | Yes | `POST …/evaluate`, `…/submit` | ScoreSnapshot | Real | Blocks if required fields missing |
| Assessment history | COMPLETE | List + dashboard | list by org/role | Yes | Real | |
| Reassessment versioning | PARTIAL | Limited UI | `parentAssessmentId` | Yes | Real | Comparison UI listed as future in PROJECT_SCOPE |
| Questionnaire (SCLI) | COMPLETE | Dynamic from API | Questionnaires module | Versioned Q/options | Real | Config-driven from seed JSON |
| MOSS 100-control catalogue | MISSING | — | — | — | — | Not in codebase |
| 0–4 control maturity scores | MISSING | — | — | riskScore 0–100 on options | — | Different scale |
| Domain / category scores | COMPLETE (SCLI) | Dashboard/review | calculateAssessmentScore | categoryScores JSON | Real | 5 SCLI categories |
| Overall risk / maturity | COMPLETE (SCLI) | Yes | shared scoring | ScoreSnapshot | Real | maturity = 100 − risk |
| Governance score (MOSS GOV-*) | MISSING / PARTIAL | “Executive Assurance” category only | Same | Category score | Real-as-SCLI | Not Master Catalogue governance |
| Leakage min/likely/max | COMPLETE (SCLI) | Dashboard + review | leakage.ts | leakageResult JSON | Real | Workbook-aligned assumptions |
| Opportunity score | COMPLETE (SCLI) | Review/results | opportunity.ts | ScoreSnapshot | Real | |
| Recommendations | COMPLETE (SCLI rules) | Review editor | evaluate + workflow | Recommendation + Rules | Real | 9 trigger rules |
| Evidence upload | COMPLETE | Assessment UI | evidence module + storage | EvidenceDocument | Real | Status workflow |
| Findings | PARTIAL | Review | workflow | Finding | Real | Pilot workflow |
| Executive PDF | COMPLETE (Phase 4-ish) | Reports | reports module | Report | Real | Ahead of Phase 3 boundary |
| Email delivery | COMPLETE | Admin emails | EmailJob queue | Yes | Real | Beyond Phase 3 diagnostic |
| EspoCRM sync | COMPLETE | Integrations | CRM module | CrmSyncRecord | Real | Beyond Phase 3 |
| Action plans | PARTIAL | `/actions` (not in main nav) | actions module | ActionItem | Real | Created on approval |
| Admin methodology | COMPLETE | `/admin/methodology` | questionnaires admin | Versioned | Real | |
| Assumptions admin | PARTIAL | Read-focused Lean MVP | Patch assumptions | CalibrationAssumption | Real | |
| Dashboard KPIs | COMPLETE | `/dashboard` | Aggregates client-side from assessments | Via API | **Real** | Not hard-coded 78% |
| SOMOD optimisation scenarios | MISSING | — | — | — | — | Correctly out of Phase 3 |

---

## 4. Phase 3 scope matrix

| Contractual deliverable | Classification | Evidence |
|-------------------------|----------------|----------|
| Diagnostic questionnaires | **PARTIAL** | SCLI 20 questions / 5 categories seeded & versioned; **not** 14×100 Master Catalogue |
| Diagnostic sessions | **COMPLETE** | `AssessmentSession` + statuses DRAFT→…→APPROVED; public anonymous session |
| Organisation / assessment response capture | **PARTIAL** | Org + inputs + responses + comments; **no Site**; evidence supported |
| Scoring engine | **PARTIAL** | Real weighted 0–100 engine in `@moss/shared`; **not** MOSS 0–4 control scores |
| Governance scoring | **PARTIAL** | “Executive Assurance” category score only; no GOV-## control set |
| Leakage calculations | **PARTIAL** | Full SCLI leakage engine; **not** control→event maps (e.g. DEP-02 / missed_shift) |
| Opportunity scoring | **PARTIAL** | Implemented commercial opportunity formula; SCLI-specific inputs |
| Recommendation logic | **PARTIAL** | 9 rule-based auto recommendations + analyst edit; not 100-control failure library |

**BLOCKED (methodology):** Full MOSS Master Catalogue import, 0–4 scoring semantics, and control-level leakage event mapping cannot be finished without client confirmation that Phase 3 should **replace or coexist with** SCLI v1.1.

---

## 5. MOSS catalogue status

| Metric | Expected (Master Catalogue) | Implemented (current) |
|--------|----------------------------:|----------------------:|
| Domains | 14 | **5** SCLI categories |
| Controls | 100 | **20** questions (`Q1`–`Q20`) |
| Control IDs like GOV-01, RISK-01, DEP-02 | Required | **0** — not present in repo |
| Response scale | 0–4 | Option `riskScore` **0–95/100** |
| Catalogue storage | DB / config | **Seeded JSON → Prisma** (`scli-v1.1.json`) |
| Hard-coded screens per control | — | **No** — UI renders from questionnaire API |

Checklist:

- [x] Seeded (SCLI)
- [x] Represented in database tables (Question, ResponseOption, …)
- [x] Represented in JSON (source of seed)
- [ ] Imported MOSS Master Catalogue
- [ ] 14 domains
- [ ] 100 controls
- [ ] Control IDs preserved (GOV-01, …)
- [ ] Frontend-only mock catalogue — **N/A** (backend-driven SCLI)

**Duplicates:** None detected among `Q1`–`Q20` codes in seed.

**Configuration-driven:** Yes for SCLI. Architecture can load another questionnaire version; scoring/leakage packages are currently **SCLI-formula-specific**.

---

## 6. Current user flow

Logical trace (SCLI Lean MVP):

| Step | Works? | Where it lives |
|------|--------|----------------|
| Login | Yes | `/login`, NextAuth/SSO, `AuthGate` |
| MOSS Dashboard | Yes | `/dashboard` ← `GET /assessments` (+ orgs/emails/crm) |
| Create Assessment | Yes | `/assessments/new` → `POST /assessments` |
| Select Organisation | Yes | Required `organisationId` |
| Select Site | **No** | No Site model/UI |
| Start Assessment | Yes | `/assessments/[id]` or public `/start` |
| Open Domain | Partial | Category sections in UI (5 SCLI categories), not 14 MOSS domains |
| Assess Control | Partial | Assess **question** Qn, not Master Catalogue control |
| Save Response | Yes | `PATCH /assessments/:id/responses/:code` |
| Add Evidence/Notes | Yes | Evidence API + response `comment` |
| Score Control | Partial | Selecting option applies its risk score; evaluate computes weighted overall |
| Complete Domain | Implicit | No explicit domain-complete state |
| Calculate Results | Yes | `POST /assessments/:id/evaluate` |
| Calculate Leakage/Opportunity | Yes | Same evaluate path → `ScoreSnapshot` |
| Generate Recommendations | Yes | Rule triggers in evaluate; editable in review |
| View Results | Yes | Assessment detail, review, dashboard, reports |

**Where Phase 3 (Master Catalogue) flow stops today:** at catalogue identity — there is no GOV/RISK/DEP control navigation, no 0–4 maturity picker as a first-class model, and no control-mapped leakage events.

---

## 7. Critical gaps (genuine Phase 3)

1. **MOSS Master Catalogue absent** (14 domains / 100 controls / IDs).
2. **Score semantics mismatch** (0–100 SCLI risk vs required 0–4 maturity).
3. **No Site entity** for organisation/site assessment scoping.
4. **Governance scoring** not implemented as Master Catalogue governance domain/controls.
5. **Leakage not control-event mapped** (no DEP-02 → missed_shift style bindings).
6. **Recommendations not driven by 100-control failures** (9 SCLI rules only).
7. **Prisma migrations folder empty** — schema applied via `db push`; operational risk for controlled environments (report only; not fixed in this audit).
8. **Client methodology confirmation needed** — whether Phase 3 replaces SCLI, wraps SCLI, or runs both.

---

## 8. Client methodology questions

Do **not** invent formulas. Confirm with Physical Risk:

1. Is Phase 3 meant to **replace SCLI v1.1**, or must SCLI remain as the commercial diagnostic while MOSS 100-control is a separate product track?
2. Exact **0–4 scoring rules** per control (definitions of Non-existent → Optimised) and any **domain/overall weighting**.
3. How **governance score** is computed from GOV-* controls (simple average, weighted, gates?).
4. Master Catalogue **leakage quantification** per control — event types, unit costs, severity multipliers, annualisation.
5. **Opportunity scoring** definition under the 100-control model (reuse SCLI opportunity.ts or new formula?).
6. Recommendation generation: rule library from Master Catalogue fields (failure conditions, SLA penalties) vs free-text analyst entry.
7. Is **Site** mandatory for Phase 3 sessions?
8. Evidence standards: mandatory per control or optional as today?
9. Confirm whether existing SCLI workbook assumptions remain authoritative for financial leakage in Phase 3 pilots.

Flag: **CLIENT RULE / FORMULA REQUIRED** for items 2–6 if Master Catalogue becomes the Phase 3 engine.

---

## 9. Out-of-scope items found (do not treat as Phase 3 defects)

Already built or partially built beyond pure Phase 3 diagnostic results:

| Item | Why out of Phase 3 core |
|------|-------------------------|
| Executive PDF generation | Phase 4 Report Generator |
| SMTP EmailJob pipeline | Delivery, not diagnostic engine |
| EspoCRM Account/Opportunity/Task sync | Commercial ops |
| Pilot workflow (QA checklist, score overrides, unlock, approve lock) | Process enrichment beyond baseline diagnostic |
| Action plans / benefit tracking | Post-assessment execution (SOMOD-adjacent) |
| Full recommendation editor UX polish | Listed as next sprint in PROJECT_SCOPE |
| Multi-report PDF types | Explicitly next phase in PROJECT_SCOPE |
| BullMQ workers | Infra enhancement |
| MFA / enterprise hardening | Security roadmap |
| SOMOD scenario/optimisation engines | Separate product — **not present** (correct) |

Phase 3 only needs **structured results** Phase 4 can consume. Today `ScoreSnapshot` + `Recommendation` + `Finding` + evidence metadata **do** provide a structured payload for executive summary / leakage / opportunity / recommendations — **for SCLI**. A Master Catalogue model would need equivalent structured persistence (likely compatible with extending the same tables).

---

## 10. Recommended next development order

**Do not implement yet — priorities only:**

1. **P1 — Product decision:** Confirm SCLI vs MOSS Master Catalogue relationship for Phase 3.
2. **P2 — Catalogue mapping:** Import/seed 14 domains × 100 controls with stable IDs (new questionnaire version; do not silently mutate published SCLI 1.1).
3. **P3 — Scoring service alignment:** Implement 0–4 control scores + domain/overall aggregation per client rules (keep SCLI engine versioned separately if both must coexist).
4. **P4 — Assessment model gaps:** Add Site (if required); ensure session metadata matches Phase 3 contract.
5. **P5 — Leakage engine (control-aware):** Map controls/events to financial outputs only where client methodology exists; retain SCLI leakage for current commercial path.
6. **P6 — Recommendation engine:** Generate from failed/low-maturity controls + configurable rules.
7. **P7 — Results dashboard:** Bind Master Catalogue domain/control views; keep current SCLI aggregations for existing assessments.
8. **P8 — Persistence hygiene:** Introduce proper Prisma migrations for MOSS (ops), without touching Repository.

---

## 11. Assessment management detail

| Capability | Classification | Code reference |
|------------|----------------|----------------|
| Create assessment | COMPLETE | `assessments.controller.ts` `POST /`; `assessments.service.ts` `create` |
| Assessment ID / reference | COMPLETE | `AssessmentSession.reference` |
| Title | COMPLETE | `title` field + Patch |
| Organisation/client | COMPLETE | `organisationId` |
| Site | MISSING | No model |
| Assessor | COMPLETE | `createdById` + `AssessmentAssignment` |
| Assessment date | PARTIAL | `createdAt` / `submittedAt` only |
| Status | COMPLETE | `AssessmentStatus` enum |
| Draft | COMPLETE | default `DRAFT` |
| Resume | COMPLETE | get + public resume |
| Save progress | COMPLETE | saveInput / saveResponse |
| Complete | COMPLETE | evaluate / submit |
| History | COMPLETE | list + dashboard |
| Version / reassessment | PARTIAL | `parentAssessmentId`; limited UI |
| Multiple per org | COMPLETE | Many sessions per `organisationId` |

---

## 12. Questionnaire / control assessment detail

| Capability | Status |
|------------|--------|
| 14 domain navigation | MISSING (5 SCLI categories instead) |
| Control navigation | PARTIAL as Q1–Q20 |
| Question rendering | COMPLETE — from API/config |
| Progress tracking | PARTIAL — completion implied by required field checks |
| Response capture | COMPLETE |
| Notes/comments | COMPLETE (`comment` on response) |
| Thresholds | PARTIAL — risk bands on overall score; option scores in catalogue |
| Evidence requirements | PARTIAL — hints + upload; not hard per-control gates for all |
| Evidence upload | COMPLETE |
| Findings | PARTIAL — pilot Finding model/workflow |
| Control status | PARTIAL — assessment/evidence statuses, not MOSS control lifecycle |
| Score selection | COMPLETE for SCLI options |
| Prev/next navigation | PARTIAL — wizard/sections in assessment & `/start` |
| Autosave | PARTIAL — explicit save on change via API patches (sectioned UX) |

Questions are **generated from configuration** (seeded methodology), **not** one hard-coded screen per control.

---

## 13. Scoring engine — where formulas live

| Concern | Location | Scale |
|---------|----------|-------|
| Overall / category risk | `moss/packages/shared/src/scoring.ts` → `calculateAssessmentScore` | 0–100 |
| Risk bands | same + `METHODOLOGY.md` | Controlled/Moderate/High/Critical |
| Leakage | `moss/packages/shared/src/leakage.ts` | Rates + ZAR values |
| Opportunity | `moss/packages/shared/src/opportunity.ts` | 0–100 commercial |
| Evidence confidence | `moss/packages/shared/src/confidence.ts` | 0–1-ish |
| Orchestration | `moss/apps/api/src/assessments/assessments.service.ts` `evaluate()` | Persists `ScoreSnapshot` |
| Option scores | DB `ResponseOption.riskScore` from seed | Per answer |
| Weights | DB `Question.weight` | Decimal |
| Assumptions | DB `CalibrationAssumption` | Drive leakage caps/weights |
| Frontend | Displays snapshot results; **does not** re-implement core leakage math for evaluate | |

Automatic scoring on evaluate; analyst override fields exist (`analystOverrideRisk`, `ScoreOverride`).

**MOSS 0–4:** not implemented — **CLIENT RULE / FORMULA REQUIRED** if mandated.

---

## 14. Financial / leakage engine

| Capability | Classification |
|------------|----------------|
| Financial / calibration inputs C1–C23 | COMPLETE (SCLI) |
| Contract value | COMPLETE (`C5`) |
| Guard / premises / coverage inputs | COMPLETE |
| Event counts / unit costs / severity multipliers per control | MISSING |
| Control financial mappings (DEP-02 → missed_shift) | MISSING |
| Leakage min/likely/max + recoverable | COMPLETE (SCLI aggregate) |
| Annualised leakage | COMPLETE (rates × annual contract) |
| Opportunity value | COMPLETE (score; not full SOMOD scenarios) |

**OUT OF SCOPE for this audit’s Phase 3 defect list:** full SOMOD Current/Risk-Aligned/Cost-Efficient scenario engine (not present).

---

## 15. Recommendation engine

| Aspect | Current behaviour |
|--------|-------------------|
| Source | `RecommendationRule` rows (9 codes) triggered when answer risk ≥ `triggerMinRisk` |
| Not from | Full failed-control Master Catalogue library |
| Fields stored | title, category, priority, summary, originalSummary, serviceOffering, status |
| Analyst edit | Workflow `PATCH /recommendations/:id`, add custom recommendations |
| AI-generated | No |
| Static text | Rule templates from seed JSON |

---

## 16. Results / dashboard

| UI element | Real or mock? |
|------------|---------------|
| Counts by status | **Real** — computed from `/assessments` |
| Average / distribution of risk scores | **Real** — from latest `scoreSnapshots` |
| Leakage totals on cards | **Real** — from `leakageResult` on snapshots |
| Risk band donuts | **Real** |
| Email/CRM failure widgets | **Real** when endpoints succeed (else empty catch) |
| Hard-coded overall “78%” score | **Not found** as a static KPI (78% appears only as chart SVG radius styling) |

---

## 17. Database quality (MOSS only)

**Present models (relevant):** User, Organisation, Membership, Questionnaire, QuestionnaireVersion, AssessmentInputDefinition, Question, ResponseOption, CalibrationAssumption, AssessmentSession, AssessmentAssignment, AssessmentInputValue, AssessmentResponse, ScoreSnapshot, ScoreOverride, EvidenceDocument, Finding, RecommendationRule, Recommendation, QaChecklistItem, ActionItem, Report, CrmSyncRecord, EmailJob, SystemSetting, AuditEvent, PublicLead, ContactSubmission.

**Missing for Master Catalogue Phase 3:** Domain entity (uses string `category`), Control entity distinct from Question (could reuse Question), Site, control-event financial mapping tables.

**JSON blobs:** `ScoreSnapshot.categoryScores`, `leakageResult`, `calculationTrace`; input `value` Json — acceptable for engine output; catalogue itself is normalised tables.

**Migrations:** `prisma/migrations` empty — **potentially dangerous** for prod change control (`db push --accept-data-loss` in scripts). Report only.

**Unused / thin:** Some pilot entities may be lightly used in UI (e.g. actions page not in primary nav).

---

## 18. API implementation (grouped)

### Assessments
| Endpoint | Implemented | Used by FE | Persisted | Notes |
|----------|-------------|------------|-----------|-------|
| GET /assessments | Yes | Dashboard, lists | Yes | Role-scoped |
| POST /assessments | Yes | New assessment | Yes | Auth + roles guard |
| GET /assessments/:id | Yes | Detail | Yes | |
| PATCH /assessments/:id | Yes | Admin | Yes | SUPER_ADMIN / METHODOLOGY_ADMIN |
| DELETE /assessments/:id | Yes | Admin | Yes | |
| PATCH …/inputs/:code | Yes | Assessment UI | Yes | |
| PATCH …/responses/:code | Yes | Assessment UI | Yes | |
| POST …/evaluate | Yes | Assessment UI | ScoreSnapshot + recs | |
| POST …/submit | Yes | Assessment UI | + CRM queue | |

### Questionnaires / methodology
| Endpoint | Status |
|----------|--------|
| GET /questionnaires, GET /:code | Implemented; used by admin/assessment |
| CRUD questions/inputs/assumptions (admin) | Implemented |

### Workflow / recommendations / review
| Endpoint | Status |
|----------|--------|
| analyst queue, assignments, transition, review-note, mark-reviewed, return, approve, unlock | Implemented; review UI |
| PATCH recommendations; POST custom recommendations | Implemented |

### Evidence / reports / financials
| Area | Status |
|------|--------|
| Evidence upload/list/status/download | Implemented |
| Report generate/issue | Implemented (Phase 4-leaning) |
| Dedicated FINANCIALS controller | **None** — financials computed inside evaluate |

### Public
| Endpoint | Status |
|----------|--------|
| contact, start, leads, resume, progress, complete-assessment | Implemented — WordPress/public funnel |

### Auth / admin / health / CRM / actions / audit / settings / users
Implemented for Lean MVP operations; protected by JWT + RolesGuard patterns.

Authorization: internal roles vs organisation membership enforced in `AssessmentsService.checkAccess`.

---

## 19. UI routes

| Route | Status | Notes |
|-------|--------|-------|
| `/` | COMPLETE | Marketing/shell entry |
| `/login`, `/auth/complete` | COMPLETE | SSO |
| `/start` | COMPLETE | Public SCLI wizard |
| `/dashboard` | COMPLETE | Real aggregations |
| `/organisations`, `/organisations/[id]` | COMPLETE | |
| `/assessments`, `/new`, `/[id]`, `/assigned`, `/[id]/review` | COMPLETE / PARTIAL | Core flow real; review is rich pilot UX |
| `/reports`, `/reports/[id]` | COMPLETE | Phase 4-leaning |
| `/actions` | PARTIAL | Works via API; **not in main NAV_SECTIONS** |
| `/settings`, `/settings/integrations` | COMPLETE | SMTP / EspoCRM |
| `/admin/methodology`, `/assumptions`, `/emails`, `/audit-logs`, `/users` | COMPLETE / PARTIAL | Assumptions lean read-only posture |

---

## 20. Security and roles (existing only)

Prisma `SystemRole`: SUPER_ADMIN, METHODOLOGY_ADMIN, ANALYST, REVIEWER, SALES, CLIENT_*, AUDITOR.

Lean helpers map Admin / Analyst / Client-style access (`moss/apps/api/src/common/roles.ts`).

| Check | Present? |
|-------|----------|
| Route protection (AuthGate) | Yes |
| API JWT + RolesGuard | Yes |
| Org membership for client users | Yes |
| Assessment ownership / assignment | Yes (creator + assignments) |
| Approval ability | Yes (workflow approve endpoints) |

Keycloak/SSO shared with platform — **not modified** in this audit.

---

## 21. Architecture fitness for MOSS 100-control model

| Requirement | Fit |
|-------------|-----|
| Versioned questionnaire catalogue | **Good** — publish new version; do not mutate SCLI 1.1 |
| 100 controls as Questions | **Feasible** |
| 14 domains | **Feasible** (category string or new Domain table) |
| 0–4 scores | **Needs new scoring module/version** — current shared scoring is 0–100 weighted risk |
| Per-control leakage events | **Needs new data model + engine** — current leakage is SCLI aggregate |
| Recommendations from control failures | **Feasible** via RecommendationRule expansion |
| Structured Phase 4 inputs | **Good pattern** already (`ScoreSnapshot`, recommendations JSON) |

---

## 22. Repository lock confirmation

Repository / Repository Gateway was treated as locked and no Repository code, schema, configuration, SOP, routing or workflow was modified during this audit.

Shared infrastructure (Keycloak, nginx, Docker, portal) was inspected for dependency reporting only and **was not changed**.

---

*End of audit. Awaiting approval before any MOSS implementation work.*
