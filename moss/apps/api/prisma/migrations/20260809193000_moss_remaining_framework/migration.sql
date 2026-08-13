-- MOSS remaining framework: scoring config, snapshot config link, nullable severities, MOSS recommendation fields.
-- Additive / non-destructive for SCLI data.

CREATE TYPE "MossScoringConfigStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "MossAggregationMode" AS ENUM ('MEAN', 'WEIGHTED_MEAN', 'MIN', 'UNCONFIGURED');
CREATE TYPE "MossRecommendationSource" AS ENUM ('MANUAL', 'CATALOGUE_TEMPLATE', 'RULE_ENGINE');

CREATE TABLE "MossScoringConfiguration" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "MossScoringConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "domainAggregation" "MossAggregationMode" NOT NULL DEFAULT 'UNCONFIGURED',
    "overallAggregation" "MossAggregationMode" NOT NULL DEFAULT 'UNCONFIGURED',
    "domainWeights" JSONB,
    "criticalControlPolicy" JSONB,
    "severityMapping" JSONB,
    "recommendationPolicy" JSONB,
    "notes" TEXT,
    "catalogueVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MossScoringConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MossScoringConfiguration_version_key" ON "MossScoringConfiguration"("version");
CREATE INDEX "MossScoringConfiguration_status_idx" ON "MossScoringConfiguration"("status");
CREATE INDEX "MossScoringConfiguration_catalogueVersionId_idx" ON "MossScoringConfiguration"("catalogueVersionId");

ALTER TABLE "MossScoringConfiguration"
  ADD CONSTRAINT "MossScoringConfiguration_catalogueVersionId_fkey"
  FOREIGN KEY ("catalogueVersionId") REFERENCES "MossCatalogueVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MossScoreSnapshot" ADD COLUMN "configurationId" TEXT;
ALTER TABLE "MossScoreSnapshot" ADD COLUMN "configurationVersion" TEXT;
CREATE INDEX "MossScoreSnapshot_configurationId_idx" ON "MossScoreSnapshot"("configurationId");
ALTER TABLE "MossScoreSnapshot"
  ADD CONSTRAINT "MossScoreSnapshot_configurationId_fkey"
  FOREIGN KEY ("configurationId") REFERENCES "MossScoringConfiguration"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Finding" ALTER COLUMN "severity" DROP NOT NULL;

ALTER TABLE "Recommendation" ALTER COLUMN "priority" DROP NOT NULL;
ALTER TABLE "Recommendation" ADD COLUMN "productCode" "ProductCode";
ALTER TABLE "Recommendation" ADD COLUMN "controlCode" TEXT;
ALTER TABLE "Recommendation" ADD COLUMN "domainCode" TEXT;
ALTER TABLE "Recommendation" ADD COLUMN "source" "MossRecommendationSource";
ALTER TABLE "Recommendation" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Recommendation_assessmentId_status_idx" ON "Recommendation"("assessmentId", "status");
CREATE INDEX "Recommendation_productCode_idx" ON "Recommendation"("productCode");
CREATE INDEX "Recommendation_controlCode_idx" ON "Recommendation"("controlCode");
ALTER TABLE "Recommendation"
  ADD CONSTRAINT "Recommendation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
