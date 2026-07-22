# Pilot delivery summary

## 1. Summary of changes

Upgraded the Lean Revenue MVP into a controlled pilot assurance platform while preserving the public `/start` flow, SCLI scoring, leakage engine, orgs, assessments, methodology Q/calibration CRUD, PDF reports, MinIO evidence, and EspoCRM connector.

Added: status transition rules, analyst assignment, assigned-to-me queue, evidence review statuses, findings (incl. high-risk generation), score overrides, QA checklist + approve/lock, action plans, user admin, email job queue, assumptions management UI, workflow timeline UI.

## 2. Database migrations

Prisma schema expanded (`apps/api/prisma/schema.prisma`). Applied via `prisma db push` on API container start (existing project pattern). New / extended entities include:

- AssessmentAssignment, ScoreOverride, QaChecklistItem, ActionItem, EmailJob
- Expanded Finding, EvidenceDocument, Recommendation, Report, CalibrationAssumption, AssessmentSession, User, AuditEvent, CrmSyncRecord

## 3. New frontend pages

- `/assessments/assigned`
- `/assessments/[id]/review`
- `/actions`
- `/admin/users`
- `/admin/emails`
- Methodology **Assumptions** tab

## 4. New API endpoints (selected)

- `GET /assessments/assigned-to-me`
- `POST /assessments/:id/transition|assign|approve-pilot|unlock|overrides`
- `GET|PATCH /assessments/:id/qa...`
- `GET|POST /assessments/:id/findings...`
- `POST /overrides/:id/decide`
- `GET|PATCH /actions...`
- `GET|POST /admin/users...`
- `GET|POST /admin/emails...`
- `GET /evidence/assessment/:id`
- `PATCH /questionnaires/assumptions/:id`

## 5. New environment variables

- `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
- `ESPOCRM_TIMEOUT`, `ESPOCRM_VERIFY_SSL` (aliases alongside existing `*_MS` / `*_TLS`)

## 6. Role and permission matrix

| Capability | SUPER_ADMIN | REVIEWER | ANALYST | METHODOLOGY_ADMIN | SALES | CLIENT_* | AUDITOR |
|---|---|---|---|---|---|---|---|
| Assign analysts | ✓ | ✓ | | | | | |
| Approve / QA decide | ✓ | ✓ | | | | | |
| Evidence review / findings | ✓ | ✓ | ✓ | | | | |
| Request override | ✓ | ✓ | ✓ | | | | |
| Decide override | ✓ | ✓ | | | | | |
| Unlock assessment | ✓ | | | | | | |
| User admin | ✓ | | | | | | |
| Methodology edit | ✓ | | | ✓ | | | |
| Read assessments (org-scoped) | ✓ | ✓ | ✓ | ✓ | ✓ | own org | ✓ read |

## 7. EspoCRM mapping

MOSS remains authoritative. Configure `ESPOCRM_ENABLED=true` and base URL/API key on the MOSS VPS only. Sync Account/Opportunity/Task via existing CRM module; failures are logged and must not block approval.

## 8. SMTP setup

Set host/port/user/password/from in `.env`. Emails enqueue to `EmailJob` and process every minute (`@nestjs/schedule`). Use `/admin/emails` to inspect / manually process.

## 9. Local startup

```bash
docker compose up -d --build
```

Admin: `admin@physicalrisk.local` / `CHANGE_ME_DEMO_PASSWORD`
Public: `http://localhost:8081/start?source=wordpress`

## 10. Test results

- Added `apps/api/src/common/workflow.spec.ts` (status transition rules).
- Full suite runs in Docker/API image via `pnpm test` after install of `@nestjs/schedule`.
- Rebuild/migrate verification performed with `docker compose up -d --build`.

## 11. Remaining known limitations

- Multi-type PDF report pack (working paper, evidence register, comparison) not fully separate generators yet
- Recommendation original-vs-edited editor UI is partial (schema fields added)
- Reassessment comparison UI not complete
- Email/CRM queues are DB-backed (+ cron), not BullMQ on Redis yet
- Redis still reserved for future workers
- Client dashboard is org-scoped access, not a separate branded client portal
- Rate limiting / MFA not added in this pass
