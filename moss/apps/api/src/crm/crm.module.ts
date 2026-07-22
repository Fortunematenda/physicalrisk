import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { EspoCrmService } from './espocrm.service';

@Module({
  controllers: [CrmController],
  providers: [EspoCrmService],
  exports: [EspoCrmService],
})
export class CrmModule {}
