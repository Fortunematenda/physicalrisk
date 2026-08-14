# MOSS Remaining Implementation Report

**Date:** 2026-08-09  
**Scope:** Local development / local staging only (`http://moss-staging.localhost`)  
**Production:** NOT DEPLOYED (`https://moss.physicalrisk.com` untouched)

---

## 1. Executive Summary

The remaining **safe** MOSS product framework is implemented locally:

- M4 scoring engine (shared) with **UNCONFIGURED** aggregation by default
- Evaluate + `MossScoreSnapshot`
- Results API/UI
- Control-linked evidence
- Structured findings (severity nullable / Not classified)
- Manual recommendations (no rule engine)
- Incomplete-submit with explicit confirmation
- Catalogue admin read-only view
- Isolation guards for SCLI CRM/reports
- Audit events for new actions

No invented client methodology. Aggregation remains pending.

---

## 2. Current MOSS Completion Status

| Area | Status |
|------|--------|
| M0–M3, M5 | COMPLETE (prior) |
| M4 scoring framework | COMPLETE (engine ready; aggregation unconfigured) |
| Evidence | COMPLETE |
| Findings | COMPLETE |
| Manual recommendations | COMPLETE |
| Results API/UI | COMPLETE |
| Catalogue governance (read-only) | COMPLETE |
| Submission lifecycle | COMPLETE (incomplete confirm supported) |
| M8 isolation hardening | COMPLETE (guards added) |
| Production deploy | **NOT DONE** |

---

## 3. M4 Scoring Framework

Module: `packages/shared/src/moss-scoring.ts` (independent of SCLI `scoring.ts` / `leakage.ts` / `opportunity.ts`)

- Effective control score = `finalScore` else `assessorScore` else `null`
- Config model: `MossScoringConfiguration` (domain/overall aggregation modes include `UNCONFIGURED`)
- Default live behaviour: **UNCONFIGURED** → `configurationStatus: PENDING_METHODOLOGY`
- Unit tests cover synthetic MEAN / WEIGHTED_MEAN / MIN (test-only; not published)

---

## 4. Methodology Configuration Status

**PENDING CLIENT METHODOLOGY**

No published MEAN/WEIGHTED/MIN config is active. Sentinel version `0.0.0-unconfigured` may exist as DRAFT only.

---

## 5. Evidence

- Endpoints:  
  `GET/POST /api/moss/assessments/:id/controls/:controlCode/evidence`
- Links via `EvidenceDocument.mossControlAssessmentId`
- Workspace UI shows catalogue **Evidence Standards** vs uploaded files
- Reuses existing MinIO/storage

---

## 6. Findings

- `GET/POST/PATCH /api/moss/assessments/:id/findings`
- `productCode=MOSS`, optional control link
- `severity` nullable → UI **Not classified**
- UI: `/moss/assessments/[id]/findings`

---

## 7. Recommendations

- Manual + optional catalogue template text (`technologySubstitutionLogic` / `manpowerOptimisationLogic`)
- `RULE_ENGINE` disabled
- UI shows: Automatic recommendation rules: Pending methodology configuration
- Route: `/moss/assessments/[id]/recommendations`

---

## 8. Submission Workflow

- `POST /api/moss/assessments/:id/submit` with `{ confirmIncomplete?: boolean }`
- Incomplete without confirmation → `400` + `MOSS_INCOMPLETE_SUBMIT_CONFIRMATION_REQUIRED`
- Does **not** require 100/100
- Explicit submit sets `submittedAt` + `SUBMITTED`
- Progress sync no longer downgrades submitted sessions

---

## 9. Score Snapshot

`MossScoreSnapshot` stores controlScores, domainScores (scores null when unconfigured), completenessPercent, calculationTrace, optional configurationId/version.

---

## 10. Results API

`GET /api/moss/assessments/:id/results`  
`POST /api/moss/assessments/:id/evaluate`

