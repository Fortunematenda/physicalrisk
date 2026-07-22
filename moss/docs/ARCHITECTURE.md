# MOSS Technical Architecture

## System boundaries

### Existing WordPress website

- Marketing and authority-building content
- Industry and service landing pages
- Lead capture and CTA funnels
- Discovery booking
- Links into the secure MOSS assessment portal

### Standalone MOSS VPS

- Identity and role management
- Organisation and assessment management
- Questionnaire and methodology versioning
- Evidence repository
- Scoring and leakage calculations
- Recommendation rules
- Analyst evaluation and approval
- PDF report generation
- Audit events
- EspoCRM outbound integration

### Third-party EspoCRM

- Leads and client account records
- Sales opportunities
- Follow-up tasks and sales activity
- Consulting engagement pipeline

## Services

| Service | Responsibility |
|---|---|
| Nginx | Single public entry point and reverse proxy |
| Next.js | Client, analyst and administrator interface |
| NestJS API | Domain logic, security, calculations and integrations |
| PostgreSQL | Authoritative transactional and methodology database |
| MinIO | Evidence and generated report object storage |
| Redis | Queue, caching and workflow foundation |
| EspoCRM client | Outbound REST API synchronisation |

## Assessment lifecycle

```text
DRAFT → IN_PROGRESS → SUBMITTED → AUTOMATED_EVALUATION_COMPLETE
→ EVIDENCE_REVIEW → ANALYST_REVIEW → QUALITY_ASSURANCE → APPROVED
→ REPORT_GENERATED → REPORT_ISSUED → REMEDIATION_IN_PROGRESS
→ REASSESSMENT_DUE → CLOSED → ARCHIVED
```

## Core database domains

- Users, roles and organisation memberships
- Organisations
- Questionnaires and published versions
- Calibration input definitions
- Questions and response options
- Assumptions and recommendation rules
- Assessment sessions, responses and evidence
- Score snapshots and calculation traces
- Findings, recommendations and action plans
- Reports
- CRM synchronisation records
- Audit events

## Scale path

The MVP can later add a background worker using the included Redis service for report queues, email delivery, scheduled reassessments, webhook handling and bulk CRM synchronisation.
