ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'EXECUTIVE_ADVISORY_BRIEF';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'FOCUSED_ASSURANCE_REPORT';
ALTER TYPE "ReportType" ADD VALUE IF NOT EXISTS 'COMMITTEE_ASSURANCE_REPORT';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'EXECUTIVE_GOVERNANCE_TRIAGE';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'EXECUTIVE_ADVISORY_DIAGNOSTIC';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'CONTRACT_SLA_ASSURANCE';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'VENDOR_PERFORMANCE_ASSURANCE';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'GOVERNANCE_EXECUTIVE_ASSURANCE';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'CYBER_PHYSICAL_DEPENDENCY';
ALTER TYPE "ProductCode" ADD VALUE IF NOT EXISTS 'SHIELD360';

CREATE TABLE IF NOT EXISTS "AdvisoryModuleReview" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "moduleName" TEXT NOT NULL,
  "principalQuestion" TEXT NOT NULL,
  "exposureRating" INTEGER,
  "finding" TEXT,
  "evidenceSummary" TEXT,
  "businessConsequence" TEXT,
  "accountableExecutive" TEXT,
  "requiredDecision" TEXT,
  "recommendedProduct" "ProductCode",
  "analystNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisoryModuleReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdvisoryModuleReview_assessmentId_moduleCode_key" ON "AdvisoryModuleReview"("assessmentId", "moduleCode");
CREATE INDEX IF NOT EXISTS "AdvisoryModuleReview_assessmentId_idx" ON "AdvisoryModuleReview"("assessmentId");
ALTER TABLE "AdvisoryModuleReview" ADD CONSTRAINT "AdvisoryModuleReview_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
