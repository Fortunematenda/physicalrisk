import type { AuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import { cacheAccessToken, getCachedAccessToken } from './token-cache';

/**
 * Public browser/server issuer — must match Keycloak OIDC discovery.
 * Server-side token exchange uses the same host via Docker network aliases
 * (auth.physicalrisk.com → nginx), so do NOT use keycloak:8080 here.
 */
const keycloakIssuer =
  process.env.KEYCLOAK_ISSUER || 'https://auth.physicalrisk.com/realms/physicalrisk';
const publicAuthUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'https://moss.physicalrisk.com';
const secureCookies = publicAuthUrl.startsWith('https://');
const clientId = process.env.KEYCLOAK_CLIENT_ID || '';
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || '';

export const SSO_CONFIGURED = Boolean(clientId && clientSecret);

function assertSsoConfig() {
  if (!SSO_CONFIGURED) return;
  const missing: string[] = [];
  if (!process.env.NEXTAUTH_URL && !process.env.AUTH_URL) missing.push('NEXTAUTH_URL');
  if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) missing.push('NEXTAUTH_SECRET');
  if (!process.env.KEYCLOAK_ISSUER) missing.push('KEYCLOAK_ISSUER');
  if (keycloakIssuer.includes('keycloak:8080')) {
    throw new Error(
      'KEYCLOAK_ISSUER must be the public HTTPS issuer, not keycloak:8080',
    );
  }
  if (missing.length) {
    console.warn(`[moss-sso] Missing env: ${missing.join(', ')}`);
  }
}

assertSsoConfig();

function persistAccessInCache(token: JWT, accessToken?: string) {
  const sub = typeof token.sub === 'string' ? token.sub : null;
  const refresh = typeof token.refreshToken === 'string' ? token.refreshToken : '';
  const expiresAt =
    typeof token.expiresAt === 'number' ? token.expiresAt : Math.floor(Date.now() / 1000) + 300;
  if (sub && accessToken && refresh) {
    cacheAccessToken(sub, accessToken, refresh, expiresAt);
  }
}

/** Cookie stays small: refresh + roles only. Access token lives in memory cache. */
function cookieSafeToken(token: JWT): JWT {
  const copy = { ...token };
  delete (copy as { accessToken?: unknown }).accessToken;
  delete (copy as { idToken?: unknown }).idToken;
  return copy;
}

export const authOptions: AuthOptions = {
  providers: SSO_CONFIGURED
    ? [
        {
          id: 'keycloak',
          name: 'Physical Risk SSO',
          type: 'oauth',
          clientId,
          clientSecret,
          authorization: {
            url: `${keycloakIssuer}/protocol/openid-connect/auth`,
            params: {
              scope: 'openid email profile roles',
              code_challenge_method: 'S256',
            },
          },
          token: `${keycloakIssuer}/protocol/openid-connect/token`,
          userinfo: `${keycloakIssuer}/protocol/openid-connect/userinfo`,
          jwks_endpoint: `${keycloakIssuer}/protocol/openid-connect/certs`,
          issuer: keycloakIssuer,
          idToken: true,
          checks: ['pkce', 'state', 'nonce'],
          profile(profile) {
            return {
              id: profile.sub,
              name:
                profile.name ??
                `${profile.given_name ?? ''} ${profile.family_name ?? ''}`.trim(),
              email: profile.email,
              image: profile.picture ?? null,
            };
          },
        },
      ]
    : [],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.refreshToken = account.refresh_token;
        token.expiresAt =
          account.expires_at ?? Math.floor(Date.now() / 1000) + Number(account.expires_in || 300);
        delete (token as { idToken?: unknown }).idToken;

        let realmRoles =
          (profile as { realm_roles?: string[]; realm_access?: { roles?: string[] } })?.realm_roles ??
          (profile as { realm_access?: { roles?: string[] } })?.realm_access?.roles ??
          [];
        if ((!realmRoles || realmRoles.length === 0) && account.access_token) {
          try {
            const payload = JSON.parse(
              Buffer.from(account.access_token.split('.')[1], 'base64url').toString('utf8'),
            );
            realmRoles = payload.realm_roles ?? payload.realm_access?.roles ?? [];
          } catch {
            // ignore
          }
        }
        token.realmRoles = realmRoles;
        persistAccessInCache(token, account.access_token);
      }

      const cached = getCachedAccessToken(token.sub);
      const expiresAt = (token.expiresAt as number | undefined) ?? cached?.expiresAt;
      const needsRefresh =
        Boolean(token.refreshToken) &&
        (!cached?.accessToken ||
          (typeof expiresAt === 'number' && Date.now() / 1000 > expiresAt - 60));

      if (needsRefresh) {
        const refreshed = await refreshAccessToken(token);
        if (typeof refreshed.accessToken === 'string') {
          persistAccessInCache(refreshed, refreshed.accessToken);
        }
        return cookieSafeToken(refreshed);
      }

      return cookieSafeToken(token);
    },
    async session({ session, token }) {
      let access = getCachedAccessToken(token.sub)?.accessToken;
      if (!access && token.refreshToken) {
        const refreshed = await refreshAccessToken(token);
        if (typeof refreshed.accessToken === 'string') {
          persistAccessInCache(refreshed, refreshed.accessToken);
          access = refreshed.accessToken;
        }
        if (refreshed.error) (session as { error?: string }).error = refreshed.error as string;
      }
      (session as { accessToken?: string }).accessToken = access;
      (session as { realmRoles?: string[] }).realmRoles =
        (token.realmRoles as string[] | undefined) ?? [];
      if (token.error) (session as { error?: string }).error = token.error as string;
      return session;
    },
  },
  events: {},
  pages: {
    signIn: '/login',
    error: '/login',
  },
  cookies: {
    sessionToken: {
      name: 'moss.next-auth.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies },
    },
    callbackUrl: {
      name: 'moss.next-auth.callback-url',
      options: { sameSite: 'lax', path: '/', secure: secureCookies },
    },
    csrfToken: {
      name: 'moss.next-auth.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies },
    },
    pkceCodeVerifier: {
      name: 'moss.next-auth.pkce.code_verifier',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies, maxAge: 900 },
    },
    state: {
      name: 'moss.next-auth.state',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies, maxAge: 900 },
    },
    nonce: {
      name: 'moss.next-auth.nonce',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies, maxAge: 900 },
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 28800,
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'moss-dev-secret',
  debug: process.env.SSO_DEBUG === 'true' || process.env.NEXTAUTH_DEBUG === 'true',
  logger: {
    error(code, metadata) {
      const correlationId = `moss-${Date.now().toString(36)}`;
      console.error(`[moss-sso][${correlationId}]`, code, metadata);
    },
  },
};

export async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(`${keycloakIssuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description ?? 'Token refresh failed');
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      error: undefined,
    };
  } catch {
    return {
      ...token,
      accessToken: undefined,
      error: 'RefreshTokenError',
    };
  }
}
