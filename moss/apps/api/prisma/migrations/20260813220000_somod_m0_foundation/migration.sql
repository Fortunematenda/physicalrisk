-- SOMOD M0: dedicated assessment aggregate (not AssessmentSession).

CREATE TYPE "SomodAssessmentStatus" AS ENUM (
  'DRAFT',
  'IN_PROGRESS',
  'SUBMITTED',
  'REVIEWED',
  'APPROVED',
  'ARCHIVED'
);

CREATE TABLE "SomodAssessment" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "organisationId" TEXT NOT NULL,
  "siteId" TEXT,
  "mossAssessmentId" TEXT,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "SomodAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "riskRequirementJson" JSONB,
  "deploymentCapabilityJson" JSONB,
  "technologyJson" JSONB,
  "costEfficiencyJson" JSONB,
  "optimisationTradeoffJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SomodAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SomodAssessment_reference_key" ON "SomodAssessment"("reference");
CREATE INDEX "SomodAssessment_organisationId_status_idx" ON "SomodAssessment"("organisationId", "status");
CREATE INDEX "SomodAssessment_siteId_idx" ON "SomodAssessment"("siteId");
CREATE INDEX "SomodAssessment_mossAssessmentId_idx" ON "SomodAssessment"("mossAssessmentId");
CREATE INDEX "SomodAssessment_status_idx" ON "SomodAssessment"("status");
CREATE INDEX "SomodAssessment_createdById_idx" ON "SomodAssessment"("createdById");

ALTER TABLE "SomodAssessment"
  ADD CONSTRAINT "SomodAssessment_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SomodAssessment"
  ADD CONSTRAINT "SomodAssessment_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SomodAssessment"
  ADD CONSTRAINT "SomodAssessment_mossAssessmentId_fkey"
  FOREIGN KEY ("mossAssessmentId") REFERENCES "AssessmentSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SomodAssessment"
  ADD CONSTRAINT "SomodAssessment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
