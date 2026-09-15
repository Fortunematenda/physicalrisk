-- Stage 5: Record Shield 360 retirement in audit log (idempotent).
-- Does not alter historical assessments, reports, or proposals.

INSERT INTO "AuditEvent" (
  "id",
  "action",
  "entityType",
  "entityId",
  "metadata",
  "createdAt"
)
SELECT
  'shield360_retired_stage5',
  'PRODUCT_ARCHIVED',
  'ProductCode',
  'SHIELD360',
  '{"reason":"Removed from Physical Risk product portfolio","scope":"active_catalogue_only","historicalRecordsPreserved":true}'::jsonb,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "AuditEvent" WHERE "id" = 'shield360_retired_stage5'
);