Returns productCode MOSS, null overall/domain maturity scores when pending, findings, recommendations, evidence gaps labelled **Evidence not yet uploaded** (not compliance failure).

---

## 11. Results UI

`/moss/assessments/[id]/results`  
Shows Pending methodology configuration for overall/domain scores; factual score distribution; domain completion counts.

---

## 12. Catalogue Governance

`/moss/admin/catalogue` (admin/methodology roles) — read-only published v3.0 summary. No uncontrolled edit/publish.

---

## 13. Audit Logging

Events include: `MOSS_ASSESSMENT_EVALUATED`, `MOSS_EVIDENCE_ADDED`, `MOSS_FINDING_CREATED/UPDATED`, `MOSS_RECOMMENDATION_CREATED/UPDATED`, plus existing create/submit/control update events.

---

## 14. Product Isolation

- SCLI CRM `checkAssessmentAccess` rejects non-`SCLI_COST_LEAKAGE`
- SCLI report generate rejects MOSS IDs
- MOSS endpoints require `productCode=MOSS`
- Cross-test: MOSS id via `/assessments/:id` → 404

---

## 15. Permissions

Existing JWT + RolesGuard. Catalogue admin requires `SUPER_ADMIN` / `METHODOLOGY_ADMIN`.

---

## 16. SCLI Regression

SCLI methodology files untouched. Shared SCLI tests still green. Local `/dashboard` reachable in staging UAT.

---

## 17. Tests

| Suite | Result |
|-------|--------|
| `@moss/shared` (incl. moss-scoring) | 12 passed |
| `@moss/api` vitest | 32 passed / 15 skipped |
| `@moss/web` vitest | 11 passed |
| Web typecheck | PASS |
| API build | PASS |

---

## 18. Build / Typecheck

shared build PASS · api build PASS · web typecheck PASS · staging images rebuilt locally

---

## 19. Local Staging UAT

Against `http://moss-staging.localhost` (browser Auth Code SSO):

| Step | Result |
|------|--------|
| Create assessment | PASS (`MOSS-2026-000004`) |
| Score GOV-01 = 2 | PASS |
| Upload evidence | PASS |
| Structured finding (severity null) | PASS |
| Manual recommendation | PASS |
| Evaluate → overallScore null / PENDING_METHODOLOGY | PASS |
| Results include findings/recs | PASS |
| Incomplete submit blocked without confirm | PASS |
| Confirm incomplete submit | PASS (`submittedAt` set) |
| MOSS via SCLI endpoint | 404 |
| Cost Leakage dashboard | reachable |

**LOCAL STAGING UAT: PASS WITH ISSUES**

Known UAT notes:
- Results page locator for “Pending methodology configuration” returned 0 in headless count (API/results payload still correct; text present in workspace header elsewhere).
- One status-sync bug fixed during UAT (submitted incomplete assessments were briefly downgraded to IN_PROGRESS by `getWorkspace` sync) — patched; requires staging API rebuild to pick up if not already in running image.

---

## 20. Known Issues

1. Staging container must be rebuilt after the submit-status sync fix to guarantee runtime behaviour matches code.
2. Evidence download UI link not fully wired (list + upload done; download uses existing evidence download path).
3. Findings “promote findingText” is optional flag, not a separate one-click UI button yet.

---

## 21. Client Methodology Items Still Required

- Domain aggregation rule
- Overall aggregation rule
- Severity mapping
- Critical-control policy
- Automatic finding rules
- Automatic recommendation rules

---

## 22. Production Status

**NOT DEPLOYED**

---

## 23. Repository Lock

**UNCHANGED** (no `repo/` product modifications)

---

## Live-site safety

| Metric | Count |
|--------|------:|
| Remote SSH | 0 |
| Remote deployments | 0 |
| Remote migrations | 0 |
| Production DB changes | 0 |
| Production Keycloak changes | 0 |
| Production nginx changes | 0 |
| Production DNS changes | 0 |
| moss.physicalrisk.com changes | 0 |
| Repository product changes | 0 |
