import { Global, Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { VpsStorageService } from './vps-storage.service';

@Global()
@Module({ controllers: [StorageController], providers: [VpsStorageService], exports: [VpsStorageService] })
export class StorageModule {}
