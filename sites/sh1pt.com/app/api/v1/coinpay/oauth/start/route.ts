import { NextResponse, type NextRequest } from 'next/server';
import { authorizeUrl, pkce, randomToken, SIGN_IN_SCOPES } from '@profullstack/coinpay-onboard/oauth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { safeNextPath } from '@/lib/safe-next';
import {
  PENDING_SECONDS,
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  coinpayConfig,
  savePending,
  supabaseCoinpayStore,
  type OAuthMode,
} from '@/lib/coinpay-signin';

export const dynamic = 'force-dynamic';

// GET /api/v1/coinpay/oauth/start?next=/dashboard           Sign in with CoinPay
// GET /api/v1/coinpay/oauth/start?mode=connect               Connect CoinPay (signed in)
//
// PKCE S256 + state + nonce. The verifier and nonce stay server side in
// coinpay_pending (keyed by sha256(state)); state is pinned to this browser by
// an httpOnly cookie scoped to the OAuth paths.
export async function GET(request: NextRequest) {
  const cfg = coinpayConfig();
  if (!cfg) return NextResponse.redirect(new URL('/login?error=coinpay_off', cfgOrigin(request)));

  const url = new URL(request.url);
  const mode: OAuthMode = url.searchParams.get('mode') === 'connect' ? 'connect' : 'login';

  let linkUserId: string | null = null;
  if (mode === 'connect') {
    // Connecting happens only from inside the account it joins.
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return NextResponse.redirect(new URL('/login?next=/dashboard', cfg.siteUrl));
    linkUserId = data.user.id;
  }

  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = pkce();
  const next = safeNextPath(url.searchParams.get('next'), '/dashboard');
  await savePending(supabaseCoinpayStore(getSupabaseServiceClient()), state, { verifier, nonce, mode, next, linkUserId });

  const res = NextResponse.redirect(
    authorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, challenge, nonce, scopes: SIGN_IN_SCOPES }),
  );
  res.headers.set('cache-control', 'no-store');
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: cfg.siteUrl.startsWith('https:'),
    sameSite: 'lax',
    path: STATE_COOKIE_PATH,
    maxAge: PENDING_SECONDS,
  });
  return res;
}

function cfgOrigin(request: NextRequest): string {
  const site = (process.env as Record<string, string | undefined>)['NEXT_PUBLIC_SITE_URL'];
  return site || new URL(request.url).origin;
}
