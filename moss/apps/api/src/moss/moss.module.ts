import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { MossCatalogueController } from './catalogue/moss-catalogue.controller';
import { MossCatalogueService } from './catalogue/moss-catalogue.service';
import { MossAssessmentsController } from './assessments/moss-assessments.controller';
import { MossAssessmentsService } from './assessments/moss-assessments.service';
import { MossSitesController } from './sites/moss-sites.controller';
import { MossSitesService } from './sites/moss-sites.service';
import { MossProgressService } from './progress/moss-progress.service';
import { MossScoringService } from './scoring/moss-scoring.service';
import { MossResultsService } from './results/moss-results.service';
import { MossFindingsService } from './findings/moss-findings.service';
import { MossRecommendationsService } from './recommendations/moss-recommendations.service';
import { MossEvidenceService } from './evidence/moss-evidence.service';
import { MossReportsService } from './reports/moss-reports.service';

@Module({
  imports: [AuditModule, forwardRef(() => EvidenceModule)],
  controllers: [MossCatalogueController, MossAssessmentsController, MossSitesController],
  providers: [
    MossCatalogueService,
    MossAssessmentsService,
    MossSitesService,
    MossProgressService,
    MossScoringService,
    MossResultsService,
    MossFindingsService,
    MossRecommendationsService,
    MossEvidenceService,
    MossReportsService,
  ],
  exports: [
    MossCatalogueService,
    MossAssessmentsService,
    MossSitesService,
    MossProgressService,
    MossScoringService,
  ],
})
export class MossModule {}
