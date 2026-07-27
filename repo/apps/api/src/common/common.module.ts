import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { OpsLoggerService } from './ops-logger.service';

@Global()
@Module({
  providers: [AuditService, OpsLoggerService],
  exports: [AuditService, OpsLoggerService],
})
export class CommonModule {}
