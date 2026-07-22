import { Module, forwardRef } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { AssessmentsModule } from '../assessments/assessments.module';
import { EmailModule } from '../email/email.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    EmailModule,
    forwardRef(() => AssessmentsModule),
    forwardRef(() => ReportsModule),
    forwardRef(() => CrmModule),
  ],
  providers: [WorkflowService],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}
