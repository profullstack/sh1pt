import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { inviteOverview, originFromHeaders, settleInvitesSentBy } from '@/lib/credits';
import { InvitesManager } from './InvitesManager';

export const metadata = {
  title: 'Invites — sh1pt',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function InvitesPage() {
  const supabase = await getSupabaseServerClient();
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // signed out
  }
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('user_id', user.id)
    .maybeSingle<{ referral_code: string }>();

  await settleInvitesSentBy(user.id);
  const overview = await inviteOverview(user.id);
  const origin = originFromHeaders(await headers());

  return (
    <main>
      <section>
        <div className="container" style={{ maxWidth: 760 }}>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            <Link href="/dashboard">← Dashboard</Link>
          </p>
          <h1 style={{ marginBottom: '0.25rem' }}>Invites</h1>
          <p className="muted">
            You get {overview.quota.total} invites. Each one works once, for someone new to sh1pt. When they sign up and
            confirm their email, you both get <strong style={{ color: 'var(--fg)' }}>{overview.bonusDays} days of sh1pt Pro</strong>.
          </p>
          <InvitesManager
            origin={origin}
            initial={overview}
          />
          {profile?.referral_code ? (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="muted" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Open referral link
              </div>
              <code style={{ display: 'block', wordBreak: 'break-all', marginTop: '0.5rem' }}>
                {`${origin}/r/${profile.referral_code}`}
              </code>
              <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.6rem', marginBottom: 0 }}>
                Share it anywhere: $50 credit per paid signup, tier bonuses at 3, 10 and 25. A sign-up counts for an invite or
                this link, not both.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
