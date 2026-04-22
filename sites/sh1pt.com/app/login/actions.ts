'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// Sign-in = sign-up for magic links. signInWithOtp creates the auth.users
// row on first use (which fires handle_new_user → profile row); for
// returning users it just mints a new magic link. The /waitlist action
// does the same thing but also forwards handle + referred_by metadata.

export async function sendLoginLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    redirect('/login?error=email');
  }

  const supabase = await getSupabaseServerClient();
  const origin = await resolveOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // No extra metadata for pure sign-ins. If the email has no account
      // yet, the trigger still creates a profile row with a fresh
      // referral_code — they become a waitlist member too.
    },
  });

  if (error) {
    console.error('[login] signInWithOtp error', error);
    redirect('/login?error=send');
  }

  redirect(`/waitlist/check-email?email=${encodeURIComponent(email)}`);
}

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com');
}
