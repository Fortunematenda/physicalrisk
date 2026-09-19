import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { EmailModule } from '../email/email.module';
import { AdvisoryController } from './advisory.controller';
import { AdvisoryService } from './advisory.service';
import { EadDiagnosticQuestionsController } from './ead-diagnostic-questions.controller';
import { EadDiagnosticQuestionsService } from './ead-diagnostic-questions.service';

@Module({
  imports: [PrismaModule, AuditModule, EvidenceModule, EmailModule],
  controllers: [AdvisoryController, EadDiagnosticQuestionsController],
  providers: [AdvisoryService, EadDiagnosticQuestionsService],
  exports: [AdvisoryService, EadDiagnosticQuestionsService],
})
export class AdvisoryModule {}
