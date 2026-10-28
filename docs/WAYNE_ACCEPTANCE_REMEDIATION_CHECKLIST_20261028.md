# Wayne Acceptance Feedback — Remediation Checklist (28 Oct 2026)

> **Remediation checklist only.** This document tracks Fortune's fixes for the
> acceptance feedback Wayne raised. It does **not** replace or amend Wayne's
> original acceptance checklist, and nothing here records acceptance on his behalf.

## How to read this checklist

| Column | Meaning |
|---|---|
| **Fortune** | `[x]` = implemented **and** verified by the evidence listed (automated tests, type check, or code inspection as stated). `[ ]` = not yet verified (e.g. needs a browser check, a live environment, or a decision). |
| **Wayne** | Wayne's acceptance. **Always left blank by Fortune.** Only Wayne ticks this. |
| **Status** | Implemented / Implemented – needs live verification / Not started / Decision required / Commercial follow-up |

Scope of this change set: local code changes only. **Not committed, not deployed.**
Nothing has been verified against staging or production, the live EspoCRM instance or the live Keycloak realm.

---

## 1. MOSS product name

| # | Item | Responsibility | Fortune | Wayne | Status | Evidence / test steps |
|---|---|---|---|---|---|---|
| 1.1 | User-facing MOSS expansion corrected to **"Management Oversight Security Standard"** (portal landing, web metadata, MOSS page fallback, sidebar description, MOSS PDF report header, API `productName`, READMEs, Keycloak realm seed description) | Fortune | [x] | [ ] | Implemented – needs live verification | `lib/navigation.test.ts` asserts the MOSS description. Repo-wide search found no remaining incorrect expansions in source. Technical identifiers (`MOSS`, `moss_*` roles, product codes) are unchanged. **Live check:** open portal → MOSS tile, MOSS dashboard and a generated MOSS PDF, and confirm the wording. |
| 1.2 | Keycloak realm *description* in the live realm | Fortune (manual) | [ ] | [ ] | Not started | Only the seed file `auth/keycloak/realm/physicalrisk-realm.json` was changed. The live realm is **not** re-imported automatically. If desired, edit Realm settings → Display name/description in the Keycloak admin console. |

## 2. SOMOD navigation

