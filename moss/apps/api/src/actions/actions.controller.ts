import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ActionItemStatus, FindingSeverity } from '@prisma/client';
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

  @Get('actions/dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.actions.dashboard(user);
  }

  @Post('assessments/:id/actions')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  create(@Param('id') id: string, @Body() body: CreateActionDto, @CurrentUser() user: AuthUser) {
    return this.actions.create(id, body, user);
  }

  @Patch('actions/:id')
  update(@Param('id') id: string, @Body() body: UpdateActionDto, @CurrentUser() user: AuthUser) {
    return this.actions.update(id, body, user);
  }
}
