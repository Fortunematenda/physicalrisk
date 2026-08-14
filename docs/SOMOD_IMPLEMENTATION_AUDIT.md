# SOMOD Implementation Audit

**Against:** SOMOD Master Developer Handoff Pack — Security Operating Model Optimisation Diagnostic v1.0  
**Original audit date:** 2026-08-14  
**P0 remediation update:** 2026-08-14  
**Scope:** Post-P0 local remediation — no live deployment  
**LIVE CHANGES MADE:** 0  
**Remediation report:** `docs/SOMOD_P0_REMEDIATION_IMPLEMENTATION_REPORT.md`

---

## Executive status (post-P0)

```
SOMOD PRODUCT FRAMEWORK: PARTIAL

ENGINE 1 — RISK & REQUIREMENT: PARTIAL — architecture/data capture implemented; client derivation methodology required
ENGINE 2 — DEPLOYMENT & CAPABILITY: PARTIAL — architecture/data capture implemented; client derivation methodology required
ENGINE 3 — TECHNOLOGY & SYSTEM CONTROL: PARTIAL — architecture/data capture implemented; substitution methodology required
ENGINE 4 — COST & EFFICIENCY: PARTIAL — CURRENT financial path governed; non-Current scenarios blocked
ENGINE 5 — OPTIMISATION & TRADE-OFF: PARTIAL — architecture only; BLOCKED — METHODOLOGY REQUIRED (α-blend disabled)

CURRENT SCENARIO: PARTIAL — working for entered current-state financials when inputs complete
RISK ALIGNED SCENARIO: BLOCKED — METHODOLOGY REQUIRED
COST EFFICIENT SCENARIO: BLOCKED — METHODOLOGY REQUIRED
RECOMMENDED OPTIMAL SCENARIO: BLOCKED — METHODOLOGY REQUIRED

FINANCIAL MODEL: PARTIAL
PENALTY LIBRARY: PARTIAL
CONTROL-FINANCIAL MAPPING: PARTIAL
CFO DASHBOARD: PARTIAL — no fake optimal/savings

APPROVAL WORKFLOW: PARTIAL — approver RBAC fixed; reopen requires reason
RBAC: PARTIAL — analyst cannot approve; formula edit gated
AUDIT/GOVERNANCE: PARTIAL
MOSS INTEGRATION: PARTIAL — isolation maintained

UNSAFE PLACEHOLDER SCENARIOS: DISABLED (legacy rows marked LEGACY_PLACEHOLDER)
DYNAMIC FUNCTION() EVALUATION: REMOVED (safe expression evaluator)
CLIENT METHODOLOGY REQUIRED: YES
LIVE CHANGES MADE: 0
```

### One-line verdict

SOMOD is a **separate product** with a **production-safer financial CURRENT path**, **methodology gates**, **safe formulas**, and **engine architecture shells**. It is **not** a complete diagnostic until the **client methodology** is configured. Engines 1–3/5 must not be reported COMPLETE.

**Prior unsafe behaviour (multipliers / α-blend / invented supervisors / heuristic scores) is disabled and must not be treated as governed results.**

---

## 1. Product boundary

| Check | Result | Evidence |
|---|---|---|
| Separate from MOSS `AssessmentSession` | **PASS** | `SomodAssessment` dedicated aggregate; schema comment: not `AssessmentSession` / `ProductCode` — `moss/apps/api/prisma/schema.prisma` |
| Own assessment / session | **PASS** | `SomodAssessment` + `reference` |
| Client | **PARTIAL** | `organisationId` (not `client_id` / CRM client entity) |
| Site | **PASS** | `siteId` optional FK |
| Engagement | **MISSING** | No `engagementId` |
| Diagnostic title / version | **PASS** | `title`, `version` |
| Approval status | **PARTIAL** | Dual tracks: `SomodAssessmentStatus` (+ `RETURNED_FOR_CORRECTION`, `SUPERSEDED`) + `SomodFinancialLayerStatus` |
| Inputs / calculations / financial outputs / snapshots | **PARTIAL** | CURRENT financial path governed; Engines 1–3/5 gated |
| Findings / controls catalogue / recommendations | **MISSING** | No SOMOD findings/recommendations entities |
| MOSS link without overwrite | **PASS** | Optional `mossAssessmentId` → `AssessmentSession` read/validate only; no MOSS writes |

**Architectural coupling:** Soft FK only. Create/update validates linked session is `productCode === MOSS` and same organisation. No MOSS mutation found.

---

## 2. Five engines — end-to-end

### Shared pattern (all five)

