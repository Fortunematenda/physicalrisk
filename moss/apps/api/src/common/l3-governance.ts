import { BadRequestException } from '@nestjs/common';
import { ProductCode } from '@prisma/client';
import { EAD_ROUTING_PRODUCT_CODES } from '@moss/shared';
import type { PrismaService } from '../prisma/prisma.service';

const GOVERNED_L3_PRODUCTS = new Set<string>([
  ProductCode.SCLI_COST_LEAKAGE,
  ...EAD_ROUTING_PRODUCT_CODES,
]);

export function isGovernedLevel3Product(productCode: string): boolean {
  return GOVERNED_L3_PRODUCTS.has(productCode);
}

export type ManualCreatePolicy = {
  allowed: boolean;
  reason?: string;
  completedEad?: { id: string; reference: string };
};

export async function resolveManualCreatePolicy(
  prisma: PrismaService,
  organisationId: string,
  productCode: string,
  parentAssessmentId?: string | null,
): Promise<ManualCreatePolicy> {
  if (parentAssessmentId) return { allowed: true };
  if (!isGovernedLevel3Product(productCode)) return { allowed: true };

  const completedEad = await prisma.assessmentSession.findFirst({
    where: {
      organisationId,
      productCode: ProductCode.EXECUTIVE_ADVISORY_DIAGNOSTIC,
      diagnosticOutcome: { isNot: null },
    },
    select: { id: true, reference: true },
    orderBy: { submittedAt: 'desc' },
  });

  if (!completedEad) return { allowed: true };

  return {
    allowed: false,
    reason:
      'Level 3 engagements must be created from the completed diagnostic outcome after commercial acceptance. Manual creation bypasses routing and commercial governance.',
    completedEad,
  };
}

export async function assertManualLevel3CreationAllowed(
  prisma: PrismaService,
  organisationId: string,
  productCode: string,
  parentAssessmentId?: string | null,
): Promise<void> {
  const policy = await resolveManualCreatePolicy(prisma, organisationId, productCode, parentAssessmentId);
  if (!policy.allowed) {
    const ref = policy.completedEad?.reference || 'diagnostic outcome';
    throw new BadRequestException(
      `${policy.reason} Use ${ref} → diagnostic outcome to create Level 3 work.`,
    );
  }
}
