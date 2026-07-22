import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { SsoUserSyncService } from '../users/sso-user-sync.service';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwksCache: { keys: any[]; expiresAt: number } | null = null;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly ssoUsers: SsoUserSyncService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || this.config.get<string>('AUTH_DISABLED') === 'true') return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Bearer token required');

    const keycloakEnabled = this.config.get<string>('KEYCLOAK_ENABLED') === 'true';

    if (keycloakEnabled) {
      try {
        const payload = await this.verifyKeycloakToken(token);
        const realmRoles: string[] = payload.realm_roles ?? payload.realm_access?.roles ?? [];
        const repoRole = this.mapKeycloakRoleToRepo(realmRoles);
        const name =
          (typeof payload.name === 'string' && payload.name.trim()) ||
          [payload.given_name, payload.family_name].filter(Boolean).join(' ').trim() ||
          (typeof payload.preferred_username === 'string' && payload.preferred_username.trim()) ||
          undefined;
        const local = await this.ssoUsers.sync({
          email: payload.email,
          name,
          role: repoRole,
        });
        request.user = {
          id: local?.id ?? payload.sub,
          email: local?.email ?? payload.email,
          name: local?.name ?? name,
          role: local?.role ?? repoRole,
          keycloakSub: payload.sub,
        };
        return true;
      } catch (kcErr) {
        // Fall through to local JWT verification
        this.logger.debug(`Keycloak token validation failed, trying local JWT: ${kcErr}`);
      }
    }

    // Local JWT fallback
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET') ?? 'replace-this-secret',
      });
      request.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async verifyKeycloakToken(token: string): Promise<any> {
    const jwksUrl = this.config.get<string>('KEYCLOAK_JWKS_URL');
    const issuer = this.config.get<string>('KEYCLOAK_ISSUER');
    if (!jwksUrl) throw new Error('KEYCLOAK_JWKS_URL not configured');

    const keys = await this.fetchJwks(jwksUrl);
    const signingKey = keys.find((k: any) => k.use === 'sig' && k.kty === 'RSA');
    if (!signingKey) throw new Error('No RSA signing key in JWKS');

    const pem = this.jwkToPem(signingKey);
    const decoded = this.jwt.decode(token, { complete: true }) as any;
    if (!decoded) throw new Error('Cannot decode token');

    // Verify signature using crypto
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const signatureBuffer = Buffer.from(padBase64(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), 'base64');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    if (!verifier.verify(pem, signatureBuffer)) {
      throw new Error('Invalid token signature');
    }

    const payload = decoded.payload;
    // Validate issuer and expiry
    if (issuer && payload.iss !== issuer) throw new Error(`Issuer mismatch: ${payload.iss}`);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');

    return payload;
  }

  private async fetchJwks(url: string): Promise<any[]> {
    if (this.jwksCache && Date.now() < this.jwksCache.expiresAt) {
      return this.jwksCache.keys;
    }
    return new Promise((resolve, reject) => {
      const fetcher = url.startsWith('https') ? https : http;
      fetcher.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const jwks = JSON.parse(data);
            this.jwksCache = { keys: jwks.keys, expiresAt: Date.now() + 300_000 };
            resolve(jwks.keys);
          } catch (e) { reject(e); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private mapKeycloakRoleToRepo(realmRoles: string[]): string {
    if (realmRoles.includes('repo_admin')) return 'ADMIN';
    if (realmRoles.includes('repo_importer')) return 'IMPORTER';
    if (realmRoles.includes('repo_reviewer')) return 'REVIEWER';
    return 'VIEWER';
  }

  private jwkToPem(jwk: any): string {
    if (jwk.x5c?.[0]) {
      const body = String(jwk.x5c[0]).match(/.{1,64}/g)?.join('\n') ?? jwk.x5c[0];
      return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
    }
    const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    return keyObject.export({ type: 'spki', format: 'pem' }).toString();
  }
}

function padBase64(value: string): string {
  const mod = value.length % 4;
  if (mod === 0) return value;
  return value + '='.repeat(4 - mod);
}
