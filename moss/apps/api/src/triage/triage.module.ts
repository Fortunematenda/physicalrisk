import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AdvisoryModule } from '../advisory/advisory.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { EmailModule } from '../email/email.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';
import { TriageCommercialService } from './triage-commercial.service';
import { TriageProposalRequestService } from './triage-proposal-request.service';

@Module({
  imports: [PrismaModule, AuditModule, AdvisoryModule, EvidenceModule, EmailModule],
  controllers: [TriageController],
  providers: [TriageService, TriageCommercialService, TriageProposalRequestService],
  exports: [TriageCommercialService, TriageProposalRequestService],
})
export class TriageModule {}