| Layer | What exists |
|---|---|
| DB | JSON columns on `SomodAssessment` (+ financial output `calculationStatus`) |
| API | `PATCH /somod/assessments/:id/engines/:engineKey`; `GET .../methodology`; `GET .../engines/readiness` |
| UI | Engines panel — capture-only; methodology banners |
| Service calc | Engine shells return `METHODOLOGY_REQUIRED`; Engine 4 CURRENT via `SOMOD_FINANCIAL_V2` |
| Tests | Sanitize, financial V2, safe expr, RBAC |

Financial calculation may read deployment/cost JSON for **CURRENT only** — that is **not** full Engines 1–5 methodology.

### Engine 1 — Risk & Requirement

**Status: PARTIAL — architecture/data capture; BLOCKED — METHODOLOGY REQUIRED for derivation**

- Shell: `SomodRiskRequirementEngine`
- Capture: threats / assets / documented requirements / notes
- Does **not** invent residual risk or control coverage scores

### Engine 2 — Deployment & Capability

**Status: PARTIAL — architecture/data capture; BLOCKED — METHODOLOGY REQUIRED for derivation**

- Shell: `SomodDeploymentCapabilityEngine`
- Capture: headcount, supervisorCount (explicit), posts, shift patterns
- Does **not** invent staffing ratios or coverage scores

### Engine 3 — Technology & System Control

**Status: PARTIAL — architecture/data capture; BLOCKED — METHODOLOGY REQUIRED for substitution**

- Shell: `SomodTechnologyControlEngine`
- Capture: systems summary, capex, opex
- Does **not** invent camera→guard substitution ratios

### Engine 4 — Cost & Efficiency

**Status: PARTIAL (CURRENT working; other scenarios gated)**

- Governed financial model, penalties, mappings, CFO snapshot path retained
- Formula execution via safe expression evaluator
- Non-Current scenario financials: `METHODOLOGY_REQUIRED`

### Engine 5 — Optimisation & Trade-off

**Status: PARTIAL — architecture; BLOCKED — METHODOLOGY REQUIRED**

- Shell: `SomodOptimisationEngine`
- α-blend / preferredBalance production path **disabled**

---

## 3. Scenarios (post-P0)

| Scenario | Status |
|---|---|
| CURRENT | **PARTIAL / WORKING** for complete current-state financial inputs |
| RISK_ALIGNED | **BLOCKED — METHODOLOGY REQUIRED** |
| COST_EFFICIENT | **BLOCKED — METHODOLOGY REQUIRED** |
| RECOMMENDED_OPTIMAL | **BLOCKED — METHODOLOGY REQUIRED** |

Legacy multiplier-based rows: **`LEGACY_PLACEHOLDER`** — not approved results.

---

## 4. Security / governance (post-P0)

| Item | Status |
|---|---|
| Analyst approve | **FIXED** — denied |
| Consultant formula edit | **FIXED** — methodology admin only |
| Safe formulas | **FIXED** — no `Function()` |
| Stale results | **PARTIAL** — `financialStale`; approve blocked when stale |
| Approval lock / reopen reason | **PARTIAL** — financial layer reopen requires reason + audit |
| Audit events | **PARTIAL** — key financial/workflow events present |

---

## 5. Remaining gaps (honest)

- Full normalized Engine 1–3 persistence model
- DB-backed formula registry table (types/slots only today)
- Complete assessment-level state machine using all new enum values
- True optimisation once client objective/constraints exist
- Broader API integration test coverage

**Do not mark Engines 1–3 or 5 COMPLETE until governed calculations exist.**

---

## Original audit narrative

The sections below preserve the original 2026-08-14 inspection narrative for historical reference. Where they conflict with the post-P0 executive status above, **the post-P0 status wins**.

---

## 1. Product boundary (original)

| Check | Result | Evidence |
|---|---|---|
| Separate from MOSS `AssessmentSession` | **PASS** | `SomodAssessment` dedicated aggregate; schema comment: not `AssessmentSession` / `ProductCode` — `moss/apps/api/prisma/schema.prisma` |
| Own assessment / session | **PASS** | `SomodAssessment` + `reference` |
| Client | **PARTIAL** | `organisationId` (not `client_id` / CRM client entity) |
| Site | **PASS** | `siteId` optional FK |
| Engagement | **MISSING** | No `engagementId` |
| Diagnostic title / version | **PASS** | `title`, `version` |
| Approval status | **PARTIAL** | Dual tracks: `SomodAssessmentStatus` + `SomodFinancialLayerStatus`; not identical to handoff enum |
| Inputs / calculations / financial outputs / snapshots | **PARTIAL** | Financial path exists; engine calculations do not |
| Findings / controls catalogue / recommendations | **MISSING** | No SOMOD findings/recommendations entities |
| MOSS link without overwrite | **PASS** | Optional `mossAssessmentId` → `AssessmentSession` read/validate only; no MOSS writes |

**Architectural coupling:** Soft FK only. Create/update validates linked session is `productCode === MOSS` and same organisation. No MOSS mutation found.

