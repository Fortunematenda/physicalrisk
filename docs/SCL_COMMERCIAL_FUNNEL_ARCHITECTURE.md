# SCL Commercial Funnel — Architecture Assessment

**Document type:** Phase A architecture audit (read-only)  
**Date:** 2026-08-21  
**Scope:** Security Cost Leakage (SCL / SCLI) end-to-end revenue funnel  
**Production:** Not modified. No automatic production deploy.

Status vocabulary (explicit):

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Present and usable in current codebase |
| **PARTIAL** | Present but incomplete vs target architecture |
| **NOT IMPLEMENTED** | Absent |
| **TESTED** | Verified with evidence in this audit cycle (none claimed here without evidence) |
| **BLOCKED BY CLIENT METHODOLOGY** | Cannot finalise without Physical Risk approval |

This document does **not** claim TESTED for any item unless a contemporaneous test evidence section is attached. Phase A is assessment only.

---

## 1. Business objective

SCL is not an isolated questionnaire. It is the conversion mechanism that connects Physical Risk thought leadership to advisory revenue:

```text
LinkedIn / campaign content
  → CTA
  → Physical Risk website / landing
  → short SCL diagnostic
  → indicative executive result
  → branded PDF
  → prospect captured
  → CRM lead / opportunity
  → Physical Risk advisory follow-up
```

**Audience:** enterprise executives (CFO, CEO, COO, governance/risk, procurement, security) with material physical-security spend (e.g. large footprint, ~500+ guards, ~R250m+ annual security expenditure — illustrative profile, not hard-coded gates).

**Positioning (must preserve):**

- Indicative executive diagnostic / decision-support
- **Not** statutory audit, forensic conclusion, confirmed recovery, legal opinion, or accusation of fraud/provider misconduct

Use approved Physical Risk methodology wording only. Do not invent marketing claims.

---

## 2. Target architecture

```text
MARKETING LAYER
  Campaign / LinkedIn / Website content
       ↓
  CTA / Landing page
       ↓
DIAGNOSTIC LAYER
  Assessment session → Calibration → Questionnaire
       ↓
  Scoring / Classification → Indicative exposure → Executive result
       ↓
REPORTING LAYER
  Normalized SCL Result → PDF → Download / Email
       ↓
COMMERCIAL LAYER
  Organisation → Contact → CRM Lead → Qualification → Opportunity → Follow-up
       ↓
ANALYTICS LAYER
  View → Start → Complete → Report → Lead → Opportunity
```

**Buy-before-build:** use existing EspoCRM. Do not create a second CRM.

---

## 3. Architecture diagram (as-is vs target)

```text
AS-IS (implemented core path)
─────────────────────────────
WordPress / header CTA ──source forced "wordpress"──► moss-web /start
                                                         │
                    intro → calibration → Q1–Q20 → details → review → thanks
                                                         │
                              public API (persist answers + lead)
                                                         │
                              assessments.evaluate → ScoreSnapshot
                                                         │
                    ┌───────────────┬────────────────────┼────────────────┐
                    ▼               ▼                    ▼                ▼
              EmailJob        Report PDF           CrmSyncRecord      AuditEvent
           (thank-you+PDF)  (from snapshot)      (EspoCRM Lead/      (admin-ish)
                                                  Opp/Task queue)

TARGET GAPS (not yet productised)
─────────────────────────────────
Dedicated SCL landing + UTM/campaign fields
Public executive result UI (classification + actions)
Commercial lead-qualification layer (≠ SCL risk score)
Product analytics funnel
Consent audit fields + approved privacy text
Role / country / spend-range as CRM-facing lead fields
In-app "Request Advisory" tied to assessment + campaign
```

---

## 4. Layer-by-layer assessment

### 4.1 Marketing layer

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| WordPress marketing site | **PARTIAL** | Hosts content; page bodies largely off-repo (Elementor/DB). |
| LinkedIn posts plugin | **IMPLEMENTED** | `wordpress/wp-content/plugins/pr-linkedin-posts/` — display/OAuth only. |
| LinkedIn → SCL CTA attribution | **NOT IMPLEMENTED** | Plugin has no assessment/UTM hooks. |
| Header/footer CTAs to `/start` | **IMPLEMENTED** | `PhysicalRiskShell.tsx`, `PublicSiteHeader.tsx` → `/start?source=wordpress`. |
| Dedicated SCL landing page | **NOT IMPLEMENTED** | No `/security-cost-leakage` (or equivalent) landing with approved copy. |
| CTA label clarity | **PARTIAL** | “Book MOSS Assessment” and questionnaire share the same `/start` deep-link in places. |

