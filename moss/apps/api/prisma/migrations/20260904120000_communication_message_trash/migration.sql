-- Gmail-style trash for triage communications
ALTER TABLE "CommunicationMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "CommunicationMessage" ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunicationMessage_publicLeadId_deletedAt_idx"
  ON "CommunicationMessage"("publicLeadId", "deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_deletedByUserId_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_deletedByUserId_fkey"
      FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
