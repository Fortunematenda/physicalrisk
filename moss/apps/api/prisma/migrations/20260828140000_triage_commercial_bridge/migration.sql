-- Commercial bridge: pre-Level-2 pipeline for Executive Governance Triage leads

CREATE TYPE "CommercialStage" AS ENUM (
  'TRIAGE_COMPLETED',
  'UNDER_REVIEW',
  'CONTACTED',
  'COMMERCIAL_DISCUSSION',
  'PROPOSAL_DRAFT',
  'PROPOSAL_SENT',
  'PROPOSAL_ACCEPTED',
  'LEVEL_2_READY',
  'LEVEL_2_CREATED',
  'CLOSED'
);

CREATE TYPE "ClientInterest" AS ENUM (
  'UNKNOWN',
  'INTERESTED',
  'NEEDS_FOLLOW_UP',
  'NOT_INTERESTED',
  'DEFERRED'
);

CREATE TYPE "TriageContactMethod" AS ENUM (
  'CALL',
  'EMAIL',
  'MEETING',
  'WHATSAPP',
  'OTHER'
);

CREATE TYPE "TriageContactOutcome" AS ENUM (
  'NO_RESPONSE',
  'FOLLOW_UP_REQUIRED',
  'INTERESTED',
  'NOT_INTERESTED',
  'WANTS_PROPOSAL',
  'NEEDS_MORE_INFORMATION',
  'DEFERRED',
  'CLOSED'
);

CREATE TYPE "TriageProposalStatus" AS ENUM (
  'DRAFT',
  'INTERNAL_REVIEW',
  'APPROVED',
  'SENT',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN'
);

CREATE TYPE "TriageProposalSource" AS ENUM (
  'PLATFORM',
  'UPLOAD'
);

ALTER TABLE "PublicLead"
  ADD COLUMN "commercialOwnerId" TEXT,
  ADD COLUMN "commercialOwnerAssignedAt" TIMESTAMP(3),
  ADD COLUMN "commercialStage" "CommercialStage",
  ADD COLUMN "clientInterest" "ClientInterest" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "scopeClientObjectives" TEXT,
  ADD COLUMN "scopeSitesOrBusinessUnits" TEXT,
  ADD COLUMN "scopeIndicativeScope" TEXT,
  ADD COLUMN "scopeExpectedTimeline" TEXT,
  ADD COLUMN "scopeCommercialNotes" TEXT,
  ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "followUpOwnerId" TEXT,
  ADD COLUMN "followUpReason" TEXT,
  ADD COLUMN "acceptedProposalId" TEXT;

CREATE UNIQUE INDEX "PublicLead_acceptedProposalId_key" ON "PublicLead"("acceptedProposalId");

CREATE TABLE "TriageContactActivity" (
  "id" TEXT NOT NULL,
  "publicLeadId" TEXT NOT NULL,
  "contactMethod" "TriageContactMethod" NOT NULL,
  "contactedById" TEXT NOT NULL,
  "contactedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome" "TriageContactOutcome" NOT NULL,
  "notes" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TriageContactActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TriageProposal" (
  "id" TEXT NOT NULL,
  "proposalNumber" TEXT NOT NULL,
  "publicLeadId" TEXT NOT NULL,
  "organisationId" TEXT,
  "productCode" TEXT NOT NULL DEFAULT 'EXECUTIVE_ADVISORY_DIAGNOSTIC',
  "title" TEXT NOT NULL,
  "scopeSummary" TEXT,
  "objectives" TEXT,
  "sitesOrBusinessUnits" TEXT,
  "deliverables" TEXT,
  "evidenceRequirements" TEXT,
  "timeline" TEXT,
  "fee" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'ZAR',
  "validUntil" TIMESTAMP(3),
  "terms" TEXT,
  "status" "TriageProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "source" "TriageProposalSource" NOT NULL DEFAULT 'PLATFORM',
  "documentStorageKey" TEXT,
  "documentFileName" TEXT,
  "documentMimeType" TEXT,
  "documentSizeBytes" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  CONSTRAINT "TriageProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TriageProposal_proposalNumber_key" ON "TriageProposal"("proposalNumber");
CREATE INDEX "TriageContactActivity_publicLeadId_contactedAt_idx" ON "TriageContactActivity"("publicLeadId", "contactedAt");
CREATE INDEX "TriageContactActivity_contactedById_idx" ON "TriageContactActivity"("contactedById");
CREATE INDEX "TriageProposal_publicLeadId_createdAt_idx" ON "TriageProposal"("publicLeadId", "createdAt");
CREATE INDEX "TriageProposal_organisationId_idx" ON "TriageProposal"("organisationId");
CREATE INDEX "TriageProposal_status_idx" ON "TriageProposal"("status");
CREATE INDEX "PublicLead_commercialOwnerId_idx" ON "PublicLead"("commercialOwnerId");
CREATE INDEX "PublicLead_commercialStage_idx" ON "PublicLead"("commercialStage");

ALTER TABLE "PublicLead"
  ADD CONSTRAINT "PublicLead_commercialOwnerId_fkey"
    FOREIGN KEY ("commercialOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicLead_followUpOwnerId_fkey"
    FOREIGN KEY ("followUpOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PublicLead_acceptedProposalId_fkey"
    FOREIGN KEY ("acceptedProposalId") REFERENCES "TriageProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TriageContactActivity"
  ADD CONSTRAINT "TriageContactActivity_publicLeadId_fkey"
    FOREIGN KEY ("publicLeadId") REFERENCES "PublicLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TriageContactActivity_contactedById_fkey"
    FOREIGN KEY ("contactedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TriageProposal"
  ADD CONSTRAINT "TriageProposal_publicLeadId_fkey"
    FOREIGN KEY ("publicLeadId") REFERENCES "PublicLead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TriageProposal_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "TriageProposal_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill commercial stage for existing completed leads
UPDATE "PublicLead"
SET "commercialStage" = CASE
  WHEN "convertedAt" IS NOT NULL THEN 'LEVEL_2_CREATED'::"CommercialStage"
  WHEN "closedAt" IS NOT NULL THEN 'CLOSED'::"CommercialStage"
  WHEN "proposalStatus" = 'ACCEPTED' THEN 'PROPOSAL_ACCEPTED'::"CommercialStage"
  WHEN "proposalStatus" = 'SENT' THEN 'PROPOSAL_SENT'::"CommercialStage"
  WHEN "proposalStatus" IN ('IN_PREPARATION', 'REQUESTED') THEN 'PROPOSAL_DRAFT'::"CommercialStage"
  WHEN "contactedAt" IS NOT NULL THEN 'CONTACTED'::"CommercialStage"
  WHEN "reviewedAt" IS NOT NULL THEN 'UNDER_REVIEW'::"CommercialStage"
  WHEN "completedAt" IS NOT NULL THEN 'TRIAGE_COMPLETED'::"CommercialStage"
  ELSE NULL
END
WHERE "commercialStage" IS NULL;
