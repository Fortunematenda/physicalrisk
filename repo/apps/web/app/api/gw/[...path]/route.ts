import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

import { cacheAccessToken, getCachedAccessToken } from '@/lib/token-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'repo.next-auth.session-token';

async function resolveBearer(req: NextRequest): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({
    req,
    secret,
    cookieName: SESSION_COOKIE,
    secureCookie: false,
  });

  if (token?.error !== 'RefreshTokenError') {
    const cached = getCachedAccessToken(token?.sub);
    if (cached?.accessToken) return cached.accessToken;

    if (typeof token?.refreshToken === 'string' && token.refreshToken) {
      const refreshed = await refreshKeycloakToken(token.refreshToken);
      if (refreshed && token.sub) {
        cacheAccessToken(
          token.sub,
          refreshed,
          token.refreshToken,
          Math.floor(Date.now() / 1000) + 300,
        );
        return refreshed;
      }
    }
  }

  const headerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return headerToken || null;
}

async function refreshKeycloakToken(refreshToken: string): Promise<string | null> {
  const issuer =
    process.env.KEYCLOAK_ISSUER || 'https://auth.physicalrisk.com/realms/physicalrisk';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || '';
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { access_token?: string };
    return typeof data.access_token === 'string' ? data.access_token : null;
  } catch (err) {
    console.error('[repo-gw] refresh failed', err);
    return null;
  }
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const bearer = await resolveBearer(req);

  if (!bearer) {
    return NextResponse.json(
      { statusCode: 401, message: 'Authentication required' },
      { status: 401 },
    );
  }

  const base = (process.env.INTERNAL_API_URL || 'http://repo-api:4000').replace(/\/$/, '');
  const subPath = pathSegments.map(encodeURIComponent).join('/');
  const url = `${base}/api/${subPath}${req.nextUrl.search}`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${bearer}`);
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const accept = req.headers.get('accept');
  if (accept) headers.set('Accept', accept);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: 'no-store',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.arrayBuffer();
    if (body.byteLength) init.body = body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    console.error('[repo-gw] upstream fetch failed', err);
    return NextResponse.json(
      { statusCode: 502, message: 'Upstream API unreachable' },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) outHeaders.set('content-type', upstreamType);
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) outHeaders.set('content-disposition', disposition);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type RouteCtx = { params: Promise<{ path: string[] }> };

async function pathOf(ctx: RouteCtx): Promise<string[]> {
  const params = await ctx.params;
  return params.path || [];
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, await pathOf(ctx));
}
export async function POST(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, await pathOf(ctx));
}
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, await pathOf(ctx));
}
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, await pathOf(ctx));
}
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, await pathOf(ctx));
}
