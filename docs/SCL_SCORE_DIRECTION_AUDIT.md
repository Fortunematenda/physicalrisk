# SCL Score Direction Audit

**Date:** 2026-08-20  
**Product:** Security Cost Leakage (SCLI / `SCLI_COST_LEAKAGE`)  
**Trigger:** Client UAT — a score such as **71%** is classified as **High** risk, but visually feels “positive/good.”  
**Scope:** Presentation / semantics audit only. **Scoring engine not modified.**  
**Deployment:** Documentation only.

---

## Executive verdict

| Question | Answer |
|----------|--------|
| What does 71% currently mean? | **Overall SCLI Risk Score ≈ 71 on a 0–100 scale** — a weighted average of questionnaire **option risk scores**. It is **not** “71% assured,” “71% mature,” or “71% leakage.” |
| Is higher mathematically better or worse? | **Worse** for the primary risk score. Higher option/category/overall risk → more risk. |
| Calculation wrong, or label misleading? | **Calculation matches methodology.** The **label / metaphor / dual-scale UI** is what misleads. |
| Is classification from the same score? | **Yes.** `riskBand` is derived from `overallRiskScore` via fixed thresholds. |
| Separate risk/exposure values? | **Yes** — maturity view, leakage ZAR/rates, methodology confidence, evidence confidence, opportunity. |
| Does methodology define directionality? | **Yes.** Workbook/METHODOLOGY: risk rises with score; **Maturity View = 100 − Overall SCLI Risk Score**. |
| Calculation change required now? | **No** — not for this UAT concern. Fix presentation; do **not** silently invert with `100 − score` as the primary risk display (maturity already exists for that). |

---

## 1. What the displayed “71%” is

### Primary result metric

**Field:** `ScoreSnapshot.overallRiskScore`  
**Engine:** `calculateAssessmentScore()` in `moss/packages/shared/src/scoring.ts`  
**Produced at evaluate:** `AssessmentsService.evaluate()` → snapshot create.

Stakeholders often say “71%” for a **0–100 risk index**. The app usually prints **`71` / `71.0/100`**, not always a `%` suffix — but rings and conversational UAT still read it as a percentage.

### Current formula (questionnaire / risk score)

```text
Weighted Question Score = Response Risk Score × Question Weight
Category Score          = Σ(category weighted scores) / Σ(category weights)
Overall SCLI Risk Score = Σ(all weighted scores) / Σ(all weights)
Maturity View           = 100 − Overall SCLI Risk Score
Risk Band               = f(Overall SCLI Risk Score)   // see thresholds below
```

Source (implementation):

```38:49:moss/packages/shared/src/scoring.ts
  const overallRiskScore = totalWeight ? totalWeightedScore / totalWeight : 0;
  // ...
  return {
    overallRiskScore,
    maturityScore: 100 - overallRiskScore,
    riskBand: getRiskBand(overallRiskScore),
```

Source (methodology doc aligned to SCLI v1.1 workbook):

```13:20:moss/docs/METHODOLOGY.md
## Weighted assessment score

Weighted Question Score = Response Risk Score × Question Weight
Category Score = Sum(Category Weighted Scores) / Sum(Category Weights)
Overall SCLI Risk Score = Sum(All Weighted Scores) / Sum(All Weights)
Maturity View = 100 - Overall SCLI Risk Score
```

### Per-option direction (confirms “higher = worse”)

From seeded catalogue `moss/apps/api/prisma/scli-v1.1.json` (Q1 example):

| Response | `riskScore` |
|----------|-------------|
| Yes – comprehensive SLA | **0** |
| Yes – partial/basic SLA | **40** |
| No formal SLA | **90** |
| Unknown | **75** |

Better control posture → **lower** risk score. That direction is baked into the catalogue, not inverted at roll-up.

---

## 2. Audit of related scores (what they are / direction)

| Concept | Stored field / source | Scale | Higher means | Used for classification of “High risk”? |
|---------|----------------------|-------|--------------|------------------------------------------|
| **Questionnaire / SCLI risk score** | `overallRiskScore` | 0–100 | **More risk (worse)** | **Yes** — primary |
| **Category scores** | `categoryScores[].score` | 0–100 | **More risk in that category** | Indirect (drivers); same direction |
| **Governance / maturity score** | `maturityScore` = `100 − overallRiskScore` | 0–100 | **More maturity (better)** | No — inverse view of the same risk |
| **Risk / assurance “band”** | `riskBand` via `getRiskBand(overallRiskScore)` | Controlled…Critical | Band worsens as risk rises | **Yes** — same score |
| **“Assurance score” (opportunity input)** | Category **Executive Assurance** score from questionnaire | 0–100 risk-style | **More risk in that category** (same engine) | Feeds opportunity, not the High band |
| **Leakage exposure** | `leakageResult` rates + ZAR | rates 0–1, ZAR | **Higher exposure = worse** | Separate financial model |
| **Methodology confidence** | `methodologyConfidence` (from leakage coverage quality) | ~0.35–0.9 | **Higher = more confidence in model coverage** | No — separate |
| **Evidence confidence** | `evidenceConfidence` | 0–1 | **Higher = stronger evidence completeness** | No — separate |
| **Opportunity score** | `opportunityScore` | 0–100 | **Higher = more commercial opportunity** | No — commercial, not client risk band |

