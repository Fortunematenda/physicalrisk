import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthSessionService } from '../auth/auth-session.service';
import { SsoUserSyncService } from './sso-user-sync.service';

@Global()
@Module({
  imports: [AuditModule],
  providers: [SsoUserSyncService, AuthSessionService],
  exports: [SsoUserSyncService, AuthSessionService],
})
export class SsoUserSyncModule {}
