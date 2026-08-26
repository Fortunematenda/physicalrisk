-- Executive Governance Triage admin funnel.
-- Keeps Level 1 submissions separate from paid assessments while preserving the existing PublicLead rows.
ALTER TABLE "PublicLead"
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contactedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "diagnosticRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "convertedAssessmentId" TEXT,
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminNotes" TEXT;

CREATE INDEX IF NOT EXISTS "PublicLead_diagnosticRequestedAt_idx" ON "PublicLead"("diagnosticRequestedAt");
CREATE INDEX IF NOT EXISTS "PublicLead_convertedAt_idx" ON "PublicLead"("convertedAt");
