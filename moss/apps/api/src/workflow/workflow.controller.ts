import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AssessmentStatus, FindingSeverity } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { WorkflowService } from './workflow.service';

class TransitionDto {
  @IsEnum(AssessmentStatus) status!: AssessmentStatus;
  @IsOptional() @IsString() reason?: string;
}

class ReviewNoteDto {
  @IsString() note!: string;
}

class ReturnDto {
  @IsString() @MinLength(3) comment!: string;
}

class RecommendationUpdateDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsEnum(FindingSeverity) priority?: FindingSeverity;
  @IsOptional() @IsBoolean() includeInReport?: boolean;
  @IsOptional() @IsString() suggestedNextStep?: string;
  @IsOptional() @IsString() serviceOffering?: string;
}

class RecommendationCreateDto {
  @IsString() title!: string;
  @IsString() summary!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(FindingSeverity) priority?: FindingSeverity;
  @IsOptional() @IsString() serviceOffering?: string;
  @IsOptional() @IsString() suggestedNextStep?: string;
}

class UnlockDto {
  @IsString() @MinLength(5) reason!: string;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('analyst/queue')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  queue(@CurrentUser() user: AuthUser) {
    return this.workflow.myAssignments(user);
  }

  /** @deprecated Prefer /analyst/queue for Lean MVP */
  @Get('analyst/assignments')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  myAssignments(@CurrentUser() user: AuthUser) {
    return this.workflow.myAssignments(user);
  }

  @Post('assessments/:id/transition')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  transition(@Param('id') id: string, @Body() body: TransitionDto, @CurrentUser() user: AuthUser) {
    return this.workflow.transition(id, body.status, user, body.reason);
  }

  @Patch('assessments/:id/review-note')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  reviewNote(@Param('id') id: string, @Body() body: ReviewNoteDto, @CurrentUser() user: AuthUser) {
    return this.workflow.saveReviewNote(id, body.note, user);
  }

  @Post('assessments/:id/mark-reviewed')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  markReviewed(@Param('id') id: string, @Body() body: ReviewNoteDto, @CurrentUser() user: AuthUser) {
    return this.workflow.markReviewed(id, user, body.note);
  }

  @Post('assessments/:id/return-to-client')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  returnToClient(@Param('id') id: string, @Body() body: ReturnDto, @CurrentUser() user: AuthUser) {
    return this.workflow.returnToClient(id, body.comment, user);
  }

  @Get('assessments/:id/approval-check')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  approvalCheck(@Param('id') id: string) {
    return this.workflow.validateForApproval(id);
  }

  @Post('assessments/:id/approve')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.approve(id, user);
  }

  /** Alias kept for older clients */
  @Post('assessments/:id/approve-pilot')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  approvePilot(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workflow.approve(id, user);
  }

  @Patch('recommendations/:id')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  updateRecommendation(@Param('id') id: string, @Body() body: RecommendationUpdateDto, @CurrentUser() user: AuthUser) {
    return this.workflow.updateRecommendation(id, body, user);
  }

  @Post('assessments/:id/recommendations')
  @Roles('SUPER_ADMIN', 'ANALYST', 'REVIEWER')
  addRecommendation(@Param('id') id: string, @Body() body: RecommendationCreateDto, @CurrentUser() user: AuthUser) {
    return this.workflow.addRecommendation(id, body, user);
  }

  @Post('assessments/:id/unlock')
  @Roles('SUPER_ADMIN')
  unlock(@Param('id') id: string, @Body() body: UnlockDto, @CurrentUser() user: AuthUser) {
    return this.workflow.unlock(id, body.reason, user);
  }
}
