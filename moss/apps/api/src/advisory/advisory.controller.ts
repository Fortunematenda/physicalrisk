import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AdvisoryRoutePriority, AssignmentRole, ProductCode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { AdvisoryService } from './advisory.service';

class CreateAdvisoryDto {
  @IsString() organisationId!: string;
  @IsEnum(ProductCode) productCode!: ProductCode;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() parentAssessmentId?: string;
}

class AssignDto {
  @IsString() userId!: string;
  @IsOptional() @IsEnum(AssignmentRole) role?: AssignmentRole;
  @IsOptional() @IsString() notes?: string;
}

class ConfirmedRouteDto {
  @IsString() productCode!: string;
  @IsOptional() @IsEnum(AdvisoryRoutePriority) priority?: AdvisoryRoutePriority;
  @IsOptional() @IsString() rationale?: string;
  @IsOptional() @IsString() sourceModuleCode?: string;
  @IsOptional() @IsString() sourceModuleName?: string;
}

class CompleteDiagnosticDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ConfirmedRouteDto)
  routes?: ConfirmedRouteDto[];
}

class CommercialProposalDto {
  @IsString() action!: string;
  @IsOptional() @IsString() commercialAdminNotes?: string;
}

class UpdateAdvisoryDto {
  @IsString() @MinLength(2) title!: string;
}

@Controller('advisory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdvisoryController {
  constructor(private readonly service: AdvisoryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('productCode') productCode?: ProductCode) {
    return this.service.list(user, productCode);
  }

  @Post()
  create(@Body() body: CreateAdvisoryDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user);
  }

  @Get('governance/manual-create')
  manualCreatePolicy(
    @CurrentUser() user: AuthUser,
    @Query('organisationId') organisationId: string,
    @Query('productCode') productCode: string,
  ) {
    return this.service.getManualCreatePolicy(organisationId, productCode, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateAdvisoryDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }

  @Get(':id/outcome')
  getOutcome(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getOutcome(id, user);
  }

  @Patch(':id/modules/:moduleCode')
  updateModule(
    @Param('id') id: string,
    @Param('moduleCode') moduleCode: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateModule(id, moduleCode, body, user);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() body: AssignDto, @CurrentUser() user: AuthUser) {
    return this.service.assign(id, body, user);
  }

  @Post(':id/generate-report')
  generateReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.generateReport(id, user);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() body: CompleteDiagnosticDto, @CurrentUser() user: AuthUser) {
    return this.service.completeDiagnostic(id, user, body);
  }

  @Post(':id/commercial-proposal')
  updateCommercialProposal(
    @Param('id') id: string,
    @Body() body: CommercialProposalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateCommercialProposal(id, body, user);
  }

  @Post(':id/routes/:routeId/create-engagement')
  createLevel3Engagement(
    @Param('id') id: string,
    @Param('routeId') routeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createLevel3Engagement(id, routeId, user);
  }
}
