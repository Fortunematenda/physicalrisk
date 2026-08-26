import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { TriageService } from './triage.service';

class UpdateTriageDto {
  @IsOptional() @IsIn(['REVIEWED', 'CONTACTED', 'CLOSED']) status?: string;
  @IsOptional() @IsString() @MaxLength(4000) adminNotes?: string;
  @IsOptional() @IsString() @MaxLength(4000) proposalAdminNotes?: string;
  @IsOptional() @IsString() assignedAnalystId?: string | null;
}

class ProposalActionDto {
  @IsIn(['PREPARE', 'SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRE']) action!: string;
  @IsOptional() @IsString() @MaxLength(4000) proposalAdminNotes?: string;
}

@Controller('triage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ANALYST', 'REVIEWER', 'SALES', 'AUDITOR')
export class TriageController {
  constructor(private readonly service: TriageService) {}

  @Get('submissions')
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('intent') intent?: string,
  ) {
    return this.service.list(user, { q, status, intent });
  }

  @Get('submissions/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user);
  }

  @Patch('submissions/:id')
  update(@Param('id') id: string, @Body() body: UpdateTriageDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Post('submissions/:id/proposal')
  proposal(
    @Param('id') id: string,
    @Body() body: ProposalActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateProposal(id, body, user);
  }

  @Post('submissions/:id/convert')
  convert(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.convert(id, user);
  }
}
