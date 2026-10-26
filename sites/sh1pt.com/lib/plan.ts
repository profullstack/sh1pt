// sh1pt's paid plan, read from one profiles row. Pro is either the founder
// prepay (profiles.prepaid) or time on the clock (profiles.pro_until), which
// credit codes and invite bonuses extend through grant_pro_days.

export interface PlanRow {
  prepaid?: boolean | null;
  pro_until?: string | null;
}

export interface PlanStatus {
  pro: boolean;
  prepaid: boolean;
  proUntil: string | null;
  /** Whole days of Pro left on pro_until (0 when none or expired). */
  daysLeft: number;
}

export function planStatus(row: PlanRow | null | undefined, now = Date.now()): PlanStatus {
  const prepaid = Boolean(row?.prepaid);
  const proUntil = row?.pro_until ?? null;
  const until = proUntil ? Date.parse(proUntil) : NaN;
  const timeLeft = Number.isFinite(until) ? until - now : 0;
  return {
    pro: prepaid || timeLeft > 0,
    prepaid,
    proUntil,
    daysLeft: timeLeft > 0 ? Math.ceil(timeLeft / 86_400_000) : 0,
  };
}
