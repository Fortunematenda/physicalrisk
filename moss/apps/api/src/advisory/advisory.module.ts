import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { AdvisoryController } from './advisory.controller';
import { AdvisoryService } from './advisory.service';

@Module({ imports: [PrismaModule, AuditModule, EvidenceModule], controllers: [AdvisoryController], providers: [AdvisoryService], exports: [AdvisoryService] })
export class AdvisoryModule {}
