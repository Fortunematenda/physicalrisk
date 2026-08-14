import { Injectable } from '@nestjs/common';
import { SomodMethodologyService } from '../methodology/somod-methodology.service';
import { methodologyRequiredPayload } from '../methodology/somod-methodology';

/**
 * Engine 1 — Risk and Requirement architecture.
 * Persists structured capture via assessment JSON until normalized tables land;
 * derivation always requires client methodology.
 */
@Injectable()
export class SomodRiskRequirementEngine {
  constructor(private readonly methodology: SomodMethodologyService) {}

  async evaluate(_assessmentId: string, _inputs?: Record<string, unknown>) {
    return methodologyRequiredPayload([
      'risk_requirement_rules',
      'effectiveness_scoring',
      'risk_position_scoring',
    ]);
  }

  async readiness(assessmentId: string) {
    const m = await this.methodology.getReadiness(assessmentId);
    return {
      engine: 'RISK_REQUIREMENT',
      ...methodologyRequiredPayload(
        m.missing.filter((x) =>
          ['risk_requirement_rules', 'effectiveness_scoring', 'risk_position_scoring'].includes(x),
        ).length
          ? (['risk_requirement_rules'] as const)
          : (['risk_requirement_rules'] as const),
      ),
      methodology: m,
    };
  }
}
