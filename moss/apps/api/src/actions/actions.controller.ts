import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ActionItemStatus, FindingSeverity, ProductCode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ActionsService } from './actions.service';

class UpdateActionDto {
  @IsOptional() @IsEnum(ActionItemStatus) status?: ActionItemStatus;
  @IsOptional() @IsNumber() progressPercent?: number;
  @IsOptional() @IsString() comments?: string;
  @IsOptional() @IsNumber() actualBenefit?: number;
  @IsOptional() @IsString() completionEvidence?: string;
  @IsOptional() @IsString() ownerName?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsEnum(FindingSeverity) priority?: FindingSeverity;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
}

class CreateActionDto {
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(FindingSeverity) priority?: FindingSeverity;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() findingId?: string;
  @IsOptional() @IsString() recommendationId?: string;
  @IsOptional() @IsString() ownerName?: string;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  /** Cost Leakage action board — SCLI only. */
  @Get('actions/dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.actions.dashboard(user, ProductCode.SCLI_COST_LEAKAGE);
  }

  @Post('assessments/:id/actions')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'METHODOLOGY_ADMIN')
  create(@Param('id') id: string, @Body() body: CreateActionDto, @CurrentUser() user: AuthUser) {
    return this.actions.create(id, body, user, ProductCode.SCLI_COST_LEAKAGE);
  }

  /** MOSS action board — MOSS only. */
  @Get('moss/actions/dashboard')
  mossDashboard(@CurrentUser() user: AuthUser) {
    return this.actions.dashboard(user, ProductCode.MOSS);
  }

  @Get('moss/assessments/:id/actions')
  listMoss(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.actions.listForAssessment(id, user, ProductCode.MOSS);
  }

  @Post('moss/assessments/:id/actions')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER', 'METHODOLOGY_ADMIN')
  createMoss(
    @Param('id') id: string,
    @Body() body: CreateActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.actions.create(id, body, user, ProductCode.MOSS);
  }

  @Patch('actions/:id')
  update(@Param('id') id: string, @Body() body: UpdateActionDto, @CurrentUser() user: AuthUser) {
    return this.actions.update(id, body, user);
  }
}
