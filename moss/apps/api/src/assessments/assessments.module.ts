import { Module, forwardRef } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [forwardRef(() => CrmModule)],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
