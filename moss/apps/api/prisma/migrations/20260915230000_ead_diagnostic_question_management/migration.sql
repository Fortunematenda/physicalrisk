-- Executive Advisory diagnostic question templates + assessment snapshots (Stage 4).

DO $$ BEGIN
  CREATE TYPE "EadTemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "EadDiagnosticTemplateVersion" (
  "id" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "EadTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "label" TEXT,
  "changeNote" TEXT,
  "publishedAt" TIMESTAMP(3),
  "publishedById" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EadDiagnosticTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EadDiagnosticTemplateVersion_versionNumber_key"
  ON "EadDiagnosticTemplateVersion"("versionNumber");
CREATE INDEX IF NOT EXISTS "EadDiagnosticTemplateVersion_status_idx"
  ON "EadDiagnosticTemplateVersion"("status");

CREATE TABLE IF NOT EXISTS "EadDiagnosticTemplateQuestion" (
  "id" TEXT NOT NULL,
  "templateVersionId" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "questionCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "helpText" TEXT,
  "displayOrder" INTEGER NOT NULL,
  "allowNa" BOOLEAN NOT NULL DEFAULT false,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EadDiagnosticTemplateQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EadDiagnosticTemplateQuestion_templateVersionId_moduleCode_questionCode_key"
  ON "EadDiagnosticTemplateQuestion"("templateVersionId", "moduleCode", "questionCode");
CREATE INDEX IF NOT EXISTS "EadDiagnosticTemplateQuestion_templateVersionId_moduleCode_displayOrder_idx"
  ON "EadDiagnosticTemplateQuestion"("templateVersionId", "moduleCode", "displayOrder");

DO $$ BEGIN
  ALTER TABLE "EadDiagnosticTemplateQuestion"
    ADD CONSTRAINT "EadDiagnosticTemplateQuestion_templateVersionId_fkey"
    FOREIGN KEY ("templateVersionId") REFERENCES "EadDiagnosticTemplateVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "EadAssessmentDiagnosticQuestion" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "moduleCode" TEXT NOT NULL,
  "questionCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "questionText" TEXT NOT NULL,
  "helpText" TEXT,
  "displayOrder" INTEGER NOT NULL,
  "allowNa" BOOLEAN NOT NULL DEFAULT false,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "removedAt" TIMESTAMP(3),
  "removedById" TEXT,
  "sourceTemplateQuestionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EadAssessmentDiagnosticQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EadAssessmentDiagnosticQuestion_assessmentId_moduleCode_questionCode_key"
  ON "EadAssessmentDiagnosticQuestion"("assessmentId", "moduleCode", "questionCode");
CREATE INDEX IF NOT EXISTS "EadAssessmentDiagnosticQuestion_assessmentId_moduleCode_displayOrder_idx"
  ON "EadAssessmentDiagnosticQuestion"("assessmentId", "moduleCode", "displayOrder");
CREATE INDEX IF NOT EXISTS "EadAssessmentDiagnosticQuestion_assessmentId_isActive_idx"
  ON "EadAssessmentDiagnosticQuestion"("assessmentId", "isActive");

DO $$ BEGIN
  ALTER TABLE "EadAssessmentDiagnosticQuestion"
    ADD CONSTRAINT "EadAssessmentDiagnosticQuestion_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "AssessmentSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "AssessmentSession" ADD COLUMN IF NOT EXISTS "eadTemplateVersionId" TEXT;

DO $$ BEGIN
  ALTER TABLE "AssessmentSession"
    ADD CONSTRAINT "AssessmentSession_eadTemplateVersionId_fkey"
    FOREIGN KEY ("eadTemplateVersionId") REFERENCES "EadDiagnosticTemplateVersion"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
