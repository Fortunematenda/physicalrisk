import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AdvisoryModule } from '../advisory/advisory.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { EmailModule } from '../email/email.module';
import { TriageController } from './triage.controller';
import { TriageInboundEmailController } from './triage-inbound-email.controller';
import { TriageService } from './triage.service';
import { TriageCommercialService } from './triage-commercial.service';
import { TriageCommunicationsService } from './triage-communications.service';
import { TriageInboundImapService } from './triage-inbound-imap.service';
import { TriageProposalRequestService } from './triage-proposal-request.service';

@Module({
  imports: [ScheduleModule, PrismaModule, AuditModule, AdvisoryModule, EvidenceModule, EmailModule],
  controllers: [TriageController, TriageInboundEmailController],
  providers: [
    TriageService,
    TriageCommercialService,
    TriageCommunicationsService,
    TriageInboundImapService,
    TriageProposalRequestService,
  ],
  exports: [TriageCommercialService, TriageCommunicationsService, TriageProposalRequestService],
})
export class TriageModule {}
