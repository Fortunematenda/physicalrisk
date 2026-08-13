-- MOSS M1 Data Foundation — additive only.
-- Does NOT seed catalogue domains/controls (M2).
-- Does NOT drop or rewrite SCLI tables/data.
-- productCode backfill: NOT NULL DEFAULT 'SCLI_COST_LEAKAGE' covers all existing AssessmentSession rows.

-- CreateEnum
CREATE TYPE "ProductCode" AS ENUM ('SCLI_COST_LEAKAGE', 'MOSS');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MossCatalogueStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MossControlAssessmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SCORED', 'NEEDS_EVIDENCE', 'COMPLETE');

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteCode" TEXT NOT NULL,
    "address" TEXT,
    "region" TEXT,
    "description" TEXT,
    "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MossCatalogueVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "MossCatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MossCatalogueVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MossDomain" (
    "id" TEXT NOT NULL,
    "catalogueVersionId" TEXT NOT NULL,
    "domainCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MossDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MossControl" (
    "id" TEXT NOT NULL,
    "catalogueVersionId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "controlCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "controlFunction" TEXT,
    "owner" TEXT,
    "frequency" TEXT,
    "metric" TEXT,
    "thresholdText" TEXT,
    "thresholdJson" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "evidenceStandards" JSONB,
    "inspectionMethodology" JSONB,
    "failureConditions" JSONB,
    "fraudIndicators" JSONB,
    "mossScoringRules" JSONB,
    "financialRelevance" TEXT,
    "eventUnit" TEXT,
    "costCategory" TEXT,
    "leakageQuantification" JSONB,
    "formulaReference" TEXT,
    "slaPenaltyLogic" JSONB,
    "incidentToCostConversion" JSONB,
    "technologySubstitutionLogic" TEXT,
    "manpowerOptimisationLogic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MossControl_pkey" PRIMARY KEY ("id")
);

-- AlterTable AssessmentSession (additive; default backfills existing rows to SCLI)
ALTER TABLE "AssessmentSession" ADD COLUMN "productCode" "ProductCode" NOT NULL DEFAULT 'SCLI_COST_LEAKAGE';
ALTER TABLE "AssessmentSession" ADD COLUMN "siteId" TEXT;
ALTER TABLE "AssessmentSession" ADD COLUMN "mossCatalogueVersionId" TEXT;

-- CreateTable
CREATE TABLE "MossControlAssessment" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "mossControlId" TEXT NOT NULL,
    "controlCode" TEXT NOT NULL,
    "score" INTEGER,
    "assessorScore" INTEGER,
    "scoreRationale" TEXT,
    "comment" TEXT,
    "findingText" TEXT,
    "status" "MossControlAssessmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assessedById" TEXT,
    "assessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MossControlAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MossScoreSnapshot" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "catalogueVersionId" TEXT NOT NULL,
    "overallScore" DECIMAL(8,2),
    "domainScores" JSONB NOT NULL,
    "controlScores" JSONB NOT NULL,
    "completenessPercent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "calculationTrace" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MossScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- AlterTable EvidenceDocument / Finding (additive nullable links)
ALTER TABLE "EvidenceDocument" ADD COLUMN "mossControlAssessmentId" TEXT;
ALTER TABLE "Finding" ADD COLUMN "productCode" "ProductCode";
ALTER TABLE "Finding" ADD COLUMN "mossControlAssessmentId" TEXT;

-- CreateIndex Site
CREATE UNIQUE INDEX "Site_organisationId_siteCode_key" ON "Site"("organisationId", "siteCode");
CREATE INDEX "Site_organisationId_status_idx" ON "Site"("organisationId", "status");

-- CreateIndex MossCatalogueVersion
CREATE UNIQUE INDEX "MossCatalogueVersion_version_key" ON "MossCatalogueVersion"("version");
CREATE INDEX "MossCatalogueVersion_status_idx" ON "MossCatalogueVersion"("status");

-- CreateIndex MossDomain
CREATE UNIQUE INDEX "MossDomain_catalogueVersionId_domainCode_key" ON "MossDomain"("catalogueVersionId", "domainCode");
CREATE UNIQUE INDEX "MossDomain_catalogueVersionId_id_key" ON "MossDomain"("catalogueVersionId", "id");
CREATE INDEX "MossDomain_catalogueVersionId_sortOrder_idx" ON "MossDomain"("catalogueVersionId", "sortOrder");

