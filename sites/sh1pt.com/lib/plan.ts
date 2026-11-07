// sh1pt's paid plan, read from one profiles row. Pro is either the founder
// prepay (profiles.prepaid) or time on the clock (profiles.pro_until), which
// credit codes and invite bonuses extend through grant_pro_days, or an active
// Profullstack Pass (profiles.coinpay_pass_until, lib/coinpay-pass.ts), which
// counts without consuming paid days.

export interface PlanRow {
  prepaid?: boolean | null;
  pro_until?: string | null;
  coinpay_pass_until?: string | null;
}

export interface PlanStatus {
  pro: boolean;
  prepaid: boolean;
  /** The later of pro_until and the pass end. */
  proUntil: string | null;
  /** Whole days of Pro left (0 when none or expired). */
  daysLeft: number;
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
}

export function planStatus(row: PlanRow | null | undefined, now = Date.now()): PlanStatus {
  const prepaid = Boolean(row?.prepaid);
  const paid = row?.pro_until ?? null;
  const pass = row?.coinpay_pass_until ?? null;
  const proUntil = ms(pass) > ms(paid) ? pass : paid;
  const until = ms(proUntil);
  const timeLeft = until === -Infinity ? 0 : until - now;
  return {
    pro: prepaid || timeLeft > 0,
    prepaid,
    proUntil,
    daysLeft: timeLeft > 0 ? Math.ceil(timeLeft / 86_400_000) : 0,
  };
}
