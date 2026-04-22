'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const REF_COOKIE = 'sh1pt_ref';
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com';

// Kick off a magic-link signup/login. Supabase fires an email via the
// configured SMTP; clicking the link lands on /auth/callback which
// exchanges the code for a session. The DB trigger (handle_new_user)
// creates a profiles row + any referrals entry.
export async function joinWaitlist(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const handle = String(formData.get('handle') ?? '').trim() || null;

  // URL param wins, then the 90-day /r/<code> cookie, then null.
  const jar = await cookies();
  const referredBy =
    String(formData.get('referred_by') ?? '').trim() ||
    jar.get(REF_COOKIE)?.value ||
    null;

  if (!email || !email.includes('@')) {
    redirect('/waitlist?error=email');
  }

  const supabase = await getSupabaseServerClient();
  const origin = await resolveOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // User hits this URL from their email client; the callback route
      // finishes the login and redirects to /dashboard.
      emailRedirectTo: `${origin}/auth/callback`,
      // Delivered to auth.users.raw_user_meta_data — the handle_new_user
      // trigger reads these and populates the profile + referrals rows.
      data: {
        handle: handle ?? undefined,
        referred_by: referredBy ?? undefined,
      },
    },
  });

  if (error) {
    console.error('[waitlist] signInWithOtp error', error);
    redirect('/waitlist?error=send');
  }

  redirect(`/waitlist/check-email?email=${encodeURIComponent(email)}`);
}

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : SITE_ORIGIN;
}
