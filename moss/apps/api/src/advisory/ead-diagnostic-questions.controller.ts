import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { EadDiagnosticQuestionsService } from './ead-diagnostic-questions.service';

class AssessmentQuestionDto {
  @IsString() moduleCode!: string;
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) questionText!: string;
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsBoolean() allowNa?: boolean;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

class UpdateAssessmentQuestionDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() questionText?: string;
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsBoolean() allowNa?: boolean;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

class ReorderDto {
  @IsArray() @IsString({ each: true }) orderedIds!: string[];
}

class TemplateQuestionDto {
  @IsString() moduleCode!: string;
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) questionText!: string;
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsBoolean() allowNa?: boolean;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

class PublishDto {
  @IsOptional() @IsString() changeNote?: string;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EadDiagnosticQuestionsController {
  constructor(private readonly service: EadDiagnosticQuestionsService) {}

  // Assessment-scoped
  @Get('advisory/:id/diagnostic-questions')
  listAssessment(
    @Param('id') id: string,
    @Query('moduleCode') moduleCode: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listAssessmentQuestions(id, moduleCode, user);
  }

  @Post('advisory/:id/diagnostic-questions')
  addAssessment(
    @Param('id') id: string,
    @Body() body: AssessmentQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addAssessmentQuestion(id, body, user);
  }

  @Patch('advisory/:id/diagnostic-questions/:questionId')
  updateAssessment(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() body: UpdateAssessmentQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateAssessmentQuestion(id, questionId, body, user);
  }

  @Post('advisory/:id/diagnostic-questions/:questionId/remove')
  removeAssessment(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeAssessmentQuestion(id, questionId, user);
  }

  @Post('advisory/:id/diagnostic-questions/:questionId/restore')
  restoreAssessment(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.restoreAssessmentQuestion(id, questionId, user);
  }

  @Post('advisory/:id/diagnostic-questions/:questionId/duplicate')
  duplicateAssessment(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.duplicateAssessmentQuestion(id, questionId, user);
  }

  @Post('advisory/:id/modules/:moduleCode/diagnostic-questions/reorder')
  reorder(
    @Param('id') id: string,
    @Param('moduleCode') moduleCode: string,
    @Body() body: ReorderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reorderAssessmentQuestions(id, moduleCode, body.orderedIds || [], user);
  }

  // Template (admin)
  @Get('admin/ead-diagnostic-template/versions')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  listVersions(@CurrentUser() user: AuthUser) {
    return this.service.listTemplateVersions(user);
  }

  @Get('admin/ead-diagnostic-template/published')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  published(@CurrentUser() user: AuthUser) {
    return this.service.getLatestPublishedTemplate(user);
  }

  @Get('admin/ead-diagnostic-template/versions/:versionId')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  getVersion(@Param('versionId') versionId: string, @CurrentUser() user: AuthUser) {
    return this.service.getTemplateVersion(versionId, user);
  }

  @Post('admin/ead-diagnostic-template/draft')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  createDraft(@Body() body: PublishDto, @CurrentUser() user: AuthUser) {
    return this.service.upsertDraftFromPublished(user, body);
  }

  @Post('admin/ead-diagnostic-template/versions/:versionId/questions')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  addTemplateQuestion(
    @Param('versionId') versionId: string,
    @Body() body: TemplateQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addTemplateQuestion(versionId, body, user);
  }

  @Patch('admin/ead-diagnostic-template/versions/:versionId/questions/:questionId')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  updateTemplateQuestion(
    @Param('versionId') versionId: string,
    @Param('questionId') questionId: string,
    @Body() body: UpdateAssessmentQuestionDto & { isActive?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateTemplateQuestion(versionId, questionId, body, user);
  }

  @Post('admin/ead-diagnostic-template/versions/:versionId/questions/:questionId/archive')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  archiveTemplateQuestion(
    @Param('versionId') versionId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.archiveTemplateQuestion(versionId, questionId, user);
  }

  @Post('admin/ead-diagnostic-template/versions/:versionId/publish')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  publish(
    @Param('versionId') versionId: string,
    @Body() body: PublishDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.publishDraftTemplate(versionId, user, body.changeNote);
  }

  @Post('admin/ead-diagnostic-template/backfill')
  @Roles('SUPER_ADMIN', 'METHODOLOGY_ADMIN', 'ADMIN')
  backfill(@CurrentUser() user: AuthUser) {
    return this.service.backfillLegacyAssessments(user.id);
  }
}
