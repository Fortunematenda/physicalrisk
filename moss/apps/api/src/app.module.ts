import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { EvidenceModule } from './evidence/evidence.module';
import { ReportsModule } from './reports/reports.module';
import { CrmModule } from './crm/crm.module';
import { HealthModule } from './health/health.module';
import { PublicModule } from './public/public.module';
import { EmailModule } from './email/email.module';
import { WorkflowModule } from './workflow/workflow.module';
import { UsersModule } from './users/users.module';
import { SsoUserSyncModule } from './users/sso-user-sync.module';
import { ActionsModule } from './actions/actions.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SsoUserSyncModule,
    AuditModule,
    AuthModule,
    OrganisationsModule,
    QuestionnairesModule,
    AssessmentsModule,
    EvidenceModule,
    ReportsModule,
    CrmModule,
    HealthModule,
    PublicModule,
    EmailModule,
    WorkflowModule,
    UsersModule,
    ActionsModule,
    SettingsModule,
  ],
})
export class AppModule {}
