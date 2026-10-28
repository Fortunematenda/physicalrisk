import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthUser } from '../common/current-user.decorator';
import { TriageService } from './triage.service';

/** Limits every `submissions/:id/...` route to leads within the caller's assignments. */
@Injectable()
export class TriageLeadScopeGuard implements CanActivate {
  constructor(private readonly triage: TriageService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ params?: Record<string, string>; user?: AuthUser }>();
    const id = request.params?.id;
    if (!id || !request.user) return true;
    await this.triage.assertLeadVisible(id, request.user);
    return true;
  }
}
