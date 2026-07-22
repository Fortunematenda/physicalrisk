import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, ValidateIf } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { EspoCrmService } from './espocrm.service';

class UpdateEspoConnectionDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsString()
  baseUrl?: string;
  @IsOptional() @IsString() apiKey?: string;
}

@Controller('integrations/espocrm')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrmController {
  constructor(private readonly service: EspoCrmService) {}

  @Get('status')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  status() {
    return this.service.integrationStatus();
  }

  @Get('mapping')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  mapping() {
    return this.service.getMapping();
  }

  @Patch('settings')
  @Roles('SUPER_ADMIN')
  updateSettings(@Body() body: UpdateEspoConnectionDto, @CurrentUser() user: AuthUser) {
    return this.service.updateConnectionSettings(body, user);
  }

  @Post('test')
  @Roles('SUPER_ADMIN')
  test(@CurrentUser() user: AuthUser) {
    return this.service.testConnection(user);
  }

  @Post('sync/organisation/:id')
  @Roles('SUPER_ADMIN')
  syncOrganisation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.syncOrganisation(id, user);
  }

  @Post('sync/contact/:id')
  @Roles('SUPER_ADMIN')
  syncContact(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.syncContactByLeadId(id, user);
  }

  @Post('sync/assessment/:id')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  syncAssessment(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.syncAssessment(id, user);
  }

  /** Legacy path retained for assessment workspace UI */
  @Post('sync/:assessmentId')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'SALES')
  syncLegacy(@Param('assessmentId') assessmentId: string, @CurrentUser() user: AuthUser) {
    return this.service.syncAssessment(assessmentId, user);
  }

  @Post('process')
  @Roles('SUPER_ADMIN')
  process() {
    return this.service.processPendingQueue();
  }

  @Post('retry-failed')
  @Roles('SUPER_ADMIN')
  retryFailed(@CurrentUser() user: AuthUser) {
    return this.service.retryFailed(user);
  }

  @Post('retry/:logId')
  @Roles('SUPER_ADMIN')
  retryByLog(@Param('logId') logId: string, @CurrentUser() user: AuthUser) {
    return this.service.retry(logId, user);
  }

  @Get('logs')
  @Roles('SUPER_ADMIN', 'ANALYST')
  logs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('jobType') jobType?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.listLogs({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      entityType,
      action,
      jobType,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Post('logs/:id/retry')
  @Roles('SUPER_ADMIN')
  retry(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.retry(id, user);
  }
}
