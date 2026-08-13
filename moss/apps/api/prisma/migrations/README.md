# Prisma migrations (diagnostic DB)

This project previously used `prisma db push`. MOSS M1 introduced **Prisma Migrate**.

## Important

- Migration SQL under `prisma/migrations/**/migration.sql` **must be committed**.
  Root `.gitignore` ignores `*.sql` globally, with an exception for these paths.
- Never run `prisma migrate diff` (or migrate dev) with `--shadow-database-url` pointing at the
  live app database — Prisma may reset that database.
- Never use `prisma db push --accept-data-loss`.

## Applying on an existing database (created via db push)

1. Ensure `DATABASE_URL` points at the diagnostic Postgres (MOSS app DB — not Repository).
2. Run preflight (row counts / additive check):

```bash
pnpm --filter @moss/api prisma:m1-preflight
```

3. Apply additive migrations:

```bash
pnpm --filter @moss/api prisma:migrate:status
pnpm --filter @moss/api prisma:migrate
```

If `migrate deploy` tries to create objects that already exist, **STOP** and baseline with
`migrate resolve` instead of forcing.

## Fresh / empty database bootstrap

Early migrations are **additive** against a schema that was originally created by `db push`
(they are not a full empty→schema history). On a truly empty DB:

1. `pnpm --filter @moss/api prisma:db-push` (**without** `--accept-data-loss`)
2. Mark the full history as applied:

```bash
pnpm exec prisma migrate resolve --applied 20260720_espocrm_integration
pnpm exec prisma migrate resolve --applied 20260720_smtp_system_settings
pnpm exec prisma migrate resolve --applied 20260809180000_moss_m1_data_foundation
pnpm exec prisma migrate resolve --applied 20260809193000_moss_remaining_framework
```

3. `pnpm --filter @moss/api prisma:seed`

The API Dockerfile uses migrate-first with this bootstrap fallback (resolves **all** of the above).

## Current migration chain

| Migration | Purpose |
|-----------|---------|
| `20260720_espocrm_integration` | Additive EspoCRM columns / indexes |
| `20260720_smtp_system_settings` | `SystemSetting` key/value store |
| `20260809180000_moss_m1_data_foundation` | MOSS catalogue / control assessment foundation |
| `20260809193000_moss_remaining_framework` | Scoring config, nullable severity, MOSS recommendation fields |

## Scripts

| Script | Purpose |
|--------|---------|
| `prisma:migrate` | `prisma migrate deploy` (safe apply) |
| `prisma:migrate:dev` | `prisma migrate dev` (dev only; needs a **separate** shadow DB) |
| `prisma:migrate:status` | Migration status |
| `prisma:db-push` | `prisma db push` (no accept-data-loss) |
| `prisma:generate` | Generate client |
| `prisma:m1-preflight` | Pre-migrate safety inspection |
