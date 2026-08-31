-- Stage 3: link proposal workspace to source triage and freeze context at request time.
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "sourceAssessmentId" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "contextSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "TriageProposal_sourceAssessmentId_idx" ON "TriageProposal"("sourceAssessmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TriageProposal_sourceAssessmentId_fkey'
  ) THEN
    ALTER TABLE "TriageProposal"
      ADD CONSTRAINT "TriageProposal_sourceAssessmentId_fkey"
      FOREIGN KEY ("sourceAssessmentId") REFERENCES "AssessmentSession"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
