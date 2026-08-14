-- SOMOD Master Handoff Pack v1.0 — financial layer tables + assessment financial status.

CREATE TYPE "SomodFinancialLayerStatus" AS ENUM (
  'DRAFT',
  'CALCULATED',
  'IN_REVIEW',
  'RETURNED',
  'APPROVED',
  'LOCKED'
);

ALTER TABLE "SomodAssessment"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "financialLayerStatus" "SomodFinancialLayerStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "financialStale" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "financialCalculatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "financialApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "financialApprovedById" TEXT,
  ADD COLUMN IF NOT EXISTS "financialLockReason" TEXT;

CREATE INDEX IF NOT EXISTS "SomodAssessment_financialLayerStatus_idx"
  ON "SomodAssessment"("financialLayerStatus");

ALTER TABLE "SomodAssessment"
  ADD CONSTRAINT "SomodAssessment_financialApprovedById_fkey"
  FOREIGN KEY ("financialApprovedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SomodFinancialModel" (
  "id" TEXT NOT NULL,
  "somodAssessmentId" TEXT NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'ZAR',
  "monthlyGuardCost" DECIMAL(18,2) NOT NULL,
  "monthlySupervisorCost" DECIMAL(18,2) NOT NULL,
  "daysPerMonth" INTEGER NOT NULL,
  "shiftHours" DECIMAL(6,2) NOT NULL,
  "responseDelayCostRate" DECIMAL(18,2) NOT NULL,
  "defaultIncidentSeverityMultiplier" DECIMAL(6,2) NOT NULL,
  "monthlyContractValue" DECIMAL(18,2) NOT NULL,
  "patrolValuePerMiss" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "technologyCapexTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "technologyMonthlyOpex" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "technologyLifespanMonths" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SomodFinancialModel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SomodFinancialModel_somodAssessmentId_key"
  ON "SomodFinancialModel"("somodAssessmentId");

ALTER TABLE "SomodFinancialModel"
  ADD CONSTRAINT "SomodFinancialModel_somodAssessmentId_fkey"
  FOREIGN KEY ("somodAssessmentId") REFERENCES "SomodAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SomodPenaltyLibrary" (
  "id" TEXT NOT NULL,
  "somodAssessmentId" TEXT,
  "penaltyKey" VARCHAR(100) NOT NULL,
  "penaltyName" VARCHAR(255) NOT NULL,
  "metricName" VARCHAR(255) NOT NULL,
  "thresholdType" VARCHAR(50) NOT NULL,
  "thresholdValue" DECIMAL(18,6),
  "unit" VARCHAR(50) NOT NULL,
  "formulaExpression" TEXT NOT NULL,
  "appliesToControlId" VARCHAR(50),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isGoverned" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SomodPenaltyLibrary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SomodPenaltyLibrary_somodAssessmentId_isActive_idx"
  ON "SomodPenaltyLibrary"("somodAssessmentId", "isActive");

CREATE UNIQUE INDEX "SomodPenaltyLibrary_somodAssessmentId_penaltyKey_key"
  ON "SomodPenaltyLibrary"("somodAssessmentId", "penaltyKey");

ALTER TABLE "SomodPenaltyLibrary"
  ADD CONSTRAINT "SomodPenaltyLibrary_somodAssessmentId_fkey"
  FOREIGN KEY ("somodAssessmentId") REFERENCES "SomodAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SomodControlFinancialMapping" (
  "id" TEXT NOT NULL,
  "somodAssessmentId" TEXT NOT NULL,
  "controlId" VARCHAR(50) NOT NULL,
  "financialRelevance" BOOLEAN NOT NULL DEFAULT false,
  "costCategory" VARCHAR(100),
  "eventUnit" VARCHAR(100),
  "exposureFormula" TEXT,
  "penaltyId" TEXT,
  "recoverableFormula" TEXT,
  "cfoOutputCategory" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SomodControlFinancialMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SomodControlFinancialMapping_somodAssessmentId_idx"
  ON "SomodControlFinancialMapping"("somodAssessmentId");

CREATE UNIQUE INDEX "SomodControlFinancialMapping_somodAssessmentId_controlId_key"
  ON "SomodControlFinancialMapping"("somodAssessmentId", "controlId");

ALTER TABLE "SomodControlFinancialMapping"
  ADD CONSTRAINT "SomodControlFinancialMapping_somodAssessmentId_fkey"
  FOREIGN KEY ("somodAssessmentId") REFERENCES "SomodAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SomodControlFinancialMapping"
  ADD CONSTRAINT "SomodControlFinancialMapping_penaltyId_fkey"
  FOREIGN KEY ("penaltyId") REFERENCES "SomodPenaltyLibrary"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SomodScenarioFinancialOutput" (
  "id" TEXT NOT NULL,
  "somodAssessmentId" TEXT NOT NULL,
  "scenarioType" "SomodScenarioType" NOT NULL,
  "monthlyManpowerCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "monthlyTechnologyCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "monthlyPenaltyExposure" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "monthlyOperationalLeakage" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "monthlyRecoverableValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "monthlyTotalSecurityCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "annualTotalSecurityCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "requiredCapitalInvestment" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "paybackMonths" DECIMAL(10,2),
  "effectivenessScore" DECIMAL(6,2),
  "riskPosition" VARCHAR(50),
  "detailJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SomodScenarioFinancialOutput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SomodScenarioFinancialOutput_somodAssessmentId_scenarioType_key"
  ON "SomodScenarioFinancialOutput"("somodAssessmentId", "scenarioType");

CREATE INDEX "SomodScenarioFinancialOutput_somodAssessmentId_idx"
  ON "SomodScenarioFinancialOutput"("somodAssessmentId");

ALTER TABLE "SomodScenarioFinancialOutput"
  ADD CONSTRAINT "SomodScenarioFinancialOutput_somodAssessmentId_fkey"
  FOREIGN KEY ("somodAssessmentId") REFERENCES "SomodAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SomodCfoDashboardSnapshot" (
  "id" TEXT NOT NULL,
  "somodAssessmentId" TEXT NOT NULL,
  "currency" VARCHAR(10) NOT NULL,
  "currentMonthlySpend" DECIMAL(18,2) NOT NULL,
  "optimalMonthlySpend" DECIMAL(18,2) NOT NULL,
  "monthlySavings" DECIMAL(18,2) NOT NULL,
  "annualSavings" DECIMAL(18,2) NOT NULL,
  "currentMonthlyLeakage" DECIMAL(18,2) NOT NULL,
  "optimalMonthlyLeakage" DECIMAL(18,2) NOT NULL,
  "monthlyRecoverableValue" DECIMAL(18,2) NOT NULL,
  "requiredCapitalInvestment" DECIMAL(18,2) NOT NULL,
  "paybackMonths" DECIMAL(10,2),
  "currentEffectiveness" DECIMAL(6,2),
  "optimalEffectiveness" DECIMAL(6,2),
  "currentRiskPosition" VARCHAR(50),
  "optimalRiskPosition" VARCHAR(50),
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "snapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SomodCfoDashboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SomodCfoDashboardSnapshot_somodAssessmentId_createdAt_idx"
  ON "SomodCfoDashboardSnapshot"("somodAssessmentId", "createdAt");

ALTER TABLE "SomodCfoDashboardSnapshot"
  ADD CONSTRAINT "SomodCfoDashboardSnapshot_somodAssessmentId_fkey"
  FOREIGN KEY ("somodAssessmentId") REFERENCES "SomodAssessment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
