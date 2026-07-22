import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Non-secret diagnostics for SSO session / cookie wiring. */
export async function GET(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const cookieHeader = req.headers.get('cookie') || '';
  const repoCookies = cookieHeader
    .split(';')
    .map((c) => c.trim().split('=')[0])
    .filter((n) => n.startsWith('repo.next-auth'));

  const token = await getToken({
    req,
    secret,
    cookieName: 'repo.next-auth.session-token',
    secureCookie: false,
  });

  const { getCachedAccessToken } = await import('@/lib/token-cache');
  const cached = getCachedAccessToken(token?.sub);

  return NextResponse.json({
    hasSecret: Boolean(secret),
    repoCookieNames: repoCookies,
    hasJwt: Boolean(token),
    hasAccessToken: Boolean(cached?.accessToken),
    hasRefreshToken: typeof token?.refreshToken === 'string' && Boolean(token.refreshToken),
    accessTokenLength: cached?.accessToken?.length ?? 0,
    expiresAt: cached?.expiresAt ?? token?.expiresAt ?? null,
    error: token?.error ?? null,
    email: typeof token?.email === 'string' ? token.email : null,
  });
}
