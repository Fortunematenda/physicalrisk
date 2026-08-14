import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assessMethodologyReadiness,
  methodologyRequiredPayload,
  type MethodologyReadiness,
} from './somod-methodology';

@Injectable()
export class SomodMethodologyService {
  constructor(private readonly prisma: PrismaService) {}

  async getReadiness(assessmentId?: string): Promise<MethodologyReadiness> {
    let hasFinancialModel = false;
    let hasActivePenalties = false;
    if (assessmentId) {
      const [model, penalties] = await Promise.all([
        this.prisma.somodFinancialModel.findUnique({
          where: { somodAssessmentId: assessmentId },
          select: { id: true },
        }),
        this.prisma.somodPenaltyLibrary.count({
          where: { somodAssessmentId: assessmentId, isActive: true },
        }),
      ]);
      hasFinancialModel = Boolean(model);
      hasActivePenalties = penalties > 0;
    }
    // No client-configured methodology registry rows yet — all engine slots missing.
    return assessMethodologyReadiness({
      configuredComponents: [],
      hasFinancialModel,
      hasActivePenalties,
    });
  }

  blocked(missing: Parameters<typeof methodologyRequiredPayload>[0]) {
    return methodologyRequiredPayload(missing);
  }
}
