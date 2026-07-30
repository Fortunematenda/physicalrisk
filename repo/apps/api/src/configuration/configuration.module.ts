import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { DocumentsModule } from '../documents/documents.module';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';

@Module({
  imports: [DocumentsModule],
  controllers: [ConfigurationController],
  providers: [ConfigurationService, RolesGuard],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
