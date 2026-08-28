import type { Prisma } from '@prisma/client';

/**
 * Sequential EAD proposal reference: PR-EAD-{YEAR}-{000001}
 */
export async function generateEadProposalNumber(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `PR-EAD-${year}-`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await tx.triageProposal.findMany({
      where: { proposalNumber: { startsWith: prefix } },
      select: { proposalNumber: true },
    });
    let max = 0;
    for (const row of rows) {
      const n = Number(String(row.proposalNumber || '').slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    const reference = `${prefix}${String(max + 1 + attempt).padStart(6, '0')}`;
    const clash = await tx.triageProposal.findUnique({
      where: { proposalNumber: reference },
      select: { id: true },
    });
    if (!clash) return reference;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}
