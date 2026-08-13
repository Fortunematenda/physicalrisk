/**
 * Local/staging repair helper for SCL assessment reference prefixes.
 *
 * DO NOT run against production without explicit approval.
 * Enum productCode SCLI_COST_LEAKAGE is unchanged — only user-facing reference strings.
 *
 * Usage (from moss/apps/api with DATABASE_URL pointing at local/staging):
 *   node prisma/repair-scl-references.js
 */
const { PrismaClient, ProductCode } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const broken = await prisma.assessmentSession.findMany({
      where: {
        productCode: ProductCode.SCLI_COST_LEAKAGE,
        OR: [{ reference: { startsWith: 'MOSS-' } }, { reference: { startsWith: 'SCLI-' } }],
      },
      select: { id: true, reference: true },
    });

    console.log(`Found ${broken.length} SCLI_COST_LEAKAGE session(s) with MOSS-/SCLI- prefix`);
    for (const row of broken) {
      const next = row.reference.replace(/^(MOSS|SCLI)-/, 'SCL-');
      if (next === row.reference) continue;
      const clash = await prisma.assessmentSession.findUnique({ where: { reference: next } });
      if (clash) {
        console.warn(`SKIP ${row.reference} → ${next} (collision with ${clash.id})`);
        continue;
      }
      await prisma.assessmentSession.update({
        where: { id: row.id },
        data: { reference: next },
      });
      console.log(`OK ${row.reference} → ${next}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
