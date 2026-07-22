# Security Baseline

- Use long random secrets and rotate the seeded administrator password.
- Use HTTPS only in production.
- Keep PostgreSQL, Redis and MinIO on private container networks.
- Use a least-privilege EspoCRM API User.
- Restrict file types and add malware scanning before broad client rollout.
- Apply organisation-level access control to every new endpoint.
- Keep evidence and reports private; distribute time-limited signed URLs.
- Log authentication, response changes, overrides, evidence reviews, approvals, reports and CRM syncs.
- Never overwrite raw client responses with analyst conclusions.
- Require an override reason and reviewer approval for manual score changes.
- Back up the database and object store separately.
- Add MFA/SSO before enterprise deployment.
