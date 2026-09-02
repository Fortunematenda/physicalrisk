-- Proposal template system: Organisation extensions, TriageProposal snapshot fields, template models

ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "tradingName" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "vatNumber" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "headOfficeAddress" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "operationalRegions" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "operationalSiteBand" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "annualSecuritySpendBand" TEXT;

ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "templateVersion" INTEGER;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "subtitle" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "understandingOfNeeds" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "methodology" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "approach" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "exclusions" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "assumptions" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "statementOfResponsibility" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "acceptanceTerms" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "analystHourlyRate" DECIMAL(10,2);
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "specialistHourlyRate" DECIMAL(10,2);
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "discount" DECIMAL(12,2);
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,4);
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "expensesEstimate" DECIMAL(12,2);
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "estimatedProjectWeeks" INTEGER;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "timelineNarrative" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "projectSponsor" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "projectChampion" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "contentSnapshot" JSONB;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "sentSnapshot" JSONB;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "viewedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProposalTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "titleTemplate" TEXT NOT NULL,
    "subtitleTemplate" TEXT,
    "understandingNeedsTemplate" TEXT,
    "objectiveTemplate" TEXT,
    "methodologyTemplate" TEXT,
    "scopeTemplate" TEXT,
    "approachTemplate" TEXT,
    "deliverablesTemplate" TEXT,
    "exclusionsTemplate" TEXT,
    "assumptionTemplate" TEXT,
    "responsibilityTemplate" TEXT,
    "termsTemplate" TEXT,
    "acceptanceTemplate" TEXT,
    "feeDefaults" JSONB,
    "defaultPhases" JSONB,
    "defaultMethodologyItems" JSONB,
    "defaultDeliverableSections" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProposalTemplate_productCode_key" ON "ProposalTemplate"("productCode");
CREATE INDEX IF NOT EXISTS "ProposalTemplate_active_idx" ON "ProposalTemplate"("active");

CREATE TABLE IF NOT EXISTS "ProposalConsultantProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "projectPosition" TEXT,
    "biography" TEXT,
    "summary" TEXT,
    "relevantAreasOfKnowledge" TEXT,
    "qualifications" TEXT,
    "yearsExperience" INTEGER,
    "photoStorageKey" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalConsultantProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalConsultantProfile_active_displayOrder_idx" ON "ProposalConsultantProfile"("active", "displayOrder");
CREATE INDEX IF NOT EXISTS "ProposalConsultantProfile_userId_idx" ON "ProposalConsultantProfile"("userId");

CREATE TABLE IF NOT EXISTS "ProposalRelevantExperience" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "engagementTitle" TEXT,
    "description" TEXT NOT NULL,
    "industry" TEXT,
    "country" TEXT,
    "serviceType" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalRelevantExperience_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProposalRelevantExperience_active_displayOrder_idx" ON "ProposalRelevantExperience"("active", "displayOrder");

CREATE INDEX IF NOT EXISTS "TriageProposal_templateId_idx" ON "TriageProposal"("templateId");

DO $$ BEGIN
  ALTER TABLE "TriageProposal" ADD CONSTRAINT "TriageProposal_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ProposalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProposalConsultantProfile" ADD CONSTRAINT "ProposalConsultantProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
