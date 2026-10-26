// Pure rules for credit codes and invites: no database, no Next.js, so
// vitest can pin every one. The server side lives in lib/credits.ts.

/** A credit code's unit: days of sh1pt Pro. */
export const PRO_DAYS_UNIT = 'pro_days';
/** Invites each account may create. Scarce on purpose. */
export const INVITE_QUOTA = 3;
/** Pro days each side gets once an accepted invite clears the checks. */
export const INVITE_BONUS_DAYS = 7;
/** An account can create invites once it is this old (stops sock-puppet chains). */
export const INVITER_MIN_AGE_DAYS = 7;
/** Only an account at most this old can accept an invite: invites are for new people. */
export const INVITEE_MAX_AGE_DAYS = 7;
/** Most inviter-side bonuses one account can earn in 30 days. */
export const INVITE_BONUS_MONTHLY_CAP = 10;
/** Invite codes expire after this many days. */
export const INVITE_TTL_DAYS = 30;
/** Cookie /i/<code> sets so the code survives the trip through signup. */
export const INVITE_COOKIE = 'sh1pt_invite';

const DAY_MS = 24 * 60 * 60 * 1000;

export type Verdict = { ok: true } | { ok: false; reason: string; message: string };

export function ageDays(iso: string | null | undefined, now: number): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? (now - t) / DAY_MS : 0;
}

export function canSendInvites(accountCreatedAt: string | null | undefined, now = Date.now()): Verdict {
  if (ageDays(accountCreatedAt, now) >= INVITER_MIN_AGE_DAYS) return { ok: true };
  return {
    ok: false,
    reason: 'too_new',
    message: `Invites unlock once your account is ${INVITER_MIN_AGE_DAYS} days old.`,
  };
}

/** When a too-new account's invites unlock (ISO), or null. */
export function invitesUnlockAt(accountCreatedAt: string | null | undefined): string | null {
  const t = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  return Number.isFinite(t) ? new Date(t + INVITER_MIN_AGE_DAYS * DAY_MS).toISOString() : null;
}

/**
 * Who may accept an invite: a new account (at most INVITEE_MAX_AGE_DAYS old)
 * that did not already join through someone's /r/ referral link, so one
 * sign-up is never credited to two programs.
 */
export function canAcceptInvite(
  input: { accountCreatedAt: string | null | undefined; referredBy: string | null | undefined },
  now = Date.now(),
): Verdict {
  if (ageDays(input.accountCreatedAt, now) > INVITEE_MAX_AGE_DAYS) {
    return {
      ok: false,
      reason: 'not_new',
      message: `Invites are for new accounts (${INVITEE_MAX_AGE_DAYS} days old or less).`,
    };
  }
  if (input.referredBy && input.referredBy.trim()) {
    return {
      ok: false,
      reason: 'already_referred',
      message: 'Your account already joined through a referral link.',
    };
  }
  return { ok: true };
}

/**
 * One mailbox, however it is spelled: lowercased, `+tag` dropped, and for
 * Gmail the dots too (googlemail.com is gmail.com).
 */
export function mailboxKey(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return null;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

// Throwaway inboxes: the cheap way to farm a bonus. Not exhaustive; it only
// has to make farming cost more than a week of Pro is worth.
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '20minutemail.com', 'anonaddy.me', 'burnermail.io', 'dispostable.com',
  'dropmail.me', 'emailnator.com', 'emailondeck.com', 'fakeinbox.com', 'getairmail.com',
  'getnada.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamailblock.com',
  'inboxkitten.com', 'mail.tm', 'mailcatch.com', 'maildrop.cc', 'mailinator.com', 'mailnesia.com',
  'mailpoof.com', 'mintemail.com', 'moakt.com', 'mohmal.com', 'mytemp.email', 'nada.email',
  'sharklasers.com', 'spam4.me', 'spamgourmet.com', 'temp-mail.io', 'temp-mail.org', 'tempail.com',
  'tempmail.com', 'tempmail.dev', 'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'tmail.ws',
  'tmpmail.net', 'tmpmail.org', 'trashmail.com', 'trashmail.de', 'yopmail.com', 'yopmail.net',
]);

export function isDisposableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const d of DISPOSABLE_DOMAINS) if (domain.endsWith(`.${d}`)) return true;
  return false;
}

/**
 * Whether an accepted invite pays its bonus. `null` means "not yet" (the new
 * account has not confirmed its email); a reason means "never".
 */
export function bonusVerdict(input: {
  inviteeEmail: string | null;
  inviteeConfirmed: boolean;
  inviterEmail: string | null;
  inviterBonusesLast30Days: number;
}): { ok: true } | { ok: false; final: boolean; reason: string } {
  if (!input.inviteeConfirmed) return { ok: false, final: false, reason: 'email_not_confirmed' };
  if (isDisposableEmail(input.inviteeEmail)) return { ok: false, final: true, reason: 'disposable_email' };
  const a = mailboxKey(input.inviteeEmail);
  if (a && a === mailboxKey(input.inviterEmail)) return { ok: false, final: true, reason: 'same_mailbox' };
  if (input.inviterBonusesLast30Days >= INVITE_BONUS_MONTHLY_CAP) {
    return { ok: false, final: true, reason: 'monthly_cap' };
  }
  return { ok: true };
}

/** Invite codes look like INV-XXXX-XXXX-XXXX; anything else is not worth a DB call. */
export function looksLikeInviteCode(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const compact = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return compact.length >= 12 && compact.length <= 20;
}
