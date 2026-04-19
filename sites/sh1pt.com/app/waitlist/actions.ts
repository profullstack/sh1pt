'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function joinWaitlist(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const handle = String(formData.get('handle') ?? '').trim() || null;
  const referredBy = String(formData.get('referred_by') ?? '').trim() || null;

  if (!email || !email.includes('@')) {
    redirect('/waitlist?error=email');
  }

  const supabase = await getSupabaseServerClient();
  const referralCode = randomCode();

  const { error } = await supabase
    .from('waitlist')
    .upsert({ email, handle, referred_by: referredBy, referral_code: referralCode }, { onConflict: 'email' });

  if (error) {
    console.error('[waitlist] upsert error', error);
    redirect('/waitlist?error=db');
  }

  redirect(`/waitlist/thanks?code=${referralCode}`);
}
