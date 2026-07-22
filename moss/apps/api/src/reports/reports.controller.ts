import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { ReportType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ReportsService } from './reports.service';

class IssueReportDto { @IsEmail() email!: string; }
class GenerateDto {
  @IsOptional() @IsEnum(ReportType) reportType?: ReportType;
}

@Controller('reports')
@UseGuards(JwtAuthGuard)
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

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }
}
