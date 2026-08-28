import { Global, Module } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { SsoUserSyncService } from './sso-user-sync.service';

@Global()
@Module({
  providers: [SsoUserSyncService, AuthSessionService],
  exports: [SsoUserSyncService, AuthSessionService],
})
export class SsoUserSyncModule {}
