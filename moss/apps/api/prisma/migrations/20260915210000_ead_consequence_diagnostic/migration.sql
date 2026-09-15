-- AlterTable
ALTER TABLE "EvidenceDocument" ADD COLUMN IF NOT EXISTS "moduleCode" TEXT;

-- AlterTable
ALTER TABLE "AdvisoryModuleReview" ADD COLUMN IF NOT EXISTS "diagnosticResponses" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvidenceDocument_assessmentId_moduleCode_idx" ON "EvidenceDocument"("assessmentId", "moduleCode");
