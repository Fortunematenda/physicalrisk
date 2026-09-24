-- Client digital proposal response + procurement fields (non-destructive).

ALTER TYPE "TriageProposalStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';

ALTER TABLE "TriageProposal"
  ADD COLUMN IF NOT EXISTS "responseToken" TEXT,
  ADD COLUMN IF NOT EXISTS "responseTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acceptedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "acceptedByJobTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "poRequirement" TEXT DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS "poNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "poDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "poValue" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "procurementContact" TEXT,
  ADD COLUMN IF NOT EXISTS "procurementEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "poNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "poDocumentStorageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "poDocumentFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "poDocumentMimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "poDocumentSizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "poReceivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "changesRequestNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "changesRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "declinedReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TriageProposal_responseToken_key" ON "TriageProposal"("responseToken");
