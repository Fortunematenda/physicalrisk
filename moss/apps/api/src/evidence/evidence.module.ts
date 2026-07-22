import { Module } from '@nestjs/common';
import { AssessmentsModule } from '../assessments/assessments.module';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { StorageService } from './storage.service';

@Module({ imports: [AssessmentsModule], controllers: [EvidenceController], providers: [EvidenceService, StorageService], exports: [EvidenceService, StorageService] })
export class EvidenceModule {}
