import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ReportType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';
import { ReportsService } from './reports.service';

class IssueReportDto { @IsEmail() email!: string; }
class GenerateDto {
  @IsOptional() @IsEnum(ReportType) reportType?: ReportType;
}
class UpdateReportDto {
  @IsString() @MinLength(2) title!: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  listAll(@CurrentUser() user: AuthUser) {
    return this.service.listAll(user);
  }

  @Post('assessment/:assessmentId/generate')
  generate(
    @Param('assessmentId') assessmentId: string,
    @Body() body: GenerateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.generate(assessmentId, user, { reportType: body?.reportType });
  }

  @Get('assessment/:assessmentId')
  list(@Param('assessmentId') assessmentId: string, @CurrentUser() user: AuthUser) {
    return this.service.listForAssessment(assessmentId, user);
  }

  @Post(':id/issue')
  issue(@Param('id') id: string, @Body() body: IssueReportDto, @CurrentUser() user: AuthUser) {
    return this.service.issue(id, body.email, user);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateReportDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }
}
