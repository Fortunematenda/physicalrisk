import type { Prisma } from '@prisma/client';

/**
 * Race-safe sequential Level 3 commercial proposal reference: L3P-{YEAR}-{000001}
 * Stored on AdvisoryDiagnosticOutcome.commercialReference (unique).
 */
export async function generateL3ProposalReference(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `L3P-${year}-`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await tx.advisoryDiagnosticOutcome.findMany({
      where: { commercialReference: { startsWith: prefix } },
      select: { commercialReference: true },
    });
    let max = 0;
    for (const row of rows) {
      const n = Number(String(row.commercialReference || '').slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    const reference = `${prefix}${String(max + 1 + attempt).padStart(6, '0')}`;
    const clash = await tx.advisoryDiagnosticOutcome.findUnique({
      where: { commercialReference: reference },
      select: { id: true },
    });
    if (!clash) return reference;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}
