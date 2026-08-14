# SOMOD P0 Remediation — Implementation Report

**Date:** 2026-08-14  
**Scope:** Local production-safe technical framework only  
**Client methodology invented:** No  
**Live deployment:** 0  
**Repository push:** Not performed  

---

## Executive Summary

SOMOD P0 remediation converts the partial product shell into a **governed technical framework** that can accept client methodology later without redesign.

Unsafe placeholder scenario math (hardcoded multipliers, α-blend Recommended Optimal, invented supervisors/effectiveness/risk heuristics) is **disabled**. Non-Current scenarios return **`METHODOLOGY_REQUIRED`**. Dynamic `Function()` formula evaluation is **replaced** by a restricted expression evaluator. Analysts/consultants **cannot approve**. Consultants **cannot edit governed formula expressions**. Engines 1–3 and Engine 5 exist as architecture shells that refuse to invent methodology. Engine 4 Current financials remain calculable from entered cost and deployment inputs.

---

## Files Changed

### Backend (API)

| Path | Change |
|---|---|
| `moss/apps/api/src/somod/financial/somod-safe-expression.ts` | Safe tokenizer/parser (no `eval` / `Function`) |
| `moss/apps/api/src/somod/financial/somod-financial-formulas.ts` | `SOMOD_FINANCIAL_V2`; CURRENT-only calc; methodology gates; legacy `scenarioFactors` throws |
| `moss/apps/api/src/somod/financial/somod-financial.service.ts` | Persist `calculationStatus`; CFO null-safe; approve/reopen hardening; methodology endpoints |
| `moss/apps/api/src/somod/financial/somod-financial.controller.ts` | Methodology / engine readiness / reopen routes |
| `moss/apps/api/src/somod/methodology/somod-methodology.ts` | Readiness model + statuses |
| `moss/apps/api/src/somod/methodology/somod-methodology.service.ts` | Readiness service |
| `moss/apps/api/src/somod/methodology/somod-formula-registry.ts` | Formula definition types + UNCONFIGURED slots |
| `moss/apps/api/src/somod/engines/somod-risk-requirement.engine.ts` | Engine 1 shell → `METHODOLOGY_REQUIRED` |
| `moss/apps/api/src/somod/engines/somod-deployment-capability.engine.ts` | Engine 2 shell |
| `moss/apps/api/src/somod/engines/somod-technology-control.engine.ts` | Engine 3 shell |
| `moss/apps/api/src/somod/engines/somod-optimisation.engine.ts` | Engine 5 shell (no α-blend) |
| `moss/apps/api/src/somod/engines/somod-engines.ts` | Sanitize without invented scores/ratios |
| `moss/apps/api/src/somod/somod.module.ts` | Wire methodology + engines |
| `moss/apps/api/src/common/roles.ts` | `SOMOD_APPROVER_ROLES` = SUPER_ADMIN \| REVIEWER |
| `moss/apps/api/prisma/schema.prisma` | Status enums + `calculationStatus` / `methodologyMissing` |
| `moss/apps/api/prisma/migrations/20260814180000_somod_p0_remediation/migration.sql` | Migration + legacy placeholder mark |

### Frontend (Web)

| Path | Change |
|---|---|
| `moss/apps/web/app/somod/assessments/[id]/SomodFinancialPanels.tsx` | Methodology banner; scenario status labels; CFO no fake savings/optimal |
| `moss/apps/web/app/somod/assessments/[id]/page.tsx` | Engine capture forms without invented score fields; supervisor count |

### Tests

| Path | Change |
|---|---|
| `somod-financial-formulas.spec.ts` | Safe expr, CURRENT calc, methodology scenarios, no supervisor invent |
| `somod-rbac.spec.ts` | Analyst cannot approve |
| `somod-engines.spec.ts` | No invented defaults |

### Docs

| Path | Change |
|---|---|
| `docs/SOMOD_P0_REMEDIATION_IMPLEMENTATION_REPORT.md` | This report |
| `docs/SOMOD_IMPLEMENTATION_AUDIT.md` | Post-P0 status update |

---

## Database Changes

Migration: `20260814180000_somod_p0_remediation`

- `SomodAssessmentStatus`: add `RETURNED_FOR_CORRECTION`, `SUPERSEDED`
- `SomodScenarioFinancialOutput.calculationStatus` (`VARCHAR`, default `CALCULATED`)
- `SomodScenarioFinancialOutput.methodologyMissing` (`JSONB`)
- Existing V1 / `factors` detail rows marked `LEGACY_PLACEHOLDER`

Normalized tables for threats/assets/requirements/capability gaps remain **future work**; structured capture continues via engine JSON with stronger sanitize contracts.

---

## API Changes

| Endpoint | Behaviour |
|---|---|
| `GET /somod/:id/methodology` | Methodology readiness (`METHODOLOGY_REQUIRED` / partial / configured) |
| `GET /somod/:id/engines/readiness` | Per-engine readiness wrappers |
| Financial calculate | CURRENT may calculate; others persist `METHODOLOGY_REQUIRED` with null money where gated |
| Financial approve | Reviewer/admin only; requires CALCULATED Current; blocks legacy placeholders & false CALCULATED non-Current |
| Financial reopen | Admin only; **reason required**; audit event |
| Penalty create/update | Consultants cannot set/change governed `formulaExpression` |

---

## UI Changes

