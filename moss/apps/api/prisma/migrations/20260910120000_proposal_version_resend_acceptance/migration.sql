-- Proposal revision (v1.0 → v1.1), resend tracking, and signed acceptance artifacts.
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "versionRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "acceptedByName" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "acceptanceMethod" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "acceptanceNotes" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "signedDocumentStorageKey" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "signedDocumentFileName" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "signedDocumentMimeType" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "signedDocumentSizeBytes" INTEGER;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "sendCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "lastSendType" TEXT;
ALTER TABLE "TriageProposal" ADD COLUMN IF NOT EXISTS "lastSentById" TEXT;

-- Repair inflated draft versions from the old bump-on-PDF bug.
UPDATE "TriageProposal"
SET "version" = 1, "versionRevision" = 0
WHERE "status" IN ('DRAFT', 'INTERNAL_REVIEW', 'APPROVED')
  AND "version" > 1;

-- Client-facing inflated majors → v1.0 (Wayne UAT cleanup).
UPDATE "TriageProposal"
SET "version" = 1, "versionRevision" = 0
WHERE "status" IN ('SENT', 'VIEWED', 'ACCEPTED', 'DECLINED')
  AND "version" > 1;