**Client decisions:** approved landing copy, primary CTA wording, whether WordPress or moss-web owns the landing page.

---

### 4.2 Diagnostic layer (questionnaire journey)

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Continuous public journey | **IMPLEMENTED** | `moss/apps/web/app/start/StartClient.tsx` phases: `intro` → `calibration` → `questions` → `details` → `review` → `thanks`. |
| Mid-flow “Start Questionnaire” gate | **IMPLEMENTED** (removed) | Continuous Back/Next; calibration is part of the same journey. |
| Step X of Y + progress | **IMPLEMENTED** | `scl-assessment-flow.ts` / `resolveJourneyStep`. |
| Answer preserve / Back–Next | **IMPLEMENTED** | Local draft + server progress PATCH. |
| Resume (same browser) | **PARTIAL** | Cookie `moss.public-assessment` + localStorage draft; no magic-link cross-device resume. |
| Percent ranges (C10–C18) | **PARTIAL** | UI live; midpoints `PROVISIONAL_MIDPOINT` — **BLOCKED BY CLIENT METHODOLOGY** for final maps. |
| ZAR money ranges (C6/C7) | **PARTIAL** | UI catalogue live; scoring map `PENDING_CLIENT_CONFIRMATION`. |
| Exact currency where required (e.g. C5) | **IMPLEMENTED** | Intentional exact input for contract value. |
| Company / contact capture | **PARTIAL** | Org, industry, name, email, optional phone **after** questions. Missing: role/title, country, explicit guard-force/spend as lead fields (spend/guards exist as **calibration inputs**, not CRM lead columns). |
| Role options (CFO/CEO/…) | **NOT IMPLEMENTED** | No role field on public details or `PublicLead`. |
| Consent UX | **PARTIAL** | Intro checkbox + `CONSENT_TEXT` in UI. No versioned consent record, timestamp, or privacy-policy link on lead. |
| Public executive result screen | **NOT IMPLEMENTED** | Thanks page only; no classification / indicator / exposure / Download / Email / Advisory CTAs. |

**Flow today:**

```text
Introduction (+ consent)
  → Calibration (C1–C23 groups)
  → Assessment (Q1–Q20)
  → Company / Contact
  → Review
  → Submit (`POST /public/complete-assessment`)
  → Thanks (no on-screen result)
```

**Target flow** aligns with the above, plus a real **Results** phase before/instead of bare thanks.

Key files:

- `moss/apps/web/app/start/page.tsx`, `StartClient.tsx`
- `moss/apps/web/lib/scl-assessment-flow.ts`, `scl-question-nav.ts`
- `moss/apps/api/src/public/public.controller.ts`, `public.service.ts`, `anonymous-session.service.ts`

---

### 4.3 Scoring / evaluation

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Weighted risk + bands | **IMPLEMENTED** | `@moss/shared` `scoring.ts` |
| Leakage / indicative exposure | **IMPLEMENTED** | `leakage.ts` → `ScoreSnapshot.leakageResult` |
| Confidence / evidence confidence | **IMPLEMENTED** | Separate fields on snapshot (`methodologyConfidence`, `evidenceConfidence`) |
| Opportunity score (commercial-ish) | **PARTIAL** | `opportunity.ts` — engagement/financial materiality score, **not** a named lead-qualification status engine |
| Persist normalized result | **IMPLEMENTED** | `ScoreSnapshot` (Prisma) |
| Public API complete path | **IMPLEMENTED** | `completeAssessment` → evaluate/submit → email + CRM queue |

**Normalized path (already correct for PDF):**

```text
Answers → AssessmentsService.evaluate → ScoreSnapshot
                                              ↓
                                    ReportsService.createPdf (reads snapshot)
                                              ↓
                                    renderSclExecutivePdf (presentation only)
```

PDF does **not** re-score independently. Keep this invariant.

**Do not reverse score direction or change band thresholds without approval** — see existing score-direction audits and methodology docs.

---

