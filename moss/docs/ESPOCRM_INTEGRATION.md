# EspoCRM Integration

MOSS is hosted independently. EspoCRM remains a separately hosted third-party CRM.
All EspoCRM REST calls are made **only** from the NestJS API. The Next.js browser never receives the API key.

## Authentication

Use a dedicated EspoCRM **API User** (not an admin interactive user).

MOSS sends:

```
X-Api-Key: <ESPOCRM_API_KEY>
Accept: application/json
Content-Type: application/json
```

Base path:

```
{ESPOCRM_BASE_URL}/api/v1/{Entity}
```

Trailing slashes on `ESPOCRM_BASE_URL` are normalised so the path never becomes `//api/v1`.

## Environment variables

See `.env.example` for the full list. Core flags:

| Variable | Purpose |
|---|---|
| `ESPOCRM_ENABLED` | Master switch |
| `ESPOCRM_BASE_URL` | External EspoCRM origin |
| `ESPOCRM_API_KEY` | API user key (server-only) |
| `ESPOCRM_TIMEOUT` | Request timeout (ms) |
| `ESPOCRM_VERIFY_SSL` | TLS certificate verification |
| `ESPOCRM_AUTO_SYNC` | Queue auto processing |
| `ESPOCRM_FOLLOW_UP_DAYS` | Opportunity close / task due offset |
| `ESPOCRM_*_FIELD` | Custom field API names |
| `ESPOCRM_STAGE_*` | Assessment status → Opportunity stage |

Never put `ESPOCRM_API_KEY` in `NEXT_PUBLIC_*` variables.

## Entity mapping

| MOSS | EspoCRM | Dedup keys |
|---|---|---|
| Organisation | Account | `cMossOrganisationId`, then exact name |
| Public lead | Lead | email + assessment reference custom field |
| Primary contact (PublicLead) | Contact | `cMossContactId`, then email |
| Assessment | Opportunity | `cMossAssessmentId` |
| Follow-up | Task | Stored `espocrmTaskId` / prior SUCCESS Task log |

Sensitive questionnaire answers and evidence files are **never** sent.

## Stage mapping (defaults)

| MOSS status | EspoCRM stage |
|---|---|
| DRAFT / IN_PROGRESS | Prospecting |
| SUBMITTED / REVIEWED | Qualification |
| APPROVED / REPORT_GENERATED | Proposal |
| REPORT_ISSUED | Negotiation |

Override with `ESPOCRM_STAGE_<STATUS>`.

## Queue and retries

Jobs are stored in Postgres `CrmSyncRecord` (not Bull/Redis yet).

Job types:

- `ESPO_SYNC_LEAD`
- `ESPO_SYNC_ACCOUNT`
- `ESPO_SYNC_CONTACT`
- `ESPO_SYNC_OPPORTUNITY`
- `ESPO_SYNC_TASK`
- `ESPO_UPDATE_REPORT`

Retry schedule: immediate → 1m → 5m → 15m → 1h (max 5 attempts).

Retryable: timeout, network, 429, 5xx.  
Not retried automatically: 400/422 validation, 401, 403, 404.

Cron drains due jobs every 10 minutes when enabled + auto-sync.

## Auto-sync triggers (non-blocking)

- Public lead capture / resume → Lead (+ Account queue)
- Assessment submit / public complete → Opportunity
- Approval → Opportunity
- Report generate → Opportunity
- Report issue → Opportunity report URL update

CRM failures never block assessment, scoring, approval, or report workflows.

## Admin API

