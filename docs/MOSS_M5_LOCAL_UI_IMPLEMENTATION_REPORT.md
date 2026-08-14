# MOSS M5 Local UI Implementation Report

**Status:** **M5 COMPLETE**  
**M4 aggregation:** **BLOCKED / PENDING CLIENT METHODOLOGY**  
**M6 recommendations:** Technically not started — **NOT authorised** for this increment  
**Date:** 2026-08-09  
**Scope:** Local development only — no production deploy

---

## 1. Executive Summary

Local MOSS frontend is available for the authenticated assessment flow against existing M3 APIs:

**Dashboard → Assessments → New Assessment → Workspace (14 domains / 100 controls) → score 0–4 → save → resume → completion progress**

No domain/overall maturity scoring, no financial execution, no SOMOD, no Repository changes, no SCLI methodology changes.

---

## 2. M5 Status

**M5 COMPLETE**

---

## 3. Files Changed

### Frontend
- `moss/apps/web/app/moss/page.tsx` — MOSS dashboard
- `moss/apps/web/app/moss/assessments/page.tsx` — list + filters
- `moss/apps/web/app/moss/assessments/new/page.tsx` — create + site modal
- `moss/apps/web/app/moss/assessments/[id]/page.tsx` — assessment workspace
- `moss/apps/web/lib/moss.ts` — UI helpers (labels, progress, guidance)
- `moss/apps/web/lib/moss.test.ts`
- `moss/apps/web/lib/navigation.ts` — DIAGNOSTICS: Cost Leakage | MOSS
- `moss/apps/web/lib/navigation.test.ts`
- `moss/apps/web/vitest.config.ts`
- `moss/apps/web/package.json` — vitest test script
- `moss/apps/web/app/globals.css` — workspace responsive stack

### Docs
- `docs/MOSS_M5_LOCAL_UI_IMPLEMENTATION_REPORT.md`

### Not modified
- Repository (locked)
- `scoring.ts` / `leakage.ts` / `opportunity.ts`
- SCLI `/start`, `/dashboard`, `/assessments` behaviour
- M3 API contracts (consumed as-is)

---

## 4. Frontend Routes Added

| Route | Purpose |
|-------|---------|
| `/moss` | MOSS dashboard |
| `/moss/assessments` | MOSS assessments list |
| `/moss/assessments/new` | Create MOSS assessment |
| `/moss/assessments/[id]` | Assessment workspace |

Optional `/results` page **not** implemented (not required).

Legacy Cost Leakage routes unchanged: `/dashboard`, `/assessments`, `/start`.

---

## 5. Navigation Changes

Sidebar section label: **DIAGNOSTICS**

| Item | Href |
|------|------|
| Cost Leakage | `/dashboard` |
| MOSS | `/moss` |

SOMOD is **not** clickable / not present.  
Existing COST LEAKAGE / ASSESSMENTS / METHODOLOGY / SYSTEM sections retained.

---

## 6. Dashboard

`/moss` shows real values only:

- Master Catalogue version **3.0**
- Domains / Controls from catalogue API
- MOSS assessment counts (active / draft / completed when > 0)
- Recent MOSS assessments with **Assessment Progress**
- Empty state: “No MOSS assessments yet.” + Create Assessment
- Overall MOSS Score shown only as **Pending methodology configuration**

---

## 7. New Assessment Flow

Organisation required · Site optional · Title optional · Catalogue card fixed to published v3.0.  
Create calls `POST /api/moss/assessments` then redirects to workspace.  
Does not fall back to SCLI create.

---

## 8. Site Flow

`+ Add New Site` opens a modal (name, code, address, region, description).  
Creates via `POST /organisations/:id/sites` and auto-selects the new site.

---

## 9. Workspace Architecture

Three-panel desktop layout:

1. Domains (14, catalogue order)
2. Controls in selected domain
3. Control methodology + score capture

Responsive: panels stack below ~960px.

---

## 10. Domain Navigation

Each domain shows code, name, assessed/total, completion %.  
Progress indicators only — **no domain maturity colours/scores**.

---

## 11. Control Navigation

Control list shows code, name, status or recorded score (`2 · Basic`).  
Previous / Next walks the full flat control list (cross-domain).  
Dirty text is flushed before navigation.

---

## 12. Methodology Display

Structured fields + collapsible sections:

Evidence, Inspection, Failure, Fraud indicators, Scoring rules, Optimisation logic.

Financial Mapping collapsed with disclaimer:

> Methodology metadata only — financial calculation is not enabled in this MOSS version.

No formula execution. No SCLI leakage API calls.

