import { Prisma } from '@prisma/client';

/**
 * Race-safe sequential SOMOD reference: SOMOD-{YEAR}-{000001}
 * Uses SomodAssessment table — never AssessmentSession.
 */
export async function generateSomodReference(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `SOMOD-${year}-`;

  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await tx.somodAssessment.findMany({
      where: { reference: { startsWith: prefix } },
      select: { reference: true },
    });

    let max = 0;
    for (const row of rows) {
      const n = Number(row.reference.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }

    const seq = max + 1 + attempt;
    const reference = `${prefix}${String(seq).padStart(6, '0')}`;
    const clash = await tx.somodAssessment.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!clash) return reference;
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
}
