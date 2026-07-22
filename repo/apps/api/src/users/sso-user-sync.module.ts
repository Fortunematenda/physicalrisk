import { Global, Module } from '@nestjs/common';
import { SsoUserSyncService } from './sso-user-sync.service';

@Global()
@Module({
  providers: [SsoUserSyncService],
  exports: [SsoUserSyncService],
})
export class SsoUserSyncModule {}
