import type { AuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

/**
 * Public browser/server issuer — must match Keycloak OIDC discovery.
 * Server-side token exchange uses the same host via Docker network aliases
 * (auth.physicalrisk.com → nginx), so do NOT use keycloak:8080 here.
 */
const keycloakIssuer =
  process.env.KEYCLOAK_ISSUER || 'https://auth.physicalrisk.com/realms/physicalrisk';
const publicAuthUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'https://apps.physicalrisk.com';
const secureCookies = publicAuthUrl.startsWith('https://');
const clientId = process.env.KEYCLOAK_CLIENT_ID || '';
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || '';

function assertSsoConfig() {
  const missing: string[] = [];
  if (!clientId) missing.push('KEYCLOAK_CLIENT_ID');
  if (!clientSecret) missing.push('KEYCLOAK_CLIENT_SECRET');
  if (!process.env.NEXTAUTH_URL && !process.env.AUTH_URL) missing.push('NEXTAUTH_URL');
  if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) missing.push('NEXTAUTH_SECRET');
  if (!process.env.KEYCLOAK_ISSUER) missing.push('KEYCLOAK_ISSUER');
  if (keycloakIssuer.includes('keycloak:8080')) {
    throw new Error(
      'KEYCLOAK_ISSUER must be the public HTTPS issuer, not keycloak:8080',
    );
  }
  if (missing.length) {
    console.warn(`[portal-sso] Missing env: ${missing.join(', ')}`);
  }
}

assertSsoConfig();

export const authOptions: AuthOptions = {
  providers: [
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
      // Must be true: Keycloak returns id_token with openid scope; idToken:false
      // causes "id_token detected… use client.callback()" OAuthCallback errors.
      idToken: true,
      checks: ['pkce', 'state', 'nonce'],
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name ?? `${profile.given_name ?? ''} ${profile.family_name ?? ''}`.trim(),
          email: profile.email,
          image: profile.picture ?? null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        // Needed for Keycloak RP logout without the confirmation screen.
        token.idToken = account.id_token;
        token.expiresAt = account.expires_at;
        token.realmRoles = (profile as any)?.realm_roles ?? [];
      }
      if (token.expiresAt && Date.now() / 1000 > (token.expiresAt as number) - 60) {
        return refreshAccessToken(token);
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      (session as any).realmRoles = token.realmRoles ?? [];
      (session as any).error = token.error;
      return session;
    },
  },
  events: {},
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  cookies: {
    sessionToken: {
      name: 'portal.next-auth.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies },
    },
    callbackUrl: {
      name: 'portal.next-auth.callback-url',
      options: { sameSite: 'lax', path: '/', secure: secureCookies },
    },
    csrfToken: {
      name: 'portal.next-auth.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies },
    },
    pkceCodeVerifier: {
      name: 'portal.next-auth.pkce.code_verifier',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies, maxAge: 900 },
    },
    state: {
      name: 'portal.next-auth.state',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies, maxAge: 900 },
    },
    nonce: {
      name: 'portal.next-auth.nonce',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: secureCookies, maxAge: 900 },
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 28800,
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  debug: process.env.SSO_DEBUG === 'true' || process.env.NEXTAUTH_DEBUG === 'true',
  logger: {
    error(code, metadata) {
      const correlationId = `portal-${Date.now().toString(36)}`;
      console.error(`[portal-sso][${correlationId}]`, code, metadata);
    },
  },
};

async function refreshAccessToken(token: JWT): Promise<JWT> {
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
      // Keep prior idToken for silent Keycloak logout (refresh usually has no id_token).
      idToken: data.id_token ?? token.idToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch {
    return { ...token, error: 'RefreshTokenError' };
  }
}
