-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProposalStatus" AS ENUM (
    'NOT_REQUESTED',
    'REQUESTED',
    'IN_PREPARATION',
    'SENT',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "PublicLead"
  ADD COLUMN IF NOT EXISTS "proposalStatus" "ProposalStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN IF NOT EXISTS "proposalRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposalSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposalAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposalDeclinedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposalExpiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposalReference" TEXT,
  ADD COLUMN IF NOT EXISTS "proposalAdminNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "proposalPreparedById" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PublicLead_proposalReference_key" ON "PublicLead"("proposalReference");
CREATE INDEX IF NOT EXISTS "PublicLead_proposalStatus_idx" ON "PublicLead"("proposalStatus");
CREATE INDEX IF NOT EXISTS "PublicLead_proposalRequestedAt_idx" ON "PublicLead"("proposalRequestedAt");
