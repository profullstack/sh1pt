import { NextResponse, type NextRequest } from 'next/server';
import { finishSignIn } from '@profullstack/coinpay-onboard/oauth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { onSignedIn } from '@/lib/credits';
import {
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  coinpayConfig,
  mintMagicLinkHash,
  resolveCoinpayUser,
  supabaseCoinpayStore,
  takeCallback,
} from '@/lib/coinpay-signin';

export const dynamic = 'force-dynamic';

// GET /api/v1/coinpay/oauth/callback?code=…&state=…
//
// Refused before the code is exchanged when the state is not this browser's,
// was already used, or (Connect) the signed-in user is not the one who asked.
// The exchange sends the PKCE verifier and the client secret; the id_token's
// iss/aud/exp/nonce are checked and userinfo's sub must match it. The account
// is chosen by sub only (lib/coinpay-signin.ts), then a normal Supabase
// session is minted server side.
export async function GET(request: NextRequest) {
  const cfg = coinpayConfig();
  const site = cfg?.siteUrl ?? 'https://sh1pt.com';
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, site));
    res.cookies.set(STATE_COOKIE, '', { path: STATE_COOKIE_PATH, maxAge: 0 });
    res.headers.set('cache-control', 'no-store');
    return res;
  };
  if (!cfg) return to('/login?error=coinpay_off');

  const url = new URL(request.url);
  const supabase = await getSupabaseServerClient();
  const { data: who } = await supabase.auth.getUser();
  const currentUserId = who?.user?.id ?? null;

  const admin = getSupabaseServiceClient();
  const store = supabaseCoinpayStore(admin);
  const checked = await takeCallback(store, {
    state: url.searchParams.get('state'),
    cookieState: request.cookies.get(STATE_COOKIE)?.value,
    currentUserId,
  });
  if (!checked.ok) return to(`/login?error=coinpay_${checked.code}`);
  const { pending } = checked;
  const fail = (code: string) =>
    to(pending.mode === 'connect' ? `/dashboard?coinpay=${code}#coinpay` : `/login?error=coinpay_${code}`);

  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) return fail('cancelled');

  let claims;
  try {
    const result = await finishSignIn({
      code,
      verifier: pending.verifier,
      nonce: pending.nonce,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
    });
    claims = { sub: result.sub, email: result.email, name: result.name };
  } catch (err) {
    console.error('[coinpay] sign-in failed', err instanceof Error ? err.message : err);
    return fail('failed');
  }

  const resolved = await resolveCoinpayUser({ mode: pending.mode, currentUserId, claims }, store);
  if (!resolved.ok) return fail(resolved.code);
  if (pending.mode === 'connect') return to('/dashboard?coinpay=connected#coinpay');

  const minted = await mintMagicLinkHash(admin, resolved.userId);
  if (!minted.ok) return fail('session');
  const { error } = await supabase.auth.verifyOtp({ token_hash: minted.tokenHash, type: 'magiclink' });
  if (error) {
    console.error('[coinpay] verifyOtp', error.message);
    return fail('session');
  }

  // Invite bonuses settle for accounts with a real address only: an account a
  // CoinPay login just made has no proven email, so it neither accepts an
  // invite nor earns one (see lib/credits.ts).
  if (resolved.action === 'login') await onSignedIn(resolved.userId, null);

  return to(resolved.action === 'created' ? '/dashboard?coinpay=welcome#coinpay' : pending.next);
}