---

## 2. Five engines — end-to-end (original)

### Shared pattern (all five)

| Layer | What exists |
|---|---|
| DB | JSON columns on `SomodAssessment` |
| API | `PATCH /somod/assessments/:id/engines/:engineKey` |
| UI | Engines panel on workspace |
| Service calc | **None** — `sanitizeEnginePayload` only (`moss/apps/api/src/somod/engines/somod-engines.ts`) |
| Tests | Sanitize clamp tests only |

Financial calculation later **reads a subset** of those JSON fields via `readEngines()` — that is **not** Engines 1–5 as specified.

### Engine 1 — Risk and Requirement — **NOT IMPLEMENTED**

| Required | Status |
|---|---|
| Derive required functions from threats, assets, operations, layout, rules, controls, time bands, operational flow, MOSS/site requirements | **MISSING** — no structures |
| Persisted inputs | **PARTIAL** — `residualRisk`, `controlCoverage`, `notes` only |
| Calculation service | **MISSING** |
| Tests of derivation | **MISSING** |

### Engine 2 — Deployment and Capability — **NOT IMPLEMENTED**

| Required | Status |
|---|---|
| Posts, shifts, grades, supervision, equipment, mobility, response | **MISSING** |
| Current vs required deployment / gaps / over-under deployment | **MISSING** |
| Persisted inputs | **PARTIAL** — `headcount`, `coveragePercent` (coverage **unused** by financial calc) |
| Supervisor count | **INCORRECT / invented** — `max(1, round(headcount/10))` in formulas |

### Engine 3 — Technology and System Control — **NOT IMPLEMENTED**

| Required | Status |
|---|---|
| Manual / system / hybrid evaluation, substitution, people–process–tech balance | **MISSING** |
| Persisted inputs | **PARTIAL** — `automationPercent`, `techDebt` (`techDebt` **unused** by calc) |
| Impact on deployment and cost via real tech model | **MISSING** — only scalar factor multipliers later |

### Engine 4 — Cost and Efficiency — **PARTIAL**

| Required | Status |
|---|---|
| Governed financial service | **PARTIAL** — `calculateScenarioFinancials` + DB financial layer |
| Manpower / technology / penalty / leakage / recoverable / totals / CAPEX / payback | **PARTIAL** — computed from financial model + engine scalars + **unapproved scenario factors** |
| Leakage/events/SLA as dedicated loads | **MISSING** — only engine JSON fields |
| UI-only calc | **PASS** — calc is server-side |

### Engine 5 — Optimisation and Trade-off — **PARTIAL**

| Required | Status |
|---|---|
| Compare alternative operating models with risk, capability, tech, finance, effectiveness, constraints | **PARTIAL / INCORRECT** |
| Explain why Recommended Optimal wins | **MISSING** — no trade-off narrative/analysis object |
| Implementation | **`scenarioFactors()` hardcoded multipliers** + **alpha blend** (0.7 / 0.5 / 0.3 by `preferredBalance`) |

**UNSAFE / PLACEHOLDER — NOT PRODUCTION READY**

```text
RISK_ALIGNED:   manpower 1.12, tech 1.15, leakage 0.55, penalty 0.5, capex 1.25, …
COST_EFFICIENT: manpower 0.78, tech 1.35, leakage 1.05, …
RECOMMENDED_OPTIMAL: mix(Risk, Cost, α)
```

File: `moss/apps/api/src/somod/financial/somod-financial-formulas.ts` (`scenarioFactors`).

---

## 3. Four scenarios

| Scenario | Generation | Persistence | API | UI | Financial metrics | Real engine logic |
|---|---|---|---|---|---|---|
| Current | Factor = 1.0 passthrough of inputs | `SomodScenarioFinancialOutput` | `GET …/scenario-financials` | Screen D | Yes | **No** (uses same pipeline) |
| Risk Aligned | Hardcoded uplift factors | Same | Same | Same | Yes | **No** |
| Cost Efficient | Hardcoded cost factors | Same | Same | Same | Yes | **No** |
| Recommended Optimal | Alpha blend of Risk + Cost factors | Same | Same | Screen E compares Current vs Optimal | Yes | **No** — not an optimiser |

`SomodScenario` table exists but is **not populated** by create/evaluate flows anymore (shell only).

Current vs Recommended Optimal on CFO: **implemented** when calculate succeeds (`SomodCfoDashboardSnapshot` + Screen E gate).

---

## 4. Root data model matrix

