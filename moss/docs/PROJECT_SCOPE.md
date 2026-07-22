# MVP Scope and Next Phases

## Implemented in this repository

- SCLI v1.1 executive assessment
- Dynamic calibration and questionnaire interface
- Versioned questions, options, assumptions and rules
- Exact scoring and leakage engine
- Preliminary confidence and commercial opportunity score
- Evidence upload and status register **with analyst review statuses**
- Automated recommendations
- Executive PDF and SMTP report delivery **(queued EmailJob)**
- EspoCRM Account, Opportunity and Task linkage
- Organisation, portfolio and methodology screens
- Docker VPS deployment
- **Pilot workflow:** status transitions, analyst assignment, findings, score overrides, QA checklist, approval lock, action plans, user admin, assigned-to-me queue

## Recommended next implementation sprint

- Full recommendation editor UX (preserve original vs final wording in UI)
- Multi-report type PDF generators (working paper, evidence register, comparison)
- Reassessment comparison UI
- WordPress lead/start-assessment plugin
- BullMQ/Redis-backed email + CRM workers (DB queue is live today)
- MFA/SSO and enterprise access hardening
- Industry-specific calibration profiles
- Compliance questionnaire and evidence control library
- Multi-site sampling and benchmarking
