import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'sh1pt — dashboard',
};

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/waitlist');

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, handle, referral_code, prepaid, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr) console.error('[dashboard] profile load', profileErr);
  if (!profile) redirect('/waitlist?error=no-profile');

  const { count: referralCount } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', profile.id);

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com');
  const referralUrl = `${origin}/r/${profile.referral_code}`;
  const invited = referralCount ?? 0;
  const nextTierAt = invited < 3 ? 3 : invited < 10 ? 10 : invited < 25 ? 25 : null;

  return (
    <main>
      <section>
        <div className="container" style={{ maxWidth: 760 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ marginBottom: 0 }}>Your dashboard</h1>
              <div className="muted" style={{ fontSize: '0.9rem' }}>
                Signed in as <strong style={{ color: 'var(--fg)' }}>{profile.email}</strong>
                {profile.handle ? ` · ${profile.handle}` : null}
              </div>
            </div>
            <form action="/auth/signout" method="post">
              <button className="btn secondary" type="submit" style={{ fontSize: '0.85rem' }}>Sign out</button>
            </form>
          </div>

          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Your referral link
            </div>
            <code style={{ fontSize: '1.05rem', display: 'block', wordBreak: 'break-all', marginTop: '0.5rem' }}>
              {referralUrl}
            </code>
            <p className="muted" style={{ marginTop: '0.8rem', fontSize: '0.9rem' }}>
              <strong style={{ color: 'var(--fg)' }}>{invited}</strong>{' '}
              {invited === 1 ? 'friend has' : 'friends have'} signed up via your link.
              {nextTierAt ? ` ${nextTierAt - invited} more to unlock the ${nextTierAt}-invite bonus.` : ' Top tier unlocked — keep sharing.'}
            </p>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              <strong style={{ color: 'var(--fg)' }}>$50</strong> credit per paid signup.
              Tiered bonuses: <strong style={{ color: 'var(--fg)' }}>+$150</strong> at 3,{' '}
              <strong style={{ color: 'var(--fg)' }}>+$600</strong> at 10,{' '}
              <strong style={{ color: 'var(--fg)' }}>+$2,000</strong> at 25.
            </p>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Prepay
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 500, marginTop: '0.25rem' }}>
                  {profile.prepaid ? '✓ Paid' : '$244/yr — price-locked for life'}
                </div>
              </div>
              <button className="btn" disabled={profile.prepaid} style={{ opacity: profile.prepaid ? 0.7 : 1 }}>
                {profile.prepaid ? 'Receipt sent' : 'Checkout opens soon'}
              </button>
            </div>
            {!profile.prepaid ? (
              <p className="muted" style={{ marginTop: '0.8rem', fontSize: '0.85rem' }}>
                CoinPay (BTC / ETH / USDC / SOL) or Stripe. We'll email you the moment the payment link goes live — $244/yr stays locked for 14 days from that email, refundable within 14 days if you change your mind.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
