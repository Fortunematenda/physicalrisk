import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { SomodAssessmentsController } from './assessments/somod-assessments.controller';
import { SomodAssessmentsService } from './assessments/somod-assessments.service';
import { SomodReportsService } from './reports/somod-reports.service';
import { SomodFinancialController } from './financial/somod-financial.controller';
import { SomodFinancialService } from './financial/somod-financial.service';
import { SomodMethodologyService } from './methodology/somod-methodology.service';
import { SomodRiskRequirementEngine } from './engines/somod-risk-requirement.engine';
import { SomodDeploymentCapabilityEngine } from './engines/somod-deployment-capability.engine';
import { SomodTechnologyControlEngine } from './engines/somod-technology-control.engine';
import { SomodOptimisationEngine } from './engines/somod-optimisation.engine';

@Module({
  imports: [AuditModule, forwardRef(() => EvidenceModule)],
  controllers: [SomodAssessmentsController, SomodFinancialController],
  providers: [
    SomodAssessmentsService,
    SomodReportsService,
    SomodFinancialService,
    SomodMethodologyService,
    SomodRiskRequirementEngine,
    SomodDeploymentCapabilityEngine,
    SomodTechnologyControlEngine,
    SomodOptimisationEngine,
  ],
  exports: [
    SomodAssessmentsService,
    SomodReportsService,
    SomodFinancialService,
    SomodMethodologyService,
  ],
})
export class SomodModule {}
