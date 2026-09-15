-- Structured business consequences for Executive Advisory module reviews (Stage 2).
ALTER TABLE "AdvisoryModuleReview" ADD COLUMN IF NOT EXISTS "businessConsequences" JSONB;
ALTER TABLE "AdvisoryModuleReview" ADD COLUMN IF NOT EXISTS "businessConsequenceDetail" TEXT;
ALTER TABLE "AdvisoryModuleReview" ADD COLUMN IF NOT EXISTS "otherBusinessConsequence" TEXT;
