# MOSS Pilot Workflow Guide

## Controlled assurance path

1. Organisation created  
2. Assessment started (DRAFT → IN_PROGRESS)  
3. Calibration + questionnaire completed  
4. Evidence uploaded  
5. Assessment submitted → automated evaluation  
6. Analyst assigned (primary analyst / senior reviewer / contributor)  
7. Evidence reviewed  
8. Findings recorded (manual or from high-risk answers)  
9. Score override requested / decided (reviewer only)  
10. QA checklist completed  
11. Assessment approved (locks responses/inputs)  
12. Report generated / issued (email via SMTP queue)  
13. EspoCRM sync (non-blocking)  
14. Remediation action plan tracked  

## Status transitions

Forward stages are enforced in `apps/api/src/common/workflow.ts`.  
Senior reviewers may return assessments with a reason.  
Only `SUPER_ADMIN` may unlock an approved assessment (reason required).

## Role mapping

| Pilot name | Database enum |
|---|---|
| SYSTEM_ADMIN | SUPER_ADMIN |
| SENIOR_REVIEWER | REVIEWER |
| SALES_USER | SALES |
| METHODOLOGY_ADMIN | METHODOLOGY_ADMIN |
| ANALYST | ANALYST |
| CLIENT_EXECUTIVE | CLIENT_EXECUTIVE |
| CLIENT_CONTRIBUTOR | CLIENT_CONTRIBUTOR |
| AUDITOR | AUDITOR |

API rejects unauthorised actions via `RolesGuard` + service-level checks.

## Key admin pages

- `/assessments/assigned` — analyst work queue  
- `/assessments/[id]/review` — evidence, findings, overrides, QA, assign, approve  
- `/actions` — action-plan dashboard  
- `/admin/users` — user administration  
- `/admin/emails` — email job logs  
- `/admin/methodology` — questions, calibration, assumptions  

## SMTP

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`.  
Jobs are stored in `EmailJob` and processed every minute. Failures do not block assessments.

## EspoCRM

EspoCRM remains an **external** system. Configure `ESPOCRM_*` variables. MOSS is authoritative for methodology, scores, evidence, findings and action plans. CRM sync failures are logged and retried.

## Local startup

```bash
docker compose up -d --build
```

API runs `prisma db push` + seed on start.  
Open `http://localhost:8081` — admin `admin@physicalrisk.local` / `CHANGE_ME_DEMO_PASSWORD`

## Assumptions

All 33 SCLI assumptions remain in calculations.  
Values used by submitted/approved assessments cannot be edited in place — publish a new methodology version instead.
