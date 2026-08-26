import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AdvisoryModule } from '../advisory/advisory.module';
import { TriageController } from './triage.controller';
import { TriageService } from './triage.service';

@Module({
  imports: [PrismaModule, AuditModule, AdvisoryModule],
  controllers: [TriageController],
  providers: [TriageService],
})
export class TriageModule {}