### Leakage use of risk score

Leakage rates are **not** “71% leakage.” The questionnaire risk enters as a small factor:

```text
questionnaireRiskFactor = clamp01(overallRiskScore / 100)   // e.g. 0.71
```

then adds to likely/max rate formulas (`moss/packages/shared/src/leakage.ts`). Displayed leakage **percentages** on reports are **rates of annual security spend** (e.g. likely leakage rate × 100), via `pct` / PDF `percent()` — a different quantity.

### Confidence (not the 71)

- **Methodology confidence:** coverage-quality clamp in leakage result; PDF shows e.g. `72.0%` from a **0–1** fraction.
- **Evidence confidence:** completion / unknowns / evidence submitted & verified (`confidence.ts`).

Methodology: these **remain separate from the risk score** (`moss/docs/METHODOLOGY.md`).

### Opportunity

Combines risk severity (uses high `overallRiskScore` as a **positive** contributor to opportunity), financial materiality, Executive Assurance category score, recoverability, urgency, readiness, evidence confidence (`opportunity.ts`). **Not** the client “High risk” label.

---

## 3. Classification logic (same score)

```2:7:moss/packages/shared/src/scoring.ts
export function getRiskBand(score: number): RiskBand {
  if (score >= 75) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Controlled';
}
```

Aligned with workbook seed `riskBands` in `scli-v1.1.json` and `METHODOLOGY.md`:

| Overall SCLI Risk Score | Band |
|-------------------------|------|
| 0 – 39.99 | Controlled |
| 40 – 59.99 | Moderate |
| **60 – 74.99** | **High** |
| 75 – 100 | Critical |

So **71 → High** is **correct** under current methodology. Classification and the number are the **same** underlying metric.

UI note: some lists relabel `Controlled` → **Low** for display (`assessments/page.tsx`, `assigned/page.tsx`) — cosmetic only.

---

## 4. Worked example producing ~71 (High)

Illustrative three-item roll-up (same formula as production):

| Item | Weight | Option risk score | Weighted |
|------|-------:|------------------:|---------:|
| A | 10 | 80 | 800 |
| B | 10 | 70 | 700 |
| C | 10 | 63 | 630 |
| **Total** | **30** | | **2130** |

```text
overallRiskScore = 2130 / 30 = 71.0
maturityScore    = 100 − 71.0 = 29.0
riskBand         = High   (because 60 ≤ 71 < 75)
```

**Interpretation of “71”:** about **71 out of 100 on the SCLI risk index** — elevated control/assurance gap risk across weighted questions — **not** “71% good.”

With a full 20-question SCLI v1.1 set (total weight **157** per methodology), the same formula applies; any mix whose weighted average is ~71 lands in **High**.

Unit-test precedent (same engine): weights 8@40 + 10@80 → **≈62.22 → High** (`scoring.test.ts`).

---

## 5. Report vs UI labels (where confusion arises)

### PDF report (`reports.service.ts`)

| Line | Example | Direction |
|------|---------|-----------|
| Overall SCLI Risk Score | `71.0 / 100` | Higher worse |
| Risk rating | `High` | From same score |
| Governance maturity score | `29.0 / 100` | Higher better (inverse) |
| Confidence (methodology / evidence) | `xx.x%` | Higher better (0–1 × 100) |
| Leakage estimates | ZAR + rate `%` | Higher exposure worse |
| Category / top risk drivers | `xx.x / 100` | Higher = more category risk |

Report copy is relatively clear (**Risk** vs **Governance maturity**). Dual scores on one page still invite mixing them up if read quickly.

### Analyst / list UI

| Surface | What is shown | Risk |
|---------|---------------|------|
| Assessment results | Band headline + `SCLI risk 71.0/100 · Maturity 29.0/100` | Explicit dual scale |
| Metric cards | “SCLI risk score” vs “Maturity view” (“100 minus risk”) | Clear if read |
| Assessments list **ScoreRing** | “SCLI” ring filled to **71**, “Gov” ring to **29** | **Progress-ring metaphor** implies “fuller = better”; SCLI fill is large for bad risk |
| ScoreRing colour | ≥70 red, ≥45 amber, else green (`scoreColor`) | Colour is risk-aware for SCLI; **Gov** uses same colour function on **maturity** (29 → green) — correct for maturity, confusing side-by-side |
| Review hero | Large `overallRiskScore` + `{riskBand} risk` | Better |
| Dashboard chip | Numeric risk, red styling if High | OK |
| Category bars | Width = category score | High fill = high **risk** category — easy to misread as “strong performance” |

