import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

// /r/[code] — the link referrers share. Route Handler (not page) so we
// can legally set a cookie in Next 15.
//
// Before stamping the 90-day cookie we verify the code actually matches
// a waitlist.referral_code — otherwise typos and malicious links end up
// attributing signups to phantom inviters.

const COOKIE = 'sh1pt_ref';
const NINETY_DAYS = 60 * 60 * 24 * 90;

// referral_code is 8 hex chars (see randomCode() in waitlist/actions.ts).
// Guard cheaply before hitting the DB.
const CODE_SHAPE = /^[0-9a-f]{8}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const trimmed = code.trim().toLowerCase();

  let valid = false;
  if (CODE_SHAPE.test(trimmed)) {
    try {
      const supabase = getSupabaseServiceClient();
      const { data } = await supabase
        .from('waitlist')
        .select('id')
        .eq('referral_code', trimmed)
        .maybeSingle();
      valid = Boolean(data);
    } catch (err) {
      console.error('[/r/code] lookup error', err);
    }
  }

  // Behind Railway's proxy, request.url reports the internal 0.0.0.0:8080
  // listen address — use the forwarded headers so redirects land on the
  // public origin (sh1pt.com / preview URLs / whatever).
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

  if (!valid) {
    return NextResponse.redirect(new URL('/waitlist', origin));
  }

  const target = new URL(`/waitlist?ref=${encodeURIComponent(trimmed)}`, origin);
  const response = NextResponse.redirect(target);
  response.cookies.set(COOKIE, trimmed, {
    maxAge: NINETY_DAYS,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
