import { Injectable } from '@nestjs/common';
import { SomodMethodologyService } from '../methodology/somod-methodology.service';
import { methodologyRequiredPayload } from '../methodology/somod-methodology';

/**
 * Engine 5 — Optimisation and Trade-off.
 * Architecture only — no objective weights or α-blend.
 */
@Injectable()
export class SomodOptimisationEngine {
  constructor(private readonly methodology: SomodMethodologyService) {}

  async run(_assessmentId: string) {
    return {
      ...methodologyRequiredPayload([
        'optimisation_objective',
        'optimisation_constraints',
        'scenario_recommended_optimal_rules',
      ]),
      message:
        'Recommended Optimal requires a configured optimisation objective and constraints. α-blend is disabled.',
      candidates: [] as unknown[],
      recommendation: null,
      tradeOffExplanation: null,
    };
  }

  async readiness(assessmentId: string) {
    const m = await this.methodology.getReadiness(assessmentId);
    return {
      engine: 'OPTIMISATION_TRADEOFF',
      ...methodologyRequiredPayload(['optimisation_objective', 'optimisation_constraints']),
      methodology: m,
    };
  }
}
