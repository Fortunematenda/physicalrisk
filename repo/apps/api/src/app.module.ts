import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ConfigurationModule } from './configuration/configuration.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentsModule } from './documents/documents.module';
import { ImportsModule } from './imports/imports.module';
import { StorageModule } from './storage/storage.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { SsoUserSyncModule } from './users/sso-user-sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    DatabaseModule,
    SsoUserSyncModule,
    CommonModule,
    AuthModule,
    DashboardModule,
    ConfigurationModule,
    DocumentsModule,
    StorageModule,
    ImportsModule,
    UsersModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