- Methodology required banner on financial screens
- Scenario outputs show calculation status; blocked scenarios show “Methodology required” instead of fake money
- CFO: Current spend when available; Optimal / savings / payback / effectiveness show methodology-required (not 0 / invented)
- Engines 1–3: structured input capture (threats, deployment headcount/supervisors, technology notes/costs) — **not** residual-risk score widgets
- Engine 5 UI: states methodology required; preferred-balance α-blend control removed
- Empty financial setup defaults (no pre-filled ZAR amounts)

---

## Security Fixes

1. **Analyst cannot approve** — `SOMOD_APPROVER_ROLES` excludes `ANALYST`
2. **Consultants cannot edit governed formulas** — create/update gated by `METHODOLOGY_ROLES`
3. **Approved financial layer locked** — edits require return/reopen; stale blocks approve
4. **Reopen requires reason + audit**
5. Server-side enforcement (UI disable alone is not trusted)

---

## Formula Safety Changes

- Removed production use of `Function()` / `eval` for SOMOD formulas
- `evaluateSafeExpression`: allow-listed identifiers, arithmetic/parentheses only
- Malicious payloads (`constructor`, unknown ids, etc.) rejected in tests
- Legacy `scenarioFactors()` throws if called

---

## Five-Engine Architecture

| Engine | Status | Notes |
|---|---|---|
| 1 Risk & Requirement | **PARTIAL** | Service shell + capture fields; derivation blocked |
| 2 Deployment & Capability | **PARTIAL** | Capture headcount/supervisors/posts; no ratio invent |
| 3 Technology & Control | **PARTIAL** | Capture systems/capex/opex; no substitution ratios |
| 4 Cost & Efficiency | **PARTIAL→stronger** | CURRENT financial path governed; non-Current gated |
| 5 Optimisation | **PARTIAL** | Architecture only; α-blend disabled |

---

## Scenario Architecture

| Scenario | Production behaviour |
|---|---|
| CURRENT | May calculate from entered deployment + financial model + penalties/mappings |
| RISK_ALIGNED | `METHODOLOGY_REQUIRED` — no multipliers |
| COST_EFFICIENT | `METHODOLOGY_REQUIRED` — no % reduction of Current |
| RECOMMENDED_OPTIMAL | `METHODOLOGY_REQUIRED` — no α-blend |

Legacy placeholder rows retained and marked `LEGACY_PLACEHOLDER` (not reinterpreted as governed).

---

## Methodology Readiness

`SomodMethodologyService` / `assessMethodologyReadiness` exposes:

- `CONFIGURED` | `PARTIALLY_CONFIGURED` | `METHODOLOGY_REQUIRED` | `INVALID_CONFIGURATION`
- `missing` / `configured` component lists
- No default weights generated

Financial cost variables + seeded penalty formulas can make status **PARTIALLY_CONFIGURED** (Current path) while engines 1–3/5 remain missing.

---

## MOSS Integration Boundary

- Soft link `mossAssessmentId` only
- No MOSS mutation from SOMOD paths
- UI copy: optional context; does not merge scoring models
- SOMOD IDs remain distinct from MOSS assessment IDs

---

## Tests Added

- Safe expression (happy path + malicious + unknown vars)
- `scenarioFactors` permanently disabled
- CURRENT calc without inventing supervisors
- Methodology readiness for engine slots
- RBAC: ANALYST cannot approve; REVIEWER/SUPER_ADMIN can
- Sanitize: no invented residual risk / preferredBalance / coverage defaults

### Tests Passed

```
pnpm exec vitest run src/somod
Test Files  3 passed (3)
Tests       18 passed (18)
```

SOMOD TypeScript check clean after `prisma generate`. Unrelated pre-existing TS errors remain in `scl-moss-isolation.spec.ts` / `moss-api.spec.ts` (outside SOMOD P0 scope).

---

## Known Issues

1. Full normalized Engine 1–3 tables (threats, assets, requirement rows, capability gaps) not yet migrated — JSON capture remains.
2. Dedicated DB-backed `SomodFormulaDefinition` table not created; registry types + penalty library governance cover P0 intent; RISK/DEPLOYMENT/TECH/OPTIMISATION slots are `UNCONFIGURED` in code.
3. Assessment-level workflow still primarily uses financial-layer statuses; `RETURNED_FOR_CORRECTION` / `SUPERSEDED` enum values exist but not all assessment transitions use them yet.
4. Full end-to-end API integration tests for approve/reopen/stale not expanded beyond unit/RBAC specs.
5. Docker/SSO stack not rebuilt in this pass (local code + unit tests only).

---

## Methodology Still Required

Client must still supply (non-exhaustive):

- risk / requirement derivation rules
- deployment derivation / staffing ratios (if any)
- technology substitution / effectiveness rules
- optimisation objective + constraints
- risk-position and effectiveness scoring
- Risk Aligned / Cost Efficient / Recommended Optimal scenario rules

Until then, platform correctly returns **`METHODOLOGY_REQUIRED`**.

---

## Safe Next Steps

1. Apply migration on local SSO DB; rebuild `moss-api` / `moss-web` for UAT.
2. Agree client methodology pack; load into governed registry (admin-only).
3. Implement Engine 1–3 derivation against approved rules only.
4. Implement Engine 5 objective/constraints against approved config only.
5. Expand normalized tables + audit coverage for methodology config changes.
6. Add API integration tests for approve/stale/reopen/MOSS immutability.

---

**LIVE SITE CHANGES: 0**
