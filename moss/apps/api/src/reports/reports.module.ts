import { Module, forwardRef } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { EmailModule } from '../email/email.module';
import { CrmModule } from '../crm/crm.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    forwardRef(() => AssessmentsModule),
    EvidenceModule,
    EmailModule,
    forwardRef(() => CrmModule),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