### 4.4 Reporting layer

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Branded SCL PDF | **IMPLEMENTED** | `scl-report-pdf.ts`, `scl-report-branding.ts`, `scl-report-visual.ts` |
| Logo / website / contact | **IMPLEMENTED** | Letterhead + footer |
| Classification + Green/Yellow/Amber/Red + text labels | **IMPLEMENTED** | Visual panel + accessible labels |
| Filename `Physical-Risk-Security-Cost-Leakage-[Company]-[Date].pdf` | **IMPLEMENTED** | Branding helpers + storage disposition |
| Download (authenticated) | **IMPLEMENTED** | Reports APIs / analyst UI |
| Download (public funnel) | **NOT IMPLEMENTED** | Prospect cannot download from thanks page |
| Email PDF on complete | **IMPLEMENTED** | Async `EmailJob` + thank-you with attachment |
| Email on demand from result page | **NOT IMPLEMENTED** | Public UI |
| Report history (admin/analyst) | **PARTIAL** | Reports per assessment; no prospect-facing history |
| Methodology disclaimer in PDF | **IMPLEMENTED** | Report note / preliminary framing |

---

### 4.5 Commercial / CRM layer

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| CRM product | **IMPLEMENTED** | **EspoCRM** only (`moss/apps/api/src/crm/`) — Buy-before-build satisfied |
| HubSpot/Salesforce first-party SCL sync | **NOT IMPLEMENTED** | (WP MetForm HubSpot vendor code is unrelated) |
| Organisation → Account | **IMPLEMENTED** | Dedup via custom Moss ID / name |
| PublicLead → Lead + Contact | **IMPLEMENTED** | Email + Moss ref fields; queue + retries |
| Assessment → Opportunity | **IMPLEMENTED** | Stage mapping by assessment status |
| Follow-up Task | **IMPLEMENTED** | `ESPOCRM_FOLLOW_UP_DAYS` |
| Associate assessment ID / SCL scores / leakage fields | **PARTIAL** | Custom opportunity fields configurable; campaign metadata **not** synced |
| Duplicate prevention | **PARTIAL** | Email / Moss IDs / conflict handling; needs UAT evidence per environment |
| Persist assessment before CRM | **IMPLEMENTED** | Assessment + snapshot first; CRM via `CrmSyncRecord` async |
| Commercial lead qualification statuses | **NOT IMPLEMENTED** | No LOW/QUALIFIED/HIGH/EXECUTIVE FOLLOW-UP engine separate from SCL risk / opportunity score |
| Contact enrichment (find other execs at same firm) | **NOT IMPLEMENTED** | Capture-only. Would need licensed data provider + privacy review — **do not scrape** |
| In-app booking / Request Advisory | **NOT IMPLEMENTED** | Website `#contact` / `POST /public/contact` is separate from SCL result |

**Models (MOSS Postgres):**

| Model | Role |
|-------|------|
| `Organisation` | Account analogue |
| `PublicLead` | Funnel contact + progress + Espo IDs |
| `AssessmentSession` | Diagnostic session (`productCode = SCLI_COST_LEAKAGE`) |
| `ScoreSnapshot` | Normalized SCL result |
| `Report` | PDF artifact |
| `CrmSyncRecord` | Outbound CRM jobs |
| `ContactSubmission` | Website contact form (parallel path) |

There is **no** separate Prisma `Contact` / `Lead` / `Opportunity` table — EspoCRM owns those entities. Correct: do not duplicate CRM entities in MOSS.

Doc: `moss/docs/ESPOCRM_INTEGRATION.md`

---

### 4.6 Campaign attribution

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Query `source` accepted by UI | **PARTIAL** | Read then **forced** to `'wordpress'` in `AnonymousSessionService.canonicalSource` |
| `medium`, `campaign`, `series`, `article`, `cta`, `referrer`, `landingPage` | **NOT IMPLEMENTED** | No columns / DTO / persistence |
| Store on assessment session | **NOT IMPLEMENTED** | Only `PublicLead.source` (effectively wordpress) |
| LinkedIn series/article analytics | **NOT IMPLEMENTED** | Requires generic campaign metadata model |

Example target URL (not yet supported end-to-end):

```text
/security-cost-leakage/start
  ?source=linkedin
  &campaign=scl-series-3
  &article=5
  &cta=assessment
```

---

