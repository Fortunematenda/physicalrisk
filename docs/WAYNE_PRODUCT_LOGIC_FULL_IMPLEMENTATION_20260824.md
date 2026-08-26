# Wayne Product Logic — Full Implementation

Date: 24 August 2026

## Implemented product architecture

### Level 1 — Executive Governance Triage
- Complimentary questionnaire only; no longer represented as an assessment/SCLA.
- Separate `EXECUTIVE_GOVERNANCE_TRIAGE` product code and `EGT-YYYY-######` references.
- Public copy uses “questionnaire”, “triage” and “preliminary indication”.
- Public results suppress misleading numeric `/100` presentation and route to the paid Executive Advisory Diagnostic.
- Public PDF is titled **Executive Governance Indication** and explicitly states that it is not an assessment, diagnostic, audit, assurance opinion or Security Cost Leakage Assessment™.
- Public triage records are isolated from the paid Cost Leakage assessment list.

### Level 2 — Executive Advisory Diagnostic
- New `EXECUTIVE_ADVISORY_DIAGNOSTIC` product code and `EAD-YYYY-######` references.
- New `/advisory` workspace and `/advisory/new` creation flow.
- Six required diagnostic modules implemented:
  1. Governance and accountability
  2. Financial assurance
  3. Contractual assurance
  4. Reporting integrity
  5. Operational resilience
  6. Consequence management
- Each module records finding, evidence/limitations, business consequence, accountable executive, required decision, internal exposure indicator and recommended next product.
- Diagnostic cannot be completed until each module records the core decision fields.
- Level 2 can route to the correct Level 3 product.
- Executive Advisory Brief PDF generation implemented.

### Level 3 — Focused Assurance
Product codes and workflows implemented for:
- Security Cost Leakage Assessment™ (`SCLI_COST_LEAKAGE`)
- Contract and SLA Assurance Review (`CONTRACT_SLA_ASSURANCE`)
- Vendor Performance Assurance Review (`VENDOR_PERFORMANCE_ASSURANCE`)
- Security Governance and Executive Assurance Review (`GOVERNANCE_EXECUTIVE_ASSURANCE`)
- Cyber-Physical Dependency Review (`CYBER_PHYSICAL_DEPENDENCY`)
- Shield 360 (`SHIELD360`)

Each newly added Level 3 product has a product-specific working-paper module set based on the supplied product logic. The system records evidence-led findings and required executive decisions rather than inventing unsupported methodology/scoring.

### Cost Leakage screen corrections
- Cost Leakage explicitly labelled Level 3 in navigation.
- C3/C4/C5 reject negative values in API validation.
- C5 uses a ZAR-formatted control with `R 100,000` increment/decrement and stores the actual numeric value (for example R19,000,000 stores `19000000`).
- “Enterprise Management Systems Providers” added to the industry catalogue.
- Results terminology changed from confusing “Maturity view” to evidence confidence.
- Risk output is explicitly labelled **Exposure score** with “higher = greater exposure”.
- Financial outputs are labelled **modelled** until evidence validation, avoiding unsupported certainty.

### Consultants / analysts
- Added **Consultants & Analysts** navigation and management view.
- Active `ANALYST`, `REVIEWER` and `SUPER_ADMIN` users are assignable as primary consultants.
- Level 2/3 engagement pages support consultant assignment.
- SSO environments continue to register users through Keycloak and sync them into the platform.

### Reports and lifecycle
- New report types:
  - `EXECUTIVE_ADVISORY_BRIEF`
  - `FOCUSED_ASSURANCE_REPORT`
  - `COMMITTEE_ASSURANCE_REPORT`
- Advisory PDF generation implemented with evidence/findings/decisions per module.
- Existing SCLA PDF retained for Level 3 Cost Leakage.
- Level 1 PDF is a preliminary indication and cannot be upgraded into a verified assessment report.

## Database migration

Apply:

`moss/apps/api/prisma/migrations/20260824164500_wayne_product_architecture/migration.sql`

Then regenerate Prisma Client and restart API/web services.

## Validation performed in the supplied source package

- TypeScript syntax/transpile check: 22/22 changed TS/TSX files passed.
- `scli-v1.1.json` JSON parse: passed.

A full dependency-aware `pnpm build`/database integration run still must be performed in the deployment environment because the supplied archive does not contain installed `node_modules` and this sandbox has no package-registry access.

## Important methodology boundary

The supplied product logic defines product purpose, modules, evidence and deliverables, but does not provide approved numerical scoring formulas for every new Level 3 product. The implementation therefore intentionally does **not** invent statutory/audit scoring, financial recovery formulas or assurance opinions for those products. Their working papers are evidence-led and ready for approved methodology rules when supplied.
