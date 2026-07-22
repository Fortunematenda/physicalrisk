import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { SsoUserSyncService } from '../users/sso-user-sync.service';

/**
 * Auth guard — Keycloak access tokens when SSO is enabled, else local JWTs.
 * On SSO success, the local User row is upserted and request.user.id is the local DB id.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwksCache: { pem: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly ssoUsers: SsoUserSyncService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const keycloakEnabled = this.config.get<string>('KEYCLOAK_ENABLED') === 'true';
    if (keycloakEnabled) {
      try {
        const payload = await this.verifyKeycloakToken(token);
        const realmRoles: string[] =
          payload.realm_roles ?? payload.realm_access?.roles ?? [];
        const role = mapKeycloakRoleToMoss(realmRoles);
        const firstName =
          (typeof payload.given_name === 'string' && payload.given_name.trim()) ||
          (typeof payload.name === 'string' ? payload.name.trim().split(/\s+/)[0] : '') ||
          undefined;
        const lastName =
          (typeof payload.family_name === 'string' && payload.family_name.trim()) ||
          (typeof payload.name === 'string'
            ? payload.name.trim().split(/\s+/).slice(1).join(' ')
            : '') ||
          undefined;
        const local = await this.ssoUsers.sync({
          email: payload.email,
          firstName,
          lastName,
          role,
        });
        request.user = {
          id: local?.id ?? payload.sub,
          email: local?.email ?? payload.email,
          role,
          keycloakSub: payload.sub,
          firstName,
          lastName,
          realmRoles,
        };
        return true;
      } catch (err) {
        this.logger.debug(
          `Keycloak token validation failed, trying local JWT: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET') || 'development-only-secret-change-me',
      });
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
  }

  private async verifyKeycloakToken(token: string): Promise<any> {
    const jwksUrl = this.config.get<string>('KEYCLOAK_JWKS_URL');
    const issuer = this.config.get<string>('KEYCLOAK_ISSUER');
    if (!jwksUrl) throw new Error('KEYCLOAK_JWKS_URL not configured');

    const pem = await this.fetchJwksPem(jwksUrl);
    const decoded = this.jwt.decode(token, { complete: true }) as {
      header: { alg?: string; kid?: string };
      payload: any;
    } | null;
    if (!decoded?.payload) throw new Error('Cannot decode token');

    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error('Malformed token');
    }

    const signature = Buffer.from(padBase64(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), 'base64');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    if (!verifier.verify(pem, signature)) {
      throw new Error('Invalid token signature');
    }

    const payload = decoded.payload;
    if (issuer && payload.iss !== issuer) {
      throw new Error(`Issuer mismatch: ${payload.iss} !== ${issuer}`);
    }
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    return payload;
  }

  private async fetchJwksPem(jwksUrl: string): Promise<string> {
    if (this.jwksCache && Date.now() < this.jwksCache.expiresAt) {
      return this.jwksCache.pem;
    }

    const jwks = await httpGetJson(jwksUrl);
    const key = jwks.keys?.find((k: any) => k.use === 'sig' && k.kty === 'RSA');
    if (!key) throw new Error('No suitable signing key found in JWKS');

    const pem = jwkToPem(key);
    this.jwksCache = { pem, expiresAt: Date.now() + 300_000 };
    return pem;
  }
}

function mapKeycloakRoleToMoss(realmRoles: string[]): string {
  if (realmRoles.includes('moss_admin')) return 'SUPER_ADMIN';
  if (realmRoles.includes('moss_reviewer')) return 'REVIEWER';
  if (realmRoles.includes('moss_analyst')) return 'ANALYST';
  if (realmRoles.includes('moss_client')) return 'CLIENT_EXECUTIVE';
  return 'CLIENT_CONTRIBUTOR';
}

function jwkToPem(jwk: any): string {
  if (jwk.x5c?.[0]) {
    const body = String(jwk.x5c[0]).match(/.{1,64}/g)?.join('\n') ?? jwk.x5c[0];
    return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
  }
  return crypto
    .createPublicKey({ key: jwk, format: 'jwk' })
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

function padBase64(value: string): string {
  const mod = value.length % 4;
  if (mod === 0) return value;
  return value + '='.repeat(4 - mod);
}

function httpGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const fetcher = url.startsWith('https') ? https : http;
    fetcher
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}