| Handoff field | Status | Exact location |
|---|---|---|
| `somod_id` | COMPLETE | `SomodAssessment.id` |
| `client_id` | PARTIAL (differently named) | `organisationId` |
| `site_id` | COMPLETE | `siteId` |
| `engagement_id` | MISSING | — |
| `diagnostic_title` | COMPLETE | `title` |
| `version` | COMPLETE | `version` |
| `approval_status` | PARTIAL | `status` + `financialLayerStatus` |
| `site_context` | MISSING | — |
| `threats` | MISSING | — |
| `assets` | MISSING | — |
| `site_layout` | MISSING | — |
| `operational_flow` | MISSING | — |
| `security_rules` | MISSING | — |
| `time_bands` | MISSING | — |
| `documents` | MISSING | PDF export to MinIO only (not document library) |
| `current_state_model` | MISSING | — |
| `technology_capabilities` | PARTIAL | `technologyJson` scalars |
| `cost_inputs` / `financial_model` | PARTIAL | `SomodFinancialModel` |
| `penalty_library` | PARTIAL | `SomodPenaltyLibrary` |
| `control_financial_mappings` | PARTIAL | `SomodControlFinancialMapping` |
| `derived_required_model` | MISSING | — |
| `cost_efficient_model` | MISSING | Only financial output row |
| `recommended_optimal_model` | MISSING | Only financial output row |
| `scenario_financial_outputs` | PARTIAL | `SomodScenarioFinancialOutput` |
| `cfo_dashboard` | PARTIAL | `SomodCfoDashboardSnapshot` |
| `trade_off_analysis` | PARTIAL | `preferredBalance` only |
| `controls` | PARTIAL | String `controlId` on mappings; no SOMOD control catalogue |
| `findings` | MISSING | — |
| `outputs` | PARTIAL | Financial outputs + report PDF |

---

## 5. Database audit

| Handoff table | Prisma model / physical table | Status |
|---|---|---|
| `somod_assessments` | `SomodAssessment` | PRESENT (PascalCase; no `@@map`) |
| `somod_financial_models` | `SomodFinancialModel` | PRESENT — **not** flattened into generic settings |
| `somod_penalty_library` | `SomodPenaltyLibrary` | PRESENT |
| `somod_control_financial_mappings` | `SomodControlFinancialMapping` | PRESENT |
| `somod_scenario_financial_outputs` | `SomodScenarioFinancialOutput` | PRESENT |
| `somod_cfo_dashboard_snapshots` | `SomodCfoDashboardSnapshot` | PRESENT |
| (extra) | `SomodScenario` | PRESENT but unused in runtime calc |

**Migrations:**  
`20260813220000_somod_m0_foundation`, `20260814120000_somod_m1_scenarios`, `20260814140000_somod_method_v1_recommended_optimal`, `20260814160000_somod_financial_layer_handoff`.

**FKs / cascade:** Financial children cascade delete with assessment; MOSS link `onDelete: SetNull`.

**Gaps:** No engagement FK; no snapshot version chain / superseded; financial enum value `LOCKED` never written (approve sets `APPROVED` + `isLocked` on snapshots).

---

## 6. Financial model

| Input | DB / API | Derived |
|---|---|---|
| currency, monthly_guard_cost, monthly_supervisor_cost, days_per_month, shift_hours, response_delay_cost_rate, default_incident_severity_multiplier, monthly_contract_value, patrol_value_per_miss, technology_capex_total, technology_monthly_opex, technology_lifespan_months | **COMPLETE** on `SomodFinancialModel` + Screen A | — |
| daily_guard_cost, hourly_guard_cost, monthly_technology_equivalent_cost | **COMPLETE** via `deriveFinancialVariables` (read-only in UI) | Server-side |

Validation (§9) implemented in `validateFinancialSetup` (backend). Frontend shows required asterisks only — **authoritative validation is backend**.

---

## 7. Penalty library

| Requirement | Status |
|---|---|
| Name, metric, threshold, unit, formula, active | **PARTIAL** — present |
| Applies to domains | **MISSING** column |
| Applies to controls | **PARTIAL** — `appliesToControlId` singular |
| Consultants cannot edit governed formulas | **PASS** (backend) — non-admin cannot change `formulaExpression` on governed rows |
| Client-specific rules | **PARTIAL** — `createPenalty` allows non-governed formula set by creator |
| Audited changes | **PASS** — `SOMOD_PENALTY_*` audit events |
| Screen B edit UX | View-only (API create/patch exist without full UI) |

---

## 8. Control financial mapping

| Field | Status |
|---|---|
| control_id, financial_relevance, cost_category, event_unit, exposure_formula, penalty_id, recoverable_formula, cfo_output_category | **COMPLETE** on model |
| Mandatory fields when financially relevant | **PASS** backend `validateControlMapping` + calculate gate |
| Screen C | **PARTIAL** — read-only table; create/patch API exist |

Default seed mappings: `DEP-02`, `DEP-05`, `OPS-01` (not a full control catalogue).

---

## 9. API audit (handoff §7)

