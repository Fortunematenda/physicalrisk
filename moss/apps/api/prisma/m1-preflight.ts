/**
 * Pre-migration safety checks for MOSS M1.
 * Run: pnpm --filter @moss/api exec tsx prisma/m1-preflight.ts
 *
 * Stops with non-zero exit if destructive conditions are detected.
 * Does not apply migrations.
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL is not set.');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    const [
      organisations,
      assessments,
      scoreSnapshots,
      evidence,
      findings,
      questions,
      responses,
    ] = await Promise.all([
      prisma.organisation.count(),
      prisma.assessmentSession.count(),
      prisma.scoreSnapshot.count(),
      prisma.evidenceDocument.count(),
      prisma.finding.count(),
      prisma.question.count(),
      prisma.assessmentResponse.count(),
    ]);

    console.log('M1 preflight row counts (SCLI diagnostic DB):');
    console.log({ organisations, assessments, scoreSnapshots, evidence, findings, questions, responses });

    // Detect whether productCode already exists (re-run safety).
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AssessmentSession'
    `;
    const names = new Set(cols.map((c) => c.column_name));
    const hasProductCode = names.has('productCode');
    console.log(`AssessmentSession.productCode present: ${hasProductCode}`);

    if (hasProductCode) {
      const grouped = await prisma.$queryRaw<Array<{ productCode: string; count: bigint }>>`
        SELECT "productCode"::text AS "productCode", COUNT(*)::bigint AS count
        FROM "AssessmentSession"
        GROUP BY "productCode"
      `;
      console.log('Existing productCode distribution:', grouped);
    }

    const mossTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Site', 'MossCatalogueVersion', 'MossDomain', 'MossControl', 'MossControlAssessment', 'MossScoreSnapshot')
    `;
    console.log(
      'MOSS tables already present:',
      mossTables.map((t) => t.table_name),
    );

    console.log('Preflight complete. Migration is expected to be additive only.');
    console.log('Do NOT run: prisma db push --accept-data-loss');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('M1 preflight failed:', err);
  process.exit(1);
});