---

## 13. Score Capture

Radio-card selector **0–4** with labels:

Non-existent / Ad hoc / Basic / Effective / Optimised

Selected-score guidance rendered from catalogue `mossScoringRules` when present (no invented text).

---

## 14. Autosave / Save Behaviour

| Field | Behaviour |
|-------|-----------|
| Score | Immediate save on select |
| Rationale / Comment / Finding | Debounced autosave (~800ms) |
| Explicit Save | Always available |

UI states: **Unsaved / Saving… / Saved / Save failed**  
Save sequencing via monotonic request id (stale responses ignored).

---

## 15. Progress Behaviour

After save, workspace reloads assessment progress from M3:

`assessed / total` and completion % (overall + domain lists).

Example: score GOV-01 → **1 / 100 · 1%**

Labeled **Assessment Progress** only — not maturity.

---

## 16. Product Isolation

- MOSS pages call `/moss/*` APIs only.
- SCLI assessment IDs on MOSS routes surface backend 404 → “Assessment not found.”
- Cost Leakage lists remain `productCode = SCLI_COST_LEAKAGE`.

---

## 17. Tests Added

| Suite | Result |
|-------|--------|
| `moss/apps/web` vitest (`moss` + `navigation` helpers) | **10/10 pass** |
| `@moss/web` typecheck | **pass** |
| moss-api tests | **45/45 pass** |
| shared scoring/leakage | **4/4 pass** |

Frontend previously had no test runner; vitest added for helper/nav coverage.

---

## 18. SCLI Regression Results

| Check | Result |
|-------|--------|
| `/api/public/start` | **200** |
| `http://moss.localhost/dashboard` | **200** |
| `http://moss.localhost/start` | **200** |
| scoring/leakage unit tests | **pass** |
| Methodology engines modified | **No** |

---

## 19. Typecheck / Build Results

| Check | Result | Category |
|-------|--------|----------|
| `@moss/web` `tsc --noEmit` | **PASS** | — |
| `@moss/web` Next.js Docker build | **PASS** | — |
| Host `@moss/api` tsc (earlier) | Known issues: `@moss/shared` resolution, seed import extension, M1 JSON null typing | **B/C** pre-existing / host-only |
| Docker moss-api tests | **PASS** | — |

Category **A** (introduced by M5): none outstanding after web typecheck/build.

---

## 20. Docker Verification

Rebuilt and restarted `moss-web`. Containers healthy for local stack (moss-web, moss-api, moss-db, keycloak as required).

| URL | Status |
|-----|--------|
| `http://localhost:4001/api/health` | **200** |
| `http://localhost:3001/moss` | **200** |
| `http://moss.localhost/moss` | **200** |

---

## 21. Local URLs

| Surface | URL |
|---------|-----|
| MOSS dashboard | http://moss.localhost/moss |
| MOSS assessments | http://moss.localhost/moss/assessments |
| New MOSS assessment | http://moss.localhost/moss/assessments/new |
| Cost Leakage dashboard | http://moss.localhost/dashboard |
| Public Cost Leakage start | http://moss.localhost/start |
| API health | http://localhost:4001/api/health |

Authenticate via existing Keycloak/SSO as for other moss.localhost pages.

---

## 22. Known Issues

- Full browser E2E (create → score → persist) requires an authenticated session; HTTP route smoke verified unauthenticated page reachability.
- Workspace uses stacked layout on small screens rather than a drawer component.
- Pre-existing host-only API `tsc` issues remain documented (B/C); Docker verification is the production-equivalent path.

---

## 23. Deferred Items

- M4 domain/overall aggregation
- Submit / evaluate workflow
- Automatic recommendations (M6)
- MOSS financial calculations
- MOSS PDF/reports
- SOMOD
- Production deployment

---

## 24. M4 Status

**M4 AGGREGATION: BLOCKED / PENDING CLIENT METHODOLOGY**

UI shows “Pending methodology configuration” only.

---

## 25. M6 Status

Recommendation automation is **not implemented** and **not authorised**.  
No SCLI `RecommendationRule` calls from MOSS UI.

---

## 26. Repository Lock Confirmation

| Check | Result |
|-------|--------|
| Repository changed files | **0** |
| SCLI methodology changed | **No** |
| MOSS calls only M3 `/moss/*` (+ shared orgs/sites) | **Yes** |
| Aggregation invented | **No** |

---

## Final verdict

```
M5 COMPLETE
M4 AGGREGATION: BLOCKED / PENDING CLIENT METHODOLOGY
```

**Local entry point:** http://moss.localhost/moss
