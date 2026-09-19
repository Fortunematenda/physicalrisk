import type { Prisma } from '@prisma/client';

/**
 * Race-safe sequential proposal reference: PRP-{YEAR}-{000001}
 * Unique across PublicLead.proposalReference and TriageProposal.proposalNumber.
 */
export async function generateProposalReference(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear(),
): Promise<string> {
  const prefix = `PRP-${year}-`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const [leadRows, proposalRows] = await Promise.all([
      tx.publicLead.findMany({
        where: { proposalReference: { startsWith: prefix } },
        select: { proposalReference: true },
      }),
      tx.triageProposal.findMany({
        where: { proposalNumber: { startsWith: prefix } },
        select: { proposalNumber: true },
      }),
    ]);
    let max = 0;
    for (const row of leadRows) {
      const n = Number(String(row.proposalReference || '').slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    for (const row of proposalRows) {
      const n = Number(String(row.proposalNumber || '').slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
    const reference = `${prefix}${String(max + 1 + attempt).padStart(6, '0')}`;
    const [leadClash, proposalClash] = await Promise.all([
      tx.publicLead.findUnique({
        where: { proposalReference: reference },
        select: { id: true },
      }),
      tx.triageProposal.findUnique({
        where: { proposalNumber: reference },
        select: { id: true },
      }),
    ]);
    if (!leadClash && !proposalClash) return reference;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}
