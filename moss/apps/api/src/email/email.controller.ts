import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';
import { EmailService } from './email.service';

@Controller('admin/emails')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailController {
  constructor(private readonly email: EmailService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  list() {
    return this.email.listDetailed();
  }

  @Post('process')
  @Roles('SUPER_ADMIN')
  process() {
    return this.email.processQueue(50);
  }

  @Post(':id/retry')
  @Roles('SUPER_ADMIN', 'ANALYST')
  retry(@Param('id') id: string) {
    return this.email.retry(id);
  }
}