### 4.7 Analytics layer

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Product funnel events | **NOT IMPLEMENTED** | No PostHog/Segment/GA events in moss apps |
| Progress fields on lead | **PARTIAL** | `progressPhase`, `progressPercent`, etc. — operational, not analytics funnel |
| Admin funnel dashboard | **NOT IMPLEMENTED** | Views/starts/completion/qualified leads not productised |
| Audit events | **PARTIAL** | `AuditEvent` for CRM/admin actions; not full funnel taxonomy |

Target events (future): landing viewed, started, calibration done, questionnaire done, contact submitted, assessment submitted, result viewed, PDF downloaded, PDF emailed, CRM lead created, follow-up requested, opportunity created.

---

### 4.8 Admin / operator views

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Assessments list/detail | **IMPLEMENTED** | `moss/apps/web/app/assessments/*` |
| Organisations (+ embedded leads) | **PARTIAL** | Org detail shows leads; no dedicated SCL leads inbox |
| EspoCRM settings / logs | **IMPLEMENTED** | Integrations settings + retry APIs |
| Email job admin | **IMPLEMENTED** | `/admin/emails` |
| Audit logs | **IMPLEMENTED** | `/admin/audit-logs` |
| SCL admin grid (company, role, spend, campaign, classification, CRM lead) | **NOT IMPLEMENTED** | Needs role/campaign fields first |

---

### 4.9 Failure handling & audit

| Capability | Status | Evidence / notes |
|------------|--------|------------------|
| Assessment persist before integrations | **IMPLEMENTED** | Complete path evaluates first |
| CRM retry queue | **IMPLEMENTED** | `CrmSyncRecord` backoff (~5 attempts) |
| Email retry queue | **IMPLEMENTED** | `EmailJob` attempts |
| Contact form CRM/email retries | **IMPLEMENTED** | `ContactSubmission` |
| Silent public failure | **PARTIAL** | UI shows errors on submit; thanks does not surface PDF/CRM failure to prospect (by design soften) — ensure ops monitoring |
| Funnel audit taxonomy | **PARTIAL** | CRM/email audits exist; not full commercial funnel actions |

---

## 5. Data flow (target normalized)

```text
CampaignAttribution (optional)
        ↓
AssessmentSession + AssessmentInputValue + AssessmentResponse
        ↓
SCL Evaluation Service (AssessmentsService.evaluate)
        ↓
ScoreSnapshot  ←── single source of truth for risk / leakage / confidence
        ↓
Public Result DTO  ──► Result UI
        ↓
Report DTO         ──► PDF Renderer (no scoring)
        ↓
Organisation + PublicLead ──► EspoCRM Account / Lead / Contact
        ↓
Opportunity + Task (follow-up)
```

**Conceptual result DTO (expose only fields methodology supports):**

```json
{
  "riskClassification": "HIGH EXPOSURE — RED",
  "riskScore": 0,
  "assuranceScore": null,
  "confidenceBand": null,
  "indicativeLeakage": {},
  "financialExposure": {},
  "recommendedAction": ""
}
```

Map from existing `ScoreSnapshot` / leakage JSON; do not invent new score formulas for the DTO.

---

## 6. CRM enrichment (A vs B)

| Capability | Status | Implication |
|------------|--------|-------------|
| **A. Lead capture** (executive self-enters details) | **IMPLEMENTED** (partial fields) | Primary path today |
| **B. Contact enrichment** (discover other CFO/CEO/COO at same enterprise) | **NOT IMPLEMENTED** | Requires licensed provider API, DPA, POPIA/GDPR review, EspoCRM write policy |

**Do not build scraping.** Document enrichment as a client decision + procurement item, not an engineering default.

---

## 7. Privacy and consent

| Item | Status |
|------|--------|
| Intro consent checkbox | **PARTIAL** |
| Approved privacy policy link | **NOT IMPLEMENTED** (flag for Physical Risk legal copy) |
| Consent version + timestamp on `PublicLead` | **NOT IMPLEMENTED** |
| Marketing vs assessment consent split | **NOT IMPLEMENTED** |
| Contact source + lawful storage via CRM | **PARTIAL** (source forced wordpress; CRM stores lead) |

**Client decision:** supply approved privacy / consent wording; do not invent legal text.

---

## 8. Existing vs missing summary matrix

