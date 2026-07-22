# SCLI v1.1 Methodology Implementation

## Source model

The seed data is generated from `20260626 Executive_Security_Cost_Leakage_Assessment_SCLI_v1_1.xlsx`.

- 23 calibration inputs
- 20 executive questions
- 93 response options
- Total question weight: 157
- 33 model assumptions

## Weighted assessment score

```text
Weighted Question Score = Response Risk Score × Question Weight
Category Score = Sum(Category Weighted Scores) / Sum(Category Weights)
Overall SCLI Risk Score = Sum(All Weighted Scores) / Sum(All Weights)
Maturity View = 100 - Overall SCLI Risk Score
```

## Risk bands

| Score | Band |
|---:|---|
| 0–39.99 | Controlled |
| 40–59.99 | Moderate |
| 60–74.99 | High |
| 75–100 | Critical |

## Leakage model

The code in `packages/shared/src/leakage.ts` mirrors the workbook formulas for:

- Minimum leakage rate, capped at 6%
- Likely leakage rate, capped at 12%
- Maximum exposure rate, capped at 20%
- Minimum, likely and maximum annual values
- Recoverable low and high estimates
- Contract value and likely leakage per premise

The model uses manual-record reliance, delayed patrol reporting, proof gaps, internal capacity, technology gaps, estate scale and allowance complexity.

## Confidence

Two values are retained:

1. **Methodology confidence** – the workbook-aligned 35% to 90% coverage-quality result.
2. **Evidence confidence** – completion, unknown answers, evidence submitted, evidence verified and consistency.

These values remain separate from the risk score.

## Opportunity score

The commercial opportunity score is stored separately from client risk and combines risk severity, financial materiality, executive assurance, recoverability, urgency, readiness and evidence confidence.

## Version control

A new methodology must be published as a new questionnaire version. Existing assessments and reports never silently recalculate against a later version.
