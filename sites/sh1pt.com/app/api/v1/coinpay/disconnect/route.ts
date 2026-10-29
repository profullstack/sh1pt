import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { coinpayConfig, disconnectCoinpay, supabaseCoinpayStore } from '@/lib/coinpay-signin';

export const dynamic = 'force-dynamic';

// POST /api/v1/coinpay/disconnect: the dashboard's form. Refused when CoinPay
// is the only way into the account (its auth email is a CoinPay placeholder).
export async function POST(request: NextRequest) {
  const site = coinpayConfig()?.siteUrl ?? 'https://sh1pt.com';
  if (!sameSite(request.headers.get('origin'), site)) return new NextResponse('Bad origin', { status: 403 });
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.redirect(new URL('/login?next=/dashboard', site), 303);

  const result = await disconnectCoinpay(
    data.user.id,
    data.user.email ?? null,
    supabaseCoinpayStore(getSupabaseServiceClient()),
  );
  return NextResponse.redirect(
    new URL(`/dashboard?coinpay=${result.ok ? 'disconnected' : 'only_sign_in'}#coinpay`, site),
    303,
  );
}

function sameSite(origin: string | null, site: string): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(site).host;
  } catch {
    return false;
  }
}
