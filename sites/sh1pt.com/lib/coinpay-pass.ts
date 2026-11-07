// Profullstack Pass on sh1pt.com: a CoinPay user who deposited $99 into their
// own CoinPay wallet gets a free month of sh1pt Pro.
//
// CoinPay reports the pass only in the userinfo `pass` claim at sign-in
// (finishSignIn() reads it with passFromUserinfo()), so the callback stores its
// end on profiles.coinpay_pass_until for the account bound to the CoinPay
// `sub` (lib/coinpay-signin.ts), never one matched by email. lib/plan.ts
// counts it as Pro until it ends.
import type { SupabaseClient } from '@supabase/supabase-js';
import { PASS_URL, type CoinpayPass } from '@profullstack/coinpay-onboard/pass';

export { PASS_URL };

/** The pass end to store, or null when the claim grants nothing. */
export function passUntilToStore(pass: CoinpayPass | null | undefined, now: number = Date.now()): string | null {
  if (!pass?.active || !pass.expiresAt) return null;
  const t = pass.expiresAt.getTime();
  return Number.isFinite(t) && t > now ? pass.expiresAt.toISOString() : null;
}

export interface PassStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, until: string): Promise<void>;
}

export function supabasePassStore(db: SupabaseClient): PassStore {
  return {
    async get(userId) {
      const { data } = await db
        .from('profiles')
        .select('coinpay_pass_until')
        .eq('user_id', userId)
        .maybeSingle<{ coinpay_pass_until: string | null }>();
      return data?.coinpay_pass_until ?? null;
    },
    async set(userId, until) {
      const { error } = await db.from('profiles').update({ coinpay_pass_until: until }).eq('user_id', userId);
      if (error) throw new Error(`coinpay pass: ${error.message}`);
    },
  };
}

/** Store an active pass on the account. Never shortens a later stored pass. */
export async function recordCoinpayPass(
  store: PassStore,
  userId: string,
  pass: CoinpayPass | null | undefined,
  now: number = Date.now(),
): Promise<string | null> {
  const until = passUntilToStore(pass, now);
  if (!until) return null;
  const cur = await store.get(userId);
  if (cur && Date.parse(cur) >= Date.parse(until)) return null;
  await store.set(userId, until);
  return until;
}