Base: Nest `@Controller('somod')` → `/api/somod/...`  
Controllers: `somod-financial.controller.ts`, `somod-assessments.controller.ts`  
Auth: `JwtAuthGuard` + `RolesGuard` on both.

| Handoff endpoint | Implemented route | Service | DTO validation | Auth beyond login | Persist | Tests | Status |
|---|---|---|---|---|---|---|---|
| POST financial-model | `POST /somod/:id/financial-model` | `upsertFinancialModel` | class-validator optional numbers | Assessment access + financial editable | Yes | Formula unit only | PARTIAL |
| GET financial-model | `GET /somod/:id/financial-model` | `getFinancialModel` | — | Access | Read | No | PARTIAL |
| PATCH financial-model | `PATCH /somod/:id/financial-model` | same upsert | same | same | Yes | No | PARTIAL |
| GET penalties | `GET /somod/:id/penalties` | `listPenalties` | — | Access | Read | No | PARTIAL |
| POST penalties | `POST /somod/:id/penalties` | `createPenalty` | loose optional DTO | Access + editable | Yes | No | PARTIAL |
| PATCH penalties/:id | `PATCH /somod/:id/penalties/:penaltyId` | `updatePenalty` | same | Formula locked for non-admin governed | Yes | No | PARTIAL |
| GET mappings | `GET /somod/:id/control-financial-mappings` | `listMappings` | — | Access | Read | No | PARTIAL |
| POST mappings | `POST /somod/:id/control-financial-mappings` | `createMapping` | mapping validation in service | Access | Yes | No | PARTIAL |
| PATCH mappings/:id | `PATCH …/control-financial-mappings/:mappingId` | `updateMapping` | same | Access | Yes | No | PARTIAL |
| POST calculate-financials | `POST /somod/:id/calculate-financials` | `calculateFinancials` | service validation | Editable gate | Outputs + CFO snapshot | Formula unit | PARTIAL |
| GET scenario-financials | `GET /somod/:id/scenario-financials` | `getScenarioFinancials` | — | Access | Read | No | PARTIAL |
| GET cfo-dashboard | `GET /somod/:id/cfo-dashboard` | `getCfoDashboard` | Requires Current + Optimal | Access | Read | No | PARTIAL |

### `calculate-financials` checklist (§7.1)

| Step | Status |
|---|---|
| 1 Load financial model | YES |
| 2 Load control mappings | YES (+ penalties) |
| 3 Load leakage/events | **PARTIAL** — engine JSON only, no event store |
| 4 Load deployment model | **PARTIAL** — `headcount` JSON only |
| 5 Load technology model | **PARTIAL** — `automationPercent` + financial CAPEX/OPEX |
| 6 Load SLA metrics | **MISSING** as entity — delay minutes from JSON |
| 7–11 Exposure / expected / applied / recoverable | **PARTIAL** — via governed expressions + factors |
| 12 Aggregate four scenarios | YES (with unapproved factors) |
| 13 Store outputs | YES |
| 14 CFO snapshot | YES |

---

## 10. UI audit (Screens A–E)

| Screen | Status | Backend traced? | Notes |
|---|---|---|---|
| A Financial Setup | **PARTIAL / working** | Yes → financial-model | Editable inputs + read-only derived |
| B Penalty Library | **PARTIAL** | Yes → GET penalties | View-only; no consultant formula edit UI |
| C Control Financial Mapping | **PARTIAL** | Yes → GET mappings | View-only table |
| D Scenario Financial Outputs | **PARTIAL** | Yes → scenario-financials | Shows four types after calculate |
| E CFO Dashboard | **PARTIAL** | Yes → cfo-dashboard | Gate until Current + Optimal; Current vs Optimal shown |

Workspace panels: **Engines | Financial | Summary** (`moss/apps/web/app/somod/assessments/[id]/page.tsx`).  
Calculate button → `POST /somod/{id}/calculate-financials` (live).

Not static mock API data — but **results quality is placeholder methodology**.

---

## 11. Validation rules

| Rule | Backend | Frontend | Status |
|---|---|---|---|
| Calc requires valid financial inputs | YES | Error from API | COMPLETE (BE) |
| days_per_month 28–31 | YES | Cosmetic `*` | COMPLETE (BE) |
| shift_hours >0 ≤24 | YES | Cosmetic | COMPLETE (BE) |
| CAPEX ⇒ lifespan mandatory | YES | Cosmetic | COMPLETE (BE) |
| Financially relevant mapping fields | YES | No client check | COMPLETE (BE) |
| CFO needs Current + Optimal | YES | Message if not ready | COMPLETE |
| Inputs change ⇒ stale | YES (`financialStale`) | Banner via status | COMPLETE |
| Stale requires recalc | YES (submit/CFO/approve gates) | Partial UX | PARTIAL |
| Non-negative leakage / recoverable | YES `clampNonNeg` | — | COMPLETE |
| Validation only client-side | — | **No** for these rules | N/A |

