import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// /auth/callback — terminates the magic-link flow. Supabase appends
// either ?code=<auth-code> (PKCE) or #access_token=... (legacy hash
// flow). We only support the server-exchangeable code path here.
//
// On success: session cookie is set, referral cookie is cleared (the
// DB trigger already wrote the referrals row), user lands on /dashboard.
// On any failure: back to /waitlist with an error marker so the UI
// can surface a helpful message.

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = resolveOrigin(request);

  if (!code) {
    return NextResponse.redirect(new URL('/waitlist?error=callback', origin));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession', error);
    return NextResponse.redirect(new URL('/waitlist?error=exchange', origin));
  }

  const response = NextResponse.redirect(new URL('/dashboard', origin));
  response.cookies.delete('sh1pt_ref');
  return response;
}

function resolveOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com');
}
