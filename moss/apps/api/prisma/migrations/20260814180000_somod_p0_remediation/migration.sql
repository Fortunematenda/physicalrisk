-- P0 remediation: workflow statuses + calculation status on financial outputs.

ALTER TYPE "SomodAssessmentStatus" ADD VALUE 'RETURNED_FOR_CORRECTION';
ALTER TYPE "SomodAssessmentStatus" ADD VALUE 'SUPERSEDED';

ALTER TABLE "SomodScenarioFinancialOutput"
  ADD COLUMN IF NOT EXISTS "calculationStatus" VARCHAR(40) NOT NULL DEFAULT 'CALCULATED';

ALTER TABLE "SomodScenarioFinancialOutput"
  ADD COLUMN IF NOT EXISTS "methodologyMissing" JSONB;

UPDATE "SomodScenarioFinancialOutput"
SET "calculationStatus" = 'LEGACY_PLACEHOLDER'
WHERE "detailJson" IS NOT NULL
  AND (
    "detailJson"::text LIKE '%"factors"%'
    OR "detailJson"::text LIKE '%SOMOD_FINANCIAL_V1%'
  );
