# SCL End-to-End UAT Checklist

**Companion:** `docs/SCL_COMMERCIAL_FUNNEL_ARCHITECTURE.md`  
**Date:** 2026-08-21  
**Environment:** Local / staging only unless Physical Risk explicitly authorises production UAT  
**Rule:** Do not mark **Pass** without evidence (screenshot, PDF, CRM ID, or log excerpt).  

Status values: `Not run` | `Pass` | `Fail` | `Blocked` | `N/A`

Illustrative prospect (non-production seed):

| Field | Value |
|-------|--------|
| Company | Example Enterprise Ltd |
| Role | CFO |
| Guard force | 500+ (via calibration scale inputs) |
| Annual security expenditure | R250m+ (via calibration / contract inputs) |
| Campaign | LinkedIn SCL |
| Series | 3 |
| Article | 5 |

Do **not** load these values into production seed data.

---

## How to use

1. Run against a non-production stack with EspoCRM + SMTP configured (or note Blocked).  
2. Fill **Actual result** and **Evidence** for each row.  
3. Record environment URL, build/commit SHA, and tester name at the bottom.  
4. Any scoring/mapping row that depends on unapproved methodology → **Blocked**.

---

## A. Marketing → landing → start

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| A1 | Dedicated SCL landing | Open SCL landing URL | Landing explains SCL, audience, indicative nature, time, deliverables, confidentiality, primary CTA | | Not run | |
| A2 | Primary CTA | Click “Assess Your Security Cost Leakage Exposure” (or approved wording) | Lands on assessment intro with attribution query preserved | | Not run | |
| A3 | LinkedIn CTA path | Open start URL with `source=linkedin&campaign=…&article=5&cta=assessment` | Session stores attribution fields (when Phase F done) | | Not run | |
| A4 | Attribution not required | Open `/start` with no query params | Assessment still starts | | Not run | |

---

## B. Assessment journey

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| B1 | Continuous journey | Complete intro → calibration → questions → details → review | No mid-flow “Start Questionnaire” gate; Back/Next throughout | | Not run | |
| B2 | Progress | Observe header | “Step X of Y” updates correctly | | Not run | |
| B3 | Preserve answers | Answer Q5, go Back, then Next | Prior answer retained | | Not run | |
| B4 | Percent ranges | Answer a percent calibration item | Options show 0–10% … 91–100%; value persists | | Not run | |
| B5 | ZAR money ranges | Answer C6/C7 style money loss | ZAR labels (e.g. R250,000); not R0 placeholder | | Not run | |
| B6 | Resume | Start assessment, refresh mid-flow (same browser) | Resumes near last step where session permits | | Not run | |
| B7 | Consent gate | Try Begin without consent | Blocked until consent checked | | Not run | |

---

## C. Company / contact capture

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| C1 | Company name | Enter Example Enterprise Ltd | Stored on lead + org | | Not run | |
| C2 | Industry | Select industry (or Other + text) | Stored; bare “Other” rejected if validation applies | | Not run | |
| C3 | Executive identity | First/last name + business email | Required fields enforced | | Not run | |
| C4 | Role / title | Select CFO | Stored on lead / CRM (when Phase C done) | | Not run | |
| C5 | Phone optional | Leave blank | Submit allowed | | Not run | |
| C6 | Country | Enter country (when field exists) | Stored | | Not run | |
| C7 | No unnecessary PII | Review form | No excess personal fields | | Not run | |

---

## D. Scoring / result integrity

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| D1 | Submit evaluates | Submit & evaluate | Assessment reaches evaluated/submitted; ScoreSnapshot created | | Not run | |
| D2 | Risk ≠ confidence | Inspect result objects | Risk classification separate from confidence fields | | Not run | |
| D3 | Classification labels | View result / PDF | GREEN/YELLOW/AMBER/RED with text label (e.g. HIGH EXPOSURE — RED) | | Not run | |
| D4 | Money not R0 | Where spend/leakage expected | Indicative figures non-zero when inputs imply spend | | Not run | |
| D5 | Website = PDF | Compare public result vs PDF | Same ScoreSnapshot-derived values | | Not run | |
| D6 | No public formulas | Inspect public UI | Technical scoring formulas not exposed | | Not run | |
| D7 | Wording boundary | Read result/PDF disclaimer | Not presented as audit/forensic/legal finding | | Not run | |

---

## E. PDF report

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| E1 | Generate | Complete assessment | Preliminary executive PDF generated | | Not run | |
| E2 | Branding | Open PDF | Logo, website, contact details present | | Not run | |
| E3 | Filename | Download / storage key | `Physical-Risk-Security-Cost-Leakage-[Company]-[Date].pdf` | | Not run | |
| E4 | Content | Review PDF | Company, date, assessment ID/ref, summary, classification, indicator, exposure, observations, next step, disclaimer | | Not run | |
| E5 | CTA link | Click Book MOSS Assessment (if present) | Opens approved contact URL | | Not run | |

---

