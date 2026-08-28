-- Triage internal notes timeline (append-only records per submission)

CREATE TYPE "TriageNoteCategory" AS ENUM (
  'GENERAL',
  'CALL_OUTCOME',
  'FOLLOW_UP',
  'COMMERCIAL',
  'CONSULTANT_OBSERVATION',
  'CLIENT_REQUEST',
  'INTERNAL_DECISION'
);

CREATE TABLE "TriageNote" (
  "id" TEXT NOT NULL,
  "publicLeadId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "category" "TriageNoteCategory" NOT NULL DEFAULT 'GENERAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "TriageNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TriageNote_publicLeadId_createdAt_idx" ON "TriageNote"("publicLeadId", "createdAt");
CREATE INDEX "TriageNote_authorId_idx" ON "TriageNote"("authorId");

ALTER TABLE "TriageNote"
  ADD CONSTRAINT "TriageNote_publicLeadId_fkey"
  FOREIGN KEY ("publicLeadId") REFERENCES "PublicLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TriageNote"
  ADD CONSTRAINT "TriageNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate legacy single adminNotes field into the first timeline entry (preserved, not lost)
INSERT INTO "TriageNote" ("id", "publicLeadId", "authorId", "body", "category", "createdAt", "updatedAt")
SELECT
  'legacy_' || pl."id",
  pl."id",
  NULL,
  trim(pl."adminNotes"),
  'GENERAL'::"TriageNoteCategory",
  COALESCE(pl."updatedAt", pl."createdAt"),
  COALESCE(pl."updatedAt", pl."createdAt")
FROM "PublicLead" pl
WHERE pl."adminNotes" IS NOT NULL
  AND trim(pl."adminNotes") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "TriageNote" tn WHERE tn."id" = 'legacy_' || pl."id"
  );
