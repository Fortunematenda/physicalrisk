import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'portal.next-auth.session-token';

/**
 * RP-initiated Keycloak logout with id_token_hint so Keycloak skips the
 * "Do you want to log out?" confirmation screen.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({
    req,
    secret,
    cookieName: SESSION_COOKIE,
    secureCookie: false,
  });

  const issuer =
    process.env.KEYCLOAK_ISSUER ||
    process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ||
    'https://auth.physicalrisk.com/realms/physicalrisk';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'physicalrisk-portal';
  const portalUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'https://apps.physicalrisk.com').replace(
    /\/$/,
    '',
  );

  const params = new URLSearchParams({
    client_id: clientId,
    post_logout_redirect_uri: `${portalUrl}/auth/signin?signedOut=1`,
  });

  const idToken =
    typeof token?.idToken === 'string'
      ? token.idToken
      : typeof (token as { id_token?: string } | null)?.id_token === 'string'
        ? (token as { id_token: string }).id_token
        : null;

  if (idToken) {
    params.set('id_token_hint', idToken);
  }

  const logoutUrl = `${issuer}/protocol/openid-connect/logout?${params}`;

  // Clear NextAuth session cookies, then send the browser to Keycloak logout.
  const res = NextResponse.redirect(logoutUrl);
  const clear = (name: string) => {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
    // Chunked session cookies (large JWTs)
    for (let i = 0; i < 5; i++) {
      res.cookies.set(`${name}.${i}`, '', { path: '/', maxAge: 0 });
    }
  };
  clear(SESSION_COOKIE);
  clear('portal.next-auth.callback-url');
  clear('portal.next-auth.csrf-token');
  clear('portal.next-auth.pkce.code_verifier');
  clear('portal.next-auth.state');
  clear('portal.next-auth.nonce');
  clear('next-auth.session-token');
  clear('next-auth.callback-url');
  clear('next-auth.csrf-token');
  clear('next-auth.pkce.code_verifier');
  clear('next-auth.state');
  clear('next-auth.nonce');

  return res;
}
