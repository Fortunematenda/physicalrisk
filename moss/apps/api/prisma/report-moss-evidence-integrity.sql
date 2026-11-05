-- Read-only integrity report for MOSS control evidence. Changes nothing.
-- Run: psql -U $POSTGRES_USER -d moss -f report-moss-evidence-integrity.sql
-- Each row is a record to review by hand; do not reassign or delete without a reliable mapping.

-- 1. MOSS evidence with no control link (will not appear under any control).
SELECT 'missing_control_link' AS issue, e.id, e."assessmentId", e."fileName", e."uploadedAt", e.status
FROM "EvidenceDocument" e
WHERE e."documentType" = 'MOSS_CONTROL_EVIDENCE'
  AND e."mossControlAssessmentId" IS NULL;

-- 2. Evidence linked to a control assessment that belongs to a different assessment.
SELECT 'control_link_wrong_assessment' AS issue, e.id, e."assessmentId", mca."assessmentId" AS "linkedAssessmentId",
       mca."controlCode", e."fileName"
FROM "EvidenceDocument" e
JOIN "MossControlAssessment" mca ON mca.id = e."mossControlAssessmentId"
WHERE mca."assessmentId" <> e."assessmentId";

-- 3. Stored object path names a different control from the database link.
SELECT 'storage_key_control_mismatch' AS issue, e.id, e."assessmentId", mca."controlCode",
       split_part(e."storageKey", '/', 4) AS "storageKeyControl", e."fileName"
FROM "EvidenceDocument" e
JOIN "MossControlAssessment" mca ON mca.id = e."mossControlAssessmentId"
WHERE e."storageKey" LIKE 'assessments/%/moss/%'
  AND split_part(e."storageKey", '/', 4) <> mca."controlCode";

-- 4. Stored object path names a different assessment from the record.
SELECT 'storage_key_assessment_mismatch' AS issue, e.id, e."assessmentId",
       split_part(e."storageKey", '/', 2) AS "storageKeyAssessment", e."fileName"
FROM "EvidenceDocument" e
WHERE e."mossControlAssessmentId" IS NOT NULL
  AND e."storageKey" LIKE 'assessments/%/moss/%'
  AND split_part(e."storageKey", '/', 2) <> e."assessmentId";
