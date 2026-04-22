import { NextResponse, type NextRequest } from 'next/server';

// /r/[code] — the link referrers share. Route Handler (not page) so we
// can legally set a cookie in Next 15 (Server Components can't mutate
// cookies; only Server Actions + Route Handlers can).
//
// Cookie sticks for 90 days so signups that happen well after the click
// still credit the right inviter. The waitlist action prefers the URL
// ?ref=<code> param, then falls back to this cookie, then gives up.

const COOKIE = 'sh1pt_ref';
const NINETY_DAYS = 60 * 60 * 24 * 90;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const target = new URL(`/waitlist?ref=${encodeURIComponent(code)}`, request.url);

  const response = NextResponse.redirect(target);
  response.cookies.set(COOKIE, code, {
    maxAge: NINETY_DAYS,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