**Root presentation issue:** culturally, **“71%” / a mostly filled ring** reads as success. The underlying metric is a **risk index** where **fuller/higher is worse**. Governance maturity (the methodology’s “higher is better” twin) is often the smaller number (29), so the eye latches onto 71.

---

## 6. Answers to the six questions (concise)

1. **What does 71% currently mean?**  
   Weighted **SCLI overall risk index ≈ 71/100** from questionnaire option risk scores × question weights.

2. **Is higher mathematically better or worse?**  
   **Worse** for `overallRiskScore`, category scores, and option `riskScore`. **Better** for `maturityScore`, confidence metrics. Leakage % of spend: higher = more exposure (worse). Opportunity: higher = more commercial opportunity (different meaning).

3. **Correct calculation but misleading label?**  
   **Yes.** Engine and bands match workbook/`METHODOLOGY.md`. Misleading cues: calling it a “percentage,” progress-ring fill, pairing with maturity without strong hierarchy, category bars that look like “performance.”

4. **Is classification derived from the same score?**  
   **Yes** — `getRiskBand(overallRiskScore)`.

5. **Is there already a separate risk/exposure value?**  
   **Yes** — maturity view; min/likely/max leakage ZAR and rates; methodology & evidence confidence; opportunity; category risk drivers.

6. **Does Physical Risk methodology define directionality?**  
   **Yes.** Risk score increases with risk; bands escalate; **Maturity View = 100 − Overall SCLI Risk Score** is the approved inverse. Option catalogue encodes lower scores for stronger controls.

---

## 7. Is any calculation change required?

**No — not for this UAT finding.**

| Change | Verdict |
|--------|---------|
| Invert primary display with `100 − score` and keep calling it “risk” | **Do not** — contradicts methodology and would desync bands unless bands are also redefined |
| Replace risk with maturity as the only headline | **Presentation decision** — allowed only if client chooses maturity as lead KPI; engine already computes it |
| Change band thresholds | Methodology change — needs client approval |
| Change option risk scores / weights | Methodology / catalogue change — out of scope |
| Change leakage formulas | Unrelated to “71% looks good” |

**Do not use `100 − score` as a silent fix** unless the product is explicitly switching the **headline** to the existing **Maturity View** (already defined). Inventing a second inversion on top of risk would double-count the methodology’s maturity transform.

---

## 8. Recommended presentation options (no engine change)

Priority order for client discussion:

1. **Lead with band + plain language**  
   e.g. **High risk** — SCLI Risk Index **71 / 100** (higher = more risk). Avoid bare “71%.”

2. **Prefer `/100` over `%` for risk and maturity**  
   Reserve `%` for true fractions (confidence 0–1, leakage rates).

3. **Separate visual systems**  
   - Risk: severity chip / thermometer / red-amber scale (fill = severity).  
   - Maturity: optional second metric, clearly labeled **Governance maturity (higher = better): 29/100**.  
   - Do not use the same “completion ring” metaphor for both without opposite colour semantics explained.

4. **Assessments list**  
   Show band text next to SCLI number; caption “Risk index”; or show maturity only when the brief is assurance/maturity-led.

5. **Category “top risk drivers”**  
   Label as **risk contribution** / sort high-to-low with “higher = more risk.”

6. **If client wants a “goodness %”**  
   Use existing **`maturityScore`** as the positive-direction percentage — do not invent another formula.

---

## 9. Source file index

| Concern | Path |
|---------|------|
| Risk / maturity / bands | `moss/packages/shared/src/scoring.ts` |
| Scoring tests | `moss/packages/shared/src/scoring.test.ts` |
| Methodology text | `moss/docs/METHODOLOGY.md` |
| Catalogue + riskBands | `moss/apps/api/prisma/scli-v1.1.json` |
| Evaluate → snapshot | `moss/apps/api/src/assessments/assessments.service.ts` |
| Leakage + methodology confidence | `moss/packages/shared/src/leakage.ts` |
| Evidence confidence | `moss/packages/shared/src/confidence.ts` |
| Opportunity | `moss/packages/shared/src/opportunity.ts` |
| PDF labels | `moss/apps/api/src/reports/reports.service.ts` |
| Score rings / dual SCLI+Gov | `moss/apps/web/app/assessments/page.tsx` |
| Results / review UI | `moss/apps/web/app/assessments/[id]/page.tsx`, `.../review/page.tsx` |

---

## 10. Client confirmation (optional next step)

- [ ] Confirm headline KPI for executives: **Risk index** vs **Governance maturity**
- [ ] Confirm whether UI should drop `%` wording for risk scores
- [ ] Confirm ScoreRing / list presentation change (no formula change)
- [ ] Confirm PDF already acceptable or needs stronger “higher = more risk” footnote

---

*End of SCL score direction audit. No scoring engine changes in this task.*
