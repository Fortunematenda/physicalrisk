import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertAssessmentInScope, isAssignmentScoped } from './assignment-scope';
import type { AuthUser } from './current-user.decorator';

type ScopedRequest = {
  params?: Record<string, string>;
  route?: { path?: string };
  user?: AuthUser;
};

/**
 * Limits `assessments/:id/...`, `:assessmentId` and `recommendations/:id` routes
 * to engagements within the caller's assignments.
 */
@Injectable()
export class AssessmentScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const user = request.user;
    if (!user || !isAssignmentScoped(user)) return true;

    const params = request.params || {};
    const path = request.route?.path || '';

    if (params.assessmentId) {
      await assertAssessmentInScope(this.prisma, user, params.assessmentId);
    } else if (params.id && /assessments\/:id(\/|$)/.test(path)) {
      await assertAssessmentInScope(this.prisma, user, params.id);
    } else if (params.id && /recommendations\/:id(\/|$)/.test(path)) {
      const recommendation = await this.prisma.recommendation.findUnique({
        where: { id: params.id },
        select: { assessmentId: true },
      });
      if (!recommendation) throw new NotFoundException('Recommendation not found.');
      await assertAssessmentInScope(this.prisma, user, recommendation.assessmentId);
    }
    return true;
  }
}