---

## 12. Approval workflow

| Handoff | Implemented | Gap |
|---|---|---|
| Draft | `DRAFT` / `IN_PROGRESS` (+ financial `DRAFT`/`CALCULATED`) | Dual tracks |
| In review | Assessment `SUBMITTED`/`REVIEWED`; financial `IN_REVIEW` | Split |
| Returned for correction | Assessment → `IN_PROGRESS`; financial `RETURNED` | Naming / dual |
| Approved | Both have `APPROVED` | — |
| Superseded | **MISSING** | — |
| Archived | Assessment `ARCHIVED` | Financial no archive |

| Step | Status |
|---|---|
| Consultant inputs + review penalties | PARTIAL |
| Run calculation + scenarios + CFO snapshot | PARTIAL (placeholder math) |
| Reviewer approve/return financial | PARTIAL — API yes; limited UI (approve/submit buttons; no return/reopen UI) |
| Lock on approve | PARTIAL — snapshots `isLocked=true`; prior snapshots not rewritten |
| Admin reopen + reason + audit | PARTIAL — API yes; no UI |

---

## 13. RBAC

| Role expectation | Backend reality |
|---|---|
| Consultant edit inputs / run calc | YES if assessment accessible and financial editable |
| Consultant must not edit governed formulas | YES for governed PATCH |
| Consultant must not approve | Assessment/financial approve require `ANALYST_ROLES` (includes ANALYST, REVIEWER, SUPER_ADMIN) — **ANALYST can approve** (may be wider than “Reviewer only”) |
| Reviewer approve/return | YES via ANALYST_ROLES |
| Admin reopen with reason | YES `SUPER_ADMIN` / `METHODOLOGY_ADMIN` |
| Consultant create non-governed penalty with formula | **ALLOWED** — governance soft spot |

Disabled UI ≠ enforcement: formula lock is enforced server-side for governed rows.

---

## 14. Governance

| Rule | Status | Priority |
|---|---|---|
| Formulas centrally governed / not assessment-editable | PARTIAL (governed yes; non-governed create allows formula) | HIGH |
| Setup / mapping / penalty / approve / reopen audited | PASS for those actions | — |
| Approved snapshots historically visible + immutable money | PARTIAL — new calc appends; locked rows not updated; reopen allows new unlocked snapshot | HIGH |
| System-derived override manual proposals | PARTIAL — derived costs read-only; no general conflict resolver | MEDIUM |
| Unapproved scenarioFactors in production path | **FAIL** — silent methodology invention | **HIGH** |

---

## 15. MOSS / SOMOD relationship

| Capability | Status |
|---|---|
| Optional link to MOSS assessment | YES `mossAssessmentId` |
| Consume MOSS controls / maturity / findings / catalogue into SOMOD engines | **MISSING** |
| Automatic MOSS→SOMOD formula | **Absent** (correct — methodology not defined) |
| Mutate MOSS | **No** |
| Separate IDs / snapshots | **Yes** |

---

## 16. Documented security requirements

Policies, SOPs, MOSS, site procedures, contractual/SLA documents as first-class SOMOD influencers: **MISSING**.  
MOSS link is reference-only; no document library / rule engine binding.

---

## 17. Testing

| Area | Coverage |
|---|---|
| Unit — formulas / sanitize | YES — 10 tests passing (`vitest run src/somod`, 2026-08-14) |
| API / controller | **MISSING** |
| Permission / approval lock | **MISSING** |
| Stale / snapshot immutability | **MISSING** |
| Audit | **MISSING** |
| Scenario acceptance / negative values (unit only) | PARTIAL — clamp covered in formula tests |
| MOSS isolation | **MISSING** |

Local run: **10/10 passed**. Insufficient for UAT of full product.

---

## 18. Mock / placeholder detection

| Item | Classification |
|---|---|
| `scenarioFactors()` multipliers | **UNSAFE / PLACEHOLDER — NOT PRODUCTION READY** |
| Recommended Optimal α blend | **UNSAFE / PLACEHOLDER — NOT PRODUCTION READY** |
| Effectiveness / riskPosition heuristics | **UNSAFE / PLACEHOLDER — NOT PRODUCTION READY** |
| Fallback 0.35 / 0.4 leakage paths | **UNSAFE / PLACEHOLDER — NOT PRODUCTION READY** |
| Default engine numbers (55/60/20/…) | Defaults for empty forms — OK as UX, not methodology |
| `evaluateGovernedExpression` via `Function()` | Constrained identifier whitelist — acceptable with governance, still HIGH review |
| Unused `SomodScenario` shell | Dead schema weight |
| TODO/FIXME/stub in somod/ | None found post Method V1 removal |

---

## 19. Methodology safety

