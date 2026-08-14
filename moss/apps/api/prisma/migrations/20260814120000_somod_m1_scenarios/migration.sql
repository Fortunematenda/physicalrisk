-- SOMOD M1: scenario rows for Current / Risk-Aligned / Cost-Efficient.

CREATE TYPE "SomodScenarioType" AS ENUM ('CURRENT', 'RISK_ALIGNED', 'COST_EFFICIENT');
CREATE TYPE "SomodScenarioStatus" AS ENUM ('DRAFT', 'READY', 'SELECTED');

CREATE TABLE "SomodScenario" (
  "id" TEXT NOT NULL,
  "somodAssessmentId" TEXT NOT NULL,
  "scenarioType" "SomodScenarioType" NOT NULL,
  "label" TEXT NOT NULL,
  "status" "SomodScenarioStatus" NOT NULL DEFAULT 'DRAFT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "summary" TEXT,
  "inputsJson" JSONB,
  "resultsJson" JSONB,
  "evaluatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SomodScenario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SomodScenario_somodAssessmentId_scenarioType_key"
  ON "SomodScenario"("somodAssessmentId", "scenarioType");
CREATE INDEX "SomodScenario_somodAssessmentId_sortOrder_idx"
  ON "SomodScenario"("somodAssessmentId", "sortOrder");
CREATE INDEX "SomodScenario_status_idx" ON "SomodScenario"("status");

ALTER TABLE "SomodScenario"
  ADD CONSTRAINT "SomodScenario_somodAssessmentId_fkey"
  FOREIGN KEY ("somodAssessmentId") REFERENCES "SomodAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
