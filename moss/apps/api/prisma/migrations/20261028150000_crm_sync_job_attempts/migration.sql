-- CRM sync history: link records written during a job to that job, and record each attempt.
-- Additive only: no existing CrmSyncRecord row is changed except the new tracking flag.

ALTER TABLE "CrmSyncRecord" ADD COLUMN "parentId" TEXT;
ALTER TABLE "CrmSyncRecord" ADD COLUMN "attemptsTracked" BOOLEAN NOT NULL DEFAULT true;

-- Rows written before this migration cannot be tied to a parent job reliably.
UPDATE "CrmSyncRecord" SET "attemptsTracked" = false;

ALTER TABLE "CrmSyncRecord"
  ADD CONSTRAINT "CrmSyncRecord_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "CrmSyncRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CrmSyncRecord_parentId_updatedAt_idx" ON "CrmSyncRecord"("parentId", "updatedAt");

CREATE TABLE "CrmSyncAttempt" (
    "id" TEXT NOT NULL,
    "syncRecordId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "trigger" TEXT,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "remoteEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSyncAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmSyncAttempt_syncRecordId_attemptNumber_key" ON "CrmSyncAttempt"("syncRecordId", "attemptNumber");

ALTER TABLE "CrmSyncAttempt"
  ADD CONSTRAINT "CrmSyncAttempt_syncRecordId_fkey"
  FOREIGN KEY ("syncRecordId") REFERENCES "CrmSyncRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each existing row already records the outcome of its latest attempt. Copy that one
-- attempt so a later retry, which overwrites the row's error, does not lose it.
-- Earlier attempts were never stored individually and are not reconstructed.
INSERT INTO "CrmSyncAttempt" ("id", "syncRecordId", "attemptNumber", "completedAt", "outcome", "errorCode", "errorMessage", "remoteEntityId")
SELECT
  'legacy_' || "id",
  "id",
  "attemptCount",
  "lastAttemptAt",
  CASE "status"
    WHEN 'SUCCESS' THEN 'success'
    WHEN 'SYNCED' THEN 'success'
    WHEN 'FAILED' THEN 'failed'
    WHEN 'RETRYING' THEN 'retrying'
    WHEN 'SKIPPED' THEN 'skipped'
  END,
  "errorCode",
  "errorMessage",
  CASE WHEN "status" IN ('SUCCESS', 'SYNCED') THEN "remoteEntityId" END
FROM "CrmSyncRecord"
WHERE "attemptCount" > 0
  AND "status" IN ('SUCCESS', 'SYNCED', 'FAILED', 'RETRYING', 'SKIPPED');
