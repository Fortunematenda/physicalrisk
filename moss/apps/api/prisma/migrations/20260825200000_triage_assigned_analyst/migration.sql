-- AlterTable
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "assignedAnalystId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PublicLead_assignedAnalystId_idx" ON "PublicLead"("assignedAnalystId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PublicLead_assignedAnalystId_fkey'
  ) THEN
    ALTER TABLE "PublicLead"
      ADD CONSTRAINT "PublicLead_assignedAnalystId_fkey"
      FOREIGN KEY ("assignedAnalystId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
