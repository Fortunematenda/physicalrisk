import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

/**
 * Combined auth guard that tries Keycloak JWT first, then falls back to local JWT.
 * This allows the app to work both in SSO mode and standalone mode.
 */
@Injectable()
export class CombinedAuthGuard extends AuthGuard(['keycloak-jwt', 'jwt']) {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const keycloakEnabled = this.config.get<string>('KEYCLOAK_ENABLED') === 'true';
    if (!keycloakEnabled) {
      // Fall back to local JWT only
      return new (AuthGuard('jwt') as any)().canActivate(context);
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