| Area | Status |
|------|--------|
| Continuous SCL questionnaire | **IMPLEMENTED** |
| Calibration as part of journey | **IMPLEMENTED** |
| Percent / ZAR executive-friendly inputs | **PARTIAL** / **BLOCKED BY CLIENT METHODOLOGY** (final maps) |
| Scoring + ScoreSnapshot | **IMPLEMENTED** |
| Branded PDF from snapshot | **IMPLEMENTED** |
| Async email with PDF | **IMPLEMENTED** |
| EspoCRM Lead/Account/Opp/Task | **IMPLEMENTED** |
| Dedicated SCL landing | **NOT IMPLEMENTED** |
| Campaign attribution (generic) | **NOT IMPLEMENTED** |
| Public result page + CTAs | **NOT IMPLEMENTED** |
| Role / country on lead | **NOT IMPLEMENTED** |
| Commercial lead qualification engine | **NOT IMPLEMENTED** (config-only recommended) |
| Product analytics funnel | **NOT IMPLEMENTED** |
| SCL leads admin view | **NOT IMPLEMENTED** |
| Contact enrichment | **NOT IMPLEMENTED** |
| In-app advisory booking tied to assessment | **NOT IMPLEMENTED** |
| E2E funnel automated tests | **PARTIAL** (unit/spec coverage exists; full LinkedIn→CRM E2E **NOT IMPLEMENTED**) |

---

## 9. Implementation phases (do not big-bang)

| Phase | Focus | Depends on |
|-------|--------|------------|
| **A** | Architecture audit (this document) | — |
| **B** | Assessment funnel cleanup (landing entry, result phase skeleton, journey polish) | Approved CTA/landing copy where needed |
| **C** | Contact/company capture (role, country, consent audit fields) | Approved privacy text |
| **D** | Result + report integration (public result from ScoreSnapshot; download CTA) | — |
| **E** | CRM linkage hardening (assessment/campaign on Lead/Opp; dedupe UAT) | Espo field names |
| **F** | Campaign attribution (generic metadata; stop forcing wordpress-only) | Attribution schema approval |
| **G** | Analytics events + admin funnel | Event taxonomy |
| **H** | UAT (see checklist) | Phases B–G as scoped |

After each phase: test → document → **commit separately** (only when requested).

---

## 10. Client-dependent items (do not invent)

Flagged for Physical Risk confirmation:

1. Score direction and risk band thresholds  
2. Percentage range → score mappings (exit provisional midpoints)  
3. Monetary band → score mappings  
4. Lead qualification weights / status rules  
5. Final report wording and template lock  
6. Landing page and CTA wording  
7. Privacy / consent legal text  
8. Whether CRM enrichment (capability B) is required and licensed  
9. Whether public result may show indicative ZAR exposure figures (and how framed)  
10. Booking tool of record (WordPress contact vs calendar vs Espo task only)

Until approved: implement **structure/config**, mark values **BLOCKED BY CLIENT METHODOLOGY**.

---

## 11. Known dependencies

- EspoCRM availability + API user + custom fields (`ESPOCRM_*`)  
- SMTP / `EmailJob` processing for prospect PDF delivery  
- WordPress (or moss-web) hosting of landing content  
- Questionnaire seed / model version for SCLI  
- Brand assets under `moss/apps/api/src/reports/assets/`  
- Local SSO stack: `docker-compose.sso.yml` + `.env.sso` (dev); production separate  

---

## 12. Related documentation

| Doc | Role |
|-----|------|
| `moss/docs/ESPOCRM_INTEGRATION.md` | CRM mapping & queues |
| `moss/docs/ARCHITECTURE.md` | WP / MOSS / Espo boundaries |
| `moss/docs/METHODOLOGY.md` | Scoring / opportunity |
| `docs/SCL_SCORE_DIRECTION_AUDIT.md` | Score / band semantics |
| `docs/SCL_END_TO_END_UAT_CHECKLIST.md` | Companion UAT checklist |
| `docs/README.md` | Docs index |

---

## 13. Phase A conclusion

**What already exists:** a working diagnostic core — continuous public assessment, scoring snapshot, branded PDF, email queue, and EspoCRM sync with retries.

**What is partial:** attribution, contact completeness for CRM qualification, public result UX, consent auditability, admin lead grid, opportunity-as-sales-qualification.

**What is missing for the commercial funnel story:** dedicated landing + campaign metadata, executive result page with conversion actions, separate commercial lead-qualification layer, product analytics, and enrichment (explicitly out of scope until licensed).

**Next recommended engineering phase:** **Phase B** (funnel cleanup + landing entry) in parallel with gathering client decisions in §10 — without changing scoring formulas.
