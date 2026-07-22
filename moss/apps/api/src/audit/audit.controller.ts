import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { AuditService } from './audit.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'AUDITOR')
  list(@Query('take') take?: string) {
    const limit = Math.min(Number(take) || 500, 1000);
    return this.audit.listDetailed(limit);
  }
}