-- CreateIndex MossControl
CREATE UNIQUE INDEX "MossControl_catalogueVersionId_controlCode_key" ON "MossControl"("catalogueVersionId", "controlCode");
CREATE INDEX "MossControl_domainId_sortOrder_idx" ON "MossControl"("domainId", "sortOrder");
CREATE INDEX "MossControl_catalogueVersionId_sortOrder_idx" ON "MossControl"("catalogueVersionId", "sortOrder");

-- CreateIndex AssessmentSession product / site / catalogue
CREATE INDEX "AssessmentSession_productCode_idx" ON "AssessmentSession"("productCode");
CREATE INDEX "AssessmentSession_productCode_organisationId_idx" ON "AssessmentSession"("productCode", "organisationId");
CREATE INDEX "AssessmentSession_siteId_idx" ON "AssessmentSession"("siteId");
CREATE INDEX "AssessmentSession_mossCatalogueVersionId_idx" ON "AssessmentSession"("mossCatalogueVersionId");

-- CreateIndex MossControlAssessment
CREATE UNIQUE INDEX "MossControlAssessment_assessmentId_mossControlId_key" ON "MossControlAssessment"("assessmentId", "mossControlId");
CREATE INDEX "MossControlAssessment_assessmentId_status_idx" ON "MossControlAssessment"("assessmentId", "status");
CREATE INDEX "MossControlAssessment_mossControlId_idx" ON "MossControlAssessment"("mossControlId");

-- CreateIndex MossScoreSnapshot
CREATE INDEX "MossScoreSnapshot_assessmentId_calculatedAt_idx" ON "MossScoreSnapshot"("assessmentId", "calculatedAt");
CREATE INDEX "MossScoreSnapshot_catalogueVersionId_idx" ON "MossScoreSnapshot"("catalogueVersionId");

-- CreateIndex Evidence / Finding MOSS links
CREATE INDEX "EvidenceDocument_mossControlAssessmentId_idx" ON "EvidenceDocument"("mossControlAssessmentId");
CREATE INDEX "Finding_productCode_idx" ON "Finding"("productCode");
CREATE INDEX "Finding_mossControlAssessmentId_idx" ON "Finding"("mossControlAssessmentId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MossDomain" ADD CONSTRAINT "MossDomain_catalogueVersionId_fkey" FOREIGN KEY ("catalogueVersionId") REFERENCES "MossCatalogueVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MossControl" ADD CONSTRAINT "MossControl_catalogueVersionId_fkey" FOREIGN KEY ("catalogueVersionId") REFERENCES "MossCatalogueVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MossControl" ADD CONSTRAINT "MossControl_catalogueVersionId_domainId_fkey" FOREIGN KEY ("catalogueVersionId", "domainId") REFERENCES "MossDomain"("catalogueVersionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssessmentSession" ADD CONSTRAINT "AssessmentSession_mossCatalogueVersionId_fkey" FOREIGN KEY ("mossCatalogueVersionId") REFERENCES "MossCatalogueVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MossControlAssessment" ADD CONSTRAINT "MossControlAssessment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MossControlAssessment" ADD CONSTRAINT "MossControlAssessment_mossControlId_fkey" FOREIGN KEY ("mossControlId") REFERENCES "MossControl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MossControlAssessment" ADD CONSTRAINT "MossControlAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MossScoreSnapshot" ADD CONSTRAINT "MossScoreSnapshot_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MossScoreSnapshot" ADD CONSTRAINT "MossScoreSnapshot_catalogueVersionId_fkey" FOREIGN KEY ("catalogueVersionId") REFERENCES "MossCatalogueVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EvidenceDocument" ADD CONSTRAINT "EvidenceDocument_mossControlAssessmentId_fkey" FOREIGN KEY ("mossControlAssessmentId") REFERENCES "MossControlAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Finding" ADD CONSTRAINT "Finding_mossControlAssessmentId_fkey" FOREIGN KEY ("mossControlAssessmentId") REFERENCES "MossControlAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Score range checks (0–4 when populated). Prisma does not model CHECK natively.
ALTER TABLE "MossControlAssessment" ADD CONSTRAINT "MossControlAssessment_score_range_check"
  CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 4));
ALTER TABLE "MossControlAssessment" ADD CONSTRAINT "MossControlAssessment_assessorScore_range_check"
  CHECK ("assessorScore" IS NULL OR ("assessorScore" >= 0 AND "assessorScore" <= 4));
