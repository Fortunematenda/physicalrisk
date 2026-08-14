# SOMOD Master Developer Handoff Pack

Security Operating Model Optimisation Diagnostic  
**Version:** 1.0  

Purpose: Provide one unified developer handoff covering the product architecture, data model, financial engine, API, UI, validation logic, approval flow, and implementation sequence.

## Product musts

- One client-facing product with five internal engines
- Four scenario outputs: Current, Risk Aligned, Cost Efficient, Recommended Optimal
- Quantify cost, leakage, recoverable value, required capital investment, payback, risk position, effectiveness score
- Integrate documented controls (policies, SOPs, MOSS, site procedures, contractual requirements)

## Five engines

1. Risk and Requirement  
2. Deployment and Capability  
3. Technology and System Control  
4. Cost and Efficiency  
5. Optimisation and Trade-off  

## Financial database (PostgreSQL)

- `somod_assessments`
- `somod_financial_models`
- `somod_penalty_library`
- `somod_control_financial_mappings`
- `somod_scenario_financial_outputs`
- `somod_cfo_dashboard_snapshots`

Formulas remain in the service layer and are not consultant-editable.

## REST API (pack §7)

| Endpoint | Purpose |
|---|---|
| POST /somod/{id}/financial-model | Create financial setup |
| GET /somod/{id}/financial-model | Read setup and derived values |
| PATCH /somod/{id}/financial-model | Update editable inputs |
| GET /somod/{id}/penalties | List active penalty rules |
| POST /somod/{id}/penalties | Create allowed client-specific rule |
| PATCH /somod/{id}/penalties/{penaltyId} | Update allowed penalty settings |
| GET /somod/{id}/control-financial-mappings | List mappings |
| POST /somod/{id}/control-financial-mappings | Create mapping |
| PATCH /somod/{id}/control-financial-mappings/{mappingId} | Update mapping |
| POST /somod/{id}/calculate-financials | Run full financial calculation |
| GET /somod/{id}/scenario-financials | Return scenario outputs |
| GET /somod/{id}/cfo-dashboard | Return executive dashboard |

## UI Screens A–E

- A Financial Setup  
- B Penalty Library  
- C Control Financial Mapping  
- D Scenario Financial Outputs  
- E CFO Dashboard  

## Governance warnings

- Do not flatten the financial layer into one generic settings table  
- Do not allow consultant-side edits to formula expressions or governed penalty rules  
- Do not render the dashboard before a successful scenario calculation  
- Do not permit negative leakage or negative recoverable values  
- Do not omit Current versus Recommended Optimal comparison  

Implementation: `moss/apps/api/src/somod/financial/` and workspace Financial screens.
