import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const sessionCookieName = 'portal.next-auth.session-token';

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    cookieName: sessionCookieName,
  });

  if (token) {
    return NextResponse.next();
  }

  const publicBaseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.AUTH_URL ||
    'https://apps.physicalrisk.com';

  const signInUrl = new URL('/auth/signin', publicBaseUrl);

  const callbackPath =
    request.nextUrl.pathname +
    request.nextUrl.search;

  signInUrl.searchParams.set('callbackUrl', callbackPath);

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    '/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
