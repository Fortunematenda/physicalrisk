# Request Proposal Workflow — Implementation

## 1. Files changed

### API
- `apps/api/prisma/schema.prisma` — `ProposalStatus` enum + `PublicLead` proposal fields
- `apps/api/prisma/migrations/20260824200000_triage_proposal_workflow/migration.sql`
- `apps/api/src/common/proposal-token.service.ts` — signed JWT tokens for PDF/public CTAs
- `apps/api/src/common/proposal-reference.ts` — `PRP-YYYY-######` generator
- `apps/api/src/common/proposal-*.spec.ts`, `apps/api/src/triage/proposal-transitions.spec.ts`
- `apps/api/src/public/public.service.ts` — preview + idempotent request capture
- `apps/api/src/public/public.controller.ts` — `GET/POST /public/triage/proposal`
- `apps/api/src/public/public.module.ts`
- `apps/api/src/triage/triage.service.ts` / `triage.controller.ts` — KPIs, filters, journey, status actions
- `apps/api/src/reports/reports.service.ts` / `reports.module.ts` — per-lead signed PDF CTA
- `apps/api/src/reports/scl-report-branding.ts`
- `apps/api/src/email/email.service.ts` — admin + user proposal templates
- `apps/api/src/crm/espocrm.service.ts` — commercial intent enrichment on lead description
- `moss/.env.example` — `PROPOSAL_TOKEN_*`

### Web
- `apps/web/app/request-proposal/page.tsx` — public confirmation page
- `apps/web/app/triage/page.tsx` / `[id]/page.tsx` — admin commercial funnel UI
- `apps/web/components/scl/AssessmentSubmittedPage.tsx` — Proposal vs Discussion CTAs
- `apps/web/components/scl/AssessmentResultPage.tsx`
- `apps/web/app/start/StartClient.tsx`
- `apps/web/components/PortalFrame.tsx` — public path for `/request-proposal`

## 2. Database changes

Added enum `ProposalStatus`:
`NOT_REQUESTED | REQUESTED | IN_PREPARATION | SENT | ACCEPTED | DECLINED | EXPIRED | CANCELLED`

Added nullable/default-safe columns on `PublicLead`:
`proposalStatus` (default `NOT_REQUESTED`), `proposalRequestedAt`, `proposalSentAt`, `proposalAcceptedAt`, `proposalDeclinedAt`, `proposalExpiredAt`, `proposalReference` (unique), `proposalAdminNotes`, `proposalPreparedById`

Indexes on `proposalStatus` and `proposalRequestedAt`.

Existing rows default to `NOT_REQUESTED`. No destructive resets.

## 3. New API routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/public/triage/proposal?token=` | Public (rate limited) |
| POST | `/api/public/triage/proposal` body `{ token }` | Public (rate limited) |
| POST | `/api/triage/submissions/:id/proposal` | Internal roles |

## 4. Public flow

1. Triage completes → PDF CTA embeds signed URL `/request-proposal?token=…`
2. User opens confirmation page (organisation + recommended product only)
3. User clicks **Request Proposal** → POST records commercial intent
4. Success shows `PRP-…` reference; repeats are idempotent

## 5. Admin flow

Executive Triage → Triage Submissions:
- KPI **Proposal Requests**
- Commercial Intent column + filters
- Detail: Commercial Journey timeline + proposal actions
- Convert reuses existing Level 2 conversion

## 6. Proposal statuses

`NOT_REQUESTED → REQUESTED → IN_PREPARATION → SENT → ACCEPTED|DECLINED`  
Also: `EXPIRED`, `CANCELLED`. Server validates transitions.

## 7. Token / security

- JWT purpose `triage_proposal`, payload `{ leadId }`
- Secret: `PROPOSAL_TOKEN_SECRET` (fallback `JWT_SECRET`)
- TTL: `PROPOSAL_TOKEN_TTL` (default `30d`)
- URL never exposes raw lead/org/assessment IDs
- Invalid/expired/missing tokens return a safe message

## 8. Email behaviour

On first request only:
- Admin: `triage_proposal_requested` → `LEAD_NOTIFY_EMAIL` / seed admin
- User: `triage_proposal_acknowledgement` → lead email  
Email/CRM failures do not roll back the DB write.

## 9. CRM behaviour

`queueLeadSync` after request. Lead description enriched with product, journey level, commercial intent, proposal reference. No duplicate CRM lead creation.

## 10. Audit events

`PROPOSAL_REQUESTED`, `PROPOSAL_PREPARATION_STARTED`, `PROPOSAL_SENT`, `PROPOSAL_ACCEPTED`, `PROPOSAL_DECLINED`, `PROPOSAL_EXPIRED`, `PROPOSAL_CANCELLED`, `TRIAGE_CONVERTED_TO_LEVEL2`

## 11. Level 2 conversion

Reuses `POST /triage/submissions/:id/convert` → `EXECUTIVE_ADVISORY_DIAGNOSTIC` with `convertedAt` / `convertedAssessmentId`. No second conversion engine.

## 12. Tests run

```
proposal-reference.spec.ts (2)
proposal-token.spec.ts (4)
proposal-transitions.spec.ts (4)
```
All passed.

## 13. Build result

`pnpm build` (shared + api + web) — **PASS**

## 14. Migration required

Yes: `20260824200000_triage_proposal_workflow`  
Apply via `pnpm db:migrate` / container startup migrate, or the SQL already applied to local moss-db.

## 15. Environment variables added

```
PROPOSAL_TOKEN_SECRET=   # optional; falls back to JWT_SECRET
PROPOSAL_TOKEN_TTL=30d
```
PDF URL base uses `PUBLIC_URL` / `WEB_URL` / `MOSS_WEB_URL`.

## 16. Remaining limitations

- No full proposal document generator / pricing engine (workflow entry point only)
- Espo custom fields for proposal status are description-based unless Entity Manager fields are added later
- On-screen result page contact CTA still uses WordPress contact for “Discuss my results”; primary Proposal CTA is on thank-you + PDF signed link
- Docker images must be rebuilt/recreated to pick up API/web changes in the running stack
