import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'portal.next-auth.session-token';

async function notifySignOut(email?: string | null) {
  if (!email) return;
  const secret = process.env.AUTH_EVENT_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) return;

  const body = JSON.stringify({ event: 'SIGN_OUT', email, app: 'portal' });
  const headers = {
    'Content-Type': 'application/json',
    'X-Auth-Event-Secret': secret,
  };
  const mossApi = (process.env.MOSS_INTERNAL_API_URL || 'http://moss-api:4000').replace(/\/$/, '');
  const repoApi = (process.env.REPO_INTERNAL_API_URL || 'http://repo-api:4000').replace(/\/$/, '');

  await Promise.allSettled([
    fetch(`${mossApi}/api/auth/session-event`, { method: 'POST', headers, body }),
    fetch(`${repoApi}/api/auth/session-event`, { method: 'POST', headers, body }),
  ]);
}

/**
 * RP-initiated Keycloak logout with id_token_hint so Keycloak skips the
 * "Do you want to log out?" confirmation screen.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const portalUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'https://apps.physicalrisk.com').replace(
    /\/$/,
    '',
  );
  const useSecureCookies = portalUrl.startsWith('https://');

  // Production HTTPS sessions use Secure cookies — secureCookie:false cannot read them.
  let token = await getToken({
    req,
    secret,
    cookieName: SESSION_COOKIE,
    secureCookie: useSecureCookies,
  });
  if (!token) {
    token = await getToken({
      req,
      secret,
      cookieName: SESSION_COOKIE,
      secureCookie: !useSecureCookies,
    });
  }

  const issuer =
    process.env.KEYCLOAK_ISSUER ||
    process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER ||
    'https://auth.physicalrisk.com/realms/physicalrisk';
  const clientId = (process.env.KEYCLOAK_CLIENT_ID || 'physicalrisk-portal').trim();

  // Land on the apps home page (signed-out). Home skips auto Keycloak when ?signedOut=1.
  const params = new URLSearchParams({
    client_id: clientId,
    post_logout_redirect_uri: `${portalUrl}/?signedOut=1`,
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

  await notifySignOut(
    typeof token?.email === 'string'
      ? token.email
      : typeof (token as { email?: string } | null)?.email === 'string'
        ? (token as { email: string }).email
        : null,
  );

  // Clear NextAuth session cookies, then send the browser to Keycloak logout.
  const res = NextResponse.redirect(logoutUrl);
  const clear = (name: string) => {
    const base = { path: '/', maxAge: 0, sameSite: 'lax' as const };
    res.cookies.set(name, '', { ...base, secure: useSecureCookies });
    res.cookies.set(name, '', base);
    // Chunked session cookies (large JWTs)
    for (let i = 0; i < 5; i++) {
      res.cookies.set(`${name}.${i}`, '', { ...base, secure: useSecureCookies });
      res.cookies.set(`${name}.${i}`, '', base);
    }
    // NextAuth secure cookie prefix
    if (useSecureCookies) {
      res.cookies.set(`__Secure-${name}`, '', { ...base, secure: true });
      for (let i = 0; i < 5; i++) {
        res.cookies.set(`__Secure-${name}.${i}`, '', { ...base, secure: true });
      }
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
