import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

/**
 * Keycloak JWT Strategy — validates access tokens issued by Keycloak.
 */
@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, 'keycloak-jwt') {
  private readonly logger = new Logger(KeycloakJwtStrategy.name);

  constructor(config: ConfigService) {
    const jwksUrl = config.get<string>('KEYCLOAK_JWKS_URL');
    const issuer = config.get<string>('KEYCLOAK_ISSUER');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (_request: any, _rawJwtToken: string, done: Function) => {
        if (!jwksUrl) {
          return done(new Error('KEYCLOAK_JWKS_URL not configured'), null);
        }
        fetchJwksPem(jwksUrl)
          .then((pem) => done(null, pem))
          .catch((err) => done(err, null));
      },
      issuer,
      algorithms: ['RS256'],
    });
  }

  validate(payload: any) {
    const realmRoles: string[] = payload.realm_roles ?? payload.realm_access?.roles ?? [];
    const mossRole = mapKeycloakRoleToMoss(realmRoles);

    return {
      id: payload.sub,
      email: payload.email,
      role: mossRole,
      keycloakSub: payload.sub,
      firstName: payload.given_name,
      lastName: payload.family_name,
      realmRoles,
    };
  }
}

function mapKeycloakRoleToMoss(realmRoles: string[]): string {
  if (realmRoles.includes('moss_admin')) return 'SUPER_ADMIN';
  if (realmRoles.includes('moss_reviewer')) return 'REVIEWER';
  if (realmRoles.includes('moss_analyst')) return 'ANALYST';
  if (realmRoles.includes('moss_client')) return 'CLIENT_EXECUTIVE';
  return 'CLIENT_CONTRIBUTOR';
}

let jwksCache: { pem: string; expiresAt: number } | null = null;

async function fetchJwksPem(jwksUrl: string): Promise<string> {
  if (jwksCache && Date.now() < jwksCache.expiresAt) {
    return jwksCache.pem;
  }

  const jwks = await httpGetJson(jwksUrl);
  const key = jwks.keys?.find((k: any) => k.use === 'sig' && k.kty === 'RSA');
  if (!key) throw new Error('No suitable signing key found in JWKS');

  const pem = jwkToPem(key);
  jwksCache = { pem, expiresAt: Date.now() + 300_000 };
  return pem;
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

/** Prefer x5c certificate; fall back to a correctly DER-encoded RSA public key. */
function jwkToPem(jwk: any): string {
  if (jwk.x5c?.[0]) {
    const body = String(jwk.x5c[0]).match(/.{1,64}/g)?.join('\n') ?? jwk.x5c[0];
    return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
  }

  const keyObject = crypto.createPublicKey({
    key: jwk,
    format: 'jwk',
  });
  return keyObject.export({ type: 'spki', format: 'pem' }).toString();
}
