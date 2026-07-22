import { Module, forwardRef } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { ActionsController } from './actions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AssessmentsModule } from '../assessments/assessments.module';

@Module({
  imports: [PrismaModule, AuditModule, forwardRef(() => AssessmentsModule)],
  providers: [ActionsService],
  controllers: [ActionsController],
  exports: [ActionsService],
})
export class ActionsModule {}
