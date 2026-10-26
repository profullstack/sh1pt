'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { INVITE_COOKIE, looksLikeInviteCode } from '@/lib/invite-rules';

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
  // A pending /i/<code> invite rides along with the emailed link (used only
  // if this email has no account yet; the callback accepts it).
  const invite = (await cookies()).get(INVITE_COOKIE)?.value;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // No extra metadata for pure sign-ins. If the email has no account
      // yet, the trigger still creates a profile row with a fresh
      // referral_code — they become a waitlist member too.
      ...(invite && looksLikeInviteCode(invite) ? { data: { invite_code: invite.slice(0, 64) } } : {}),
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
