'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function joinWaitlist(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const handle = String(formData.get('handle') ?? '').trim() || null;
  const referredByCode = String(formData.get('referred_by') ?? '').trim() || null;

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

  redirect(`/waitlist/thanks?code=${referralCode}`);
}