| Method | Path | Roles |
|---|---|---|
| GET | `/api/integrations/espocrm/status` | SUPER_ADMIN, ANALYST, REVIEWER, SALES |
| POST | `/api/integrations/espocrm/test` | SUPER_ADMIN |
| POST | `/api/integrations/espocrm/sync/organisation/:id` | SUPER_ADMIN |
| POST | `/api/integrations/espocrm/sync/contact/:id` | SUPER_ADMIN |
| POST | `/api/integrations/espocrm/sync/assessment/:id` | SUPER_ADMIN, ANALYST, REVIEWER, SALES |
| POST | `/api/integrations/espocrm/process` | SUPER_ADMIN |
| POST | `/api/integrations/espocrm/retry-failed` | SUPER_ADMIN |
| POST | `/api/integrations/espocrm/retry/:logId` | SUPER_ADMIN |
| GET | `/api/integrations/espocrm/logs` | SUPER_ADMIN, ANALYST |
| POST | `/api/integrations/espocrm/logs/:id/retry` | SUPER_ADMIN |

CLIENT users have no CRM configuration access.

Status/logs responses never include the API key.

## EspoCRM administrator setup

### 1. Create API Role

Entity permissions (minimum):

- Account: create, read, edit
- Contact: create, read, edit
- Lead: create, read, edit
- Opportunity: create, read, edit
- Task: create, read, edit
- User: read (for `/App/user` connection test)

### 2. Create API User

- Type: API User
- Assign the API Role
- Generate API Key → paste into MOSS `ESPOCRM_API_KEY`

### 3. Create custom fields (API names)

**Account**

- `cMossOrganisationId` (Varchar)

**Contact**

- `cMossContactId` (Varchar)

**Lead**

- `cMossAssessmentReference` (Varchar)

**Opportunity**

- `cMossAssessmentId`
- `cMossAssessmentReference`
- `cMossScliScore`
- `cMossRiskRating`
- `cMossGovernanceScore`
- `cMossConfidenceScore`
- `cMossOpportunityScore`
- `cMossMinimumLeakage`
- `cMossLikelyLeakage`
- `cMossMaximumExposure`
- `cMossRecoverableLow`
- `cMossRecoverableHigh`
- `cMossHighestRiskCategory`
- `cMossRecommendedService`
- `cMossAssessmentStatus`
- `cMossReportUrl`

If your EspoCRM uses different API names, map them with the `ESPOCRM_*_FIELD` env vars.

### 4. How to find field API names

In EspoCRM: Administration → Entity Manager → select entity → Fields → open field → **Name** (API name), usually prefixed with `c` for custom fields.

### 5. Test connection from MOSS

1. Set env vars and restart API.
2. Sign in as SUPER_ADMIN.
3. Open **Settings → EspoCRM Integration**.
4. Click **Test Connection**.
5. Confirm status shows connected and logs show no auth errors.

### 6. Local testing

```bash
# API unit tests (mocked HTTP; does not call production CRM)
pnpm --filter @moss/api test

# Apply schema (includes CRM ID columns)
pnpm --filter @moss/api prisma:migrate
```

Set `ESPOCRM_ENABLED=true` against a sandbox EspoCRM only.

### 7. Production checklist

- HTTPS EspoCRM URL
- Dedicated API user (least privilege)
- `ESPOCRM_VERIFY_SSL=true`
- API key only on API VPS `.env`
- Confirm queue worker via pending/failed KPI cards
- Retry failed jobs after EspoCRM outages

## Troubleshooting

| Symptom | Check |
|---|---|
| 401 on test | API key / API user active |
| 403 on sync | Role entity permissions |
| 404 | Base URL / `/api/v1` path |
| Timeout | Network / firewall / `ESPOCRM_TIMEOUT` |
| SSL failure | Certificate chain or temporarily review `ESPOCRM_VERIFY_SSL` (not for production) |
| Duplicate accounts | Confirm `cMossOrganisationId` exists and is searchable |
| No auto sync | `ESPOCRM_ENABLED` + `ESPOCRM_AUTO_SYNC` |
| Stuck FAILED | Use **Retry Failed** or wait for cron if retryable |

## Security controls

- Backend-only CRM HTTP client
- API key never returned by endpoints
- Secrets redacted from sync payloads/logs/audit metadata
- SSRF guard: requests may only target the configured EspoCRM host
- Production HTTPS enforcement for base URL
- Role guards on all integration routes
