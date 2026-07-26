import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { ConnectorRegistryService } from './connector-registry.service';
import { CredentialEncryptionService } from './credential-encryption.service';
import { ConnectorSyncScheduler } from './connector-sync.scheduler';
import { GoogleDriveConnector } from './google-drive/google-drive.connector';
import { ManualUploadConnector } from './manual/manual-upload.connector';
import { ImportsModule } from '../imports/imports.module';

@Module({
  imports: [ImportsModule, ScheduleModule.forRoot()],
  controllers: [ConnectorsController],
  providers: [
    ConnectorsService,
    ConnectorRegistryService,
    CredentialEncryptionService,
    ConnectorSyncScheduler,
    GoogleDriveConnector,
    ManualUploadConnector,
  ],
  exports: [ConnectorsService, ConnectorRegistryService, CredentialEncryptionService],
})
export class ConnectorsModule {}
