-- Stage 13: Level 3 delivery engagements linked to accepted TriageProposal.
ALTER TABLE "AssessmentSession" ADD COLUMN IF NOT EXISTS "sourceProposalId" TEXT;
ALTER TABLE "AssessmentSession" ADD COLUMN IF NOT EXISTS "sourceContext" JSONB;

CREATE INDEX IF NOT EXISTS "AssessmentSession_sourceProposalId_idx" ON "AssessmentSession"("sourceProposalId");
CREATE INDEX IF NOT EXISTS "AssessmentSession_sourceProposalId_productCode_idx" ON "AssessmentSession"("sourceProposalId", "productCode");

-- One initial delivery engagement per product per accepted proposal.
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentSession_sourceProposalId_productCode_key"
  ON "AssessmentSession"("sourceProposalId", "productCode")
  WHERE "sourceProposalId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AssessmentSession_sourceProposalId_fkey'
  ) THEN
    ALTER TABLE "AssessmentSession"
      ADD CONSTRAINT "AssessmentSession_sourceProposalId_fkey"
      FOREIGN KEY ("sourceProposalId") REFERENCES "TriageProposal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
