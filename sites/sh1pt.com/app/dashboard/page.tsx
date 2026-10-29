import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { planFor } from '@/lib/credits';
import { RedeemCodeForm } from './RedeemCodeForm';
import { coinpayConfig, isPlaceholderEmail, supabaseCoinpayStore } from '@/lib/coinpay-signin';

export const metadata = {
  title: 'sh1pt — dashboard',
};

export const dynamic = 'force-dynamic';

const INVITE_NOTICES: Record<string, string> = {
  'accepted-granted': 'Invite accepted: you and your inviter each got 7 days of sh1pt Pro.',
  'accepted-pending': 'Invite accepted. The Pro bonus lands once your email is confirmed.',
  'accepted-denied': 'Invite accepted, but this sign-up does not qualify for the Pro bonus.',
  already_invited: 'Your account has already joined on an invite.',
  already_referred: 'Your account joined through a referral link, so it cannot also use an invite.',
  not_new: 'Invites are for new accounts.',
  invalid: 'That invite code is not valid.',
  expired: 'That invite has expired.',
  used: 'That invite has already been used.',
  revoked: 'That invite was withdrawn.',
  self: 'You cannot use your own invite.',
};

const COINPAY_NOTICES: Record<string, string> = {
  welcome: 'Welcome. You signed in with CoinPay, which is how you get back in.',
  connected: 'CoinPay connected. You can sign in with it from now on.',
  disconnected: 'CoinPay disconnected.',
  only_sign_in: 'CoinPay is the only way into this account, so it stays connected.',
  linked_elsewhere: 'That CoinPay account is already connected to another sh1pt account.',
  already_connected: 'This account is already connected to a different CoinPay account. Disconnect it first.',
  not_signed_in: 'Sign in first, then connect CoinPay.',
  cancelled: 'CoinPay was cancelled.',
  failed: "CoinPay couldn't be reached. Try again.",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const inviteNotice = INVITE_NOTICES[params.invite ?? ''] ?? null;
  const coinpayNotice = COINPAY_NOTICES[params.coinpay ?? ''] ?? null;
  const supabase = await getSupabaseServerClient();
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Stale/invalid cookie — treat as logged out.
  }
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

  const adminClient = getSupabaseServiceClient();
  const { data: activeInstallations } = await adminClient
    .from('github_installations')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('status', 'active');
  const installationIds = (activeInstallations ?? []).map((installation) => installation.id);
  const { count: selectedRepoCount } = installationIds.length
    ? await adminClient
        .from('github_installation_repos')
        .select('id', { count: 'exact', head: true })
        .in('installation_pk', installationIds)
    : { count: 0 };
  const installationCount = installationIds.length;
  // Sign in with CoinPay: connected or not, and whether it may be dropped.
  const coinpayIdentity = await supabaseCoinpayStore(adminClient)
    .identityByUser(user.id)
    .catch(() => null);
  const coinpayOnly = isPlaceholderEmail(user.email);
  const coinpayAvailable = coinpayConfig() !== null;
  const plan = await planFor(user.id).catch((err) => {
    console.error('[dashboard] plan', err);
    return null;
  });

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
                Signed in as <strong style={{ color: 'var(--fg)' }}>{coinpayOnly ? 'your CoinPay account' : profile.email}</strong>
                {profile.handle ? ` · ${profile.handle}` : null}
              </div>
            </div>
            <form action="/auth/signout" method="post">
              <button className="btn secondary" type="submit" style={{ fontSize: '0.85rem' }}>Sign out</button>
            </form>
          </div>

          <div className="card" id="coinpay" style={{ marginTop: '1.5rem' }}>
            <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              CoinPay
            </div>
            {coinpayNotice ? <p role="status" style={{ marginTop: '0.5rem' }}>{coinpayNotice}</p> : null}
            {coinpayIdentity ? (
              <>
                <p style={{ marginTop: '0.5rem' }}>
                  Connected{coinpayIdentity.coinpay_email ? ` (${coinpayIdentity.coinpay_email})` : ''}. You can sign in with CoinPay.
                </p>
                {coinpayOnly ? (
                  <p className="muted" style={{ fontSize: '0.85rem' }}>
                    CoinPay is the only way into this account, so it can't be disconnected.
                  </p>
                ) : (
                  <form action="/api/v1/coinpay/disconnect" method="post">
                    <button className="btn secondary" type="submit" style={{ fontSize: '0.85rem' }}>Disconnect CoinPay</button>
                  </form>
                )}
              </>
            ) : coinpayAvailable ? (
              <>
                <p style={{ marginTop: '0.5rem' }}>Connect your CoinPay account to sign in with it.</p>
                <a className="btn" href="/api/v1/coinpay/oauth/start?mode=connect">Connect CoinPay</a>
              </>
            ) : (
              <p className="muted" style={{ marginTop: '0.5rem' }}>Sign in with CoinPay is not available right now.</p>
            )}
          </div>

          {inviteNotice ? (
            <div className="card" role="status" style={{ marginTop: '1.5rem' }}>
              {inviteNotice}
            </div>
          ) : null}

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
                  Plan
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 500, marginTop: '0.25rem' }}>
                  {profile.prepaid ? '✓ Paid' : '$244/yr — price-locked for life'}
                </div>
                {plan && plan.daysLeft > 0 ? (
                  <div className="muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    sh1pt Pro until{' '}
                    <strong style={{ color: 'var(--fg)' }}>
                      {new Date(plan.proUntil as string).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    </strong>{' '}
                    ({plan.daysLeft} {plan.daysLeft === 1 ? 'day' : 'days'} left)
                  </div>
                ) : null}
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
            <RedeemCodeForm />
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.75rem', marginBottom: 0 }}>
              Invite someone new: <Link href="/invites">your invites</Link> (3 per account, 7 days of Pro each side).
            </p>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Actions Fleet
                </div>
                <div style={{ fontSize: '1.05rem', marginTop: '0.25rem' }}>
                  {installationCount && installationCount > 0
                    ? `${installationCount} GitHub installation${installationCount === 1 ? '' : 's'} connected · ${
                        selectedRepoCount ?? 0
                      } repo${selectedRepoCount === 1 ? '' : 's'} selected`
                    : 'Connect GitHub to install workflow packs across your repos'}
                </div>
              </div>
              <Link
                href={installationCount && installationCount > 0 ? '/dashboard/github' : '/dashboard/connect/github'}
                className="btn"
                style={{ fontSize: '0.9rem' }}
              >
                {installationCount && installationCount > 0 ? 'Manage' : 'Connect GitHub'}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
