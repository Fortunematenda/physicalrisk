# API Summary

All protected routes require `Authorization: Bearer <JWT>`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/organisations` | List or create organisations |
| GET | `/api/questionnaires/SCLI` | Published SCLI definition |
| GET/POST | `/api/assessments` | Portfolio or create session |
| GET | `/api/assessments/:id` | Full assessment workspace |
| PATCH | `/api/assessments/:id/inputs/:code` | Save calibration input |
| PATCH | `/api/assessments/:id/responses/:code` | Save answer |
| POST | `/api/assessments/:id/evaluate` | Run scoring and recommendation rules |
| POST | `/api/assessments/:id/submit` | Submit and evaluate |
| POST | `/api/assessments/:id/approve` | Reviewer approval and lock |
| POST | `/api/evidence/assessment/:id` | Upload evidence |
| PATCH | `/api/evidence/:id/status` | Review evidence |
| GET | `/api/evidence/:id/download` | Signed evidence URL |
| POST | `/api/reports/assessment/:id/generate` | Generate executive PDF |
| GET | `/api/reports/:id` | Report details and signed URL |
| POST | `/api/reports/:id/issue` | Email a secure report link |
| GET | `/api/integrations/espocrm/status` | Connector configuration status |
| POST | `/api/integrations/espocrm/test` | Test CRM connection |
| POST | `/api/integrations/espocrm/sync/:id` | Sync evaluated assessment |
| GET | `/api/health` | Service and database health |
