import { NextResponse } from 'next/server';
import { fetchWordpressPublicNav } from '@/lib/wordpressPublicNav';

export const dynamic = 'force-dynamic';

/**
 * Live WordPress home header for /start.
 * Path is intentionally NOT under /api/* — nginx sends /api/ to moss-api.
 */
export async function GET() {
  const nav = await fetchWordpressPublicNav();
  return NextResponse.json(nav, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
