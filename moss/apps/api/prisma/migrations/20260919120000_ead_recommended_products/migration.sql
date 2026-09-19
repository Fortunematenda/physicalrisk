-- Stage 9: multi-select recommended next products on AdvisoryModuleReview.
ALTER TABLE "AdvisoryModuleReview" ADD COLUMN IF NOT EXISTS "recommendedProducts" JSONB;

-- Backfill: preserve historical singular recommendations as a one-element array.
UPDATE "AdvisoryModuleReview"
SET "recommendedProducts" = jsonb_build_array("recommendedProduct"::text)
WHERE "recommendedProduct" IS NOT NULL
  AND (
    "recommendedProducts" IS NULL
    OR "recommendedProducts" = 'null'::jsonb
    OR "recommendedProducts" = '[]'::jsonb
  );
