import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentBinScheduler } from './document-bin.scheduler';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentBinScheduler, RolesGuard],
  exports: [DocumentsService],
})
export class DocumentsModule {}