## F. Email delivery

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| F1 | Thank-you email | Complete with real mailbox | Email received with PDF attachment | | Not run | |
| F2 | Job record | Check EmailJob admin | assessmentId / recipient / status / timestamp recorded | | Not run | |
| F3 | Failure isolation | Force SMTP failure | Assessment + score still persisted; job retryable | | Not run | |
| F4 | No infra leak | Read email body | No internal hostnames/keys exposed | | Not run | |

---

## G. CRM (EspoCRM)

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| G1 | Organisation | Complete once | Account created/updated; Moss org ID linked | | Not run | |
| G2 | Contact | Complete once | Contact created/updated by email | | Not run | |
| G3 | Lead | Complete once | Lead created/updated; assessment reference associated | | Not run | |
| G4 | Opportunity | After sync | Opportunity linked to assessment; SCL fields populated where configured | | Not run | |
| G5 | Follow-up | After sync | Task created per follow-up days config | | Not run | |
| G6 | Dedup | Submit twice same email/company | No duplicate Lead/Contact storms | | Not run | |
| G7 | CRM down | Disable Espo / break API | Assessment retained; CrmSyncRecord PENDING/FAILED with retry | | Not run | |
| G8 | Campaign on CRM | Complete with attribution | Campaign/source visible on lead/opp (Phase F) | | Not run | |
| G9 | Enrichment | N/A unless licensed | Contact enrichment not assumed | | N/A | Capture-only today |

---

## H. Public result actions

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| H1 | Result screen | After submit | Shows branding, company, date, classification, indicator, exposure, observations, next action | | Not run | |
| H2 | Download Report | Click Download | PDF downloads with correct filename | | Not run | |
| H3 | Email Report | Click Email | Queues delivery; status recorded | | Not run | |
| H4 | Request Advisory | Click CTA | Uses approved booking/contact flow; ties assessment + company + contact + lead + campaign | | Not run | |

---

## I. Analytics / admin (when built)

| ID | Requirement | Test | Expected result | Actual result | Status | Evidence |
|----|-------------|------|-----------------|---------------|--------|----------|
| I1 | Funnel events | Complete full path | Events for view/start/complete/report/lead/follow-up | | Not run | |
| I2 | Admin SCL view | Open admin grid | Assessment ID, company, executive, role, spend/guards, classification, report, CRM lead, campaign, status, date | | Not run | |
| I3 | Filters | Filter by classification/campaign/role/date | Correct subset | | Not run | |
| I4 | Public isolation | As anonymous user | Analytics/admin not exposed | | Not run | |

---

## J. Scenario script — LinkedIn → CRM

**Script name:** LinkedIn Series 3 Article 5 → Example Enterprise Ltd (CFO)

| Step | Action | Expected | Actual | Status | Evidence |
|------|--------|----------|--------|--------|----------|
| J1 | Open LinkedIn CTA URL with campaign params | Landing/start with attribution | | Not run | |
| J2 | Accept consent; begin | Intro → calibration | | Not run | |
| J3 | Complete calibration (scale ≈ 500+ guards, R250m+ spend profile) | Progress advances | | Not run | |
| J4 | Complete questionnaire | Contact step | | Not run | |
| J5 | Enter company + CFO contact | Lead captured | | Not run | |
| J6 | Review & submit | Result + snapshot | | Not run | |
| J7 | Verify PDF | Branded; company in filename; not R0 incorrectly | | Not run | |
| J8 | Verify email | Delivered | | Not run | |
| J9 | Verify EspoCRM | Lead + Opp + Task; assessment linked; no dupes | | Not run | |
| J10 | Verify attribution | Campaign/series/article retained | | Not run | |

---

## K. Regression / non-goals

| ID | Requirement | Test | Expected | Actual | Status | Evidence |
|----|-------------|------|----------|--------|--------|----------|
| K1 | Scoring unchanged without approval | Diff methodology constants | No unapproved formula changes | | Not run | |
| K2 | MOSS Master Catalogue unaffected | Spot-check MOSS product paths | SCL changes do not break MOSS catalogue product isolation | | Not run | |
| K3 | No production auto-deploy | Check deploy logs | UAT did not push production | | Not run | |

---

## UAT run log

| Field | Value |
|-------|--------|
| Environment URL | |
| Commit / image SHA | |
| Tester | |
| Date | |
| EspoCRM enabled | Yes / No |
| SMTP configured | Yes / No |
| Overall outcome | |
| Blockers (client methodology) | |
| Defects filed | |

---

## Mapping to architecture phases

| Checklist section | Earliest phase for Pass |
|-------------------|-------------------------|
| A Landing / attribution | B + F |
| B Journey | B (core already largely IMPLEMENTED) |
| C Contact fields | C |
| D Scoring integrity | Existing core; public result D |
| E PDF | Existing core (E5 CTA IMPLEMENTED in PDF) |
| F Email | Existing core |
| G CRM | Existing core; G8 needs F |
| H Result actions | D |
| I Analytics / admin | G |
| J Full script | H (after B–G scoped) |