| # | Item | Responsibility | Fortune | Wayne | Status | Evidence / test steps |
|---|---|---|---|---|---|---|
| 2.1 | Portal SOMOD tile → `/somod` → SSO → returns to `/somod` | Fortune | [x] | [ ] | Implemented – needs live verification | Code path traced: AuthGate → `redirectToLogin` → `/auth/complete?next=/somod`. `lib/return-path.test.ts` covers the SOMOD return path. **Live check:** signed out, click the SOMOD tile, sign in, and confirm you land on SOMOD. |
| 2.2 | **Defect fixed:** deep links lost their query string or hash after SSO login (e.g. `/somod/...?tab=x`) | Fortune | [x] | [ ] | Implemented – needs live verification | `AuthGate.tsx` now passes the full path + query + hash. New `lib/return-path.ts` rejects open redirects (`//`, `/\`, external hosts) and auth intermediates (`/login`, `/auth/complete`, `/api/auth`). Covered by `lib/return-path.test.ts`. |
| 2.3 | SOMOD sidebar section highlights correctly on `/somod/*`; description reads "Security Operating Model Optimisation Diagnostic" | Fortune | [x] | [ ] | Implemented – needs live verification | `lib/navigation.test.ts` covers section selection. **Live check:** refresh on a SOMOD sub-page and confirm the section stays selected and the heading is correct. |
| 2.4 | Responsive/mobile sidebar behaviour for SOMOD | Fortune | [ ] | [ ] | Implemented – needs live verification | The mobile sidebar shares `SidebarNavList`. Not yet checked in a browser at mobile width. |

## 3. EspoCRM — selection, access, connection testing, end-to-end workflow

These four are deliberately separate. A passing connection test **does not** prove users can sign in to EspoCRM or that records sync end to end.

| # | Item | Responsibility | Fortune | Wayne | Status | Evidence / test steps |
|---|---|---|---|---|---|---|
| 3.1 | **CRM selection:** EspoCRM is the CRM for this scope | Wayne / Physical Risk (business decision) | [ ] | [ ] | Decision record | No code change. Recorded here so it is not confused with access or testing. |
| 3.2 | **CRM access:** "Open EspoCRM ↗" button at the top of Settings → Integrations, and a "CRM" sidebar link for internal staff | Fortune | [x] | [ ] | Implemented – needs live verification | The URL comes from the existing validated `ESPOCRM_BASE_URL` via `GET /integrations/espocrm/access` (roles SUPER_ADMIN, ANALYST, REVIEWER, SALES, unchanged from status). HTTPS only (HTTP only for loopback hosts outside production). URLs with credentials are refused; `/api/v1`, query and fragment are stripped. The client re-validates with `safeExternalNavUrl`. It opens in a new tab with `rel="noopener noreferrer"`. If the URL is missing or invalid, the button is disabled and the reason is shown. Tests: `crm/espocrm.health.spec.ts`, `crm/crm.controller.authz.spec.ts`, `lib/navigation.test.ts`. **Live check:** click the link and confirm EspoCRM opens at its login page. |
| 3.3 | **CRM access — user sign-in to EspoCRM** | Physical Risk / Fortune (manual) | [ ] | [ ] | Not started | EspoCRM uses its **own** sign-in. No platform credentials are passed and **no shared SSO is configured or claimed**. EspoCRM user accounts must be created in EspoCRM itself. |
| 3.4 | Integration page explains what the settings do | Fortune | [x] | [ ] | Implemented – needs live verification | The notice explains that the settings manage the MOSS→EspoCRM API connection, that EspoCRM opens separately with its own sign-in, and that a connection test confirms API reachability and key acceptance only. Verified by code review; not yet viewed in a browser. |
| 3.5 | **Connection testing:** status reflects real checks | Fortune | [x] | [ ] | Implemented – needs live verification | The "100% Healthy" gauge is replaced by individual checks, each Passed / Failed / Not checked with its check time: API reachable, integration key accepted, TLS certificate, sync worker (from a persisted heartbeat). A pass shows a green "Connection test passed · checked …" banner. Failures show sanitised, actionable messages. The integration user name is no longer shown. Tests: `crm/espocrm.health.spec.ts`, `crm/espocrm.integration-screen.spec.ts`. **Live check:** Settings → Integrations → Test connection, then confirm each row. |
| 3.6 | Connectivity shown separately from sync | Fortune | [x] | [ ] | Implemented – needs live verification | Separate cards: API connection (Verified / Failed / Not checked + last check time), Synchronisation (Up to date / Pending work / Processing / Errors need attention / Unknown), Last sync attempt, Last successful sync. A connection test never changes the last successful sync (tested). Paginated sync history comes from `CrmSyncRecord`, with safe retry for administrators. |
| 3.7 | **End-to-end workflow testing:** a lead/proposal created in MOSS appears correctly in EspoCRM and is visible to the intended CRM users | Fortune + Wayne | [ ] | [ ] | Not started | Requires a live environment. Steps: (1) run Test connection; (2) create a test triage lead; (3) confirm the Lead/Account/Contact in EspoCRM; (4) advance to proposal and confirm the Opportunity; (5) confirm "Last successful sync" updates; (6) delete the test records. |
| 3.8 | Connection-test result persists across API restarts | Fortune | [x] | [ ] | Implemented – needs live verification | Stored in `SystemSetting` `espocrm.connectionTest` (no migration needed), cleared when the URL, key or enabled flag changes. Tested in `crm/espocrm.integration-screen.spec.ts`. |

## 4. User administration and roles

| # | Item | Responsibility | Fortune | Wayne | Status | Evidence / test steps |
|---|---|---|---|---|---|---|
| 4.1 | SSO/Keycloak remains the identity authority; no legacy login enabled | Fortune | [x] | [ ] | Implemented | Local user creation stays blocked when Keycloak is on (`users.service.ts`). No change to `ENABLE_LEGACY_LOGIN`. |
| 4.2 | Admin → Users explains platform roles vs engagement responsibilities | Fortune | [x] | [ ] | Implemented – needs live verification | Columns "Platform role (effective)" (label, description, Keycloak role) and "Engagement responsibilities". The notice lists the Keycloak role names and says role changes take effect after sign-out/sign-in. Test: `lib/role-catalogue.test.ts`. |
| 4.3 | Misleading "Add analyst" replaced | Fortune | [x] | [ ] | Implemented – needs live verification | Admin → Consultants and Triage show "Add analyst" only when local creation is enabled. Otherwise they show "Add analyst in Keycloak" (external link) or "No analysts available". |
| 4.4 | Keycloak admin console link from environment config | Fortune | [x] | [ ] | Implemented – needs live verification | `identityAdminUrl` (admins only, Keycloak enabled) comes from `KEYCLOAK_ADMIN_CONSOLE_URL`, or is derived from `KEYCLOAK_ISSUER`. It allows http(s) only and no embedded credentials. It opens with `rel="noopener noreferrer"`. Test: `users/identity-admin-url.spec.ts`. **Live check:** confirm the link opens the correct realm's Users page. |
| 4.5 | Engagement responsibilities: **Engagement lead, Consultant, Reviewer, Approver**, assigned with checkboxes (multiple per person) | Fortune | [x] | [ ] | Implemented – needs live verification | New `EngagementResponsibilitiesCard` on advisory engagement pages (hidden from client viewers). API `GET /advisory/:id/responsibilities` and `PUT /advisory/:id/responsibilities/:userId`. Catalogue in `common/engagement-responsibilities.ts`. Tests: `common/engagement-responsibilities.spec.ts` (6), `advisory/advisory-responsibilities.spec.ts` (8). |
| 4.6 | **Analyst** support | Fortune | [x] | [ ] | Implemented (as platform role) | Analyst is the platform role from Keycloak `moss_analyst`. At engagement level, analysts can be Engagement lead or Consultant. See decision D2. |
| 4.7 | Server-side permission enforcement and tenant boundaries | Fortune | [x] | [ ] | Implemented | The PUT requires SUPER_ADMIN plus engagement access. Eligibility is validated per platform role. Assignees must be active. The engagement lead cannot be removed (only replaced). Auditors cannot assign. All changes are audited (`ADVISORY_RESPONSIBILITIES_UPDATED`). Responsibilities **grant no extra permissions**. Covered by `advisory-responsibilities.spec.ts`. |
| 4.8 | Database migration `20261028120000_assignment_role_approver` (adds `APPROVER` to `AssignmentRole`) | Fortune prepares / Physical Risk approves | [ ] | [ ] | Prepared for review | Additive only: `ALTER TYPE "AssignmentRole" ADD VALUE IF NOT EXISTS 'APPROVER'`. **Note:** the API container runs `prisma migrate deploy` at start-up, so it applies on the next API deploy. Review before deploying. |
| 4.9 | Platform roles changed for real users in Keycloak | Physical Risk (manual) | [ ] | [ ] | Not started | No live Keycloak roles were changed and no accounts were created. Assign `moss_admin` / `moss_reviewer` / `moss_analyst` / `moss_client` manually in the Keycloak console as required. |
| 4.10 | Responsive layout and accessible labels on new admin and engagement UI | Fortune | [ ] | [ ] | Implemented – needs live verification | Checkboxes have aria-labels ("Approver for Jane Smith"). Tables use horizontal scroll on small screens. Not yet checked in a browser or with a screen reader. |

### Unresolved permission decisions (default: **no additional access**)

| ID | Decision needed | Current behaviour until decided |
|---|---|---|
| D1 | Should only the named engagement **Approver** be allowed to approve, rather than anyone with an approving platform role? | Approval is still governed by platform role (`APPROVER_ROLES` = Super admin, Analyst, Reviewer for MOSS/SCL; Super admin, Reviewer for SOMOD). The Approver responsibility is informational. |
| D2 | Does **Analyst** need a distinct engagement-level responsibility, or is "Consultant" sufficient? | Analysts can hold Engagement lead or Consultant. |
| D3 | **Segregation of duties:** may the Engagement lead also be the Reviewer/Approver on the same engagement? | Not blocked. |
| D4 | Platform roles METHODOLOGY_ADMIN, SALES and AUDITOR have no Keycloak realm role mapping. Should they be added? | Not reachable via SSO; users without a mapped role fall back to Client contributor. |
| D5 | Should responsibilities extend beyond advisory engagements (SCL, MOSS and SOMOD sessions)? | Advisory engagements only. |
| D6 | Keycloak admin console URL: the default derived link uses the master-realm console. Is a realm-scoped admin console preferred? | Set `KEYCLOAK_ADMIN_CONSOLE_URL` to override. |

## 5. Commercial follow-up (out of scope)

| # | Item | Responsibility | Fortune | Wayne | Status | Evidence / test steps |
|---|---|---|---|---|---|---|
| 5.1 | **Customer portal** — quotation requested | Fortune (commercial) | [ ] | [ ] | Commercial follow-up | A separate commercial item. No quotation is included here, and no portal development is part of this remediation scope. |

---

## Environment variables

| Variable | New? | Purpose |
|---|---|---|
| `KEYCLOAK_ADMIN_CONSOLE_URL` | **New, optional** | Explicit Keycloak admin console URL for the "Manage users in Keycloak" link. If unset, it is derived from `KEYCLOAK_ISSUER`. |
| `KEYCLOAK_ENABLED`, `KEYCLOAK_ISSUER` | Existing | Unchanged. |
| `ESPOCRM_ENABLED`, `ESPOCRM_BASE_URL`, `ESPOCRM_API_KEY` | Existing | Unchanged. The "Open EspoCRM" link is derived from `ESPOCRM_BASE_URL`; the API key is never sent to the browser. |

## Verification run (local, 28 Oct 2026)

- New and updated API specs (CRM health, CRM service, responsibilities catalogue, advisory responsibilities, identity admin URL): **all pass**.
- Full API suite: 191 passed, 6 failed, 20 skipped. All 6 failures are pre-existing and in untouched areas (email list, proposal reference, M1 `ProductCode` contract, proposal PDF).
- Web vitest: 70/71 pass. One pre-existing failure in `lib/moss.test.ts` (file not modified).
- Web `tsc --noEmit`: no errors in changed files. The remaining errors are pre-existing (missing tiptap/pdfjs types, an SCL calibration test).
- API `tsc --noEmit` (non-spec): no errors in changed files; 2 pre-existing errors versus 3 at baseline.
- **Not done:** browser/responsive/screen-reader checks, live EspoCRM tests, live Keycloak checks.
