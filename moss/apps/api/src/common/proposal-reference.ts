import type { Prisma } from '@prisma/client';

/**
 * Race-safe sequential proposal request reference: PRP-{YEAR}-{000001}
 * Stored on PublicLead.proposalReference (unique).
 */
export async function generateProposalReference(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `PRP-${year}-`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await tx.publicLead.findMany({
      where: { proposalReference: { startsWith: prefix } },
      select: { proposalReference: true },
    });
    let max = 0;
    for (const row of rows) {
      const n = Number(String(row.proposalReference || '').slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    const reference = `${prefix}${String(max + 1 + attempt).padStart(6, '0')}`;
    const clash = await tx.publicLead.findUnique({
      where: { proposalReference: reference },
      select: { id: true },
    });
    if (!clash) return reference;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}
