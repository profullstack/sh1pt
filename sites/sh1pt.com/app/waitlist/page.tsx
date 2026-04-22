import { cookies } from 'next/headers';
import { joinWaitlist } from './actions';

export const metadata = {
  title: 'Join the sh1pt waitlist — $244/yr locked in',
  description: 'Prepay your first year at $244 instead of $499. Price locked for life.',
};

export default function Waitlist({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <main>
      <section>
        <div className="container" style={{ maxWidth: 640 }}>
          <h1>Lock in $244/year — for life.</h1>
          <p className="muted">
            Pay once at $244, every renewal stays at $244. At launch the price becomes $499/yr and there's no way back in.
            Prepay via CoinPay (crypto) or Stripe (card once live). Refundable within 14 days if we can't deliver.
          </p>
          <form action={joinWaitlist}>
            <WaitlistFields searchParams={searchParams} />
            <button className="btn" type="submit" style={{ marginTop: '1rem', width: '100%' }}>
              Claim my seat — $244/yr locked in
            </button>
          </form>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
            You'll get a unique referral link after signup. <strong>$50 credit</strong> per paid referral, tiered bonuses at 3 / 10 / 25 invites.
          </p>
        </div>
      </section>
    </main>
  );
}

async function WaitlistFields({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  // Prefer the URL param (freshest click) over the cookie, but fall
  // back to cookie so signups days after clicking /r/<code> still credit
  // the right inviter.
  const cookieRef = (await cookies()).get('sh1pt_ref')?.value;
  const referredBy = params.ref ?? cookieRef;
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <label>
        <div className="muted" style={{ fontSize: '0.85rem' }}>Email *</div>
        <input name="email" type="email" required
          style={{ width: '100%', padding: '0.8rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)' }} />
      </label>
      <label>
        <div className="muted" style={{ fontSize: '0.85rem' }}>Handle (optional)</div>
        <input name="handle" type="text" placeholder="@you on X / Bluesky"
          style={{ width: '100%', padding: '0.8rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)' }} />
      </label>
      {referredBy ? <input type="hidden" name="referred_by" value={referredBy} /> : null}
    </div>
  );
}
