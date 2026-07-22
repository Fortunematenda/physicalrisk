import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { KeycloakJwtStrategy } from './keycloak-jwt.strategy';
import { CombinedAuthGuard } from './combined-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuditModule } from '../audit/audit.module';
import { SsoUserSyncModule } from '../users/sso-user-sync.module';

@Global()
@Module({
  imports: [
    PassportModule,
    AuditModule,
    SsoUserSyncModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'development-only-secret-change-me',
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '8h') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, KeycloakJwtStrategy, CombinedAuthGuard, JwtAuthGuard],
  exports: [JwtModule, CombinedAuthGuard, JwtAuthGuard],
})
export class AuthModule {}
