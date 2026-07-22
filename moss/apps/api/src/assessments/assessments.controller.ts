import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Allow, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles';
import { RolesGuard } from '../common/roles.guard';
import { AssessmentsService } from './assessments.service';

class CreateAssessmentDto {
  @IsString() organisationId!: string;
  @IsOptional() @IsString() questionnaireCode?: string;
  @IsOptional() @IsString() title?: string;
}
class SaveInputDto {
  @Allow()
  value!: unknown;
}
class SaveResponseDto {
  @IsString() responseOptionId!: string;
  @IsOptional() @IsString() comment?: string;
}
class UpdateAssessmentDto {
  @IsString() @MinLength(2) title!: string;
}

@Controller('assessments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
  @Post() create(@Body() body: CreateAssessmentDto, @CurrentUser() user: AuthUser) { return this.service.create(body, user); }
  @Get(':id') get(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.get(id, user); }
  @Patch(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateAssessmentDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }
  @Delete(':id')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
  @Patch(':id/inputs/:code') saveInput(@Param('id') id: string, @Param('code') code: string, @Body() body: SaveInputDto, @CurrentUser() user: AuthUser) { return this.service.saveInput(id, code, body.value, user); }
  @Patch(':id/responses/:code') saveResponse(@Param('id') id: string, @Param('code') code: string, @Body() body: SaveResponseDto, @CurrentUser() user: AuthUser) { return this.service.saveResponse(id, code, body.responseOptionId, body.comment, user); }
  @Post(':id/evaluate') evaluate(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.evaluate(id, user); }
  @Post(':id/submit') submit(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.submit(id, user); }
}
