# MOSS — Client Confirmations Required

**To:** Physical Risk (methodology / commercial owners)  
**From:** Bretune (technical)  
**Re:** MOSS 100-control product — decisions needed before / during build  
**Date:** 2026-08-09  

This note lists **only** items that need your confirmation. Technical choices (database shape, routing, ProductCode for SCLI vs MOSS, reference prefixes, etc.) will follow the approved architecture plan and do not require your input here.

**Context:** Cost Leakage / SCLI remains the live diagnostic and will be preserved. MOSS is a **separate** 14-domain / 100-control product. This is not a commercial acceptance certificate for Phase 3.

**MOSS Master Catalogue v3.0 source of truth:**  
`moss/docs/source/20260604 Physical_Risk_MOSS_100_Control_Master_Catalogue_v3.json`  
(Catalogue file delivery is **resolved** — not listed below.)

---

### 1. Domain and overall score aggregation

**Question:** How should domain scores and the overall MOSS score be calculated from control scores (0–4)? (e.g. simple average, weighted average, minimum, other — please specify weights if any.)

**Why needed:** Maturity labels 0–4 are clear; aggregation rules are not defined in code or in-repo docs.

**Blocked without it:** Automated domain/overall scoring (M4). Per-control score capture can proceed earlier.

**Recommended default if you delegate:** Unweighted mean of scored controls per domain; unweighted mean of domain scores for overall; unscored controls excluded until complete; overall may remain blank until assessment is complete.

---

### 2. Critical controls and severity

**Question:** Are any controls “critical” with special scoring or reporting rules? If findings are auto-generated, what score→severity mapping should apply?

**Why needed:** Affects results presentation and automated findings.

**Blocked without it:** Critical-control logic and auto-severity (M4/M6). Manual findings can still be entered.

**Recommended default if you delegate:** No critical overrides in v1; findings created manually by assessors; severity chosen by assessor.

---

### 3. Is Site mandatory on every MOSS assessment?

**Question:** Must every MOSS assessment be linked to a Site, or may some assessments be organisation-only?

**Why needed:** Not stated as mandatory in repository documentation; affects create-assessment validation.

**Blocked without it:** Enforcement rule only. Site master data can still be built.

**Recommended default if you delegate:** Site **recommended** and strongly prompted in UI, but not hard-blocked in v1 API validation.

---

### 4. Automatic recommendations

**Question:** Should the system auto-create recommendations from catalogue text (failure conditions / technology substitution / manpower optimisation) when a control scores below a threshold, or should assessors/reviewers create and edit recommendations manually in v1?

**Why needed:** Catalogue text can supply wording; automation rules are a product choice.

**Blocked without it:** Recommendation automation (M6). Manual recommendations can proceed.

**Recommended default if you delegate:** v1 = display catalogue guidance on the control screen; recommendations created/edited manually in review; no auto-generation.

---

### 5. MOSS financial calculations in v1

**Question:** Confirm that MOSS v1 stores catalogue financial metadata only and does **not** run leakage/SLA/incident-cost engines (those stay with Cost Leakage / SCLI unless you specify otherwise).

**Why needed:** Avoids mixing SCLI financial engines into MOSS.

**Blocked without it:** Any MOSS financial calculation build.

**Recommended default if you delegate:** Metadata only in v1; no MOSS financial calculations until a later signed methodology note.

---

### 6. System-suggested scores in v1

**Question:** For v1, should control scores be assessor-selected only (0–4), or should the system suggest scores from thresholds / evidence / inspection results?

**Why needed:** Determines whether suggestion logic is in scope for early releases.

**Blocked without it:** Suggested-score features only. Manual scoring can proceed.

**Recommended default if you delegate:** Assessor-selected scores only in v1; suggestion/trace fields added later if required.

---

Please reply with answers to items 1–6 (or “accept recommended default” per item).

Schema foundations (M1) and catalogue import (M2) can proceed without blocking on aggregation formulas (items 1–2); those still block M4 scoring compute.
