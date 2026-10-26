import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { saveProfileFromMetadata } from '@/lib/profile';
import { onSignedIn } from '@/lib/credits';
import { INVITE_COOKIE } from '@/lib/invite-rules';
import { safeNextPath } from '@/lib/safe-next';

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
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: typeParam as OtpType,
  });

  if (error) {
    console.error('[auth/verify] verifyOtp error', error);
    return NextResponse.redirect(new URL('/waitlist?error=verify', origin));
  }
  if (data.user) {
    await saveProfileFromMetadata(data.user);
    // Accept a pending invite (cookie from /i/<code>, or the code saved with
    // the emailed link) and settle any invite bonus. Never blocks sign-in.
    const meta = (data.user.user_metadata ?? {}) as { invite_code?: unknown };
    const invite =
      request.cookies.get(INVITE_COOKIE)?.value ||
      (typeof meta.invite_code === 'string' ? meta.invite_code : null);
    await onSignedIn(data.user.id, invite);
  }

  // Same-origin paths only, so nobody can use us as an open redirect
  // (`//evil`, `/\\evil` and `/<tab>/evil` all start with '/').
  const safeNext = safeNextPath(next);
  const response = NextResponse.redirect(new URL(safeNext, origin));
  response.cookies.delete('sh1pt_ref');
  response.cookies.delete(INVITE_COOKIE);
  return response;
}

function resolveOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com');
}
