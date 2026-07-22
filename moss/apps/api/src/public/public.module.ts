import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { CrmModule } from '../crm/crm.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { AnonymousSessionService } from './anonymous-session.service';
import { ContactService } from './contact.service';

@Module({
  imports: [AuthModule, AssessmentsModule, AuditModule, EmailModule, CrmModule],
  controllers: [PublicController],
  providers: [PublicService, AnonymousSessionService, ContactService],
})
export class PublicModule {}
