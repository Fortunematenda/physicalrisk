-- EAD diagnostic outcome + confirmed Level 3 routing + commercial workflow

CREATE TYPE "AdvisoryRoutePriority" AS ENUM ('HIGH', 'RECOMMENDED', 'OPTIONAL');

CREATE TABLE "AdvisoryDiagnosticOutcome" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "confirmedById" TEXT NOT NULL,
  "commercialReference" TEXT,
  "commercialStatus" "ProposalStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "commercialRequestedAt" TIMESTAMP(3),
  "commercialSentAt" TIMESTAMP(3),
  "commercialAcceptedAt" TIMESTAMP(3),
  "commercialDeclinedAt" TIMESTAMP(3),
  "commercialExpiredAt" TIMESTAMP(3),
  "commercialAdminNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisoryDiagnosticOutcome_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvisoryConfirmedRoute" (
  "id" TEXT NOT NULL,
  "outcomeId" TEXT NOT NULL,
  "productCode" "ProductCode" NOT NULL,
  "priority" "AdvisoryRoutePriority" NOT NULL DEFAULT 'RECOMMENDED',
  "rationale" TEXT,
  "sourceModuleCode" TEXT,
  "sourceModuleName" TEXT,
  "createdAssessmentId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisoryConfirmedRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisoryDiagnosticOutcome_assessmentId_key" ON "AdvisoryDiagnosticOutcome"("assessmentId");
CREATE UNIQUE INDEX "AdvisoryDiagnosticOutcome_commercialReference_key" ON "AdvisoryDiagnosticOutcome"("commercialReference");
CREATE INDEX "AdvisoryDiagnosticOutcome_commercialStatus_idx" ON "AdvisoryDiagnosticOutcome"("commercialStatus");

CREATE UNIQUE INDEX "AdvisoryConfirmedRoute_createdAssessmentId_key" ON "AdvisoryConfirmedRoute"("createdAssessmentId");
CREATE UNIQUE INDEX "AdvisoryConfirmedRoute_outcomeId_productCode_key" ON "AdvisoryConfirmedRoute"("outcomeId", "productCode");
CREATE INDEX "AdvisoryConfirmedRoute_outcomeId_idx" ON "AdvisoryConfirmedRoute"("outcomeId");

ALTER TABLE "AdvisoryDiagnosticOutcome"
  ADD CONSTRAINT "AdvisoryDiagnosticOutcome_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisoryDiagnosticOutcome"
  ADD CONSTRAINT "AdvisoryDiagnosticOutcome_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdvisoryConfirmedRoute"
  ADD CONSTRAINT "AdvisoryConfirmedRoute_outcomeId_fkey"
  FOREIGN KEY ("outcomeId") REFERENCES "AdvisoryDiagnosticOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisoryConfirmedRoute"
  ADD CONSTRAINT "AdvisoryConfirmedRoute_createdAssessmentId_fkey"
  FOREIGN KEY ("createdAssessmentId") REFERENCES "AssessmentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