**CLIENT METHODOLOGY REQUIRED: YES** for:

- Engine 1–3 derivation rules  
- Scenario optimisation weights / constraints  
- Effectiveness and risk-position scoring  
- Technology/manpower substitution ratios  
- Any automatic MOSS→SOMOD mapping  
- Full penalty domain applicability rules  

Do **not** treat current `scenarioFactors` as approved. Classify remaining engine work as:

**TECHNICALLY READY — CLIENT METHODOLOGY REQUIRED** (financial plumbing)  
**NOT READY** (Engines 1–3 and true optimisation).

---

# Implementation matrix

| Requirement | Status | Backend | Database | API | UI | Tests | Evidence/File | Gap | Recommended Action |
|---|---|---|---|---|---|---|---|---|---|
| Separate SOMOD product | COMPLETE | Y | Y | Y | Y | Partial | `SomodAssessment` | Naming client vs org | Keep |
| Engine 1 Risk & Requirement | NOT IMPLEMENTED | N | N | Input only | Form | N | JSON only | No derivation model | Spec + methodology then build |
| Engine 2 Deployment & Capability | NOT IMPLEMENTED | N | N | Input only | Form | N | headcount only | No posts/shifts/gaps | Spec + methodology |
| Engine 3 Technology & System | NOT IMPLEMENTED | N | N | Input only | Form | N | automation only | No substitution model | Spec + methodology |
| Engine 4 Cost & Efficiency | PARTIAL | Y | Y | Y | Y | Unit | `somod-financial-*` | Incomplete event/SLA loads; placeholder scenario factors | Replace factors with approved methodology |
| Engine 5 Optimisation & Trade-off | PARTIAL | Y | N | Via calc | Screen D/E | Unit | `scenarioFactors` + α | Not real optimisation | Client optimiser rules |
| Scenario Current | PARTIAL | Y | Y | Y | Y | Unit | Financial output | No engine-backed model | After engines |
| Scenario Risk Aligned | PARTIAL | Y | Y | Y | Y | Unit | Hardcoded factors | Placeholder | Methodology |
| Scenario Cost Efficient | PARTIAL | Y | Y | Y | Y | Unit | Hardcoded factors | Placeholder | Methodology |
| Scenario Recommended Optimal | PARTIAL | Y | Y | Y | Y | Unit | α blend | Placeholder | Methodology |
| Current vs Optimal CFO | PARTIAL | Y | Y | Y | Y | N | Snapshot + Screen E | Depends on placeholder math | Lock methodology then UAT |
| Financial model + derived | PARTIAL | Y | Y | Y | Y | Unit | `SomodFinancialModel` | — | Harden tests |
| Penalty library | PARTIAL | Y | Y | Y | Read-only | N | `SomodPenaltyLibrary` | Domains; UI editors | Extend + UI |
| Control-financial mapping | PARTIAL | Y | Y | Y | Read-only | N | mappings model | Control catalogue | Link MOSS/controls |
| CFO dashboard | PARTIAL | Y | Y | Y | Y | N | Snapshot | Methodology trust | Label provisional until sign-off |
| §7 REST surface | PARTIAL | Y | — | Y | Y | N | financial controller | Extra workflow routes OK | Add API tests |
| Validation §9 | PARTIAL | Y | — | — | Weak FE | Unit | `validateFinancialSetup` | FE optional | Keep BE authoritative |
| Approval workflow | PARTIAL | Y | Y | Y | Partial | N | Dual statuses | No superseded; split tracks | Unify to handoff enum |
| RBAC | PARTIAL | Y | — | — | Partial | N | `hasRole` | ANALYST can approve; non-governed formula create | Tighten roles |
| Audit / governance | PARTIAL | Y | AuditEvent | — | — | N | `audit.record` | Snapshot reopen policy | Document + tests |
| MOSS integration | PARTIAL | Link only | FK | — | Link UI | N | `mossAssessmentId` | No controlled consume | Methodology first |
| Documents / findings / engagement | MISSING | N | N | N | N | N | — | Root model | Phase after engines |
| Financial not flattened | COMPLETE | Y | Y | — | — | — | Separate tables | — | Keep |

Status legend used: COMPLETE / PARTIAL / MISSING / INCORRECT / BLOCKED — METHODOLOGY REQUIRED  
(Items above use NOT IMPLEMENTED synonymously with MISSING for engines with forms only.)

---

# Priority gap list

## P0 — Blocking / Incorrect

1. **Unapproved scenarioFactors / α-blend / effectiveness heuristics presented as real SOMOD results** — false confidence / financial misstatement risk.  
2. **Engines 1–3 advertised in product architecture but perform no derivation** — architectural false completeness.  
3. **Recommended Optimal is not an optimiser** — violates Engine 5 / scenario intent.  
4. **ANALYST role can approve** financial and assessment layers — may violate Consultant vs Reviewer split.  
5. **Consultants can create non-governed penalties with free-form formulas** — governance hole.  
6. **`Function()` expression evaluator** — constrained but high-risk; needs hardened sandbox review.

