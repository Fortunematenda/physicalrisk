# MOSS Platform — Lean Revenue MVP

MOSS is a standalone Management Operating Security System for Physical Risk Consultancy. It runs on its own VPS and integrates with the client's separately hosted EspoCRM instance.

This repository implements the **Lean Revenue MVP** (not the future full enterprise assurance platform): public lead capture → assessment → scoring → basic analyst review → approval → executive PDF → email → EspoCRM follow-up.

## Architecture principles

- **MOSS** is the source of truth for questionnaires, calibration, scoring, leakage, evidence, recommendations and reports.
- **EspoCRM** is hosted separately and is used for sales / follow-up only (Account, Contact, Opportunity, Task).
- The WordPress website links to MOSS `/start` (no WordPress plugin in this MVP).

## Assessment workflow (MVP statuses)

`DRAFT` → `IN_PROGRESS` → `SUBMITTED` → `REVIEWED` → `APPROVED` → `REPORT_GENERATED` → `REPORT_ISSUED`

Roles (mapped to existing system roles):

| MVP role | System roles | Capabilities |
|----------|--------------|--------------|
| ADMIN | SUPER_ADMIN, METHODOLOGY_ADMIN | All orgs, approve, SMTP/CRM config, methodology, audit |
| ANALYST | ANALYST, REVIEWER | Review assessments/evidence, edit recommendation wording, preliminary reports, approve |
| CLIENT | CLIENT_EXECUTIVE, CLIENT_CONTRIBUTOR | Own organisation assessments, upload evidence, view issued reports |

## Included

- Next.js portal + public `/start` flow
- NestJS API, PostgreSQL / Prisma, Redis, MinIO, Docker Compose, Nginx
- SCLI v1.1 questionnaire, 23 calibration inputs, 33 assumptions
- Scoring, leakage, confidence, opportunity, automated recommendations
- Basic analyst review, evidence PENDING/ACCEPTED/REJECTED
- Preliminary + approved executive PDFs (versioned history)
- SMTP email queue with retry
- EspoCRM sync with integration log + retry
- Admin dashboard (real data + filters)
- Read-only assumptions page; methodology Q/calibration management

## Explicitly out of scope for this MVP

Findings module, score-override workflow, multi-stage QA, action-plan tracking, reassessment, MFA/SSO, WordPress plugin, assumption editing UI, complex analyst assignment.

## Quick start with Docker

```bash
cp .env.example .env
# Change passwords and JWT_SECRET
docker compose up -d --build
```

Open `http://localhost:8081` (or the port mapped in `docker-compose.yml`).

Default admin (change before production): values from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

Public assessment: `http://localhost:8081/start?source=wordpress`

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm --filter @moss/api prisma:generate
pnpm --filter @moss/api prisma:migrate
pnpm --filter @moss/api prisma:seed
pnpm --filter @moss/shared test
pnpm --filter @moss/api test
pnpm --filter @moss/api build
pnpm --filter @moss/web build
pnpm dev
```

## SMTP

Set in `.env`:

```text
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=MOSS
LEAD_NOTIFY_EMAIL=ops@example.com
```

Emails: submission confirmation, missing information, assessment approved, report issued, internal submission notification. Failures are logged (`PENDING` / `SENT` / `FAILED`) and do not block submission or approval. Retry failed jobs under **Email logs**.

## EspoCRM

EspoCRM is a separate third-party CRM. MOSS talks to it **only from the NestJS API** using `X-Api-Key`.

```text
ESPOCRM_ENABLED=false
ESPOCRM_BASE_URL=https://crm.example.com
ESPOCRM_API_KEY=
ESPOCRM_TIMEOUT=15000
ESPOCRM_VERIFY_SSL=true
ESPOCRM_AUTO_SYNC=true
ESPOCRM_FOLLOW_UP_DAYS=2
```

1. Create a dedicated EspoCRM API Role + API User (Account, Contact, Lead, Opportunity, Task).
2. Create the custom fields listed in `docs/ESPOCRM_INTEGRATION.md`.
3. Put the API key in the **API** `.env` only (never `NEXT_PUBLIC_*`).
4. Enable and use **Settings → EspoCRM Integration → Test connection**.
5. Use **Retry Failed** after outages; sync jobs are queued in `CrmSyncRecord`.

Full mapping, permissions, retries and troubleshooting: `docs/ESPOCRM_INTEGRATION.md`.

## Report workflow

- **Preliminary** report: after submission (analyst).
- **Approved executive** report: after approval (auto-generated on approve; versioned; prior versions kept).
- Issue report emails a secure download link and sets status `REPORT_ISSUED`.

## Production notes

- Terminate TLS at the VPS reverse proxy.
- Replace all default secrets.
- Keep PostgreSQL, Redis, MinIO and the API on internal networks.
- Configure SMTP and EspoCRM before go-live UAT.

## Important limitation

SCLI results are decision-support estimates, not audit findings. Financial exposure and recoverable-value ranges require evidence validation.
