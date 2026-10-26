import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { onSignedIn, originFromHeaders } from '@/lib/credits';
import { INVITE_COOKIE, looksLikeInviteCode } from '@/lib/invite-rules';

// /i/<code>: the link an invite carries. Signed out: keep the code in a
// cookie for 30 days and go to the signup form, which also saves it with
// the emailed sign-in link (so opening the link on another device still
// counts). Signed in: accept it now (new accounts only).
//
// Not behind any gate: the crawl gateway only answers AI training crawlers.

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code: raw } = await context.params;
  const code = decodeURIComponent(raw).trim().slice(0, 64);
  const origin = originFromHeaders(request.headers);
  if (!looksLikeInviteCode(code)) return NextResponse.redirect(new URL('/waitlist', origin));

  let userId: string | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  if (userId) {
    const r = await onSignedIn(userId, code);
    const status = r.invite ? (r.invite.ok ? `accepted-${r.invite.bonus}` : r.invite.reason) : 'already_invited';
    const response = NextResponse.redirect(new URL(`/dashboard?invite=${encodeURIComponent(status)}`, origin));
    response.cookies.delete(INVITE_COOKIE);
    return response;
  }

  const response = NextResponse.redirect(new URL(`/waitlist?invite=${encodeURIComponent(code)}`, origin));
  response.cookies.set(INVITE_COOKIE, code, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}
