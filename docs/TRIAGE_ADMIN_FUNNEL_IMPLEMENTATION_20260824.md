# Executive Governance Triage Admin Funnel — 24 August 2026

## Purpose

This implementation separates the complimentary Level 1 Executive Governance Triage from paid assessment work and makes every public questionnaire submission visible to internal Physical Risk users automatically.

## Implemented flow

1. A public user supplies contact details.
2. `PublicLead` and the Level 1 `EXECUTIVE_GOVERNANCE_TRIAGE` session are created immediately.
3. The lead appears under **Executive Triage (Level 1) → Triage Submissions** even if the questionnaire is still in progress.
4. Questionnaire progress is saved against that lead.
5. On completion, the lead is marked completed, the preliminary indication is produced, the customer email is queued, and the admin completion notification is queued.
6. The post-completion **Request Executive Advisory Diagnostic** CTA records buying intent only. Admin visibility does not depend on the request.
7. Admin can mark a completed lead reviewed/contacted, save follow-up notes, close it, or convert it to Level 2.
8. Conversion creates a real `EXECUTIVE_ADVISORY_DIAGNOSTIC` engagement linked to the Level 1 triage through `parentAssessmentId`.

## Admin funnel

Available admin data includes:

- all Level 1 submissions;
- in-progress questionnaire progress;
- completion date;
- preliminary indication/risk band;
- internal exposure score where available (clearly labelled as internal exposure, higher = greater exposure);
- diagnostic-request buying intent;
- reviewed/contacted timestamps;
- internal follow-up notes;
- conversion status and Level 2 engagement reference;
- audit trail.

## Lifecycle

Primary workflow stages:

- `IN_PROGRESS`
- `COMPLETED`
- `REVIEWED`
- `CONTACTED`
- `CONVERTED`
- `CLOSED`

Buying intent is additionally persisted using `diagnosticRequestedAt`. The admin UI displays **Diagnostic requested** prominently even when follow-up activity has occurred.

## Public CTA

The CTA calls:

`POST /public/leads/:id/request-diagnostic`

The endpoint is protected by the anonymous signed session cookie, is idempotent, records an audit event, queues an internal email notification, and queues an EspoCRM Lead resync where available.

## Admin API

- `GET /triage/submissions`
- `GET /triage/submissions/:id`
- `PATCH /triage/submissions/:id`
- `POST /triage/submissions/:id/convert`

These routes require an internal Physical Risk role.

## Database migration

Run migration:

`20260824182000_triage_admin_funnel`

It adds lifecycle timestamps, conversion linkage and internal notes to `PublicLead`.

## Deployment

From the MOSS project environment with dependencies installed:

1. Run Prisma migration/deploy.
2. Run Prisma generate.
3. Build API and web applications.
4. Restart API/web services.
5. UAT: start a new public questionnaire and confirm it appears in Triage Submissions before completion.
6. Complete the questionnaire and confirm status/notification.
7. Click Request Executive Advisory Diagnostic and confirm the high-intent flag.
8. Convert from admin and confirm a Level 2 Executive Advisory Diagnostic is created and linked.

## Validation performed in packaging environment

All 14 modified/new TypeScript and TSX files passed TypeScript syntax transpilation. The Prisma schema also passed structural checks for the new fields. A complete dependency-aware build was not possible in the packaging sandbox because the uploaded project does not include `node_modules`.