## P1 — Required for SOMOD completion

1. Root data: engagement, threats, assets, site layout, operational flow, security rules, time bands, documents, findings, controls catalogue, trade-off analysis object.  
2. Real Engine 1–3 services + persistence + APIs + UI.  
3. Leakage/event and SLA metric stores feeding calculate (§7.1).  
4. Unified approval status including `returned_for_correction`, `superseded`.  
5. Screen B/C edit UX (allowed fields only) + financial return/reopen UI.  
6. API / permission / lock / stale / snapshot immutability tests.  
7. Documented-requirements linkage (policies/SOPs/MOSS/contracts) as rule inputs — methodology gated.

## P2 — UX / quality / hardening

1. Remove or stop exposing unused `SomodScenario` shell / dead fields.  
2. Frontend validation mirroring §9 (optional; BE remains source of truth).  
3. Clear UI badges: “results pending methodology sign-off” until factors approved.  
4. Snake_case table mapping (`@@map`) if DBA requires handoff names.  
5. Assign or remove unused `LOCKED` financial status.  
6. PDF report alignment polish.

---

# Implementation plan (do not execute yet)

| # | Task | Affected files | DB | API | UI | Tests | Dependency | Methodology? | Complexity |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Freeze/label placeholder factors; block production claims | `somod-financial-formulas.ts`, UI banners, docs | No | Optional flag | Banner | Unit | — | YES (until approved) | LOW |
| 2 | Tighten RBAC: Reviewer-only approve; block consultant formula on create | `somod-financial.service.ts`, assessments service | No | Auth | Buttons | Permission tests | — | Confirm role matrix | MEDIUM |
| 3 | Harden expression evaluator (no `Function`) | formulas service | No | — | — | Fuzz tests | — | Formula grammar | MEDIUM |
| 4 | Capture client-approved scenario & effectiveness coefficients | Config/versioned methodology table | Yes | Read | Display version | Acceptance | Task 1 | **YES** | HIGH |
| 5 | Replace `scenarioFactors` with approved config | formulas + seed | Maybe | — | Trace UI | Scenario tests | Task 4 | **YES** | HIGH |
| 6 | Design Engine 1 data model (threats/assets/…) | Prisma + migrations | Yes | CRUD | Forms | Model tests | Client schema | **YES** | HIGH |
| 7 | Implement Engine 1 calculation service | new engine service | Yes | Calc | Results | Unit/API | Task 6 | **YES** | HIGH |
| 8 | Engine 2 deployment model + gap analysis | schema + service | Yes | CRUD/calc | UI | Unit/API | Engine 1 outputs | **YES** | HIGH |
| 9 | Engine 3 technology substitution model | schema + service | Yes | CRUD/calc | UI | Unit/API | Engine 2 | **YES** | HIGH |
| 10 | Event/leakage/SLA stores; wire calculate §7.1 | schema + calculate | Yes | Extend | Capture UI | Integration | Engines | Partial | HIGH |
| 11 | True trade-off / Recommended Optimal optimiser | Engine 5 service | Yes | Calc | Explain UI | Acceptance | Tasks 4–10 | **YES** | HIGH |
| 12 | Unify / findings / engagement | schema + APIs | Yes | CRUD | Screens | Unit | Org/CRM | Partial | MEDIUM |
| 13 | Unify controls → requirements rules | rule engine | Yes | — | Link UI | Rule tests | Docs + Eng1 | **YES** | HIGH |
| 14 | Unify MOSS consume (read-only projections) | integration service | No mutate MOSS | Read APIs | Prefill optional | Isolation tests | Methodology | **YES** | MEDIUM |
| 15 | Unify Unify approval enum + superseded + lock UX | schema + workflow | Yes | Workflow | Summary | Workflow tests | — | Confirm names | MEDIUM |
| 16 | Complete Screens B/C editors (allowed fields) | FinancialPanels | No | Existing | Forms | E2E | RBAC task 2 | No | MEDIUM |
| 17 | Full test suite (API, RBAC, stale, snapshot, audit) | `*.spec.ts` | — | — | — | Expand | Stable APIs | No | MEDIUM |

---

# Local UAT notes

- SSO stack previously built with financial routes registered (`/api/somod/:id/financial-model`, `calculate-financials`, etc.).  
- Unit tests: **10/10 pass**.  
- Happy path (save setup → calculate → Screen D/E) is **technically operable**.  
- Results are **not methodology-certified** → **PASS WITH ISSUES**.

---

*End of audit. No code or live data was modified (`LIVE CHANGES MADE: 0`).*
