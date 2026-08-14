import { Injectable } from '@nestjs/common';
import { SomodMethodologyService } from '../methodology/somod-methodology.service';
import { methodologyRequiredPayload } from '../methodology/somod-methodology';

/** Engine 2 — Deployment and Capability. Current-state capture OK; derivation blocked. */
@Injectable()
export class SomodDeploymentCapabilityEngine {
  constructor(private readonly methodology: SomodMethodologyService) {}

  async evaluate(_assessmentId: string, _inputs?: Record<string, unknown>) {
    return methodologyRequiredPayload(['deployment_derivation_rules']);
  }

  async compareCurrentToRequired(_assessmentId: string) {
    return {
      ...methodologyRequiredPayload(['deployment_derivation_rules', 'risk_requirement_rules']),
      message:
        'Capability gap analysis requires Engine 1 required-capability outputs and deployment derivation methodology.',
    };
  }

  async readiness(assessmentId: string) {
    const m = await this.methodology.getReadiness(assessmentId);
    return { engine: 'DEPLOYMENT_CAPABILITY', ...methodologyRequiredPayload(['deployment_derivation_rules']), methodology: m };
  }
}
