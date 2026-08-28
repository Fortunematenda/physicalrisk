import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'repo.next-auth.session-token';

async function forwardSessionEvent(req: NextRequest, body: Record<string, unknown>) {
  const secret = process.env.AUTH_EVENT_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  const token = await getToken({
    req,
    secret,
    cookieName: SESSION_COOKIE,
    secureCookie: false,
  });
  const apiBase = (process.env.INTERNAL_API_URL || 'http://repo-api:4000').replace(/\/$/, '');
  const email =
    (typeof body.email === 'string' && body.email)
    || (typeof token?.email === 'string' ? token.email : undefined);

  await fetch(`${apiBase}/api/auth/session-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Event-Secret': secret || '',
    },
    body: JSON.stringify({ ...body, email, app: body.app || 'repo' }),
  }).catch(() => undefined);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  await forwardSessionEvent(req, body);
  return NextResponse.json({ ok: true });
}
