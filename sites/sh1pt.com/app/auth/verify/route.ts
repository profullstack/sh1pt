import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// /auth/verify — email links from Supabase email templates point here
// instead of supabase.co/auth/v1/verify, so users never leave sh1pt.com.
//
// We call supabase.auth.verifyOtp server-side with the token_hash,
// which sets the session cookie on sh1pt.com directly. One hop instead
// of two, no third-party domain flash, better UX.
//
// Magic-link template embeds:
//   {{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard

type OtpType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email';

const ALLOWED_TYPES = new Set<OtpType>([
  'signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email',
]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const typeParam = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/dashboard';
  const origin = resolveOrigin(request);

  if (!tokenHash || !typeParam || !ALLOWED_TYPES.has(typeParam as OtpType)) {
    return NextResponse.redirect(new URL('/waitlist?error=verify-params', origin));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: typeParam as OtpType,
  });

  if (error) {
    console.error('[auth/verify] verifyOtp error', error);
    return NextResponse.redirect(new URL('/waitlist?error=verify', origin));
  }

  // Only allow relative paths for `next` so nobody can use us as an
  // open redirect to an external URL.
  const safeNext = next.startsWith('/') ? next : '/dashboard';
  const response = NextResponse.redirect(new URL(safeNext, origin));
  response.cookies.delete('sh1pt_ref');
  return response;
}

function resolveOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com');
}
