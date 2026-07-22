-- EspoCRM integration columns (applied via prisma db push in this MVP)
-- AssessmentSession: store Opportunity / Task remote IDs
-- PublicLead: separate Contact vs Lead remote IDs
-- CrmSyncRecord: jobType, action, errorCode for queue observability

ALTER TABLE "AssessmentSession" ADD COLUMN IF NOT EXISTS "espocrmOpportunityId" TEXT;
ALTER TABLE "AssessmentSession" ADD COLUMN IF NOT EXISTS "espocrmTaskId" TEXT;
ALTER TABLE "PublicLead" ADD COLUMN IF NOT EXISTS "espocrmContactId" TEXT;
ALTER TABLE "CrmSyncRecord" ADD COLUMN IF NOT EXISTS "jobType" TEXT;
ALTER TABLE "CrmSyncRecord" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "CrmSyncRecord" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
CREATE INDEX IF NOT EXISTS "CrmSyncRecord_jobType_status_idx" ON "CrmSyncRecord"("jobType", "status");
