'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { sendWaitlistWelcome } from '@/lib/email/waitlist-welcome';

const REF_COOKIE = 'sh1pt_ref';
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sh1pt.com';

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function joinWaitlist(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const handle = String(formData.get('handle') ?? '').trim() || null;

  // Form field takes priority (hidden input set from ?ref=), then the
  // 90-day cookie set by /r/[code] for signups that happen well after
  // the click.
  const jar = await cookies();
  const referredByCode =
    String(formData.get('referred_by') ?? '').trim() ||
    jar.get(REF_COOKIE)?.value ||
    null;

  if (!email || !email.includes('@')) {
    redirect('/waitlist?error=email');
  }

  const supabase = getSupabaseServiceClient();
  const referralCode = randomCode();

  // 1. Upsert the waitlist row and grab its id so we can reference it
  //    from the referrals table below.
  const { data: row, error: upsertErr } = await supabase
    .from('waitlist')
    .upsert(
      { email, handle, referred_by: referredByCode, referral_code: referralCode },
      { onConflict: 'email' },
    )
    .select('id')
    .single();

  if (upsertErr || !row) {
    console.error('[waitlist] upsert error', upsertErr);
    redirect('/waitlist?error=db');
  }

  // 2. If the signup came through a /r/<code> link, look up the inviter
  //    and record the referral. Failures here are non-fatal — a missing
  //    inviter code shouldn't block the signup.
  if (referredByCode) {
    const { data: inviter, error: inviterErr } = await supabase
      .from('waitlist')
      .select('id')
      .eq('referral_code', referredByCode)
      .maybeSingle();

    if (inviterErr) {
      console.error('[waitlist] inviter lookup error', inviterErr);
    } else if (inviter && inviter.id !== row.id) {
      // Ignore self-referrals (a user pasting their own code).
      const { error: refErr } = await supabase
        .from('referrals')
        .upsert(
          { referred_by: inviter.id, referred_to: row.id },
          { onConflict: 'referred_by,referred_to' },
        );
      if (refErr) {
        console.error('[waitlist] referral insert error', refErr);
      }
    }
  }

  // Credit is done — drop the cookie so a later unrelated signup in the
  // same browser doesn't get wrongly attributed.
  jar.delete(REF_COOKIE);

  // Fire-and-log the welcome email. SMTP failures must never break the
  // signup flow — the row is already in Supabase; we can retry later.
  try {
    const origin = await resolveOrigin();
    await sendWaitlistWelcome({
      to: email,
      handle,
      referralUrl: `${origin}/r/${referralCode}`,
      thanksUrl: `${origin}/waitlist/thanks?code=${referralCode}`,
    });
  } catch (err) {
    console.error('[waitlist] welcome email send failed', err);
  }

  redirect(`/waitlist/thanks?code=${referralCode}`);
}

// Resolve the user-facing origin so email links don't leak the internal
// 0.0.0.0:8080 Railway listen address.
async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : SITE_ORIGIN;
}
