import { NextResponse } from 'next/server';
import { fetchWordpressPublicNav } from '@/lib/wordpressPublicNav';

export const dynamic = 'force-dynamic';

/** Live WordPress home header (menu, CTA, utility strip) for /start and public shells. */
export async function GET() {
  const nav = await fetchWordpressPublicNav();
  return NextResponse.json(nav, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
