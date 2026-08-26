import { ProductCode, type Prisma } from '@prisma/client';

const PREFIX_BY_PRODUCT: Record<string, string> = {
  EXECUTIVE_GOVERNANCE_TRIAGE: 'EGT',
  SCLI_COST_LEAKAGE: 'SCL',
  EXECUTIVE_ADVISORY_DIAGNOSTIC: 'EAD',
  CONTRACT_SLA_ASSURANCE: 'CSLA',
  VENDOR_PERFORMANCE_ASSURANCE: 'VPA',
  GOVERNANCE_EXECUTIVE_ASSURANCE: 'SGEA',
  CYBER_PHYSICAL_DEPENDENCY: 'CPD',
  SHIELD360: 'SH360',
  MOSS: 'MOSS',
};

export function assessmentReferencePrefix(productCode: string): string {
  const prefix = PREFIX_BY_PRODUCT[productCode];
  if (!prefix) throw new Error(`Unsupported productCode for assessment reference: ${productCode}`);
  return prefix;
}

/** Race-safe sequential reference: {PREFIX}-{YEAR}-{000001}, scoped by product. */
export async function generateAssessmentReference(
  tx: Prisma.TransactionClient,
  productCode: string,
  year = new Date().getFullYear(),
): Promise<string> {
  const label = assessmentReferencePrefix(productCode);
  const prefix = `${label}-${year}-`;
  const prismaProduct = productCode as ProductCode;

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
    const reference = `${prefix}${String(max + 1 + attempt).padStart(6, '0')}`;
    const clash = await tx.assessmentSession.findUnique({ where: { reference }, select: { id: true } });
    if (!clash) return reference;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}
