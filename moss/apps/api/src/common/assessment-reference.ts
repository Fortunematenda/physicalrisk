import { ProductCode, type Prisma } from '@prisma/client';

/** User-facing assessment reference prefix. DB enum stays SCLI_COST_LEAKAGE. */
export function assessmentReferencePrefix(productCode: string): 'SCL' | 'MOSS' {
  if (productCode === 'MOSS' || productCode === ProductCode.MOSS) return 'MOSS';
  if (productCode === 'SCLI_COST_LEAKAGE' || productCode === ProductCode.SCLI_COST_LEAKAGE) {
    return 'SCL';
  }
  throw new Error(`Unsupported productCode for assessment reference: ${productCode}`);
}

/**
 * Race-safe sequential reference: {PREFIX}-{YEAR}-{000001}
 * SCL and MOSS use separate sequences scoped by productCode.
 */
export async function generateAssessmentReference(
  tx: Prisma.TransactionClient,
  productCode: string,
  year = new Date().getFullYear(),
): Promise<string> {
  const label = assessmentReferencePrefix(productCode);
  const prefix = `${label}-${year}-`;
  const prismaProduct =
    label === 'MOSS' ? ProductCode.MOSS : ProductCode.SCLI_COST_LEAKAGE;

  for (let attempt = 0; attempt < 8; attempt++) {
    const rows = await tx.assessmentSession.findMany({
      where: { productCode: prismaProduct, reference: { startsWith: prefix } },
      select: { reference: true },
    });

    let max = 0;
    for (const row of rows) {
      const n = Number(row.reference.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }

    const seq = max + 1 + attempt;
    const reference = `${prefix}${String(seq).padStart(6, '0')}`;
    const clash = await tx.assessmentSession.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!clash) return reference;
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
}
