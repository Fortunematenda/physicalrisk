import { Injectable } from '@nestjs/common';
import { SomodMethodologyService } from '../methodology/somod-methodology.service';
import { methodologyRequiredPayload } from '../methodology/somod-methodology';

/** Engine 3 — Technology and System Control. No substitution ratios invented. */
@Injectable()
export class SomodTechnologyControlEngine {
  constructor(private readonly methodology: SomodMethodologyService) {}

  async evaluate(_assessmentId: string, _inputs?: Record<string, unknown>) {
    return methodologyRequiredPayload(['technology_substitution_rules']);
  }

  async evaluateSubstitution(_assessmentId: string) {
    return {
      ...methodologyRequiredPayload(['technology_substitution_rules']),
      message: 'Technology substitution evaluation requires client-approved substitution methodology.',
    };
  }

  async readiness(assessmentId: string) {
    const m = await this.methodology.getReadiness(assessmentId);
    return {
      engine: 'TECHNOLOGY',
      ...methodologyRequiredPayload(['technology_substitution_rules']),
      methodology: m,
    };
  }
}
