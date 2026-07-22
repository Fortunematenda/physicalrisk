import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';

@Module({
  controllers: [ConfigurationController],
  providers: [ConfigurationService, RolesGuard],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
