import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

import {
  cacheAccessToken,
  getCachedAccessToken,
  isCachedAccessTokenFresh,
} from '@/lib/token-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'moss.next-auth.session-token';

type RefreshedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

/**
 * Resolve a fresh Keycloak access token for upstream API calls.
 * The in-memory cache previously returned expired tokens until process restart,
 * which made Nest reject JWTs (~5 min) and the browser redirect to SSO — looking
 * like the triage page "refreshed" every few minutes.
 */
async function resolveBearer(
  req: NextRequest,
  opts?: { forceRefresh?: boolean },
): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({
    req,
    secret,
    cookieName: SESSION_COOKIE,
    secureCookie: false,
  });

  if (token?.error !== 'RefreshTokenError') {
    const sub = typeof token?.sub === 'string' ? token.sub : null;
    if (!opts?.forceRefresh && isCachedAccessTokenFresh(sub)) {
      return getCachedAccessToken(sub)?.accessToken || null;
    }

    const cached = getCachedAccessToken(sub);
    const refreshToken =
      (cached?.refreshToken && String(cached.refreshToken)) ||
      (typeof token?.refreshToken === 'string' ? token.refreshToken : '');

    if (sub && refreshToken) {
      const refreshed = await refreshKeycloakToken(refreshToken);
      if (refreshed) {
        cacheAccessToken(sub, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt);
        return refreshed.accessToken;
      }
    }
  }

  const headerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return headerToken || null;
}

async function refreshKeycloakToken(refreshToken: string): Promise<RefreshedTokens | null> {
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
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (typeof data.access_token !== 'string') return null;
    return {
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in || 300),
    };
  } catch (err) {
    console.error('[moss-gw] refresh failed', err);
    return null;
  }
}

async function proxy(req: NextRequest, pathSegments: string[]) {
  const subPath = pathSegments.map(encodeURIComponent).join('/');
  const isPublicAssessmentRoute =
    (req.method === 'GET' && subPath === 'public/start') ||
    (req.method === 'POST' && subPath === 'public/leads') ||
    (req.method === 'POST' && subPath === 'public/resume') ||
    (req.method === 'PATCH' && /^public\/leads\/[^/]+\/progress$/.test(subPath)) ||
    (req.method === 'POST' && subPath === 'public/complete-assessment') ||
    (req.method === 'GET' && subPath === 'public/triage/proposal') ||
    (req.method === 'POST' && subPath === 'public/triage/proposal');

  let bearer = isPublicAssessmentRoute ? null : await resolveBearer(req);

  if (!isPublicAssessmentRoute && !bearer) {
    return NextResponse.json(
      { statusCode: 401, message: 'Authentication required' },
      { status: 401 },
    );
  }

  const base = (process.env.INTERNAL_API_URL || 'http://moss-api:4000').replace(/\/$/, '');
  const url = `${base}/api/${subPath}${req.nextUrl.search}`;

  const contentType = req.headers.get('content-type');
  const isMultipartUpload = contentType?.includes('multipart/form-data');
  const maxBodyBytes = isMultipartUpload ? 25 * 1024 * 1024 : 102_400;

  let requestBody: ArrayBuffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.arrayBuffer();
    if (body.byteLength > maxBodyBytes) {
      return NextResponse.json(
        {
          statusCode: 413,
          message: isMultipartUpload
            ? 'Upload exceeds 25 MB limit.'
            : 'Request body too large',
        },
        { status: 413 },
      );
    }
    if (body.byteLength) requestBody = body;
  }

  const buildInit = (accessToken: string | null): RequestInit => {
    const headers = new Headers();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const cookie = req.headers.get('cookie');
    if (cookie) headers.set('Cookie', cookie);
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) headers.set('X-Forwarded-For', forwardedFor);
    if (contentType) headers.set('Content-Type', contentType);
    const accept = req.headers.get('accept');
    if (accept) headers.set('Accept', accept);
    const init: RequestInit = {
      method: req.method,
      headers,
      cache: 'no-store',
    };
    if (requestBody) init.body = requestBody;
    return init;
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, buildInit(bearer));
    // Expired access token race: refresh once and retry.
    if (upstream.status === 401 && !isPublicAssessmentRoute) {
      bearer = await resolveBearer(req, { forceRefresh: true });
      if (bearer) {
        upstream = await fetch(url, buildInit(bearer));
      }
    }
  } catch (err) {
    console.error('[moss-gw] upstream fetch failed', err);
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
  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) outHeaders.set('set-cookie', setCookie);
  const cacheControl = upstream.headers.get('cache-control');
  if (cacheControl) outHeaders.set('cache-control', cacheControl);

  // Buffer binary downloads (PDF reports/evidence). Streaming `upstream.body`
  // can arrive empty in some Next.js/fetch runtimes and shows as a blank file.
  const isBinary =
    Boolean(upstreamType?.includes('pdf')) ||
    Boolean(upstreamType?.includes('octet-stream')) ||
    Boolean(disposition?.includes('attachment')) ||
    /\/file(?:\?|$)/.test(subPath) ||
    /\/download(?:\?|$)/.test(subPath) ||
    /\/proposal-preview(?:\?|$)/.test(subPath);

  if (isBinary) {
    const buf = await upstream.arrayBuffer();
    outHeaders.set('content-length', String(buf.byteLength));
    return new NextResponse(buf, {
      status: upstream.status,
      headers: outHeaders,
    });
  }

  const contentLength = upstream.headers.get('content-length');
  if (contentLength) outHeaders.set('content-length', contentLength);

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type Ctx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path || []);
}
