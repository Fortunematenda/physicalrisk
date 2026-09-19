-- Stage 12: link TriageProposal to Executive Advisory assessment + report for follow-on proposals.
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "sourceAdvisoryAssessmentId" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "sourceReportId" TEXT;

CREATE INDEX IF NOT EXISTS "TriageProposal_sourceAdvisoryAssessmentId_idx" ON "TriageProposal"("sourceAdvisoryAssessmentId");
CREATE INDEX IF NOT EXISTS "TriageProposal_sourceReportId_idx" ON "TriageProposal"("sourceReportId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TriageProposal_sourceAdvisoryAssessmentId_fkey'
  ) THEN
    ALTER TABLE "TriageProposal"
      ADD CONSTRAINT "TriageProposal_sourceAdvisoryAssessmentId_fkey"
      FOREIGN KEY ("sourceAdvisoryAssessmentId") REFERENCES "AssessmentSession"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TriageProposal_sourceReportId_fkey'
  ) THEN
    ALTER TABLE "TriageProposal"
      ADD CONSTRAINT "TriageProposal_sourceReportId_fkey"
      FOREIGN KEY ("sourceReportId") REFERENCES "Report"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
